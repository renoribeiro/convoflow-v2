import { MessageCircle, UserPlus, Megaphone, Bot, Target, Inbox } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useRecentActivity } from '@/hooks/useRecentActivity';

const TYPE_ICON = {
  message: MessageCircle,
  contact: UserPlus,
  campaign: Megaphone,
  automation: Bot,
  conversion: Target,
} as const;

const STATUS_TINT: Record<string, string> = {
  success: 'text-status-success',
  pending: 'text-status-warning',
  warning: 'text-status-warning',
  error: 'text-status-error',
};

export const ActivityFeed = () => {
  const { activities, isLoading } = useRecentActivity(10);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Atividades Recentes</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <Inbox className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">Sem atividades recentes</p>
            <p className="text-xs text-muted-foreground">As ações dos últimos 7 dias aparecerão aqui.</p>
          </div>
        ) : (
          <ScrollArea className="h-[340px] pr-3">
            <ul className="space-y-1">
              {activities.map((a) => {
                const Icon = TYPE_ICON[a.type] ?? MessageCircle;
                const tint = STATUS_TINT[a.status] ?? 'text-muted-foreground';
                return (
                  <li key={a.id} className="flex gap-3 rounded-lg p-2 transition-colors hover:bg-muted/50">
                    <span className={`mt-0.5 shrink-0 ${tint}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{a.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{a.description}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                        há {formatDistanceToNowStrict(new Date(a.timestamp), { locale: ptBR })}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};
