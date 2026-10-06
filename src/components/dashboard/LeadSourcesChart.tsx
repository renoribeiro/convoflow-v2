import { PieChart as PieChartIcon } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useLeadSourcesDistribution } from '@/hooks/useLeadSourcesDistribution';
import type { UsePeriodFilterResult } from '@/hooks/usePeriodFilter';

interface LeadSourcesChartProps {
  period: UsePeriodFilterResult;
}

const numberFmt = new Intl.NumberFormat('pt-BR');

const SourcesTooltip = ({ active, payload }: { active?: boolean; payload?: any[] }) => {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-medium">
      <p className="flex items-center gap-1.5 text-muted-foreground">
        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: item.payload.color }} />
        {item.name}:{' '}
        <span className="font-medium text-foreground">
          {numberFmt.format(item.value)} ({item.payload.percentage.toFixed(0)}%)
        </span>
      </p>
    </div>
  );
};

export const LeadSourcesChart = ({ period }: LeadSourcesChartProps) => {
  const { data, total, isLoading } = useLeadSourcesDistribution(period);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <PieChartIcon className="h-5 w-5 text-muted-foreground" />
          Contatos por Fonte
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[220px] w-full rounded-lg" />
        ) : total === 0 ? (
          <div className="flex h-[220px] flex-col items-center justify-center gap-2 text-center">
            <PieChartIcon className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">Sem contatos no período</p>
            <p className="text-xs text-muted-foreground">As fontes de lead aparecerão aqui.</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <div className="h-[180px] w-[180px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    isAnimationActive={false}
                  >
                    {data.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip content={<SourcesTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="flex-1 space-y-1.5">
              {data.slice(0, 6).map((entry) => (
                <li key={entry.name} className="flex items-center gap-2 text-xs">
                  <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
                  <span className="flex-1 truncate text-foreground">{entry.name}</span>
                  <span className="shrink-0 font-medium text-muted-foreground">
                    {numberFmt.format(entry.value)} · {entry.percentage.toFixed(0)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
