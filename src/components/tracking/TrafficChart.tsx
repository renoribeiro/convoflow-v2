
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { DashboardCardSkeleton } from '@/components/shared/Skeleton';
import { rotuloDiaCurto } from '@/lib/datas/brasilia';
import { CHART_SERIES } from '@/lib/chartColors';
import type { DiaDoResumo } from '@/lib/rastreamento/resumo';

interface TrafficChartProps {
  data?: DiaDoResumo[];
  isLoading?: boolean;
}

export const TrafficChart = ({ data, isLoading }: TrafficChartProps) => {
  // O dia vem do banco já em Brasília ("AAAA-MM-DD"), um ponto por dia do
  // período, com zero onde não houve nada. O rótulo sai do texto, sem Date:
  // new Date('2026-11-12') é meia noite UTC, 11/11 às 21h em Brasília.
  const chartData =
    data
      ?.filter((item) => item && /^\d{4}-\d{2}-\d{2}/.test(item.dia))
      .map((item) => ({
        date: rotuloDiaCurto(item.dia),
        leads: item.contatos || 0,
        conversions: item.conversoes || 0,
        ads: item.conversas_anuncio || 0,
      })) || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contatos, conversões e conversas de anúncio por dia</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-[300px] flex items-center justify-center">
            <DashboardCardSkeleton />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="leads"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                name="Contatos"
              />
              <Line
                type="monotone"
                dataKey="conversions"
                stroke="hsl(var(--success))"
                strokeWidth={2}
                name="Conversões"
              />
              <Line
                type="monotone"
                dataKey="ads"
                stroke={CHART_SERIES[1]}
                strokeWidth={2}
                name="Conversas de anúncio"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};
