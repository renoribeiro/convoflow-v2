import { useEffect, useRef, useState } from 'react';
import { Mic, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

interface AudioRecorderProps {
  /** Receives the recorded audio as a File (audio/ogg or best-supported opus). */
  onSend: (file: File) => Promise<void> | void;
  /** Notifies the parent so it can hide the text input row while recording. */
  onRecordingChange?: (recording: boolean) => void;
  disabled?: boolean;
}

/** Picks the best WhatsApp-compatible opus container the browser supports. */
function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  return candidates.find((c) => MediaRecorder.isTypeSupported(c)) ?? null;
}

const RECORDER_SUPPORTED =
  typeof navigator !== 'undefined' &&
  !!navigator.mediaDevices?.getUserMedia &&
  typeof MediaRecorder !== 'undefined';

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function AudioRecorder({ onSend, onRecordingChange, disabled }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [isSending, setIsSending] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  // True when the user cancels — tells onstop to discard instead of send.
  const cancelledRef = useRef(false);

  useEffect(() => {
    onRecordingChange?.(isRecording);
  }, [isRecording, onRecordingChange]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // MediaRecorder unsupported → render nothing (hide the Mic entirely).
  if (!RECORDER_SUPPORTED) return null;

  const cleanupStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startRecording = async () => {
    if (disabled) return;
    const mimeType = pickMimeType();
    if (!mimeType) {
      toast.error('Seu navegador não suporta gravação de áudio.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      cancelledRef.current = false;

      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        cleanupStream();
        const wasCancelled = cancelledRef.current;
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        setIsRecording(false);
        setElapsed(0);

        if (wasCancelled || blob.size === 0) return;

        const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'm4a' : 'webm';
        const file = new File([blob], `audio-${Date.now()}.${ext}`, { type: mimeType });
        setIsSending(true);
        try {
          await onSend(file);
        } catch (err) {
          logger.error('[AudioRecorder] envio falhou', {
            error: err instanceof Error ? err.message : String(err),
          });
          toast.error('Não foi possível enviar o áudio. Tente novamente.');
        } finally {
          setIsSending(false);
        }
      };

      recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
      setElapsed(0);
      timerRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    } catch (err) {
      logger.warn('[AudioRecorder] permissão de microfone negada', {
        error: err instanceof Error ? err.message : String(err),
      });
      toast.error('Permita o acesso ao microfone para gravar áudio.');
      cleanupStream();
      setIsRecording(false);
    }
  };

  const stopAndSend = () => {
    cancelledRef.current = false;
    recorderRef.current?.stop();
  };

  const cancelRecording = () => {
    cancelledRef.current = true;
    recorderRef.current?.stop();
  };

  if (isRecording) {
    return (
      <div className="flex flex-1 items-center gap-3 rounded-md border border-border bg-muted/40 px-3 py-1.5">
        <span className="flex items-center gap-2 text-sm text-destructive">
          <span className="w-2.5 h-2.5 rounded-full bg-destructive animate-pulse" aria-hidden />
          Gravando
        </span>
        <span className="text-sm tabular-nums text-muted-foreground">{formatElapsed(elapsed)}</span>
        <div className="flex-1" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={cancelRecording}
          aria-label="Cancelar gravação"
        >
          <Trash2 className="w-5 h-5 text-destructive" />
        </Button>
        <Button type="button" size="sm" onClick={stopAndSend} aria-label="Enviar áudio">
          <Send className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="sm"
          onClick={startRecording}
          disabled={disabled || isSending}
          aria-label="Gravar áudio"
        >
          {isSending ? (
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <Mic className="w-4 h-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        Gravar áudio
      </TooltipContent>
    </Tooltip>
  );
}
