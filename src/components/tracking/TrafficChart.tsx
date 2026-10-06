
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DashboardCardSkeleton } from '@/components/shared/Skeleton';

interface TrafficChartProps {
  data?: any[];
  isLoading?: boolean;
}

export const TrafficChart = ({ data, isLoading }: TrafficChartProps) => {
  // Um item sem `date` (ou com data invalida) fazia o format() do date-fns
  // lancar RangeError e derrubar a tela de Rastreamento inteira. Ponto sem
  // data nao tem onde ser plotado, entao sai do grafico em vez de quebrar.
  const chartData =
    data
      ?.filter((item) => item && !Number.isNaN(new Date(item.date).getTime()))
      .map((item) => ({
        date: format(new Date(item.date), 'dd/MM', { locale: ptBR }),
        leads: item.total_leads || 0,
        conversions: item.conversions || 0,
      }))
      .reverse() || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Evolução de Leads e Conversões</CardTitle>
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
                name="Leads"
              />
              <Line
                type="monotone"
                dataKey="conversions"
                stroke="hsl(var(--success))"
                strokeWidth={2}
                name="Conversões"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};
