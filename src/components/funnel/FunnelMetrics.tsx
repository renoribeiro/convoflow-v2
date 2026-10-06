import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, TrendingDown, Users, Target, Clock, DollarSign } from 'lucide-react';

interface FunnelMetricsProps {
  detailed?: boolean;
}

export const FunnelMetrics = ({ detailed = false }: FunnelMetricsProps) => {
  const metrics = {
    totalLeads: 28,
    conversionRate: 18.5,
    averageTime: 12,
    totalValue: 45600,
    monthlyGrowth: 15.2,
    stageConversion: [
      { stage: 'Novos → Qualificados', rate: 62.5, trend: 'up' },
      { stage: 'Qualificados → Proposta', rate: 60.0, trend: 'up' },
      { stage: 'Proposta → Negociação', rate: 66.7, trend: 'down' },
      { stage: 'Negociação → Fechado', rate: 75.0, trend: 'up' }
    ]
  };

  if (!detailed) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total de Leads</p>
                <p className="text-2xl font-bold">{metrics.totalLeads}</p>
              </div>
              <Users className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Taxa de Conversão</p>
                <p className="text-2xl font-bold">{metrics.conversionRate}%</p>
              </div>
              <Target className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Tempo Médio</p>
                <p className="text-2xl font-bold">{metrics.averageTime}d</p>
              </div>
              <Clock className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Valor Total</p>
                <p className="text-2xl font-bold">R$ {metrics.totalValue.toLocaleString()}</p>
              </div>
              <DollarSign className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Métricas Principais */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Leads
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold">{metrics.totalLeads}</p>
                <div className="flex items-center gap-1 mt-1">
                  <TrendingUp className="h-4 w-4 text-green-500" />
                  <span className="text-sm text-green-600">+{metrics.monthlyGrowth}%</span>
                  <span className="text-sm text-muted-foreground">este mês</span>
                </div>
              </div>
              <Users className="h-12 w-12 text-blue-500 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Taxa de Conversão Geral
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold">{metrics.conversionRate}%</p>
                <Progress value={metrics.conversionRate} className="mt-2" />
              </div>
              <Target className="h-12 w-12 text-green-500 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Tempo Médio no Funil
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold">{metrics.averageTime}</p>
                <p className="text-sm text-muted-foreground">dias</p>
              </div>
              <Clock className="h-12 w-12 text-orange-500 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Valor Total do Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold">R$ {metrics.totalValue.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">em negociação</p>
              </div>
              <DollarSign className="h-12 w-12 text-purple-500 opacity-20" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Conversões por Estágio */}
      <Card>
        <CardHeader>
          <CardTitle>Conversão por Estágio do Funil</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {metrics.stageConversion.map((conversion, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">{conversion.stage}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold">{conversion.rate}%</span>
                      {conversion.trend === 'up' ? (
                        <TrendingUp className="h-4 w-4 text-green-500" />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-red-500" />
                      )}
                    </div>
                  </div>
                  <Progress value={conversion.rate} className="h-2" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Métricas Adicionais */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Performance por Fonte</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { source: 'Google Ads', leads: 12, conversion: 25 },
                { source: 'Facebook', leads: 8, conversion: 18 },
                { source: 'Instagram', leads: 5, conversion: 15 },
                { source: 'Indicação', leads: 3, conversion: 35 }
              ].map((item, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{item.source}</p>
                    <p className="text-sm text-muted-foreground">{item.leads} leads</p>
                  </div>
                  <Badge variant={item.conversion > 20 ? 'default' : 'secondary'}>
                    {item.conversion}%
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Performance por Vendedor</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { name: 'Maria Santos', leads: 10, closed: 4 },
                { name: 'Pedro Lima', leads: 8, closed: 2 },
                { name: 'Ana Costa', leads: 6, closed: 3 },
                { name: 'João Silva', leads: 4, closed: 1 }
              ].map((seller, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{seller.name}</p>
                    <p className="text-sm text-muted-foreground">{seller.leads} leads ativos</p>
                  </div>
                  <Badge variant="outline">
                    {seller.closed} fechados
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};