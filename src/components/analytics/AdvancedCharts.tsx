import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ComingSoonButton } from '@/components/shared/ComingSoonButton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  FunnelChart,
  Funnel,
  LabelList
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  PieChart as PieChartIcon,
  Activity,
  Target,
  Users,
  DollarSign,
  Calendar,
  Filter,
  Download,
  Maximize2,
  RefreshCw
} from 'lucide-react';
import { AnalyticsFilters } from './AdvancedFilters';
import { useRealTimeChartData } from '@/hooks/useRealTimeAnalytics';
import { cn } from '@/lib/utils';
import { CHART_SERIES, BRAND_CHART } from '@/lib/chartColors';

// Interfaces
interface AdvancedChartsProps {
  filters: AnalyticsFilters;
  className?: string;
}

interface ChartData {
  date: string;
  leads: number;
  conversions: number;
  revenue: number;
  visitors: number;
  conversionRate: number;
  avgTicket: number;
  source?: string;
  campaign?: string;
  device?: string;
}

interface FunnelData {
  name: string;
  value: number;
  percentage: number;
  color: string;
}

interface SourceData {
  source: string;
  leads: number;
  conversions: number;
  revenue: number;
  conversionRate: number;
  cost: number;
  roi: number;
}

// Funções de mock removidas

// Paleta de cores para gráficos derivada da marca ConvoFlow
const COLORS = CHART_SERIES;

export const AdvancedCharts = ({ filters, className }: AdvancedChartsProps) => {
  const [chartType, setChartType] = useState<'line' | 'area' | 'bar'>('line');
  const [selectedMetric, setSelectedMetric] = useState<'leads' | 'conversions' | 'revenue' | 'conversionRate'>('leads');
  const [timeGranularity, setTimeGranularity] = useState<'day' | 'week' | 'month'>('day');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Usar hook de dados em tempo real
  const { chartData: realTimeChartData, sourceData: realTimeSourceData, funnelData: realTimeFunnelData, isLoading, error, refresh, lastUpdated } = useRealTimeChartData(filters);

  // Dados processados (remoção de fallbacks mockados)
  const chartData = useMemo(() => realTimeChartData, [realTimeChartData]);
  const funnelData = useMemo(() => realTimeFunnelData, [realTimeFunnelData]);
  const sourceData = useMemo(() => realTimeSourceData, [realTimeSourceData]);

  // Métricas calculadas
  const metrics = useMemo(() => {
    const totalLeads = chartData.reduce((sum, item) => sum + item.leads, 0);
    const totalConversions = chartData.reduce((sum, item) => sum + item.conversions, 0);
    const totalRevenue = chartData.reduce((sum, item) => sum + item.revenue, 0);
    const avgConversionRate = totalLeads > 0 ? (totalConversions / totalLeads) * 100 : 0;

    return {
      totalLeads,
      totalConversions,
      totalRevenue,
      avgConversionRate,
      avgTicket: totalConversions > 0 ? totalRevenue / totalConversions : 0
    };
  }, [chartData]);

  // Configurações do tooltip customizado
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border rounded-lg p-3 shadow-lg">
          <p className="font-medium">{`Data: ${label}`}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }}>
              {`${entry.dataKey}: ${entry.value.toLocaleString('pt-BR')}`}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // Renderizar gráfico principal
  const renderMainChart = () => {
    const ChartComponent = chartType === 'line' ? LineChart : chartType === 'area' ? AreaChart : BarChart;

    return (
      <ResponsiveContainer width="100%" height={400}>
        <ChartComponent data={chartData}>
          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12 }}
            tickFormatter={(value) => new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
          />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />

          {chartType === 'line' && (
            <>
              <Line
                type="monotone"
                dataKey={selectedMetric}
                stroke={BRAND_CHART.primary}
                strokeWidth={2}
                dot={{ fill: BRAND_CHART.primary, strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6 }}
              />
            </>
          )}

          {chartType === 'area' && (
            <Area
              type="monotone"
              dataKey={selectedMetric}
              stroke={BRAND_CHART.primary}
              fill={BRAND_CHART.primary}
              fillOpacity={0.3}
            />
          )}

          {chartType === 'bar' && (
            <Bar dataKey={selectedMetric} fill={BRAND_CHART.primary} radius={[4, 4, 0, 0]} />
          )}
        </ChartComponent>
      </ResponsiveContainer>
    );
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header com status e controles */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-xl font-bold">Análises Avançadas</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Visualizações detalhadas dos seus dados de conversão
              {lastUpdated && (
                <span className="ml-2">
                  • Última atualização: {lastUpdated.toLocaleTimeString()}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center space-x-2">
            {error && (
              <Badge variant="destructive" className="text-xs">
                Erro nos dados
              </Badge>
            )}
            {isLoading && (
              <Badge variant="secondary" className="text-xs">
                <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                Atualizando
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={refresh}
              disabled={isLoading}
            >
              <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
              Atualizar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsFullscreen(!isFullscreen)}
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
            <ComingSoonButton variant="outline" size="sm" motivo="Exportação em breve">
              <Download className="h-4 w-4 mr-2" />
              Exportar
            </ComingSoonButton>
          </div>
        </CardHeader>
      </Card>

      {/* Métricas resumo */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total de Leads</p>
                <p className="text-2xl font-bold">{metrics.totalLeads.toLocaleString('pt-BR')}</p>
              </div>
              <Users className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Conversões</p>
                <p className="text-2xl font-bold">{metrics.totalConversions.toLocaleString('pt-BR')}</p>
              </div>
              <Target className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Receita Total</p>
                <p className="text-2xl font-bold">R$ {metrics.totalRevenue.toLocaleString('pt-BR')}</p>
              </div>
              <DollarSign className="w-8 h-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Taxa de Conversão</p>
                <p className="text-2xl font-bold">{metrics.avgConversionRate.toFixed(1)}%</p>
              </div>
              <TrendingUp className="w-8 h-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Ticket Médio</p>
                <p className="text-2xl font-bold">R$ {metrics.avgTicket.toFixed(0)}</p>
              </div>
              <Activity className="w-8 h-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos principais */}
      <Tabs defaultValue="trends" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="trends">Tendências</TabsTrigger>
          <TabsTrigger value="funnel">Funil</TabsTrigger>
          <TabsTrigger value="sources">Fontes</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        {/* Aba de Tendências */}
        <TabsContent value="trends">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Análise de Tendências
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Select value={selectedMetric} onValueChange={(value: any) => setSelectedMetric(value)}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="leads">Leads</SelectItem>
                      <SelectItem value="conversions">Conversões</SelectItem>
                      <SelectItem value="revenue">Receita</SelectItem>
                      <SelectItem value="conversionRate">Taxa de Conversão</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={chartType} onValueChange={(value: any) => setChartType(value)}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="line">Linha</SelectItem>
                      <SelectItem value="area">Área</SelectItem>
                      <SelectItem value="bar">Barras</SelectItem>
                    </SelectContent>
                  </Select>

                  <ComingSoonButton variant="outline" size="sm" motivo="Exportação em breve">
                    <Download className="w-4 h-4 mr-1" />
                    Exportar
                  </ComingSoonButton>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {renderMainChart()}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Aba do Funil */}
        <TabsContent value="funnel">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5" />
                Funil de Conversão
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <ResponsiveContainer width="100%" height={400}>
                    <FunnelChart>
                      <Tooltip />
                      <Funnel
                        dataKey="value"
                        data={funnelData}
                        isAnimationActive
                      >
                        <LabelList position="center" fill="#fff" stroke="none" />
                      </Funnel>
                    </FunnelChart>
                  </ResponsiveContainer>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Detalhes do Funil</h3>
                  {funnelData.map((item, index) => (
                    <div key={item.name} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="font-medium">{item.name}</span>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">{item.value.toLocaleString('pt-BR')}</p>
                        <p className="text-sm text-muted-foreground">{item.percentage}%</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Aba de Fontes */}
        <TabsContent value="sources">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PieChartIcon className="w-5 h-5" />
                Análise por Fonte de Tráfego
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={sourceData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ source, percentage }) => `${source} (${percentage}%)`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="leads"
                      >
                        {sourceData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="space-y-3">
                  <h3 className="font-semibold text-lg">Performance por Fonte</h3>
                  <div className="space-y-2">
                    {sourceData.map((source, index) => (
                      <div key={source.source} className="p-3 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: COLORS[index % COLORS.length] }}
                            />
                            <span className="font-medium">{source.source}</span>
                          </div>
                          {/* A etiqueta de ROI saiu em 2026-08-31. Sem ingestão
                              de gasto do Gerenciador de Anúncios, `cost` é
                              sempre 0 — e a etiqueta escrevia "Orgânico" em
                              cima de anúncio pago, que é o contrário da
                              verdade. Volta quando houver custo real. */}
                          <Badge variant="outline">
                            {source.conversionRate.toFixed(1)}% de conversão
                          </Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-sm">
                          <div>
                            <p className="text-muted-foreground">Leads</p>
                            <p className="font-semibold">{source.leads}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Conversões</p>
                            <p className="font-semibold">{source.conversions}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Taxa</p>
                            <p className="font-semibold">{source.conversionRate.toFixed(1)}%</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Aba de Performance */}
        <TabsContent value="performance">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Correlação Leads vs Conversões</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <ScatterChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="leads" name="Leads" />
                    <YAxis dataKey="conversions" name="Conversões" />
                    <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                    <Scatter name="Dados" data={chartData} fill={BRAND_CHART.primary} />
                  </ScatterChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Evolução da Taxa de Conversão</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) => new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                    />
                    <YAxis />
                    <Tooltip content={<CustomTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="conversionRate"
                      stroke={CHART_SERIES[1]}
                      strokeWidth={2}
                      dot={{ fill: CHART_SERIES[1], strokeWidth: 2, r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};