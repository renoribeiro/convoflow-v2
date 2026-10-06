
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Save, TestTube } from 'lucide-react';

export const WebhookConfig = () => {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Configuração do Webhook</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="webhookUrl">URL do Webhook</Label>
            <Input 
              id="webhookUrl" 
              placeholder="https://seu-dominio.com/webhook"
              defaultValue="https://api.exemplo.com/webhook"
            />
          </div>

          <div className="space-y-4">
            <Label>Eventos para Monitorar</Label>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="messages">Mensagens</Label>
                <Switch id="messages" defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="status">Status de Conexão</Label>
                <Switch id="status" defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="presence">Presença Online</Label>
                <Switch id="presence" />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="qrcode">QR Code</Label>
                <Switch id="qrcode" defaultChecked />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button>
              <Save className="h-4 w-4 mr-2" />
              Salvar Configuração
            </Button>
            <Button variant="outline">
              <TestTube className="h-4 w-4 mr-2" />
              Testar Webhook
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status do Webhook</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Status Atual</p>
              <p className="text-sm text-muted-foreground">
                Última verificação: há 2 minutos
              </p>
            </div>
            <Badge variant="default">Ativo</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
