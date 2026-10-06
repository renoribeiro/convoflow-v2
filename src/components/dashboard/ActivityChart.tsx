import { Activity } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BRAND_CHART } from '@/lib/chartColors';
import { useActivityChartData } from '@/hooks/useActivityChartData';
import { LojaWideHint } from '@/components/shared/LojaWideHint';
import type { UsePeriodFilterResult } from '@/hooks/usePeriodFilter';

interface ActivityChartProps {
  period: UsePeriodFilterResult;
}

interface TooltipPayloadItem {
  name: string;
  value: number;
  color: string;
}

const ChartTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-medium">
      <p className="mb-1 font-medium text-foreground">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-1.5 text-muted-foreground">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
          {p.name}: <span className="font-medium text-foreground">{p.value}</span>
        </p>
      ))}
    </div>
  );
};

export const ActivityChart = ({ period }: ActivityChartProps) => {
  const { data, isLoading } = useActivityChartData(period);
  const hasData = data.some((d) => d.enviadas > 0 || d.recebidas > 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Activity className="h-5 w-5 text-muted-foreground" />
          Atividade de Mensagens
          <LojaWideHint />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[280px] w-full rounded-lg" />
        ) : !hasData ? (
          <div className="flex h-[280px] flex-col items-center justify-center gap-2 text-center">
            <Activity className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">Sem mensagens no período</p>
            <p className="text-xs text-muted-foreground">
              As mensagens enviadas e recebidas aparecerão aqui.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <defs>
                <linearGradient id="grad-enviadas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={BRAND_CHART.primary} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={BRAND_CHART.primary} stopOpacity={0.1} />
                </linearGradient>
                <linearGradient id="grad-recebidas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={BRAND_CHART.secondary} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={BRAND_CHART.secondary} stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                className="fill-muted-foreground"
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={24}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                className="fill-muted-foreground"
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                width={36}
              />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="enviadas"
                name="Enviadas"
                stroke={BRAND_CHART.primary}
                strokeWidth={2}
                fill="url(#grad-enviadas)"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="recebidas"
                name="Recebidas"
                stroke={BRAND_CHART.secondary}
                strokeWidth={2}
                fill="url(#grad-recebidas)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
        {hasData && !isLoading && (
          <div className="mt-3 flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: BRAND_CHART.primary }} />
              Enviadas
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: BRAND_CHART.secondary }} />
              Recebidas
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
