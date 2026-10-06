import { useNavigate } from 'react-router-dom';
import { Workflow, ChevronRight, CheckCircle2, XCircle, Loader } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useAutomationsSummary } from '@/hooks/useAutomationsSummary';
import type { UsePeriodFilterResult } from '@/hooks/usePeriodFilter';

interface AutomationsSummaryProps {
  period: UsePeriodFilterResult;
}

const numberFmt = new Intl.NumberFormat('pt-BR');

export const AutomationsSummary = ({ period }: AutomationsSummaryProps) => {
  const navigate = useNavigate();
  const { activeFlows, totalExecutions, byStatus, successRate, isLoading } =
    useAutomationsSummary(period);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Workflow className="h-5 w-5 text-muted-foreground" />
          Automações
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => navigate('/dashboard/automation')}
        >
          Gerenciar
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[180px] w-full rounded-lg" />
        ) : (
          <div className="space-y-4">
            <div className="flex items-end justify-between">
              <div>
                <p className="font-display text-3xl font-bold leading-none text-foreground">
                  {numberFmt.format(activeFlows)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">fluxos ativos</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-foreground">
                  {numberFmt.format(totalExecutions)}
                </p>
                <p className="text-xs text-muted-foreground">execuções no período</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Taxa de sucesso</span>
                <span className="font-semibold text-foreground">{successRate.toFixed(0)}%</span>
              </div>
              <Progress value={successRate} className="h-2" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
              <StatusPill
                icon={<CheckCircle2 className="h-3.5 w-3.5 text-status-success" />}
                label="Concluídas"
                value={byStatus.completed}
              />
              <StatusPill
                icon={<Loader className="h-3.5 w-3.5 text-status-warning" />}
                label="Em execução"
                value={byStatus.running}
              />
              <StatusPill
                icon={<XCircle className="h-3.5 w-3.5 text-status-error" />}
                label="Falhas"
                value={byStatus.failed}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const StatusPill = ({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) => (
  <div className="rounded-lg border border-border p-2 text-center">
    <div className="flex items-center justify-center gap-1">
      {icon}
      <span className="text-sm font-semibold text-foreground">{numberFmt.format(value)}</span>
    </div>
    <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
  </div>
);
