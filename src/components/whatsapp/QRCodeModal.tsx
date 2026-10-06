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
import type { EvolutionApiService } from '@/services/evolutionApi';
import { evolutionServiceForInstanceKey } from '@/services/whatsapp/evolutionInstanceService';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

interface QRCodeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `instance_key` da instância na Evolution. */
  instanceName: string;
  onSuccess?: () => void;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({
  open,
  onOpenChange,
  instanceName,
  onSuccess,
}) => {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const serviceRef = useRef<EvolutionApiService | null>(null);
  const queryClient = useQueryClient();

  const getService = useCallback(async (): Promise<EvolutionApiService> => {
    if (serviceRef.current) return serviceRef.current;
    serviceRef.current = await evolutionServiceForInstanceKey(instanceName);
    return serviceRef.current;
  }, [instanceName]);

  const fetchConnectionData = useCallback(async () => {
    if (!instanceName) return;

    try {
      setLoading(true);
      setError(null);

      const service = await getService();
      const connectionData = await service.connectInstance(instanceName);

      // A Evolution v2 devolve `base64` (data URL pronta para <img>) e `code`
      // (o payload cru do QR, que NÃO é imagem). Usar `code` como src pintava
      // um ícone de imagem quebrada; sem base64, o pareamento por código é o
      // caminho que resta.
      setQrCode(connectionData?.base64 || null);
      setPairingCode(connectionData?.pairingCode || null);

      if (!connectionData?.base64 && !connectionData?.pairingCode) {
        setError('O servidor não devolveu QR Code nem código de pareamento. A instância pode já estar conectada.');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao conectar instância';
      logger.error('Falha ao obter QR Code da instância', { instanceName, error: errorMessage });
      setError(errorMessage);
      toast({ title: 'Erro', description: errorMessage, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [getService, instanceName]);

  const handleClose = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setQrCode(null);
    setPairingCode(null);
    setError(null);
    setConnected(false);
    serviceRef.current = null;
    onOpenChange(false);
  }, [onOpenChange]);

  useEffect(() => {
    if (open && instanceName) {
      serviceRef.current = null;
      fetchConnectionData();
    }
  }, [open, instanceName, fetchConnectionData]);

  // Polling do status: quando state vira "open", mostra sucesso e fecha o modal.
  useEffect(() => {
    if (!open || !instanceName || connected) return;

    const stopPolling = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };

    pollRef.current = setInterval(async () => {
      try {
        const service = await getService();
        const { instance } = await service.getInstanceStatus(instanceName);
        if (instance?.state === 'open') {
          stopPolling();
          setConnected(true);
          await supabase
            .from('whatsapp_instances')
            .update({ status: 'open', last_connected_at: new Date().toISOString() })
            .eq('instance_key', instanceName);
          queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });
          onSuccess?.();
          toast({
            title: 'Conectado!',
            description: `Instância ${instanceName} pareada com sucesso.`,
          });
          setTimeout(() => handleClose(), 1500);
        }
      } catch (err) {
        // Erros transientes durante polling não devem encerrar — só logar.
        logger.warn('Falha ao checar status da instância', {
          instanceName,
          error: err instanceof Error ? err.message : err,
        });
      }
    }, 3000);

    return stopPolling;
  }, [open, instanceName, connected, getService, handleClose, onSuccess, queryClient]);

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
            Conecte sua instância <strong>{instanceName}</strong> escaneando o QR Code ou usando o código de pareamento
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {connected && (
            <div className="flex flex-col items-center justify-center py-8 space-y-3">
              <CheckCircle2 className="h-12 w-12 text-green-600" />
              <p className="font-medium text-green-700">Conectado com sucesso!</p>
              <p className="text-sm text-gray-600">Fechando...</p>
            </div>
          )}

          {loading && !connected && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <p className="text-sm text-gray-600">Conectando instância...</p>
            </div>
          )}

          {error && !connected && !loading && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <div className="text-red-500 text-center">
                <p className="font-medium">Erro ao conectar instância</p>
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
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-blue-900">Código de Pareamento</h3>
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
                  <div className="bg-white border rounded p-3 font-mono text-lg text-center tracking-wider">
                    {pairingCode}
                  </div>
                  <p className="text-sm text-blue-700 mt-2">
                    Digite este código no WhatsApp em <strong>Aparelhos conectados</strong> &gt; <strong>Conectar com código</strong>
                  </p>
                </div>
              )}

              {/* QR Code */}
              {qrCode && (
                <div className="flex flex-col items-center space-y-4">
                  <h3 className="font-medium text-gray-900">Ou escaneie o QR Code</h3>
                  <div className="bg-white p-4 rounded-lg border-2 border-gray-200">
                    <img
                      src={qrCode}
                      alt="QR Code para conexão WhatsApp"
                      className="w-64 h-64 object-contain"
                    />
                  </div>

                  <div className="text-center space-y-2">
                    <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
                      <Smartphone className="h-4 w-4" />
                      <span>Abra o WhatsApp no seu celular</span>
                    </div>
                    <p className="text-sm text-gray-600">
                      Vá em <strong>Configurações</strong> &gt; <strong>Aparelhos conectados</strong> &gt; <strong>Conectar um aparelho</strong>
                    </p>
                    <p className="text-sm text-gray-600">
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
