import { useEffect, useRef, useState } from 'react';
import { Mic, Send, Square, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import {
  LIMITE_GRAVACAO_SEGUNDOS,
  MENSAGENS_MICROFONE,
  escolherFormatoGravacao,
  formatarDuracao,
  mensagemErroMicrofone,
  type FormatoGravacao,
} from '@/lib/audio/recording';
import { ErroPreparoAudio, prepararGravacao } from '@/lib/audio/voiceNote';

export const TEXTOS_GRAVADOR = {
  semSuporte: 'Este navegador não grava áudio. Anexe um arquivo de áudio pelo clipe.',
  vazio: 'A gravação ficou vazia. Tente de novo.',
  limite: 'Limite de 5 minutos atingido. Ouça o áudio e envie, ou descarte.',
  falhaEnvio: 'Não foi possível enviar o áudio. Tente de novo.',
} as const;

interface AudioRecorderProps {
  /**
   * Recebe o áudio pronto: OGG/Opus mono com `voz: true` (mensagem de voz) ou
   * M4A com `voz: false` (iPhone antes do 18.4). Devolver `false` = não saiu
   * (a guarda do envio recusou): a prévia fica na tela para tentar de novo.
   */
  onSend: (file: File, opcoes: { voz: boolean }) => Promise<boolean | void> | boolean | void;
  /** Avisa o pai para esconder o resto do compositor enquanto grava ou revisa. */
  onRecordingChange?: (ativo: boolean) => void;
  disabled?: boolean;
  /**
   * Por que não dá para enviar áudio agora (número desconectado, janela de 24 h
   * fechada...). Com motivo, o botão avisa em vez de abrir o microfone.
   */
  blockedReason?: string | null;
}

type Fase = 'parado' | 'gravando' | 'revisando' | 'enviando';

type Previa = { url: string; blob: Blob; formato: FormatoGravacao; segundos: number };

function navegadorGrava(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined'
  );
}

/**
 * Gravador de mensagem de voz do compositor de Conversas: grava (até 5 min),
 * para, deixa ouvir e só então envia ou descarta. Sem pausa por enquanto.
 */
export function AudioRecorder({ onSend, onRecordingChange, disabled, blockedReason }: AudioRecorderProps) {
  const [fase, setFase] = useState<Fase>('parado');
  const [segundos, setSegundos] = useState(0);
  const [previa, setPrevia] = useState<Previa | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const inicioRef = useRef(0);
  // true quando a pessoa joga fora DURANTE a gravação: o onstop descarta.
  const descartarRef = useRef(false);
  const previaUrlRef = useRef<string | null>(null);

  useEffect(() => {
    onRecordingChange?.(fase !== 'parado');
  }, [fase, onRecordingChange]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (previaUrlRef.current) URL.revokeObjectURL(previaUrlRef.current);
    };
  }, []);

  if (!navegadorGrava()) return null;

  const pararRelogio = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const liberarMicrofone = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    pararRelogio();
  };

  const limparPrevia = () => {
    if (previaUrlRef.current) URL.revokeObjectURL(previaUrlRef.current);
    previaUrlRef.current = null;
    setPrevia(null);
  };

  const parar = () => {
    pararRelogio();
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
  };

  const iniciar = async () => {
    if (disabled || fase !== 'parado') return;
    if (blockedReason) {
      toast.error(blockedReason);
      return;
    }
    const formato = escolherFormatoGravacao((t) => MediaRecorder.isTypeSupported(t));
    if (!formato) {
      toast.error(TEXTOS_GRAVADOR.semSuporte);
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: { ideal: 1 },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err) {
      logger.warn('[AudioRecorder] microfone indisponível', {
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      });
      toast.error(mensagemErroMicrofone(err));
      return;
    }

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, {
        mimeType: formato.mimeType,
        audioBitsPerSecond: formato.audioBitsPerSecond,
      });
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop());
      logger.warn('[AudioRecorder] MediaRecorder recusou o formato', {
        mimeType: formato.mimeType,
        error: err instanceof Error ? err.message : String(err),
      });
      toast.error(MENSAGENS_MICROFONE.generico);
      return;
    }

    streamRef.current = stream;
    recorderRef.current = recorder;
    chunksRef.current = [];
    descartarRef.current = false;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const duracao = Math.min(
        LIMITE_GRAVACAO_SEGUNDOS,
        Math.round((Date.now() - inicioRef.current) / 1000),
      );
      liberarMicrofone();
      recorderRef.current = null;
      const pedacos = chunksRef.current;
      chunksRef.current = [];
      setSegundos(0);

      if (descartarRef.current) {
        setFase('parado');
        return;
      }
      const blob = new Blob(pedacos,{ type: recorder.mimeType || formato.mimeType });
      if (blob.size === 0) {
        toast.error(TEXTOS_GRAVADOR.vazio);
        setFase('parado');
        return;
      }
      const url = URL.createObjectURL(blob);
      previaUrlRef.current = url;
      setPrevia({ url, blob, formato, segundos: duracao });
      setFase('revisando');
    };

    // Pedaço a cada segundo: numa gravação longa nada fica só na memória do encoder.
    recorder.start(1000);
    inicioRef.current = Date.now();
    setSegundos(0);
    setFase('gravando');
    timerRef.current = window.setInterval(() => {
      const s = Math.floor((Date.now() - inicioRef.current) / 1000);
      setSegundos(Math.min(s, LIMITE_GRAVACAO_SEGUNDOS));
      if (s >= LIMITE_GRAVACAO_SEGUNDOS) {
        toast.info(TEXTOS_GRAVADOR.limite);
        parar();
      }
    }, 250);
  };

  const descartarGravacao = () => {
    descartarRef.current = true;
    parar();
  };

  const descartarPrevia = () => {
    limparPrevia();
    setFase('parado');
  };

  const enviar = async () => {
    if (!previa || fase !== 'revisando') return;
    setFase('enviando');
    try {
      const pronto = await prepararGravacao(previa.blob, previa.formato);
      const saiu = await onSend(pronto.file, { voz: pronto.voz });
      if (saiu === false) {
        setFase('revisando');
        return;
      }
      limparPrevia();
      setFase('parado');
    } catch (err) {
      logger.error('[AudioRecorder] envio falhou', {
        error: err instanceof Error ? err.message : String(err),
      });
      toast.error(err instanceof ErroPreparoAudio ? err.message : TEXTOS_GRAVADOR.falhaEnvio);
      setFase('revisando');
    }
  };

  if (fase === 'gravando') {
    return (
      <div
        className="flex flex-1 items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5"
        role="group"
        aria-label="Gravando áudio"
      >
        <span className="flex items-center gap-2 text-sm text-destructive">
          <span className="w-2.5 h-2.5 rounded-full bg-destructive animate-pulse" aria-hidden />
          Gravando
        </span>
        <span className="text-sm tabular-nums text-muted-foreground" data-testid="audio-timer">
          {formatarDuracao(segundos)}
          <span className="hidden sm:inline"> / {formatarDuracao(LIMITE_GRAVACAO_SEGUNDOS)}</span>
        </span>
        <div className="flex-1" />
        <Button type="button" variant="ghost" size="sm" onClick={descartarGravacao} aria-label="Descartar gravação">
          <Trash2 className="w-5 h-5 text-destructive" />
        </Button>
        <Button type="button" size="sm" onClick={parar} aria-label="Parar e ouvir">
          <Square className="w-4 h-4 fill-current" />
        </Button>
      </div>
    );
  }

  if ((fase === 'revisando' || fase === 'enviando') && previa) {
    const enviando = fase === 'enviando';
    return (
      <div
        className="flex flex-1 min-w-0 items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1"
        role="group"
        aria-label="Prévia do áudio"
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={descartarPrevia}
          disabled={enviando}
          aria-label="Descartar áudio"
        >
          <Trash2 className="w-5 h-5 text-destructive" />
        </Button>
        <audio
          controls
          preload="metadata"
          src={previa.url}
          className="h-9 min-w-0 flex-1"
          aria-label="Ouvir antes de enviar"
        />
        <span className="hidden sm:inline text-xs tabular-nums text-muted-foreground">
          {formatarDuracao(previa.segundos)}
        </span>
        <Button type="button" size="sm" onClick={enviar} disabled={enviando} aria-label="Enviar áudio">
          {enviando ? (
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </Button>
      </div>
    );
  }

  const bloqueado = Boolean(blockedReason);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="sm"
          onClick={iniciar}
          disabled={disabled}
          // aria-disabled, e não disabled: o clique ainda precisa mostrar o
          // motivo (no celular não há tooltip).
          aria-disabled={bloqueado || undefined}
          className={bloqueado ? 'opacity-50' : undefined}
          aria-label="Gravar áudio"
        >
          <Mic className="w-4 h-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs max-w-[260px]">
        {blockedReason || 'Gravar áudio'}
      </TooltipContent>
    </Tooltip>
  );
}
