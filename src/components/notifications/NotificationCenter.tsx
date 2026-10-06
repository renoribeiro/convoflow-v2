import React, { useState } from 'react';
import { Bell, X, AlertTriangle, Info, CheckCircle } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { safeNotificationLink } from '@/lib/notifications/safeLink';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  is_read: boolean;
  created_at: string;
  action_url?: string | null;
  action_label?: string | null;
  metadata?: Record<string, any> | null;
}

interface NotificationCenterProps {
  className?: string;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Notificações são por usuário — o RLS (user_id = auth.uid()) já escopa,
  // então NÃO filtramos por tenant (uma notificação de plataforma pode ter
  // tenant_id nulo). Consulta direta em vez de useSupabaseQuery (que forçaria
  // o filtro tenant_id e quebraria isso).
  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<Notification[]> => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as Notification[];
    },
  });

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });

  const handleMarkAsRead = async (notificationId: string) => {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);
    if (error) {
      toast({ title: 'Erro', description: 'Não foi possível marcar como lida.', variant: 'destructive' });
      return;
    }
    invalidate();
  };

  const handleMarkAllAsRead = async () => {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('is_read', false);
    if (error) {
      toast({ title: 'Erro', description: 'Não foi possível marcar todas como lidas.', variant: 'destructive' });
      return;
    }
    invalidate();
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.is_read) {
      handleMarkAsRead(notification.id);
    }
    // Links internos (ex.: /dashboard/...) navegam na app; externos só se
    // https:// — qualquer outra coisa (javascript:, http:, //site) é ignorada.
    const link = safeNotificationLink(notification.action_url);
    if (link?.kind === 'internal') {
      navigate(link.path);
      setIsOpen(false);
    } else if (link?.kind === 'external') {
      window.open(link.href, '_blank', 'noopener,noreferrer');
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-success" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-warning" />;
      case 'error':
        return <X className="h-4 w-4 text-error" />;
      default:
        return <Info className="h-4 w-4 text-info" />;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) {
      return 'Agora mesmo';
    } else if (diffInHours < 24) {
      return `${diffInHours}h atrás`;
    } else {
      return date.toLocaleDateString('pt-BR');
    }
  };

  return (
    <div className={`relative ${className}`}>
      {/* Botão de notificações */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(!isOpen)}
        className="relative h-8 w-8"
        aria-label="Notificações"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-destructive text-destructive-foreground text-[10px] font-medium rounded-full h-4 min-w-4 px-1 flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Button>

      {/* Painel de notificações */}
      {isOpen && (
        <>
          {/* Overlay */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Painel */}
          <div className="absolute right-0 mt-2 w-96 max-w-[calc(100vw-2rem)] bg-popover text-popover-foreground rounded-lg shadow-lg border border-border z-50 max-h-96 overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="text-lg font-semibold">Notificações</h3>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllAsRead}
                    className="text-sm text-accent hover:text-accent/80"
                  >
                    Marcar todas como lidas
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Fechar notificações"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Lista de notificações */}
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Bell className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
                  <p>Nenhuma notificação</p>
                </div>
              ) : (
                notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={cn(
                      'p-4 border-b border-border hover:bg-muted cursor-pointer transition-colors',
                      !notification.is_read && 'bg-accent/10 border-l-4 border-l-accent',
                    )}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className="flex items-start gap-3">
                      {getNotificationIcon(notification.type)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h4 className={cn(
                            'text-sm truncate',
                            !notification.is_read
                              ? 'font-semibold text-foreground'
                              : 'font-medium text-muted-foreground',
                          )}>
                            {notification.title}
                          </h4>
                          <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">
                            {formatDate(notification.created_at)}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {notification.message}
                        </p>
                        {notification.action_label && (
                          <button className="text-xs text-accent hover:text-accent/80 mt-2">
                            {notification.action_label}
                          </button>
                        )}
                      </div>
                      {!notification.is_read && (
                        <div className="w-2 h-2 bg-accent rounded-full mt-2 flex-shrink-0"></div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="p-3 border-t border-border bg-muted/50">
                <button
                  className="w-full text-sm text-center text-accent hover:text-accent/80"
                  onClick={() => {
                    setIsOpen(false);
                    navigate('/dashboard/notifications');
                  }}
                >
                  Ver todas as notificações
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
export default NotificationCenter;