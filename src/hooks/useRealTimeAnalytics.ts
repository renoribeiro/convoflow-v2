import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AnalyticsFilters } from '@/components/analytics/AdvancedFilters';
import { getChartColor } from '@/lib/chartColors';

// Interfaces
interface RealTimeAnalyticsData {
  metrics: {
    totalLeads: number;
    totalConversions: number;
    totalRevenue: number;
    avgConversionRate: number;
    avgTicket: number;
    activeVisitors: number;
  };
  chartData: ChartDataPoint[];
  sourceData: SourcePerformance[];
  funnelData: FunnelStage[];
  lastUpdated: Date;
}

interface ChartDataPoint {
  date: string;
  leads: number;
  conversions: number;
  revenue: number;
  visitors: number;
  conversionRate: number;
  avgTicket: number;
}

interface SourcePerformance {
  source: string;
  leads: number;
  conversions: number;
  revenue: number;
  conversionRate: number;
  cost: number;
  roi: number;
  trend: 'up' | 'down' | 'stable';
}

interface FunnelStage {
  name: string;
  value: number;
  percentage: number;
  color: string;
  change: number;
}

// Teto de tentativas de reconexão do WebSocket.
const MAX_WS_RETRIES = 5;

interface UseRealTimeAnalyticsOptions {
  filters: AnalyticsFilters;
  updateInterval?: number; // em milissegundos
  enableWebSocket?: boolean;
  enablePolling?: boolean;
}

interface UseRealTimeAnalyticsReturn {
  data: RealTimeAnalyticsData | null;
  isLoading: boolean;
  error: string | null;
  isConnected: boolean;
  lastUpdate: Date | null;
  forceRefresh: () => void;
  pauseUpdates: () => void;
  resumeUpdates: () => void;
  isPaused: boolean;
}

// Hook principal
export const useRealTimeAnalytics = ({
  filters,
  updateInterval = 30000, // 30 segundos por padrão
  // Desligado por padrão: o endpoint /ws/analytics não existe em nenhum ambiente.
  // Com ele ligado, o onclose reagendava a conexão a cada 5s indefinidamente.
  // A atualização real vem do polling.
  enableWebSocket = false,
  enablePolling = true
}: UseRealTimeAnalyticsOptions): UseRealTimeAnalyticsReturn => {
  const [data, setData] = useState<RealTimeAnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const wsRetriesRef = useRef(0);

  // Função para buscar dados do servidor
  const fetchAnalyticsData = useCallback(async (): Promise<RealTimeAnalyticsData | null> => {
    try {
      // Cancelar requisição anterior se existir
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();
      const { signal } = abortControllerRef.current;

      // Buscar métricas principais
      const { data: metricsData, error: metricsError } = await supabase
        .from('tracking_metrics_view')
        .select('*')
        .gte('created_at', getDateFromFilter(filters.quickDate))
        .abortSignal(signal);

      if (metricsError) throw metricsError;

      // Buscar dados do gráfico temporal
      const { data: chartData, error: chartError } = await supabase
        .from('daily_analytics_view')
        .select('*')
        .gte('date', getDateFromFilter(filters.quickDate))
        .order('date', { ascending: true })
        .abortSignal(signal);

      if (chartError) throw chartError;

      // Buscar performance por fonte
      const { data: sourceData, error: sourceError } = await supabase
        .from('source_performance_view')
        .select('*')
        .gte('date', getDateFromFilter(filters.quickDate))
        .abortSignal(signal);

      if (sourceError) throw sourceError;

      // Buscar dados do funil
      const { data: funnelData, error: funnelError } = await supabase
        .from('conversion_funnel_view')
        .select('*')
        .gte('date', getDateFromFilter(filters.quickDate))
        .abortSignal(signal);

      if (funnelError) throw funnelError;

      // Processar e formatar os dados
      const processedData = processAnalyticsData({
        metrics: metricsData,
        chart: chartData,
        sources: sourceData,
        funnel: funnelData
      });

      return processedData;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return null; // Requisição cancelada, não é um erro
      }
      console.error('Erro ao buscar dados de análise:', err);
      throw err;
    }
  }, [filters]);

  // Função para processar dados brutos
  const processAnalyticsData = (rawData: any): RealTimeAnalyticsData => {
    // Calcular métricas principais
    const metrics = {
      totalLeads: rawData.metrics?.reduce((sum: number, item: any) => sum + (item.leads || 0), 0) || 0,
      totalConversions: rawData.metrics?.reduce((sum: number, item: any) => sum + (item.conversions || 0), 0) || 0,
      totalRevenue: rawData.metrics?.reduce((sum: number, item: any) => sum + (item.revenue || 0), 0) || 0,
      avgConversionRate: 0,
      avgTicket: 0,
      activeVisitors: 0
    };

    metrics.avgConversionRate = metrics.totalLeads > 0 ? (metrics.totalConversions / metrics.totalLeads) * 100 : 0;
    metrics.avgTicket = metrics.totalConversions > 0 ? metrics.totalRevenue / metrics.totalConversions : 0;

    // Processar dados do gráfico
    const chartData: ChartDataPoint[] = rawData.chart?.map((item: any) => ({
      date: item.date,
      leads: item.leads || 0,
      conversions: item.conversions || 0,
      revenue: item.revenue || 0,
      visitors: item.visitors || 0,
      conversionRate: item.leads > 0 ? (item.conversions / item.leads) * 100 : 0,
      avgTicket: item.conversions > 0 ? item.revenue / item.conversions : 0
    })) || [];

    // Processar dados de fonte.
    // `source_performance_view` tem grão (fonte, dia) — precisa disso para o
    // filtro por data funcionar. O gráfico, porém, quer UMA entrada por fonte
    // (usa `source.source` como key do React), então o agrupamento acontece
    // aqui, depois do filtro.
    const bySource = new Map<string, { leads: number; conversions: number; revenue: number; cost: number; daily: Array<{ date: string; leads: number }> }>();

    for (const item of (rawData.sources ?? [])) {
      const key = item.source || 'Desconhecido';
      const acc = bySource.get(key) ?? { leads: 0, conversions: 0, revenue: 0, cost: 0, daily: [] };
      acc.leads += Number(item.leads) || 0;
      acc.conversions += Number(item.conversions) || 0;
      acc.revenue += Number(item.revenue) || 0;
      acc.cost += Number(item.cost) || 0;
      acc.daily.push({ date: item.date, leads: Number(item.leads) || 0 });
      bySource.set(key, acc);
    }

    const sourceData: SourcePerformance[] = Array.from(bySource.entries())
      .map(([source, acc]) => ({
        source,
        leads: acc.leads,
        conversions: acc.conversions,
        revenue: acc.revenue,
        conversionRate: acc.leads > 0 ? (acc.conversions / acc.leads) * 100 : 0,
        cost: acc.cost,
        // Sem ingestão de gasto de anúncio, ROI não existe. Fica 0 e a tela
        // não mostra a etiqueta — número inventado é pior que nenhum.
        roi: acc.cost > 0 ? ((acc.revenue - acc.cost) / acc.cost) * 100 : 0,
        trend: determineTrend(
          acc.daily.sort((a, b) => a.date.localeCompare(b.date)).map((d) => d.leads)
        ),
      }))
      .sort((a, b) => b.leads - a.leads);

    // Processar dados do funil.
    // `conversion_funnel_view` tem grão (etapa, dia); a etapa é a unidade do
    // gráfico. Agrupa aqui e calcula a porcentagem sobre o total do período —
    // a view não tem como saber qual recorte de data o usuário escolheu.
    const byStage = new Map<string, { order: number; value: number }>();

    for (const item of (rawData.funnel ?? [])) {
      const key = item.stage_name;
      if (!key) continue;
      const order = Number(item.stage_order);
      const acc = byStage.get(key) ?? { order: Number.isFinite(order) ? order : 0, value: 0 };
      acc.value += Number(item.count) || 0;
      byStage.set(key, acc);
    }

    const funnelTotal = Array.from(byStage.values()).reduce((sum, s) => sum + s.value, 0);

    const funnelData: FunnelStage[] = Array.from(byStage.entries())
      .sort((a, b) => a[1].order - b[1].order)
      .map(([name, s], index) => ({
        name,
        value: s.value,
        percentage: funnelTotal > 0 ? (s.value / funnelTotal) * 100 : 0,
        color: getFunnelColor(index),
        // Não há histórico de passagem por etapa no produto, então não há
        // variação para mostrar. A tela não renderiza este campo.
        change: 0,
      }));

    return {
      metrics,
      chartData,
      sourceData,
      funnelData,
      lastUpdated: new Date()
    };
  };

  // Função para determinar tendência
  const determineTrend = (trendData: any): 'up' | 'down' | 'stable' => {
    if (!trendData || !Array.isArray(trendData) || trendData.length < 2) {
      return 'stable';
    }

    const recent = trendData[trendData.length - 1];
    const previous = trendData[trendData.length - 2];

    if (recent > previous * 1.05) return 'up';
    if (recent < previous * 0.95) return 'down';
    return 'stable';
  };

  // Função para obter cor do funil — usa paleta da marca
  const getFunnelColor = (index: number): string => getChartColor(index);

  // Função para obter data baseada no filtro
  const getDateFromFilter = (quickDate: string): string => {
    const now = new Date();
    let daysAgo = 30;

    switch (quickDate) {
      case 'today': daysAgo = 0; break;
      case '7d': daysAgo = 7; break;
      case '30d': daysAgo = 30; break;
      case '90d': daysAgo = 90; break;
      case '6m': daysAgo = 180; break;
      case '1y': daysAgo = 365; break;
      default: daysAgo = 30;
    }

    const date = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    return date.toISOString().split('T')[0];
  };

  // Função para atualizar dados
  const updateData = useCallback(async () => {
    if (isPaused) return;

    try {
      setError(null);
      const newData = await fetchAnalyticsData();

      if (newData) {
        setData(newData);
        setLastUpdate(new Date());
        setIsConnected(true);
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao atualizar dados');
      setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  }, [fetchAnalyticsData, isPaused]);

  // Configurar WebSocket
  const setupWebSocket = useCallback(() => {
    if (!enableWebSocket || isPaused) return;

    try {
      // Fechar conexão anterior se existir
      if (wsRef.current) {
        wsRef.current.close();
      }

      // Criar nova conexão WebSocket
      const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/analytics`;
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('WebSocket conectado para análises');
        wsRetriesRef.current = 0; // conectou: zera o contador de tentativas
        setIsConnected(true);

        // Enviar filtros para o servidor
        if (wsRef.current) {
          wsRef.current.send(JSON.stringify({ type: 'subscribe', filters }));
        }
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.type === 'analytics_update') {
            const processedData = processAnalyticsData(message.data);
            setData(processedData);
            setLastUpdate(new Date());
          }
        } catch (err) {
          console.error('Erro ao processar mensagem WebSocket:', err);
        }
      };

      wsRef.current.onclose = () => {
        console.log('WebSocket desconectado');
        setIsConnected(false);

        // Reconexão com teto: sem isso, um endpoint inexistente vira loop infinito.
        if (!isPaused && wsRetriesRef.current < MAX_WS_RETRIES) {
          wsRetriesRef.current += 1;
          const delay = 5000 * wsRetriesRef.current; // backoff linear
          setTimeout(setupWebSocket, delay);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('Erro no WebSocket:', error);
        setIsConnected(false);
      };
    } catch (err) {
      console.error('Erro ao configurar WebSocket:', err);
      setIsConnected(false);
    }
  }, [enableWebSocket, filters, isPaused, processAnalyticsData]);

  // Configurar polling
  const setupPolling = useCallback(() => {
    if (!enablePolling || isPaused) return;

    // Limpar intervalo anterior
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Configurar novo intervalo
    intervalRef.current = setInterval(updateData, updateInterval);
  }, [enablePolling, updateInterval, updateData, isPaused]);

  // Funções de controle
  const forceRefresh = useCallback(() => {
    updateData();
  }, [updateData]);

  const pauseUpdates = useCallback(() => {
    setIsPaused(true);

    // Fechar WebSocket
    if (wsRef.current) {
      wsRef.current.close();
    }

    // Limpar polling
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
  }, []);

  const resumeUpdates = useCallback(() => {
    setIsPaused(false);
  }, []);

  // Efeitos
  useEffect(() => {
    // Buscar dados iniciais
    updateData();
  }, [updateData]);

  useEffect(() => {
    if (!isPaused) {
      setupWebSocket();
      setupPolling();
    }

    return () => {
      // Cleanup
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [setupWebSocket, setupPolling, isPaused]);

  // Cleanup no unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    data,
    isLoading,
    error,
    isConnected,
    lastUpdate,
    forceRefresh,
    pauseUpdates,
    resumeUpdates,
    isPaused
  };
};

// Hook para métricas específicas em tempo real
export const useRealTimeMetrics = (filters: AnalyticsFilters) => {
  const { data, isLoading, error, forceRefresh } = useRealTimeAnalytics({
    filters,
    updateInterval: 10000, // 10 segundos para métricas
    enableWebSocket: false,
    enablePolling: true
  });

  return {
    metrics: data?.metrics || null,
    isLoading,
    error,
    refresh: forceRefresh,
    lastUpdated: data?.lastUpdated || null
  };
};

// Hook para dados de gráfico em tempo real
export const useRealTimeChartData = (filters: AnalyticsFilters) => {
  const { data, isLoading, error, forceRefresh } = useRealTimeAnalytics({
    filters,
    updateInterval: 30000, // 30 segundos para gráficos
    enableWebSocket: false,
    // Antes era false, contando apenas com o WebSocket. Como o WS nunca conectou,
    // este hook ficava sem nenhuma fonte de atualização.
    enablePolling: true
  });

  return {
    chartData: data?.chartData || [],
    sourceData: data?.sourceData || [],
    funnelData: data?.funnelData || [],
    isLoading,
    error,
    refresh: forceRefresh,
    lastUpdated: data?.lastUpdated || null
  };
};

export default useRealTimeAnalytics;