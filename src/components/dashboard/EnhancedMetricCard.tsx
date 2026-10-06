import { ReactNode, useId } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { BRAND_CHART } from '@/lib/chartColors';
import { LojaWideHint } from '@/components/shared/LojaWideHint';
import type { KpiMetric } from '@/hooks/useDashboardKpis';

interface EnhancedMetricCardProps {
  title: string;
  /** Valor já formatado para exibição. */
  value: string;
  icon: ReactNode;
  metric: KpiMetric;
  href?: string;
  index?: number;
  /** Cor da sparkline (default: lima da marca). */
  sparkColor?: string;
  /** Oculta o indicador de variação (métricas onde não faz sentido). */
  hideDelta?: boolean;
  /**
   * O número é da Loja inteira (conversas/mensagens via loja_* RPCs). Para um
   * atendente com visibilidade restringida aparece a etiqueta "Toda a Loja";
   * para todo mundo mais, nada muda.
   */
  lojaWide?: boolean;
}

export const EnhancedMetricCard = ({
  title,
  value,
  icon,
  metric,
  href,
  index = 0,
  sparkColor = BRAND_CHART.primary,
  hideDelta = false,
  lojaWide = false,
}: EnhancedMetricCardProps) => {
  const navigate = useNavigate();
  const gradientId = useId().replace(/:/g, '');

  if (metric.loading) {
    return <Skeleton className="h-[150px] w-full rounded-lg" />;
  }

  const delta = metric.deltaPct;
  const positive = (delta ?? 0) >= 0;
  const showDelta = !hideDelta && delta !== null && Number.isFinite(delta);
  const clickable = !!href;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05, ease: 'easeOut' }}
    >
      <Card
        className={cn(
          'relative overflow-hidden p-4 transition-all duration-200 hover:shadow-medium',
          clickable && 'cursor-pointer hover:-translate-y-0.5',
        )}
        onClick={clickable ? () => navigate(href!) : undefined}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-muted-foreground">
            {title}
            {lojaWide && <LojaWideHint />}
          </p>
          <span className="text-muted-foreground [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
        </div>

        {/* O número nunca é cortado: quem cede é o sparkline (fica com 48px a
            96px e, se nem 48 couber, desce para a linha de baixo). Antes o
            valor tinha `truncate` e virava "100…" a 1280px, onde o grid de 5
            colunas deixa ~186px por cartão. */}
        <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
          <div className="shrink-0">
            <div className="font-display text-2xl font-bold leading-none text-foreground whitespace-nowrap">
              {value}
            </div>
            {showDelta && (
              <div
                className={cn(
                  'mt-2 flex items-center gap-0.5 text-xs font-medium',
                  positive ? 'text-status-success' : 'text-status-error',
                )}
              >
                {positive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                {Math.abs(delta!).toFixed(1)}%
              </div>
            )}
          </div>

          {/* Sparkline 7 dias */}
          {/* basis 48 + grow até 96: num flex que quebra linha, a quebra olha
              o tamanho-base do item, então a base precisa ser o mínimo. */}
          <div className="h-[44px] grow basis-[48px] max-w-[96px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metric.sparkline} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={sparkColor} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={sparkColor} stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <YAxis hide domain={['dataMin', 'dataMax']} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={sparkColor}
                  strokeWidth={2}
                  fill={`url(#${gradientId})`}
                  isAnimationActive={false}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Card>
    </motion.div>
  );
};
