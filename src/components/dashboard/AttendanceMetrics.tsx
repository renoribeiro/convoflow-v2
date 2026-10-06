import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowDown, ArrowUp, Bot, Clock, Hourglass, MessageSquareOff, Timer, UserRound } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { LojaWideHint } from '@/components/shared/LojaWideHint';
import { useAttendanceMetrics } from '@/hooks/useAttendanceMetrics';
import type { AttendanceCardModel } from '@/lib/dashboard/attendanceMetrics';
import type { UsePeriodFilterResult } from '@/hooks/usePeriodFilter';

const ICONS: Record<AttendanceCardModel['key'], typeof Bot> = {
  bot: Bot,
  human: UserRound,
  waiting: Hourglass,
  noHuman: MessageSquareOff,
  botTouched: Timer,
  duration: Clock,
};

interface AttendanceMetricsProps {
  period: UsePeriodFilterResult;
}

/**
 * Seção "Atendimento" do Dashboard: os números por conversa, da Loja inteira
 * (RPC loja_conversation_metrics). Substitui o cartão único "Tempo Médio de
 * Resposta", que somava bot e pessoa — aqui são dois cartões, em mediana, cada
 * um dizendo o que NÃO conta. A etiqueta "Toda a Loja" segue o padrão dos
 * outros cartões (só aparece para atendente com visibilidade restrita).
 */
export const AttendanceMetrics = ({ period }: AttendanceMetricsProps) => {
  const navigate = useNavigate();
  const { cards, isLoading, unavailable } = useAttendanceMetrics(period);

  return (
    <section aria-labelledby="attendance-metrics-title" className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 id="attendance-metrics-title" className="text-base font-semibold text-foreground">
          Atendimento
        </h2>
        <p className="text-xs text-muted-foreground">
          Conversas iniciadas no período. Bot e pessoa são medidos separados.
        </p>
      </div>

      {unavailable ? (
        <p className="text-sm text-muted-foreground" data-testid="attendance-unavailable">
          Sem números de atendimento para esta Conta.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {cards.map((card, i) => {
            const Icon = ICONS[card.key];
            if (isLoading) return <Skeleton key={card.key} className="h-[140px] w-full rounded-lg" />;
            const showDelta = card.deltaPct !== null && Number.isFinite(card.deltaPct);
            const positive = (card.deltaPct ?? 0) >= 0;
            const clickable = !!card.href;
            return (
              <motion.div
                key={card.key}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.05, ease: 'easeOut' }}
              >
                <Card
                  data-testid={`attendance-card-${card.key}`}
                  className={cn(
                    'flex h-full flex-col p-4 transition-all duration-200 hover:shadow-medium',
                    clickable && 'cursor-pointer hover:-translate-y-0.5',
                  )}
                  onClick={clickable ? () => navigate(card.href!) : undefined}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-muted-foreground">
                      {card.title}
                      {card.lojaWide && <LojaWideHint />}
                    </p>
                    <Icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                  </div>
                  <div className="mt-2 font-display text-2xl font-bold leading-none text-foreground whitespace-nowrap">
                    {card.value}
                  </div>
                  {showDelta && (
                    <div
                      className={cn(
                        'mt-2 flex items-center gap-0.5 text-xs font-medium',
                        positive ? 'text-status-success' : 'text-status-error',
                      )}
                    >
                      {positive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                      {Math.abs(card.deltaPct!).toFixed(0)}% {positive ? 'mais rápido' : 'mais lento'}
                    </div>
                  )}
                  <p className="mt-2 text-xs leading-snug text-muted-foreground">{card.description}</p>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </section>
  );
};
