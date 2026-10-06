
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { DashboardCardSkeleton } from '@/components/shared/Skeleton';
import { CHART_SERIES } from '@/lib/chartColors';

const COLORS = CHART_SERIES;

interface SourceBreakdownProps {
  data?: any[];
  isLoading?: boolean;
}

const RADIAN = Math.PI / 180;
const renderCustomizedLabel = ({
  cx, cy, midAngle, innerRadius, outerRadius, percent
}: any) => {
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor={x > cx ? 'start' : 'end'}
      dominantBaseline="central"
      className="text-xs font-medium"
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

export const SourceBreakdown = ({ data, isLoading }: SourceBreakdownProps) => {
  const chartData = data
    ?.filter(source => source.lead_tracking && source.lead_tracking[0]?.count > 0)
    .map(source => ({
      name: source.name,
      value: source.lead_tracking[0]?.count || 0
    }))
    .sort((a, b) => b.value - a.value) || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Distribuição de Leads por Fonte</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-[300px] flex items-center justify-center">
            <DashboardCardSkeleton />
          </div>
        ) : chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderCustomizedLabel}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center py-8 text-muted-foreground h-[300px] flex flex-col items-center justify-center">
            <p>Nenhuma distribuição disponível</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
