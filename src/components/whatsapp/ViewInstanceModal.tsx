import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  Smartphone, 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  Key, 
  Globe, 
  Webhook, 
  Calendar,
  User,
  Phone
} from 'lucide-react';

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

interface ViewInstanceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instance: WhatsAppInstance;
}

export const ViewInstanceModal = ({ open, onOpenChange, instance }: ViewInstanceModalProps) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-green-500';
      case 'connecting':
        return 'bg-yellow-500';
      case 'close':
      default:
        return 'bg-red-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open':
        return <Wifi className="h-4 w-4 text-green-600" />;
      case 'connecting':
        return <RefreshCw className="h-4 w-4 text-yellow-600 animate-spin" />;
      case 'close':
      default:
        return <WifiOff className="h-4 w-4 text-red-600" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'open':
        return 'Conectado';
      case 'connecting':
        return 'Conectando';
      case 'close':
      default:
        return 'Desconectado';
    }
  };

  const maskApiKey = (key?: string) => {
    if (!key) return 'Não configurado';
    if (key.length <= 8) return key;
    return key.substring(0, 4) + '*'.repeat(key.length - 8) + key.substring(key.length - 4);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Detalhes da Instância WhatsApp
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Status e Informações Básicas */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  {getStatusIcon(instance.status)}
                  {instance.name}
                </span>
                <div className="flex items-center gap-2">
                  <Badge variant={instance.status === 'open' ? 'default' : 'secondary'}>
                    {getStatusText(instance.status)}
                  </Badge>
                  <Badge variant={instance.is_active ? 'default' : 'secondary'}>
                    {instance.is_active ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${getStatusColor(instance.status)}`} />
                <span className="text-sm font-medium">
                  Status: {getStatusText(instance.status)}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Key className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Chave:</span>
                    <code className="bg-muted px-2 py-1 rounded text-xs">
                      {instance.instance_key}
                    </code>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Criado em:</span>
                    <span>{format(new Date(instance.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Perfil WhatsApp */}
          {(instance.phone_number || instance.profile_name) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Perfil WhatsApp
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={instance.profile_picture_url} />
                    <AvatarFallback>
                      {instance.profile_name ? instance.profile_name.charAt(0).toUpperCase() : 'WA'}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="space-y-2">
                    {instance.profile_name && (
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Nome:</span>
                        <span>{instance.profile_name}</span>
                      </div>
                    )}
                    
                    {instance.phone_number && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">Número:</span>
                        <span>{instance.phone_number}</span>
                      </div>
                    )}
                    
                    {instance.last_connected_at && (
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">Última conexão:</span>
                        <span>{format(new Date(instance.last_connected_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</span>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Configurações da Evolution API */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Configurações da Evolution API
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">URL da API</label>
                  <div className="mt-1">
                    <code className="bg-muted px-3 py-2 rounded text-sm block break-all">
                      {instance.evolution_api_url || 'Não configurado'}
                    </code>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-muted-foreground">Chave da API</label>
                  <div className="mt-1">
                    <code className="bg-muted px-3 py-2 rounded text-sm block">
                      {maskApiKey(instance.evolution_api_key)}
                    </code>
                  </div>
                </div>

                {instance.webhook_url && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Webhook className="h-4 w-4" />
                      URL do Webhook
                    </label>
                    <div className="mt-1">
                      <code className="bg-muted px-3 py-2 rounded text-sm block break-all">
                        {instance.webhook_url}
                      </code>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Informações do Sistema */}
          <Card>
            <CardHeader>
              <CardTitle>Informações do Sistema</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium text-muted-foreground">ID da Instância:</span>
                  <div className="mt-1">
                    <code className="bg-muted px-2 py-1 rounded text-xs">
                      {instance.id}
                    </code>
                  </div>
                </div>

                <div>
                  <span className="font-medium text-muted-foreground">Última Atualização:</span>
                  <div className="mt-1">
                    {format(new Date(instance.updated_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};