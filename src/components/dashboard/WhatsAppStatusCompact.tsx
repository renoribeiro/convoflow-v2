import { useNavigate } from 'react-router-dom';
import { Smartphone, Settings } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useWhatsAppInstances } from '@/hooks/useWhatsAppInstances';

const normalize = (status: string): 'connected' | 'connecting' | 'disconnected' => {
  switch (status) {
    case 'connected':
    case 'open':
      return 'connected';
    case 'connecting':
    case 'qrcode':
      return 'connecting';
    default:
      return 'disconnected';
  }
};

const DOT: Record<string, string> = {
  connected: 'bg-status-success',
  connecting: 'bg-status-warning animate-pulse',
  disconnected: 'bg-status-error',
};

export const WhatsAppStatusCompact = () => {
  const navigate = useNavigate();
  const { instances, isLoading, error } = useWhatsAppInstances();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Smartphone className="h-5 w-5 text-muted-foreground" />
          Status WhatsApp
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => navigate('/dashboard/whatsapp-numbers')}
        >
          <Settings className="h-3.5 w-3.5" />
          Gerenciar
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-11 w-full rounded-lg" />)
        ) : error ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            Erro ao carregar instâncias
          </p>
        ) : instances.length === 0 ? (
          <div className="flex flex-col items-center gap-1 py-5 text-center">
            <Smartphone className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-xs text-muted-foreground">Nenhuma instância configurada</p>
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() => navigate('/dashboard/whatsapp-numbers')}
            >
              Conectar WhatsApp
            </Button>
          </div>
        ) : (
          instances.map((instance) => {
            const status = normalize(instance.status);
            return (
              <div
                key={instance.id}
                className="flex items-center gap-3 rounded-lg border border-border p-2.5"
              >
                <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', DOT[status])} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{instance.name}</p>
                  {instance.number && (
                    <p className="truncate text-xs text-muted-foreground">{instance.number}</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-foreground">{instance.messagesCount}</p>
                  <p className="text-[11px] text-muted-foreground">msgs hoje</p>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
};
