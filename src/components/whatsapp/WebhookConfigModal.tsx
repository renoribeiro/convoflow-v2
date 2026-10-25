import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Copy, Webhook } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface WhatsAppInstance {
  id: string;
  name: string;
  webhook_url?: string;
}

interface WebhookConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instance: WhatsAppInstance;
  /** Mantido para não mudar quem abre a janela; ela não grava nada. */
  onSuccess?: () => void;
}

/**
 * Mostra o endereço por onde o servidor do WhatsApp (Evolution) entrega ao
 * ConvoFlow as mensagens que chegam nesse número. SÓ MOSTRA.
 *
 * Até 2026-10-25 esta janela "configurava" o webhook (achado 105 do checkup,
 * ops-privado/checkup-ux/RELATORIO_CHECKUP_UX.md):
 *  - "Testar Webhook" esperava 2 segundos e dizia "Endpoint está respondendo"
 *    para qualquer endereço que começasse com http, sem chamar nada;
 *  - "Salvar" gravava só a coluna whatsapp_instances.webhook_url, que nada usa
 *    para configurar o servidor: mudar ali não mudava a entrega;
 *  - as chaves de eventos (Mensagens, Status, Presença, QR Code) não eram
 *    gravadas em lugar nenhum.
 * O endereço é configurado sozinho quando o número é conectado
 * (evolution-provision). Um teste de verdade exigiria o servidor chamar um
 * endereço arbitrário, o que não é seguro fazer só para esta tela.
 */
export const WebhookConfigModal: React.FC<WebhookConfigModalProps> = ({ open, onOpenChange, instance }) => {
  const { toast } = useToast();
  const endereco = instance.webhook_url?.trim() || '';

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(endereco);
      toast({ title: 'Endereço copiado' });
    } catch {
      toast({ title: 'Não foi possível copiar', description: 'Selecione o endereço e copie à mão.', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Webhook className="h-5 w-5" />
            Endereço de entrega das mensagens
          </DialogTitle>
          <DialogDescription>{instance.name}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            É por este endereço que o servidor do WhatsApp entrega ao ConvoFlow as mensagens que chegam neste número.
            Ele é configurado sozinho quando o número é conectado, e não é alterado por esta tela.
          </p>

          {endereco ? (
            <div className="space-y-2">
              <Label htmlFor="endereco-entrega">Endereço atual</Label>
              <div className="flex items-center gap-2">
                <Input id="endereco-entrega" value={endereco} readOnly className="bg-muted" />
                <Button variant="outline" size="icon" onClick={copiar} aria-label="Copiar endereço" title="Copiar endereço">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm">Não há endereço registrado para este número.</p>
          )}

          <p className="text-xs text-muted-foreground">
            Mensagens não estão chegando? Confira se o número está "Conectado" e use o botão de atualizar status. Se continuar,
            escreva para contato@convoflow.com.br.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
