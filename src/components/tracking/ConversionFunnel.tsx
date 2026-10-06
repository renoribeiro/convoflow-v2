
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { DashboardCardSkeleton } from '@/components/shared/Skeleton';

interface ConversionFunnelProps {
  metrics?: any;
  isLoading?: boolean;
}

export const ConversionFunnel = ({ metrics, isLoading }: ConversionFunnelProps) => {
  const totalLeads = metrics?.totalLeads || 0;
  const totalConversions = metrics?.totalConversions || 0;

  const funnelData = [
    { stage: 'Leads Identificados', count: totalLeads, percentage: 100, color: 'bg-blue-500' },
    { stage: 'Conversões', count: totalConversions, percentage: totalLeads > 0 ? (totalConversions / totalLeads) * 100 : 0, color: 'bg-green-500' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Funil de Conversão</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-[300px] flex items-center justify-center">
            <DashboardCardSkeleton />
          </div>
        ) : (
          <div className="space-y-4">
            {funnelData.map((stage, index) => (
              <div key={index} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{stage.stage}</span>
                  <div className="flex items-center space-x-2">
                    <span className="text-2xl font-bold">{stage.count}</span>
                    <span className="text-sm text-muted-foreground">
                      ({stage.percentage}%)
                    </span>
                  </div>
                </div>
                <Progress
                  value={stage.percentage}
                  className="h-3"
                />
                {index < funnelData.length - 1 && (
                  <div className="flex justify-center my-2">
                    <div className="text-xs text-muted-foreground">
                      ↓ {stage.count > 0 ? (((funnelData[index + 1]?.count || 0) / stage.count) * 100).toFixed(1) : 0}% conversão
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
