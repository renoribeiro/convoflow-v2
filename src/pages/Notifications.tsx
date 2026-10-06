import { useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Bell,
  MessageSquare,
  Users,
  TrendingUp,
  Settings,
  Check,
  X,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type NotificationType = 'info' | 'success' | 'warning' | 'error';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  isRead: boolean;
  timestamp: string;
  icon: React.ReactNode;
}

const TYPE_TO_STATUS: Record<NotificationType, 'info' | 'success' | 'warning' | 'danger'> = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  error: 'danger',
};

const TYPE_LABELS: Record<NotificationType, string> = {
  info: 'Info',
  success: 'Sucesso',
  warning: 'Alerta',
  error: 'Erro',
};

const TYPE_ICON_CLASS: Record<NotificationType, string> = {
  success: 'text-emerald-600 bg-emerald-50',
  warning: 'text-amber-600 bg-amber-50',
  error: 'text-red-600 bg-red-50',
  info: 'text-sky-600 bg-sky-50',
};

const mockNotifications: Notification[] = [
  {
    id: '1',
    title: 'Nova mensagem recebida',
    message: 'Ana Silva enviou uma nova mensagem no WhatsApp',
    type: 'info',
    isRead: false,
    timestamp: '2 minutos atrás',
    icon: <MessageSquare className="w-4 h-4" />,
  },
  {
    id: '2',
    title: 'Lead movido no funil',
    message: 'Carlos Santos foi movido para "Proposta"',
    type: 'success',
    isRead: false,
    timestamp: '15 minutos atrás',
    icon: <TrendingUp className="w-4 h-4" />,
  },
  {
    id: '3',
    title: 'Follow-up agendado',
    message: 'Lembrete: Ligar para Maria Oliveira às 14:00',
    type: 'warning',
    isRead: true,
    timestamp: '1 hora atrás',
    icon: <Clock className="w-4 h-4" />,
  },
  {
    id: '4',
    title: 'Novo contato adicionado',
    message: 'João Pereira foi adicionado aos contatos',
    type: 'info',
    isRead: true,
    timestamp: '2 horas atrás',
    icon: <Users className="w-4 h-4" />,
  },
  {
    id: '5',
    title: 'Problema de conexão',
    message: 'WhatsApp desconectado. Verifique as configurações.',
    type: 'error',
    isRead: false,
    timestamp: '3 horas atrás',
    icon: <AlertCircle className="w-4 h-4" />,
  },
];

export default function Notifications() {
  const [notifications, setNotifications] = useState(mockNotifications);
  const [preferences, setPreferences] = useState({
    emailNotifications: true,
    pushNotifications: true,
    whatsappMessages: true,
    funnelUpdates: true,
    followupReminders: true,
    systemAlerts: true,
  });
  const { toast } = useToast();

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const markAsRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
  };

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    toast({ title: 'Todas as notificações foram marcadas como lidas' });
  };

  const deleteNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notificações"
        helpKey="page:notifications"
        description={`${unreadCount} não lida${unreadCount !== 1 ? 's' : ''}`}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Notificações' },
        ]}
        actions={
          <Button variant="outline" size="sm" onClick={markAllAsRead} disabled={unreadCount === 0}>
            <Check className="w-4 h-4 mr-2" />
            Marcar todas como lidas
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lista */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Bell className="w-4 h-4" />
                Notificações Recentes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {notifications.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Nenhuma notificação
                </p>
              ) : (
                notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-3 rounded-md border transition-colors ${
                      notification.isRead
                        ? 'bg-muted/20 border-muted'
                        : 'bg-card border-border shadow-sm'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`p-1.5 rounded-full flex-shrink-0 ${TYPE_ICON_CLASS[notification.type]}`}
                      >
                        {notification.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h4
                              className={`text-sm font-medium leading-snug ${
                                notification.isRead ? 'text-muted-foreground' : 'text-foreground'
                              }`}
                            >
                              {notification.title}
                            </h4>
                            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                              {notification.message}
                            </p>
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className="text-[10px] text-muted-foreground">
                                {notification.timestamp}
                              </span>
                              <StatusBadge status={TYPE_TO_STATUS[notification.type]}>
                                {TYPE_LABELS[notification.type]}
                              </StatusBadge>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {!notification.isRead && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => markAsRead(notification.id)}
                                title="Marcar como lida"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => deleteNotification(notification.id)}
                              title="Excluir notificação"
                            >
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Preferências */}
        <div>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings className="w-4 h-4" />
                Preferências
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { id: 'email', label: 'Email', desc: 'Receber notificações por email', key: 'emailNotifications' as const },
                { id: 'push', label: 'Push', desc: 'Notificações no navegador', key: 'pushNotifications' as const },
                { id: 'whatsapp', label: 'WhatsApp', desc: 'Novas mensagens recebidas', key: 'whatsappMessages' as const },
                { id: 'funnel', label: 'Funil', desc: 'Mudanças no funil de vendas', key: 'funnelUpdates' as const },
                { id: 'followup', label: 'Follow-ups', desc: 'Lembretes de follow-up', key: 'followupReminders' as const },
                { id: 'system', label: 'Sistema', desc: 'Alertas do sistema', key: 'systemAlerts' as const },
              ].map((item, idx, arr) => (
                <div key={item.id}>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor={item.id} className="text-sm font-medium">
                        {item.label}
                      </Label>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                    <Switch
                      id={item.id}
                      checked={preferences[item.key]}
                      onCheckedChange={(checked) =>
                        setPreferences((prev) => ({ ...prev, [item.key]: checked }))
                      }
                    />
                  </div>
                  {idx < arr.length - 1 && <Separator className="mt-4" />}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
