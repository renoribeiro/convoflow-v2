import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import {
  Settings,
  Database,
  Shield,
  Zap,
  Bell,
  Mail,
  MessageSquare,
  Users,
  Clock,
  HardDrive,
  Wifi,
  Lock,
  Eye,
  AlertTriangle,
  CheckCircle,
  Save,
  RotateCcw,
  Download,
  Upload,
  Trash2,
  RefreshCw,
  Globe,
  Smartphone,
  Monitor,
  Palette,
  Volume2,
  Image,
  FileText,
  Calendar
} from 'lucide-react';
import { useSupabaseMutation } from '@/hooks/useSupabaseMutation';
import { useToast } from '@/hooks/use-toast';

interface SystemSettings {
  // Configurações Gerais
  app_name: string;
  app_description: string;
  timezone: string;
  language: string;
  date_format: string;
  currency: string;
  
  // Configurações de Performance
  max_concurrent_connections: number;
  request_timeout: number;
  cache_duration: number;
  max_file_size: number;
  compression_enabled: boolean;
  
  // Configurações de Segurança
  session_timeout: number;
  max_login_attempts: number;
  password_min_length: number;
  require_2fa: boolean;
  ip_whitelist_enabled: boolean;
  audit_log_retention: number;
  
  // Configurações de Notificações
  email_notifications: boolean;
  push_notifications: boolean;
  sms_notifications: boolean;
  notification_sound: boolean;
  notification_frequency: string;
  
  // Configurações de WhatsApp
  whatsapp_webhook_timeout: number;
  whatsapp_retry_attempts: number;
  whatsapp_rate_limit: number;
  whatsapp_media_compression: boolean;
  
  // Configurações de Backup
  auto_backup_enabled: boolean;
  backup_frequency: string;
  backup_retention: number;
  backup_compression: boolean;
  
  // Configurações de Interface
  theme: string;
  sidebar_collapsed: boolean;
  show_tooltips: boolean;
  animation_enabled: boolean;
  compact_mode: boolean;
  
  // Configurações de Logs
  log_level: string;
  log_retention: number;
  log_compression: boolean;
  real_time_logs: boolean;
}

const defaultSettings: SystemSettings = {
  app_name: 'ConvoFlow',
  app_description: 'Sistema de Gestão de Conversas WhatsApp',
  timezone: 'America/Sao_Paulo',
  language: 'pt-BR',
  date_format: 'dd/MM/yyyy',
  currency: 'BRL',
  
  max_concurrent_connections: 100,
  request_timeout: 30,
  cache_duration: 3600,
  max_file_size: 10,
  compression_enabled: true,
  
  session_timeout: 480,
  max_login_attempts: 5,
  password_min_length: 8,
  require_2fa: false,
  ip_whitelist_enabled: false,
  audit_log_retention: 90,
  
  email_notifications: true,
  push_notifications: true,
  sms_notifications: false,
  notification_sound: true,
  notification_frequency: 'immediate',
  
  whatsapp_webhook_timeout: 10,
  whatsapp_retry_attempts: 3,
  whatsapp_rate_limit: 60,
  whatsapp_media_compression: true,
  
  auto_backup_enabled: true,
  backup_frequency: 'daily',
  backup_retention: 30,
  backup_compression: true,
  
  theme: 'system',
  sidebar_collapsed: false,
  show_tooltips: true,
  animation_enabled: true,
  compact_mode: false,
  
  log_level: 'info',
  log_retention: 30,
  log_compression: true,
  real_time_logs: true
};

const GeneralSettings = ({ settings, onChange }: { settings: SystemSettings; onChange: (settings: SystemSettings) => void }) => {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Settings className="h-5 w-5" />
            <span>Configurações da Aplicação</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="app_name">Nome da Aplicação</Label>
              <Input
                id="app_name"
                value={settings.app_name}
                onChange={(e) => onChange({ ...settings, app_name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="timezone">Fuso Horário</Label>
              <Select value={settings.timezone} onValueChange={(value) => onChange({ ...settings, timezone: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="America/Sao_Paulo">São Paulo (GMT-3)</SelectItem>
                  <SelectItem value="America/New_York">Nova York (GMT-5)</SelectItem>
                  <SelectItem value="Europe/London">Londres (GMT+0)</SelectItem>
                  <SelectItem value="Asia/Tokyo">Tóquio (GMT+9)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="language">Idioma</Label>
              <Select value={settings.language} onValueChange={(value) => onChange({ ...settings, language: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pt-BR">Português (Brasil)</SelectItem>
                  <SelectItem value="en-US">English (US)</SelectItem>
                  <SelectItem value="es-ES">Español</SelectItem>
                  <SelectItem value="fr-FR">Français</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="currency">Moeda</Label>
              <Select value={settings.currency} onValueChange={(value) => onChange({ ...settings, currency: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BRL">Real (R$)</SelectItem>
                  <SelectItem value="USD">Dólar ($)</SelectItem>
                  <SelectItem value="EUR">Euro (€)</SelectItem>
                  <SelectItem value="GBP">Libra (£)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div>
            <Label htmlFor="app_description">Descrição da Aplicação</Label>
            <Textarea
              id="app_description"
              value={settings.app_description}
              onChange={(e) => onChange({ ...settings, app_description: e.target.value })}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const PerformanceSettings = ({ settings, onChange }: { settings: SystemSettings; onChange: (settings: SystemSettings) => void }) => {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Zap className="h-5 w-5" />
            <span>Configurações de Performance</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label>Conexões Simultâneas Máximas: {settings.max_concurrent_connections}</Label>
              <Slider
                value={[settings.max_concurrent_connections]}
                onValueChange={([value]) => onChange({ ...settings, max_concurrent_connections: value })}
                max={500}
                min={10}
                step={10}
                className="mt-2"
              />
              <div className="text-xs text-muted-foreground mt-1">
                Número máximo de conexões simultâneas permitidas
              </div>
            </div>
            
            <div>
              <Label>Timeout de Requisição: {settings.request_timeout}s</Label>
              <Slider
                value={[settings.request_timeout]}
                onValueChange={([value]) => onChange({ ...settings, request_timeout: value })}
                max={120}
                min={5}
                step={5}
                className="mt-2"
              />
              <div className="text-xs text-muted-foreground mt-1">
                Tempo limite para requisições HTTP
              </div>
            </div>
            
            <div>
              <Label>Duração do Cache: {Math.floor(settings.cache_duration / 60)}min</Label>
              <Slider
                value={[settings.cache_duration]}
                onValueChange={([value]) => onChange({ ...settings, cache_duration: value })}
                max={7200}
                min={300}
                step={300}
                className="mt-2"
              />
              <div className="text-xs text-muted-foreground mt-1">
                Tempo de vida dos dados em cache
              </div>
            </div>
            
            <div>
              <Label>Tamanho Máximo de Arquivo: {settings.max_file_size}MB</Label>
              <Slider
                value={[settings.max_file_size]}
                onValueChange={([value]) => onChange({ ...settings, max_file_size: value })}
                max={100}
                min={1}
                step={1}
                className="mt-2"
              />
              <div className="text-xs text-muted-foreground mt-1">
                Tamanho máximo para upload de arquivos
              </div>
            </div>
          </div>
          
          <Separator />
          
          <div className="flex items-center justify-between">
            <div>
              <Label>Compressão Habilitada</Label>
              <div className="text-xs text-muted-foreground">
                Comprime dados para reduzir uso de banda
              </div>
            </div>
            <Switch
              checked={settings.compression_enabled}
              onCheckedChange={(checked) => onChange({ ...settings, compression_enabled: checked })}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const SecuritySettings = ({ settings, onChange }: { settings: SystemSettings; onChange: (settings: SystemSettings) => void }) => {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Shield className="h-5 w-5" />
            <span>Configurações de Segurança</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label>Timeout de Sessão: {Math.floor(settings.session_timeout / 60)}h</Label>
              <Slider
                value={[settings.session_timeout]}
                onValueChange={([value]) => onChange({ ...settings, session_timeout: value })}
                max={1440}
                min={30}
                step={30}
                className="mt-2"
              />
              <div className="text-xs text-muted-foreground mt-1">
                Tempo até expirar sessão inativa
              </div>
            </div>
            
            <div>
              <Label>Tentativas de Login: {settings.max_login_attempts}</Label>
              <Slider
                value={[settings.max_login_attempts]}
                onValueChange={([value]) => onChange({ ...settings, max_login_attempts: value })}
                max={10}
                min={3}
                step={1}
                className="mt-2"
              />
              <div className="text-xs text-muted-foreground mt-1">
                Máximo de tentativas antes de bloquear
              </div>
            </div>
            
            <div>
              <Label>Tamanho Mínimo da Senha: {settings.password_min_length}</Label>
              <Slider
                value={[settings.password_min_length]}
                onValueChange={([value]) => onChange({ ...settings, password_min_length: value })}
                max={20}
                min={6}
                step={1}
                className="mt-2"
              />
              <div className="text-xs text-muted-foreground mt-1">
                Número mínimo de caracteres
              </div>
            </div>
            
            <div>
              <Label>Retenção de Logs: {settings.audit_log_retention} dias</Label>
              <Slider
                value={[settings.audit_log_retention]}
                onValueChange={([value]) => onChange({ ...settings, audit_log_retention: value })}
                max={365}
                min={7}
                step={7}
                className="mt-2"
              />
              <div className="text-xs text-muted-foreground mt-1">
                Tempo de retenção dos logs de auditoria
              </div>
            </div>
          </div>
          
          <Separator />
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Autenticação de Dois Fatores</Label>
                <div className="text-xs text-muted-foreground">
                  Requer 2FA para todos os usuários
                </div>
              </div>
              <Switch
                checked={settings.require_2fa}
                onCheckedChange={(checked) => onChange({ ...settings, require_2fa: checked })}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <Label>Lista Branca de IPs</Label>
                <div className="text-xs text-muted-foreground">
                  Permite apenas IPs autorizados
                </div>
              </div>
              <Switch
                checked={settings.ip_whitelist_enabled}
                onCheckedChange={(checked) => onChange({ ...settings, ip_whitelist_enabled: checked })}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const NotificationSettings = ({ settings, onChange }: { settings: SystemSettings; onChange: (settings: SystemSettings) => void }) => {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Bell className="h-5 w-5" />
            <span>Configurações de Notificações</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Mail className="h-4 w-4" />
                <div>
                  <Label>Notificações por Email</Label>
                  <div className="text-xs text-muted-foreground">
                    Enviar notificações via email
                  </div>
                </div>
              </div>
              <Switch
                checked={settings.email_notifications}
                onCheckedChange={(checked) => onChange({ ...settings, email_notifications: checked })}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Smartphone className="h-4 w-4" />
                <div>
                  <Label>Notificações Push</Label>
                  <div className="text-xs text-muted-foreground">
                    Notificações push no navegador
                  </div>
                </div>
              </div>
              <Switch
                checked={settings.push_notifications}
                onCheckedChange={(checked) => onChange({ ...settings, push_notifications: checked })}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <MessageSquare className="h-4 w-4" />
                <div>
                  <Label>Notificações SMS</Label>
                  <div className="text-xs text-muted-foreground">
                    Enviar notificações via SMS
                  </div>
                </div>
              </div>
              <Switch
                checked={settings.sms_notifications}
                onCheckedChange={(checked) => onChange({ ...settings, sms_notifications: checked })}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Volume2 className="h-4 w-4" />
                <div>
                  <Label>Som de Notificação</Label>
                  <div className="text-xs text-muted-foreground">
                    Reproduzir som ao receber notificações
                  </div>
                </div>
              </div>
              <Switch
                checked={settings.notification_sound}
                onCheckedChange={(checked) => onChange({ ...settings, notification_sound: checked })}
              />
            </div>
          </div>
          
          <Separator />
          
          <div>
            <Label htmlFor="notification_frequency">Frequência de Notificações</Label>
            <Select value={settings.notification_frequency} onValueChange={(value) => onChange({ ...settings, notification_frequency: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="immediate">Imediata</SelectItem>
                <SelectItem value="every_5min">A cada 5 minutos</SelectItem>
                <SelectItem value="every_15min">A cada 15 minutos</SelectItem>
                <SelectItem value="hourly">A cada hora</SelectItem>
                <SelectItem value="daily">Diária</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const WhatsAppSettings = ({ settings, onChange }: { settings: SystemSettings; onChange: (settings: SystemSettings) => void }) => {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <MessageSquare className="h-5 w-5" />
            <span>Configurações do WhatsApp</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label>Timeout do Webhook: {settings.whatsapp_webhook_timeout}s</Label>
              <Slider
                value={[settings.whatsapp_webhook_timeout]}
                onValueChange={([value]) => onChange({ ...settings, whatsapp_webhook_timeout: value })}
                max={60}
                min={5}
                step={5}
                className="mt-2"
              />
              <div className="text-xs text-muted-foreground mt-1">
                Tempo limite para webhooks do WhatsApp
              </div>
            </div>
            
            <div>
              <Label>Tentativas de Retry: {settings.whatsapp_retry_attempts}</Label>
              <Slider
                value={[settings.whatsapp_retry_attempts]}
                onValueChange={([value]) => onChange({ ...settings, whatsapp_retry_attempts: value })}
                max={10}
                min={1}
                step={1}
                className="mt-2"
              />
              <div className="text-xs text-muted-foreground mt-1">
                Número de tentativas em caso de falha
              </div>
            </div>
            
            <div>
              <Label>Rate Limit: {settings.whatsapp_rate_limit}/min</Label>
              <Slider
                value={[settings.whatsapp_rate_limit]}
                onValueChange={([value]) => onChange({ ...settings, whatsapp_rate_limit: value })}
                max={200}
                min={10}
                step={10}
                className="mt-2"
              />
              <div className="text-xs text-muted-foreground mt-1">
                Mensagens por minuto permitidas
              </div>
            </div>
          </div>
          
          <Separator />
          
          <div className="flex items-center justify-between">
            <div>
              <Label>Compressão de Mídia</Label>
              <div className="text-xs text-muted-foreground">
                Comprime imagens e vídeos automaticamente
              </div>
            </div>
            <Switch
              checked={settings.whatsapp_media_compression}
              onCheckedChange={(checked) => onChange({ ...settings, whatsapp_media_compression: checked })}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const InterfaceSettings = ({ settings, onChange }: { settings: SystemSettings; onChange: (settings: SystemSettings) => void }) => {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Palette className="h-5 w-5" />
            <span>Configurações de Interface</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Label htmlFor="theme">Tema</Label>
            <Select value={settings.theme} onValueChange={(value) => onChange({ ...settings, theme: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Claro</SelectItem>
                <SelectItem value="dark">Escuro</SelectItem>
                <SelectItem value="system">Sistema</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <Separator />
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Sidebar Recolhida</Label>
                <div className="text-xs text-muted-foreground">
                  Manter sidebar recolhida por padrão
                </div>
              </div>
              <Switch
                checked={settings.sidebar_collapsed}
                onCheckedChange={(checked) => onChange({ ...settings, sidebar_collapsed: checked })}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <Label>Mostrar Tooltips</Label>
                <div className="text-xs text-muted-foreground">
                  Exibir dicas de ferramentas
                </div>
              </div>
              <Switch
                checked={settings.show_tooltips}
                onCheckedChange={(checked) => onChange({ ...settings, show_tooltips: checked })}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <Label>Animações Habilitadas</Label>
                <div className="text-xs text-muted-foreground">
                  Ativar animações da interface
                </div>
              </div>
              <Switch
                checked={settings.animation_enabled}
                onCheckedChange={(checked) => onChange({ ...settings, animation_enabled: checked })}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <Label>Modo Compacto</Label>
                <div className="text-xs text-muted-foreground">
                  Interface mais densa e compacta
                </div>
              </div>
              <Switch
                checked={settings.compact_mode}
                onCheckedChange={(checked) => onChange({ ...settings, compact_mode: checked })}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export const AdvancedSettings = () => {
  const [settings, setSettings] = useState<SystemSettings>(defaultSettings);
  const [hasChanges, setHasChanges] = useState(false);
  const { toast } = useToast();
  
  const saveSettingsMutation = useSupabaseMutation({
    mutationFn: async (newSettings: SystemSettings) => {
      // Simular salvamento
      await new Promise(resolve => setTimeout(resolve, 1000));
      return newSettings;
    },
    onSuccess: () => {
      setHasChanges(false);
      toast({
        title: "Configurações salvas",
        description: "As configurações foram salvas com sucesso"
      });
    },
    onError: () => {
      toast({
        title: "Erro ao salvar",
        description: "Ocorreu um erro ao salvar as configurações",
        variant: "destructive"
      });
    }
  });

  const handleSettingsChange = (newSettings: SystemSettings) => {
    setSettings(newSettings);
    setHasChanges(true);
  };

  const handleSave = () => {
    saveSettingsMutation.mutate(settings);
  };

  const handleReset = () => {
    setSettings(defaultSettings);
    setHasChanges(true);
  };

  const handleExportSettings = () => {
    const dataStr = JSON.stringify(settings, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'convoflow-settings.json';
    link.click();
    URL.revokeObjectURL(url);
    
    toast({
      title: "Configurações exportadas",
      description: "As configurações foram exportadas com sucesso"
    });
  };

  const handleImportSettings = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedSettings = JSON.parse(e.target?.result as string);
        setSettings({ ...defaultSettings, ...importedSettings });
        setHasChanges(true);
        toast({
          title: "Configurações importadas",
          description: "As configurações foram importadas com sucesso"
        });
      } catch (error) {
        toast({
          title: "Erro na importação",
          description: "Arquivo de configuração inválido",
          variant: "destructive"
        });
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Configurações Avançadas</h2>
          <p className="text-muted-foreground">
            Configure parâmetros avançados do sistema
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <input
            type="file"
            accept=".json"
            onChange={handleImportSettings}
            className="hidden"
            id="import-settings"
          />
          <Button variant="outline" onClick={() => document.getElementById('import-settings')?.click()}>
            <Upload className="h-4 w-4 mr-2" />
            Importar
          </Button>
          <Button variant="outline" onClick={handleExportSettings}>
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
          <Button variant="outline" onClick={handleReset}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Resetar
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={!hasChanges || saveSettingsMutation.isPending}
          >
            {saveSettingsMutation.isPending ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Salvar
          </Button>
        </div>
      </div>

      {hasChanges && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Você tem alterações não salvas. Lembre-se de salvar antes de sair.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="general">Geral</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="security">Segurança</TabsTrigger>
          <TabsTrigger value="notifications">Notificações</TabsTrigger>
          <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
          <TabsTrigger value="interface">Interface</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <GeneralSettings settings={settings} onChange={handleSettingsChange} />
        </TabsContent>

        <TabsContent value="performance">
          <PerformanceSettings settings={settings} onChange={handleSettingsChange} />
        </TabsContent>

        <TabsContent value="security">
          <SecuritySettings settings={settings} onChange={handleSettingsChange} />
        </TabsContent>

        <TabsContent value="notifications">
          <NotificationSettings settings={settings} onChange={handleSettingsChange} />
        </TabsContent>

        <TabsContent value="whatsapp">
          <WhatsAppSettings settings={settings} onChange={handleSettingsChange} />
        </TabsContent>

        <TabsContent value="interface">
          <InterfaceSettings settings={settings} onChange={handleSettingsChange} />
        </TabsContent>
      </Tabs>
    </div>
  );
};