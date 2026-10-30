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
import { instanceAction, isConnectedState } from '@/services/whatsapp/instanceActions';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

interface QRCodeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** id da instância (Evolution ou WAHA). */
  instanceId: string;
  /** Nome que aparece na janela. */
  instanceName: string;
  onSuccess?: () => void;
}

/** Quantas vezes pedir o QR de novo enquanto o servidor ainda o prepara (3 s cada). */
const MAX_TENTATIVAS_QR = 10;

/**
 * Conectar um número Evolution ou WAHA por QR Code ou código de pareamento.
 *
 * Tudo pelo SERVIDOR (whatsapp-instance-action): ele pede o QR ao provedor
 * com a chave do cofre e devolve só a imagem; o acompanhamento ("conectou?")
 * também é dele, e é ele que grava o estado no banco. A tela nunca recebe a
 * chave nem o endereço do servidor do número.
 */
export const QRCodeModal: React.FC<QRCodeModalProps> = ({
  open,
  onOpenChange,
  instanceId,
  instanceName,
  onSuccess,
}) => {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tentativasRef = useRef(0);
  const queryClient = useQueryClient();

  const clearRetry = () => {
    if (retryRef.current) {
      clearTimeout(retryRef.current);
      retryRef.current = null;
    }
  };

  const markConnected = useCallback(() => {
    setConnected(true);
    queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });
    onSuccess?.();
    toast({ title: 'Conectado!', description: `${instanceName} pareado com sucesso.` });
  }, [instanceName, onSuccess, queryClient]);

  const fetchConnectionData = useCallback(async () => {
    if (!instanceId) return;
    clearRetry();
    setLoading(true);
    setError(null);
    const r = await instanceAction(instanceId, 'connect');
    setLoading(false);

    if (!r.ok) {
      // Recusa do servidor (sem chave, provedor fora) é resposta esperada e
      // aparece na janela: aviso, não erro do sistema.
      logger.warn('Servidor não devolveu o QR Code', { instanceId, reason: r.reason });
      setError(r.error || 'Não foi possível conectar o número.');
      return;
    }
    if (isConnectedState(r.state)) {
      markConnected();
      return;
    }
    setQrCode(r.qr ?? null);
    setPairingCode(r.pairing_code ?? null);
    if (!r.qr && !r.pairing_code) {
      // O servidor ainda prepara a sessão (WAHA iniciando): pede de novo.
      if (tentativasRef.current < MAX_TENTATIVAS_QR) {
        tentativasRef.current += 1;
        setPreparing(true);
        retryRef.current = setTimeout(() => void fetchConnectionData(), 3000);
      } else {
        setPreparing(false);
        setError('O servidor não devolveu QR Code nem código de pareamento. Tente de novo em instantes.');
      }
      return;
    }
    setPreparing(false);
  }, [instanceId, markConnected]);

  const handleClose = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    clearRetry();
    tentativasRef.current = 0;
    setQrCode(null);
    setPairingCode(null);
    setPreparing(false);
    setError(null);
    setConnected(false);
    onOpenChange(false);
  }, [onOpenChange]);

  useEffect(() => {
    if (open && instanceId) {
      tentativasRef.current = 0;
      void fetchConnectionData();
    }
    return clearRetry;
  }, [open, instanceId, fetchConnectionData]);

  // Acompanhamento pelo servidor: quando o número conecta, mostra sucesso e fecha.
  useEffect(() => {
    if (!open || !instanceId || connected) return;

    const stopPolling = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };

    pollRef.current = setInterval(async () => {
      const r = await instanceAction(instanceId, 'status');
      if (!r.ok) {
        // Erro transitório durante o acompanhamento não encerra: só registra.
        logger.warn('Falha ao checar status da instância', { instanceId, reason: r.reason });
        return;
      }
      if (isConnectedState(r.status)) {
        stopPolling();
        markConnected();
      }
    }, 3000);

    return stopPolling;
  }, [open, instanceId, connected, markConnected]);

  // Conectou (pelo acompanhamento ou porque já estava): fecha sozinho.
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
        </DialogHeader>

        <div className="space-y-4">
          {connected && (
            <div className="flex flex-col items-center justify-center py-8 space-y-3">
              <CheckCircle2 className="h-12 w-12 text-success" />
              <p className="font-medium text-success">Conectado com sucesso!</p>
              <p className="text-sm text-muted-foreground">Fechando...</p>
            </div>
          )}

          {(loading || preparing) && !connected && !qrCode && !pairingCode && !error && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-info" />
              <p className="text-sm text-muted-foreground">
                {preparing ? 'Preparando o QR Code...' : 'Conectando o número...'}
              </p>
            </div>
          )}

          {error && !connected && !loading && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <div className="text-destructive text-center">
                <p className="font-medium">Não foi possível conectar o número</p>
                <p className="text-sm mt-1">{error}</p>
              </div>
              <Button onClick={fetchConnectionData} variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Tentar novamente
              </Button>
            </div>
          )}

          {(qrCode || pairingCode) && !loading && !error && !connected && (
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
                      Aponte a câmera para este QR Code
                    </p>
                  </div>
                </div>
              )}

              <div className="flex justify-center">
                <Button onClick={fetchConnectionData} variant="outline" size="sm">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Atualizar conexão
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
