import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, QrCode, Smartphone, Copy, CheckCircle2 } from 'lucide-react';
import { instanceAction, isConnectedState, type InstanceActionResult } from '@/services/whatsapp/instanceActions';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { NomeNoServidor } from './NomeNoServidor';

interface QRCodeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** id da instância (Evolution ou WAHA). */
  instanceId: string;
  /** Nome que aparece na janela. */
  instanceName: string;
  /** O nome no servidor de conexão (`instance_key`), mostrado embaixo do nome. */
  serverName?: string;
  onSuccess?: () => void;
}

/** Intervalo do acompanhamento (ver o QR atual e se conectou). */
export const INTERVALO_ACOMPANHAMENTO_MS = 5000;
/**
 * Quantas leituras seguidas com a conexão fechada contam como "o QR venceu".
 * Logo depois da leitura do QR o WhatsApp reinicia a conexão e ela fica
 * fechada por um instante: uma leitura fechada sozinha não quer dizer nada.
 */
const FECHADA_SEGUIDAS_PARA_VENCER = 4;

/**
 * Conectar um número Evolution ou WAHA por QR Code ou código de pareamento.
 *
 * Tudo pelo SERVIDOR (whatsapp-instance-action). Regra desde 2026-11-18:
 * UM `connect` por abertura da janela, e só. Depois, o acompanhamento usa `qr`,
 * que devolve o QR que já existe e o estado, sem nunca abrir conexão nova. Pedir
 * `connect` de novo no instante em que o celular acabou de ler o QR (a conexão
 * fica fechada por um momento) fazia o Evolution abrir outra conexão, e o
 * celular mostrava "Não foi possível conectar o dispositivo".
 *
 * O acompanhamento para em "Conectado", ao fechar a janela e ao sair da tela.
 * O aviso "Conectado!" sai uma vez só por abertura.
 */
export const QRCodeModal: React.FC<QRCodeModalProps> = ({
  open,
  onOpenChange,
  instanceId,
  instanceName,
  serverName,
  onSuccess,
}) => {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [connected, setConnected] = useState(false);
  const queryClient = useQueryClient();

  // Quem chama passa funções novas a cada desenho; guardar em ref impede que
  // isso reinicie a conexão ou repita o aviso.
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  const nomeRef = useRef(instanceName);
  nomeRef.current = instanceName;

  /** Cada abertura ganha um número; resposta de abertura antiga é ignorada. */
  const sessaoRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emVooRef = useRef(false);
  const avisouRef = useRef(false);
  const fechadasRef = useRef(0);
  const qrAtualRef = useRef<string | null>(null);
  const acompanharAgoraRef = useRef<(() => void) | null>(null);

  const pararAcompanhamento = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleClose = useCallback(() => {
    sessaoRef.current += 1;
    pararAcompanhamento();
    acompanharAgoraRef.current = null;
    setQrCode(null);
    setPairingCode(null);
    setPreparing(false);
    setError(null);
    setExpired(false);
    setConnected(false);
    onOpenChangeRef.current(false);
  }, []);

  useEffect(() => {
    if (!open || !instanceId) return;
    const sessao = ++sessaoRef.current;
    const viva = () => sessaoRef.current === sessao;
    avisouRef.current = false;
    fechadasRef.current = 0;
    emVooRef.current = false;
    qrAtualRef.current = null;
    setQrCode(null);
    setPairingCode(null);
    setError(null);
    setExpired(false);
    setConnected(false);

    const marcarConectado = () => {
      pararAcompanhamento();
      if (avisouRef.current) return;
      avisouRef.current = true;
      setConnected(true);
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });
      onSuccessRef.current?.();
      toast({ title: 'Conectado!', description: `${nomeRef.current} pareado com sucesso.` });
    };

    const mostrar = (r: InstanceActionResult) => {
      if (r.qr && r.qr !== qrAtualRef.current) {
        qrAtualRef.current = r.qr;
        setQrCode(r.qr);
      }
      if (r.pairing_code) setPairingCode(r.pairing_code);
      setPreparing(!qrAtualRef.current && !r.pairing_code);
    };

    const agendar = () => {
      if (!viva()) return;
      pararAcompanhamento();
      timerRef.current = setTimeout(() => void acompanhar(), INTERVALO_ACOMPANHAMENTO_MS);
    };

    const acompanhar = async () => {
      if (!viva() || emVooRef.current || avisouRef.current) return;
      pararAcompanhamento();
      emVooRef.current = true;
      const r = await instanceAction(instanceId, 'qr');
      emVooRef.current = false;
      if (!viva()) return;
      if (!r.ok) {
        // Erro passageiro no acompanhamento não encerra: só registra.
        logger.warn('Falha ao acompanhar o QR Code', { instanceId, reason: r.reason });
        agendar();
        return;
      }
      if (isConnectedState(r.state)) {
        marcarConectado();
        return;
      }
      if (r.state === 'close') {
        fechadasRef.current += 1;
        if (fechadasRef.current >= FECHADA_SEGUIDAS_PARA_VENCER) {
          setExpired(true);
          return;
        }
        agendar();
        return;
      }
      fechadasRef.current = 0;
      mostrar(r);
      agendar();
    };
    acompanharAgoraRef.current = () => void acompanhar();

    // O ÚNICO pedido de conexão desta abertura.
    void (async () => {
      setLoading(true);
      const r = await instanceAction(instanceId, 'connect');
      if (!viva()) return;
      setLoading(false);
      if (!r.ok) {
        // Recusa do servidor (sem chave, provedor fora) é resposta esperada e
        // aparece na janela: aviso, não erro do sistema.
        logger.warn('Servidor não devolveu o QR Code', { instanceId, reason: r.reason });
        setError(r.error || 'Não foi possível conectar o número.');
        return;
      }
      if (isConnectedState(r.state)) {
        marcarConectado();
        return;
      }
      mostrar(r);
      agendar();
    })();

    return () => {
      sessaoRef.current += 1;
      pararAcompanhamento();
      acompanharAgoraRef.current = null;
    };
  }, [open, instanceId, queryClient]);

  // Conectou: fecha sozinho.
  useEffect(() => {
    if (!connected) return;
    const t = setTimeout(() => handleClose(), 1500);
    return () => clearTimeout(t);
  }, [connected, handleClose]);

  const copyPairingCode = () => {
    if (pairingCode) {
      navigator.clipboard.writeText(pairingCode);
      toast({
        title: 'Copiado!',
        description: 'Código de pareamento copiado para a área de transferência',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : handleClose())}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            Conectar WhatsApp
          </DialogTitle>
          <DialogDescription>
            Conecte o número <strong>{instanceName}</strong> escaneando o QR Code ou usando o código de pareamento
          </DialogDescription>
          {serverName && (
            <NomeNoServidor nome={serverName} variante="cartao" className="text-sm text-muted-foreground" />
          )}
        </DialogHeader>

        <div className="space-y-4">
          {connected && (
            <div className="flex flex-col items-center justify-center py-8 space-y-3">
              <CheckCircle2 className="h-12 w-12 text-success" />
              <p className="font-medium text-success">Conectado com sucesso!</p>
              <p className="text-sm text-muted-foreground">Fechando...</p>
            </div>
          )}

          {(loading || preparing) && !connected && !qrCode && !pairingCode && !error && !expired && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-info" />
              <p className="text-sm text-muted-foreground">
                {preparing ? 'Preparando o QR Code...' : 'Conectando o número...'}
              </p>
            </div>
          )}

          {(error || expired) && !connected && !loading && (
            <div className="flex flex-col items-center justify-center py-8 space-y-2 text-center">
              <p className="font-medium text-destructive">
                {expired ? 'O QR Code venceu' : 'Não foi possível conectar o número'}
              </p>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <p className="text-sm text-muted-foreground">
                Feche esta janela e abra o QR Code de novo para tentar outra vez.
              </p>
            </div>
          )}

          {(qrCode || pairingCode) && !loading && !error && !expired && !connected && (
            <div className="space-y-6">
              {/* Código de Pareamento */}
              {pairingCode && (
                <div className="bg-info/10 border border-info/30 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-info">Código de Pareamento</h3>
                    <Button
                      onClick={copyPairingCode}
                      variant="outline"
                      size="sm"
                      className="h-8 px-2"
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      Copiar
                    </Button>
                  </div>
                  <div className="bg-card border rounded p-3 font-mono text-lg text-center tracking-wider">
                    {pairingCode}
                  </div>
                  <p className="text-sm text-info mt-2">
                    Digite este código no WhatsApp em <strong>Aparelhos conectados</strong> &gt; <strong>Conectar com código</strong>
                  </p>
                </div>
              )}

              {/* QR Code */}
              {qrCode && (
                <div className="flex flex-col items-center space-y-4">
                  <h3 className="font-medium text-foreground">Ou escaneie o QR Code</h3>
                  <div className="bg-papel p-4 rounded-lg border-2 border-border">
                    <img
                      src={qrCode}
                      alt="QR Code para conexão WhatsApp"
                      className="w-64 h-64 object-contain"
                    />
                  </div>

                  <div className="text-center space-y-2">
                    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                      <Smartphone className="h-4 w-4" />
                      <span>Abra o WhatsApp no seu celular</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Vá em <strong>Configurações</strong> &gt; <strong>Aparelhos conectados</strong> &gt; <strong>Conectar um aparelho</strong>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Aponte a câmera para este QR Code. Ele muda sozinho de tempos em tempos; leia o que estiver na tela e espere, sem fechar a janela.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex justify-center">
                <Button onClick={() => acompanharAgoraRef.current?.()} variant="outline" size="sm">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Atualizar QR Code
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button onClick={handleClose} variant="outline">
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default QRCodeModal;
