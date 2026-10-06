import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  MessageCircle,
  CalendarClock,
  UserX,
  CheckCircle2,
  Check,
  ChevronRight,
} from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useAttentionItems, type AttentionType } from '@/hooks/useAttentionItems';

const TYPE_META: Record<
  AttentionType,
  { icon: typeof MessageCircle; tint: string; label: string }
> = {
  no_reply: { icon: MessageCircle, tint: 'text-status-error', label: 'Sem resposta' },
  overdue_followup: { icon: CalendarClock, tint: 'text-status-warning', label: 'Follow-up atrasado' },
  stalled_contact: { icon: UserX, tint: 'text-status-info', label: 'Parado no funil' },
};

export const AttentionPanel = () => {
  const navigate = useNavigate();
  const { items, total, counts, isLoading, completeFollowup, isCompleting } = useAttentionItems();

  const verTodosHref =
    counts.overdue_followup >= counts.no_reply ? '/dashboard/followups' : '/dashboard/conversations';

  return (
    <Card className="border-l-4 border-l-status-warning">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <AlertTriangle className="h-5 w-5 text-status-warning" />
          Precisa de Atenção
          {total > 0 && (
            <span className="rounded-full bg-status-warning/15 px-2 py-0.5 text-xs font-semibold text-status-warning">
              {total}
            </span>
          )}
        </CardTitle>
        {total > 0 && (
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => navigate(verTodosHref)}>
            Ver todos
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <CheckCircle2 className="h-10 w-10 text-status-success" />
            <p className="text-sm font-medium text-foreground">Tudo em dia!</p>
            <p className="text-xs text-muted-foreground">
              Nenhuma conversa, follow-up ou contato precisa de atenção agora.
            </p>
          </div>
        ) : (
          items.map((item) => {
            const meta = TYPE_META[item.type];
            const Icon = meta.icon;
            const ago = formatDistanceToNowStrict(new Date(item.since), { locale: ptBR });
            return (
              <div
                key={item.key}
                className="flex items-center gap-3 rounded-lg border border-border p-2.5 transition-colors hover:bg-muted/50"
              >
                <div className={cn('shrink-0', meta.tint)}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{item.contactName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {meta.label} · há {ago}
                    {item.detail ? ` · ${item.detail}` : ''}
                  </p>
                </div>
                {item.type === 'overdue_followup' && item.followupId ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0 gap-1 px-2 text-xs"
                    disabled={isCompleting}
                    onClick={() => completeFollowup(item.followupId!)}
                  >
                    <Check className="h-3.5 w-3.5" />
                    Concluir
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 shrink-0 gap-1 px-2 text-xs"
                    onClick={() => navigate(item.href)}
                  >
                    Abrir
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
};
