
import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { TrafficChart } from './TrafficChart';
import { ConversionFunnel } from './ConversionFunnel';
import { SourceBreakdown } from './SourceBreakdown';
import { DashboardCardSkeleton } from '@/components/shared/Skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  TrendingUp,
  TrendingDown,
  Users,
  Target,
  DollarSign,
  Eye,
  Globe,
  Facebook,
  Instagram,
  Search,
  AlertCircle
} from 'lucide-react';
import {
  useTrackingMetrics,
  useTrafficSources,
  useCampaignPerformance
} from '@/hooks/useTracking';
import { formatCurrency } from '@/lib/utils';
import { DateRange } from 'react-day-picker';

// Mapeamento de ícones por tipo de fonte
const getSourceIcon = (sourceType: string) => {
  const iconMap: Record<string, any> = {
    'facebook': Facebook,
    'instagram': Instagram,
    'google': Search,
    'organic': Globe,
    'direct': Users,
    'email': Target,
    'social': Instagram,
    'paid': Search,
    'referral': Globe,
  };
  return iconMap[sourceType.toLowerCase()] || Globe;
};

// Mapeamento de cores por tipo de fonte
const getSourceColor = (sourceType: string) => {
  const colorMap: Record<string, string> = {
    'facebook': 'bg-blue-500',
    'instagram': 'bg-purple-500',
    'google': 'bg-green-500',
    'organic': 'bg-orange-500',
    'direct': 'bg-gray-500',
    'email': 'bg-red-500',
    'social': 'bg-pink-500',
    'paid': 'bg-yellow-500',
    'referral': 'bg-indigo-500',
  };
  return colorMap[sourceType.toLowerCase()] || 'bg-gray-500';
};

interface TrackingDashboardProps {
  dateRange?: DateRange;
  selectedSources?: string[];
  selectedStatus?: string;
}

export const TrackingDashboard = ({ dateRange, selectedSources, selectedStatus }: TrackingDashboardProps) => {
  const defaultDateRange = useMemo(() => {
    if (dateRange && dateRange.from && dateRange.to) {
      return {
        from: dateRange.from.toISOString(),
        to: dateRange.to.toISOString()
      };
    }
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return {
      from: thirtyDaysAgo.toISOString(),
      to: now.toISOString()
    };
  }, [dateRange]);

  const { data: metrics, isLoading: metricsLoading, error: metricsError } = useTrackingMetrics(defaultDateRange);
  const { data: trafficSources, isLoading: sourcesLoading } = useTrafficSources();
  const { data: campaignData, isLoading: campaignLoading } = useCampaignPerformance(defaultDateRange);

  // Estados de loading
  const isLoading = metricsLoading || sourcesLoading || campaignLoading;

  // Tratar erro
  if (metricsError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Erro ao carregar dados de tracking: {metricsError.message}
        </AlertDescription>
      </Alert>
    );
  }

  // Calcular métricas derivadas
  const totalLeads = metrics?.totalLeads || 0;
  const totalConversions = metrics?.totalConversions || 0;
  const totalRevenue = metrics?.totalRevenue || 0;
  const conversionRate = metrics?.conversionRate || 0;

  // Calcular tendências (comparação com período anterior)
  const leadsGrowth = metrics?.trends?.leads?.value || 0;
  const conversionsGrowth = metrics?.trends?.conversions?.value || 0;
  const revenueGrowth = metrics?.trends?.revenue?.value || 0;
  const rateGrowth = metrics?.trends?.rate?.value || 0;

  return (
    <div className="space-y-6">
      {/* Métricas Principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          <DashboardCardSkeleton />
        ) : (
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total de Leads</p>
                  <p className="text-3xl font-bold">{totalLeads.toLocaleString()}</p>
                  <div className="flex items-center mt-1">
                    {leadsGrowth >= 0 ? (
                      <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-red-500 mr-1" />
                    )}
                    <span className={`text-sm ${leadsGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {Math.abs(leadsGrowth).toFixed(1)}%
                    </span>
                    <span className="text-sm text-muted-foreground ml-1">vs mês anterior</span>
                  </div>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Users className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <DashboardCardSkeleton />
        ) : (
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Conversões</p>
                  <p className="text-3xl font-bold">{totalConversions.toLocaleString()}</p>
                  <div className="flex items-center mt-1">
                    {conversionsGrowth >= 0 ? (
                      <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-red-500 mr-1" />
                    )}
                    <span className={`text-sm ${conversionsGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {Math.abs(conversionsGrowth).toFixed(1)}%
                    </span>
                    <span className="text-sm text-muted-foreground ml-1">vs mês anterior</span>
                  </div>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <Target className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <DashboardCardSkeleton />
        ) : (
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Receita Gerada</p>
                  <p className="text-3xl font-bold">R$ {totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  <div className="flex items-center mt-1">
                    {revenueGrowth >= 0 ? (
                      <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-red-500 mr-1" />
                    )}
                    <span className={`text-sm ${revenueGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {Math.abs(revenueGrowth).toFixed(1)}%
                    </span>
                    <span className="text-sm text-muted-foreground ml-1">vs mês anterior</span>
                  </div>
                </div>
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <DollarSign className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <DashboardCardSkeleton />
        ) : (
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Taxa de Conversão</p>
                  <p className="text-3xl font-bold">{conversionRate.toFixed(1)}%</p>
                  <div className="flex items-center mt-1">
                    {rateGrowth >= 0 ? (
                      <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-red-500 mr-1" />
                    )}
                    <span className={`text-sm ${rateGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {Math.abs(rateGrowth).toFixed(1)}%
                    </span>
                    <span className="text-sm text-muted-foreground ml-1">vs mês anterior</span>
                  </div>
                </div>
                <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                  <Eye className="w-6 h-6 text-orange-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Gráficos e Análises */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TrafficChart data={metrics?.rawData} isLoading={isLoading} />
        <ConversionFunnel metrics={metrics} isLoading={isLoading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <SourceBreakdown data={trafficSources} isLoading={isLoading} />
        </div>

        {/* Performance por Fonte */}
        <Card>
          <CardHeader>
            <CardTitle>Performance por Fonte</CardTitle>
          </CardHeader>
          <CardContent>
            {sourcesLoading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-gray-200 rounded-lg animate-pulse" />
                      <div className="space-y-1">
                        <div className="w-20 h-3 bg-gray-200 rounded animate-pulse" />
                        <div className="w-32 h-2 bg-gray-200 rounded animate-pulse" />
                      </div>
                    </div>
                    <div className="w-12 h-6 bg-gray-200 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {trafficSources?.slice(0, 5).map((source: any) => {
                  const IconComponent = getSourceIcon(source.type || 'organic');
                  const colorClass = getSourceColor(source.type || 'organic');
                  // Assumindo que lead_tracking(count) retorna um array com objeto count
                  const totalLeads = source.lead_tracking?.[0]?.count || 0;
                  const totalConversions = source.total_conversions || 0; // Se houver coluna ou join de conversões na fonte
                  const conversionRate = totalLeads > 0
                    ? (totalConversions / totalLeads) * 100
                    : 0;

                  return (
                    <div key={source.id} className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className={`w-8 h-8 ${colorClass} rounded-lg flex items-center justify-center`}>
                          <IconComponent className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{source.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {totalLeads} leads • {totalConversions} conversões
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline">
                          {conversionRate.toFixed(1)}%
                        </Badge>
                      </div>
                    </div>
                  );
                })}
                {(!trafficSources || trafficSources.length === 0) && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Globe className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhuma fonte de tráfego configurada</p>
                    <p className="text-sm">Configure suas fontes para ver os dados aqui</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
