import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Settings, Mail, MessageSquare, Clock, X, Save } from 'lucide-react';
import { toast } from 'sonner';

interface ReportSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SettingsData {
  emailSettings: {
    enabled: boolean;
    smtpServer: string;
    smtpPort: string;
    username: string;
    password: string;
    fromEmail: string;
    fromName: string;
  };
  whatsappSettings: {
    enabled: boolean;
    instanceId: string;
    defaultMessage: string;
  };
  schedulingSettings: {
    timezone: string;
    defaultTime: string;
    maxRetries: string;
    retryInterval: string;
  };
  generalSettings: {
    autoArchive: boolean;
    archiveDays: string;
    compressionEnabled: boolean;
    maxFileSize: string;
  };
}

export const ReportSettingsModal = ({ isOpen, onClose }: ReportSettingsModalProps) => {
  const [settings, setSettings] = useState<SettingsData>({
    emailSettings: {
      enabled: true,
      smtpServer: 'smtp.gmail.com',
      smtpPort: '587',
      username: '',
      password: '',
      fromEmail: 'reports@convoflow.com.br',
      fromName: 'ConvoFlow Reports'
    },
    whatsappSettings: {
      enabled: false,
      instanceId: '',
      defaultMessage: 'Seu relatório está pronto! 📊'
    },
    schedulingSettings: {
      timezone: 'America/Sao_Paulo',
      defaultTime: '09:00',
      maxRetries: '3',
      retryInterval: '30'
    },
    generalSettings: {
      autoArchive: true,
      archiveDays: '30',
      compressionEnabled: true,
      maxFileSize: '10'
    }
  });
  const [isLoading, setIsLoading] = useState(false);

  const timezones = [
    { value: 'America/Sao_Paulo', label: 'Brasília (GMT-3)' },
    { value: 'America/New_York', label: 'Nova York (GMT-5)' },
    { value: 'Europe/London', label: 'Londres (GMT+0)' },
    { value: 'Europe/Paris', label: 'Paris (GMT+1)' },
    { value: 'Asia/Tokyo', label: 'Tóquio (GMT+9)' }
  ];

  const handleSettingChange = (section: keyof SettingsData, field: string, value: string | boolean) => {
    setSettings(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }));
  };

  const handleSave = async () => {
    setIsLoading(true);
    
    try {
      // Simular salvamento
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      console.log('Configurações salvas:', settings);
      toast.success('Configurações salvas com sucesso!');
      onClose();
    } catch (error) {
      console.error('Erro ao salvar configurações:', error);
      toast.error('Erro ao salvar configurações. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Configurações de Relatórios
            </DialogTitle>
            <Button variant="ghost" size="sm" onClick={handleClose} disabled={isLoading}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Configurações de Email */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Configurações de Email
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Habilitar envio por email</Label>
                  <p className="text-sm text-muted-foreground">Permite enviar relatórios por email automaticamente</p>
                </div>
                <Switch
                  checked={settings.emailSettings.enabled}
                  onCheckedChange={(checked) => handleSettingChange('emailSettings', 'enabled', checked)}
                  disabled={isLoading}
                />
              </div>
              
              {settings.emailSettings.enabled && (
                <>
                  <Separator />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="smtpServer">Servidor SMTP</Label>
                      <Input
                        id="smtpServer"
                        value={settings.emailSettings.smtpServer}
                        onChange={(e) => handleSettingChange('emailSettings', 'smtpServer', e.target.value)}
                        placeholder="smtp.gmail.com"
                        disabled={isLoading}
                      />
                    </div>
                    <div>
                      <Label htmlFor="smtpPort">Porta SMTP</Label>
                      <Input
                        id="smtpPort"
                        value={settings.emailSettings.smtpPort}
                        onChange={(e) => handleSettingChange('emailSettings', 'smtpPort', e.target.value)}
                        placeholder="587"
                        disabled={isLoading}
                      />
                    </div>
                    <div>
                      <Label htmlFor="username">Usuário</Label>
                      <Input
                        id="username"
                        value={settings.emailSettings.username}
                        onChange={(e) => handleSettingChange('emailSettings', 'username', e.target.value)}
                        placeholder="seu-email@gmail.com"
                        disabled={isLoading}
                      />
                    </div>
                    <div>
                      <Label htmlFor="password">Senha</Label>
                      <Input
                        id="password"
                        type="password"
                        value={settings.emailSettings.password}
                        onChange={(e) => handleSettingChange('emailSettings', 'password', e.target.value)}
                        placeholder="••••••••"
                        disabled={isLoading}
                      />
                    </div>
                    <div>
                      <Label htmlFor="fromEmail">Email do Remetente</Label>
                      <Input
                        id="fromEmail"
                        value={settings.emailSettings.fromEmail}
                        onChange={(e) => handleSettingChange('emailSettings', 'fromEmail', e.target.value)}
                        placeholder="reports@convoflow.com.br"
                        disabled={isLoading}
                      />
                    </div>
                    <div>
                      <Label htmlFor="fromName">Nome do Remetente</Label>
                      <Input
                        id="fromName"
                        value={settings.emailSettings.fromName}
                        onChange={(e) => handleSettingChange('emailSettings', 'fromName', e.target.value)}
                        placeholder="ConvoFlow Reports"
                        disabled={isLoading}
                      />
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Configurações de WhatsApp */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Configurações de WhatsApp
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Habilitar envio por WhatsApp</Label>
                  <p className="text-sm text-muted-foreground">Permite enviar relatórios via WhatsApp</p>
                </div>
                <Switch
                  checked={settings.whatsappSettings.enabled}
                  onCheckedChange={(checked) => handleSettingChange('whatsappSettings', 'enabled', checked)}
                  disabled={isLoading}
                />
              </div>
              
              {settings.whatsappSettings.enabled && (
                <>
                  <Separator />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="instanceId">Instância do WhatsApp</Label>
                      <Select 
                        value={settings.whatsappSettings.instanceId} 
                        onValueChange={(value) => handleSettingChange('whatsappSettings', 'instanceId', value)}
                        disabled={isLoading}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione uma instância" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="instance1">Instância Principal</SelectItem>
                          <SelectItem value="instance2">Instância Secundária</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="defaultMessage">Mensagem Padrão</Label>
                      <Input
                        id="defaultMessage"
                        value={settings.whatsappSettings.defaultMessage}
                        onChange={(e) => handleSettingChange('whatsappSettings', 'defaultMessage', e.target.value)}
                        placeholder="Seu relatório está pronto! 📊"
                        disabled={isLoading}
                      />
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Configurações de Agendamento */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Configurações de Agendamento
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="timezone">Fuso Horário</Label>
                  <Select 
                    value={settings.schedulingSettings.timezone} 
                    onValueChange={(value) => handleSettingChange('schedulingSettings', 'timezone', value)}
                    disabled={isLoading}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {timezones.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>
                          {tz.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="defaultTime">Horário Padrão</Label>
                  <Input
                    id="defaultTime"
                    type="time"
                    value={settings.schedulingSettings.defaultTime}
                    onChange={(e) => handleSettingChange('schedulingSettings', 'defaultTime', e.target.value)}
                    disabled={isLoading}
                  />
                </div>
                <div>
                  <Label htmlFor="maxRetries">Máximo de Tentativas</Label>
                  <Input
                    id="maxRetries"
                    type="number"
                    value={settings.schedulingSettings.maxRetries}
                    onChange={(e) => handleSettingChange('schedulingSettings', 'maxRetries', e.target.value)}
                    min="1"
                    max="10"
                    disabled={isLoading}
                  />
                </div>
                <div>
                  <Label htmlFor="retryInterval">Intervalo entre Tentativas (min)</Label>
                  <Input
                    id="retryInterval"
                    type="number"
                    value={settings.schedulingSettings.retryInterval}
                    onChange={(e) => handleSettingChange('schedulingSettings', 'retryInterval', e.target.value)}
                    min="5"
                    max="120"
                    disabled={isLoading}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Configurações Gerais */}
          <Card>
            <CardHeader>
              <CardTitle>Configurações Gerais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Arquivamento Automático</Label>
                  <p className="text-sm text-muted-foreground">Arquiva relatórios antigos automaticamente</p>
                </div>
                <Switch
                  checked={settings.generalSettings.autoArchive}
                  onCheckedChange={(checked) => handleSettingChange('generalSettings', 'autoArchive', checked)}
                  disabled={isLoading}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <Label>Compressão de Arquivos</Label>
                  <p className="text-sm text-muted-foreground">Comprime relatórios para economizar espaço</p>
                </div>
                <Switch
                  checked={settings.generalSettings.compressionEnabled}
                  onCheckedChange={(checked) => handleSettingChange('generalSettings', 'compressionEnabled', checked)}
                  disabled={isLoading}
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="archiveDays">Dias para Arquivamento</Label>
                  <Input
                    id="archiveDays"
                    type="number"
                    value={settings.generalSettings.archiveDays}
                    onChange={(e) => handleSettingChange('generalSettings', 'archiveDays', e.target.value)}
                    min="1"
                    max="365"
                    disabled={isLoading || !settings.generalSettings.autoArchive}
                  />
                </div>
                <div>
                  <Label htmlFor="maxFileSize">Tamanho Máximo (MB)</Label>
                  <Input
                    id="maxFileSize"
                    type="number"
                    value={settings.generalSettings.maxFileSize}
                    onChange={(e) => handleSettingChange('generalSettings', 'maxFileSize', e.target.value)}
                    min="1"
                    max="100"
                    disabled={isLoading}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Botões de Ação */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleClose} disabled={isLoading}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isLoading}>
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Salvar Configurações
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};