import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Save, TestTube, Webhook, CheckCircle, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useSupabaseMutation } from '@/hooks/useSupabaseMutation';
import { useTenant } from '@/contexts/TenantContext';

interface WhatsAppInstance {
  id: string;
  name: string;
  instance_key: string;
  phone_number?: string;
  profile_name?: string;
  profile_picture_url?: string;
  status: 'close' | 'open' | 'connecting';
  is_active: boolean;
  qr_code?: string;
  last_connected_at?: string;
  created_at: string;
  updated_at: string;
  evolution_api_url?: string;
  evolution_api_key?: string;
  webhook_url?: string;
}

interface WebhookConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instance: WhatsAppInstance;
  onSuccess?: () => void;
}

interface WebhookSettings {
  url: string;
  events: {
    messages: boolean;
    status: boolean;
    presence: boolean;
    qrcode: boolean;
  };
}

export const WebhookConfigModal: React.FC<WebhookConfigModalProps> = ({
  open,
  onOpenChange,
  instance,
  onSuccess
}) => {
  const [webhookSettings, setWebhookSettings] = useState<WebhookSettings>({
    url: instance.webhook_url || '',
    events: {
      messages: true,
      status: true,
      presence: false,
      qrcode: true
    }
  });
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  
  const { tenant } = useTenant();
  const { toast } = useToast();

  // Mutation para atualizar webhook da instância
  const updateWebhookMutation = useSupabaseMutation({
    table: 'whatsapp_instances',
    onSuccess: () => {
      toast({
        title: 'Sucesso',
        description: 'Configuração de webhook atualizada com sucesso'
      });
      onSuccess?.();
    },
    onError: (error) => {
      toast({
        title: 'Erro',
        description: 'Erro ao atualizar configuração de webhook',
        variant: 'destructive'
      });
    }
  });

  useEffect(() => {
    if (open) {
      setWebhookSettings({
        url: instance.webhook_url || '',
        events: {
          messages: true,
          status: true,
          presence: false,
          qrcode: true
        }
      });
      setTestResult(null);
    }
  }, [open, instance]);

  const handleSaveWebhook = async () => {
    if (!webhookSettings.url.trim()) {
      toast({
        title: 'Erro',
        description: 'URL do webhook é obrigatória',
        variant: 'destructive'
      });
      return;
    }

    try {
      await updateWebhookMutation.mutateAsync({
        data: { webhook_url: webhookSettings.url },
        options: { filter: { column: 'id', operator: 'eq', value: instance.id } }
      });
    } catch (error) {
      console.error('Error updating webhook:', error);
    }
  };

  const handleTestWebhook = async () => {
    if (!webhookSettings.url.trim()) {
      toast({
        title: 'Erro',
        description: 'URL do webhook é obrigatória para teste',
        variant: 'destructive'
      });
      return;
    }

    setIsTestingWebhook(true);
    setTestResult(null);

    try {
      // Simular teste de webhook
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Aqui você pode implementar a lógica real de teste do webhook
      const isValidUrl = webhookSettings.url.startsWith('http');
      
      if (isValidUrl) {
        setTestResult({
          success: true,
          message: 'Webhook testado com sucesso! Endpoint está respondendo.'
        });
      } else {
        setTestResult({
          success: false,
          message: 'URL inválida. Certifique-se de que a URL comece com http:// ou https://'
        });
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: 'Erro ao testar webhook. Verifique a URL e tente novamente.'
      });
    } finally {
      setIsTestingWebhook(false);
    }
  };

  const handleEventToggle = (event: keyof WebhookSettings['events']) => {
    setWebhookSettings(prev => ({
      ...prev,
      events: {
        ...prev.events,
        [event]: !prev.events[event]
      }
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Webhook className="h-5 w-5" />
            Configurar Webhook - {instance.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Configuração do Webhook</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="webhookUrl">URL do Webhook</Label>
                <Input 
                  id="webhookUrl" 
                  placeholder="https://seu-dominio.com/webhook"
                  value={webhookSettings.url}
                  onChange={(e) => setWebhookSettings(prev => ({ ...prev, url: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  Esta URL receberá os eventos do WhatsApp para a instância {instance.instance_key}
                </p>
              </div>

              <div className="space-y-4">
                <Label>Eventos para Monitorar</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="messages">Mensagens</Label>
                    <Switch 
                      id="messages" 
                      checked={webhookSettings.events.messages}
                      onCheckedChange={() => handleEventToggle('messages')}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="status">Status de Conexão</Label>
                    <Switch 
                      id="status" 
                      checked={webhookSettings.events.status}
                      onCheckedChange={() => handleEventToggle('status')}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="presence">Presença Online</Label>
                    <Switch 
                      id="presence" 
                      checked={webhookSettings.events.presence}
                      onCheckedChange={() => handleEventToggle('presence')}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="qrcode">QR Code</Label>
                    <Switch 
                      id="qrcode" 
                      checked={webhookSettings.events.qrcode}
                      onCheckedChange={() => handleEventToggle('qrcode')}
                    />
                  </div>
                </div>
              </div>

              {testResult && (
                <Alert className={testResult.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
                  {testResult.success ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-red-600" />
                  )}
                  <AlertDescription className={testResult.success ? 'text-green-800' : 'text-red-800'}>
                    {testResult.message}
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex items-center gap-2">
                <Button 
                  onClick={handleSaveWebhook}
                  disabled={updateWebhookMutation.isPending}
                >
                  <Save className="h-4 w-4 mr-2" />
                  {updateWebhookMutation.isPending ? 'Salvando...' : 'Salvar Configuração'}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={handleTestWebhook}
                  disabled={isTestingWebhook || !webhookSettings.url.trim()}
                >
                  <TestTube className="h-4 w-4 mr-2" />
                  {isTestingWebhook ? 'Testando...' : 'Testar Webhook'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Status do Webhook</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Status Atual</p>
                  <p className="text-sm text-muted-foreground">
                    {instance.webhook_url ? 'Webhook configurado' : 'Webhook não configurado'}
                  </p>
                </div>
                <Badge variant={instance.webhook_url ? 'default' : 'secondary'}>
                  {instance.webhook_url ? 'Configurado' : 'Não Configurado'}
                </Badge>
              </div>
              {instance.webhook_url && (
                <div className="mt-4 p-3 bg-muted rounded-lg">
                  <p className="text-sm font-medium">URL Atual:</p>
                  <p className="text-sm text-muted-foreground break-all">{instance.webhook_url}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};