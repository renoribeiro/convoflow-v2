import { useNavigate } from 'react-router-dom';
import { Filter, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useFunnelDistribution } from '@/hooks/useFunnelDistribution';

const numberFmt = new Intl.NumberFormat('pt-BR');

export const FunnelMini = () => {
  const navigate = useNavigate();
  const { stages, total, isLoading } = useFunnelDistribution();

  const populated = stages.filter((s) => s.count > 0);
  const maxCount = Math.max(1, ...stages.map((s) => s.count));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Filter className="h-5 w-5 text-muted-foreground" />
          Funil de Vendas
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => navigate('/dashboard/funnel')}
        >
          Ver funil
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded-md" />
            ))}
          </div>
        ) : populated.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <Filter className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">Funil vazio</p>
            <p className="text-xs text-muted-foreground">
              Nenhum contato em estágios do funil ainda.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {stages.map((stage) => (
              <button
                key={stage.id}
                type="button"
                onClick={() => navigate('/dashboard/funnel')}
                className="group block w-full text-left"
              >
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="truncate font-medium text-foreground">{stage.name}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {numberFmt.format(stage.count)} · {stage.percentage.toFixed(0)}%
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-all duration-500 group-hover:opacity-80"
                    style={{
                      width: `${Math.max(2, (stage.count / maxCount) * 100)}%`,
                      backgroundColor: stage.color,
                    }}
                  />
                </div>
              </button>
            ))}
            <p className="pt-1 text-right text-xs text-muted-foreground">
              {numberFmt.format(total)} contatos no funil
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
