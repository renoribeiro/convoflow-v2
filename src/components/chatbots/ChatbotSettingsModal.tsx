
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ChatbotSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChatbotSettingsModal = ({ isOpen, onClose }: ChatbotSettingsModalProps) => {
  const [settings, setSettings] = useState({
    defaultResponseTime: 2,
    maxRetries: 3,
    enableFallback: true,
    fallbackMessage: 'Desculpe, não entendi sua mensagem. Um de nossos atendentes entrará em contato em breve.',
    businessHours: '09:00-18:00',
    timezone: 'America/Sao_Paulo',
    enableTypingIndicator: true,
    enableReadReceipts: true,
    autoTransferEnabled: true,
    transferThreshold: 3
  });

  const handleSave = () => {
    console.log('Saving settings:', settings);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurações Globais dos Chatbots</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Configurações Gerais */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Configurações Gerais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="responseTime">Tempo de Resposta Padrão (segundos)</Label>
                  <Input
                    id="responseTime"
                    type="number"
                    value={settings.defaultResponseTime}
                    onChange={(e) => setSettings({...settings, defaultResponseTime: parseInt(e.target.value)})}
                  />
                </div>
                <div>
                  <Label htmlFor="maxRetries">Máximo de Tentativas</Label>
                  <Input
                    id="maxRetries"
                    type="number"
                    value={settings.maxRetries}
                    onChange={(e) => setSettings({...settings, maxRetries: parseInt(e.target.value)})}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="businessHours">Horário de Funcionamento</Label>
                  <Input
                    id="businessHours"
                    value={settings.businessHours}
                    placeholder="09:00-18:00"
                    onChange={(e) => setSettings({...settings, businessHours: e.target.value})}
                  />
                </div>
                <div>
                  <Label htmlFor="timezone">Fuso Horário</Label>
                  <Select value={settings.timezone} onValueChange={(value) => setSettings({...settings, timezone: value})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="America/Sao_Paulo">São Paulo (GMT-3)</SelectItem>
                      <SelectItem value="America/Rio_Branco">Acre (GMT-5)</SelectItem>
                      <SelectItem value="America/Manaus">Manaus (GMT-4)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Mensagens de Fallback */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Mensagens de Fallback</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="enableFallback"
                  checked={settings.enableFallback}
                  onCheckedChange={(checked) => setSettings({...settings, enableFallback: checked})}
                />
                <Label htmlFor="enableFallback">Ativar mensagem de fallback</Label>
              </div>

              {settings.enableFallback && (
                <div>
                  <Label htmlFor="fallbackMessage">Mensagem Padrão</Label>
                  <Textarea
                    id="fallbackMessage"
                    value={settings.fallbackMessage}
                    onChange={(e) => setSettings({...settings, fallbackMessage: e.target.value})}
                    placeholder="Digite a mensagem que será enviada quando o bot não entender"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recursos Avançados */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recursos Avançados</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="typingIndicator">Indicador de Digitação</Label>
                  <p className="text-sm text-muted-foreground">Simula que o bot está digitando</p>
                </div>
                <Switch
                  id="typingIndicator"
                  checked={settings.enableTypingIndicator}
                  onCheckedChange={(checked) => setSettings({...settings, enableTypingIndicator: checked})}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="readReceipts">Confirmação de Leitura</Label>
                  <p className="text-sm text-muted-foreground">Marca mensagens como lidas</p>
                </div>
                <Switch
                  id="readReceipts"
                  checked={settings.enableReadReceipts}
                  onCheckedChange={(checked) => setSettings({...settings, enableReadReceipts: checked})}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="autoTransfer">Transferência Automática</Label>
                  <p className="text-sm text-muted-foreground">Transfer para humano após falhas</p>
                </div>
                <Switch
                  id="autoTransfer"
                  checked={settings.autoTransferEnabled}
                  onCheckedChange={(checked) => setSettings({...settings, autoTransferEnabled: checked})}
                />
              </div>

              {settings.autoTransferEnabled && (
                <div>
                  <Label htmlFor="transferThreshold">Limite para Transferência</Label>
                  <Input
                    id="transferThreshold"
                    type="number"
                    value={settings.transferThreshold}
                    onChange={(e) => setSettings({...settings, transferThreshold: parseInt(e.target.value)})}
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    Número de falhas antes de transferir para atendente humano
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={handleSave}>
              Salvar Configurações
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
