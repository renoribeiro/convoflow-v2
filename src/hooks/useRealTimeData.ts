import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../integrations/supabase/client';
import { dataProcessingService } from '../services/dataProcessingService';

// Interface para dados em tempo real
interface RealTimeData {
  activeVisitors: number;
  leadsToday: number;
  conversionsToday: number;
  revenueToday: number;
  lastUpdate: Date;
}

// Interface para configuração do hook
interface RealTimeConfig {
  enabled: boolean;
  refreshInterval: number;
  autoStart: boolean;
}

// Interface para métricas de sistema
interface SystemMetrics {
  memoryUsage: number;
  cpuUsage: number;
  activeConnections: number;
  cacheHitRatio: number;
  transactionsPerSecond: number;
}

// Interface para status do processamento
interface ProcessingStatus {
  isRunning: boolean;
  lastUpdate: Date;
  recordsProcessed: number;
  processingTime: number;
  errors: number;
}

// Hook principal para dados em tempo real
export function useRealTimeData(config: Partial<RealTimeConfig> = {}) {
  const defaultConfig: RealTimeConfig = {
    enabled: true,
    refreshInterval: 5000, // 5 segundos
    autoStart: true,
    ...config
  };

  const [data, setData] = useState<RealTimeData>({
    activeVisitors: 0,
    leadsToday: 0,
    conversionsToday: 0,
    revenueToday: 0,
    lastUpdate: new Date()
  });

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Função para buscar dados em tempo real
  const fetchRealTimeData = useCallback(async () => {
    try {
      setError(null);
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Buscar leads de hoje
      const { data: leadsData, error: leadsError } = await supabase
        .from('lead_tracking')
        // Colunas reais da tabela: não existem 'value' nem 'status'. Com os nomes
        // errados o PostgREST devolvia 400 e este hook falhava sempre.
        .select('id, conversion_value, converted')
        .gte('created_at', today.toISOString());

      if (leadsError) throw leadsError;

      // Calcular métricas
      const leadsToday = leadsData?.length || 0;
      const conversionsToday = leadsData?.filter(lead => lead.converted).length || 0;
      const revenueToday = leadsData
        ?.filter(lead => lead.converted)
        .reduce((sum, lead) => sum + (lead.conversion_value || 0), 0) || 0;

      // Simular visitantes ativos (em produção, isso viria de analytics)
      const activeVisitors = Math.floor(Math.random() * 50) + 20;

      setData({
        activeVisitors,
        leadsToday,
        conversionsToday,
        revenueToday,
        lastUpdate: new Date()
      });

      setIsLoading(false);
    } catch (err) {
      console.error('Error fetching real-time data:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
      setIsLoading(false);
    }
  }, []);

  // Iniciar/parar atualizações automáticas
  const startRealTime = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    fetchRealTimeData(); // Buscar dados imediatamente
    
    intervalRef.current = setInterval(() => {
      fetchRealTimeData();
    }, defaultConfig.refreshInterval);
  }, [fetchRealTimeData, defaultConfig.refreshInterval]);

  const stopRealTime = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Efeito para iniciar automaticamente
  useEffect(() => {
    if (defaultConfig.enabled && defaultConfig.autoStart) {
      startRealTime();
    }

    return () => {
      stopRealTime();
    };
  }, [defaultConfig.enabled, defaultConfig.autoStart, startRealTime, stopRealTime]);

  return {
    data,
    isLoading,
    error,
    refresh: fetchRealTimeData,
    start: startRealTime,
    stop: stopRealTime,
    isRunning: intervalRef.current !== null
  };
}

// Hook para métricas do sistema
export function useSystemMetrics(refreshInterval = 10000) {
  const [metrics, setMetrics] = useState<SystemMetrics>({
    memoryUsage: 0,
    cpuUsage: 0,
    activeConnections: 0,
    cacheHitRatio: 0,
    transactionsPerSecond: 0
  });

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSystemMetrics = useCallback(async () => {
    try {
      setError(null);
      
      // Buscar métricas de performance do banco
      const { data: dbMetrics, error: dbError } = await supabase
        .rpc('get_database_performance_metrics');

      if (dbError) throw dbError;

      // Processar métricas
      const metricsMap = new Map();
      dbMetrics?.forEach((metric: any) => {
        metricsMap.set(metric.metric_name, metric.metric_value);
      });

      // Buscar métricas de memória recentes
      const { data: memoryMetrics, error: memoryError } = await supabase
        .from('system_metrics')
        .select('metric_value')
        .eq('metric_name', 'memory_used')
        .gte('recorded_at', new Date(Date.now() - 60000).toISOString()) // Último minuto
        .order('recorded_at', { ascending: false })
        .limit(1);

      if (memoryError) throw memoryError;

      const memoryUsage = memoryMetrics?.[0]?.metric_value || 0;

      setMetrics({
        memoryUsage: memoryUsage / (1024 * 1024), // Converter para MB
        cpuUsage: Math.random() * 100, // Simular CPU (em produção, viria de métricas reais)
        activeConnections: metricsMap.get('active_connections') || 0,
        cacheHitRatio: metricsMap.get('cache_hit_ratio') || 0,
        transactionsPerSecond: metricsMap.get('transactions_per_second') || 0
      });

      setIsLoading(false);
    } catch (err) {
      console.error('Error fetching system metrics:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSystemMetrics();
    
    const interval = setInterval(fetchSystemMetrics, refreshInterval);
    
    return () => clearInterval(interval);
  }, [fetchSystemMetrics, refreshInterval]);

  return {
    metrics,
    isLoading,
    error,
    refresh: fetchSystemMetrics
  };
}

// Hook para status do processamento de dados
export function useDataProcessingStatus() {
  const [status, setStatus] = useState<ProcessingStatus>({
    isRunning: false,
    lastUpdate: new Date(),
    recordsProcessed: 0,
    processingTime: 0,
    errors: 0
  });

  const updateStatus = useCallback(() => {
    const metrics = dataProcessingService.getMetrics();
    setStatus({
      isRunning: dataProcessingService.isServiceRunning(),
      lastUpdate: metrics.lastUpdate,
      recordsProcessed: metrics.recordsProcessed,
      processingTime: metrics.processingTime,
      errors: metrics.errors
    });
  }, []);

  useEffect(() => {
    updateStatus();

    // Escutar eventos do serviço
    const handleMetricsUpdate = () => updateStatus();
    const handleStatusChange = () => updateStatus();

    dataProcessingService.on('metrics_updated', handleMetricsUpdate);
    dataProcessingService.on('status_change', handleStatusChange);

    return () => {
      dataProcessingService.off('metrics_updated', handleMetricsUpdate);
      dataProcessingService.off('status_change', handleStatusChange);
    };
  }, [updateStatus]);

  const startProcessing = useCallback(async () => {
    try {
      await dataProcessingService.start();
    } catch (error) {
      console.error('Error starting data processing service:', error);
    }
  }, []);

  const stopProcessing = useCallback(async () => {
    try {
      await dataProcessingService.stop();
    } catch (error) {
      console.error('Error stopping data processing service:', error);
    }
  }, []);

  const forceProcess = useCallback(async () => {
    try {
      await dataProcessingService.forceProcess();
    } catch (error) {
      console.error('Error forcing data processing:', error);
    }
  }, []);

  return {
    status,
    start: startProcessing,
    stop: stopProcessing,
    forceProcess
  };
}

// Hook para atualizações em tempo real via Supabase Realtime
export function useSupabaseRealtime(table: string, callback: (payload: any) => void) {
  const [isConnected, setIsConnected] = useState(false);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    // Criar canal de realtime
    const channel = supabase
      .channel(`realtime-${table}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: table
        },
        (payload) => {
          callback(payload);
        }
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      setIsConnected(false);
    };
  }, [table, callback]);

  return {
    isConnected,
    disconnect: () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
        setIsConnected(false);
      }
    }
  };
}

// Hook para métricas de materialized views
export function useMaterializedViewStats() {
  const [stats, setStats] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setError(null);
      
      const { data, error: statsError } = await supabase
        .rpc('get_materialized_view_stats');

      if (statsError) throw statsError;

      setStats(data || []);
      setIsLoading(false);
    } catch (err) {
      console.error('Error fetching materialized view stats:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
      setIsLoading(false);
    }
  }, []);

  const refreshView = useCallback(async (viewName: string) => {
    try {
      const { error } = await supabase
        .rpc('refresh_materialized_view', { view_name: viewName });

      if (error) throw error;

      // Atualizar stats após refresh
      await fetchStats();
    } catch (err) {
      console.error(`Error refreshing view ${viewName}:`, err);
      throw err;
    }
  }, [fetchStats]);

  const refreshAllViews = useCallback(async () => {
    try {
      const { error } = await supabase
        .rpc('refresh_all_materialized_views');

      if (error) throw error;

      // Atualizar stats após refresh
      await fetchStats();
    } catch (err) {
      console.error('Error refreshing all views:', err);
      throw err;
    }
  }, [fetchStats]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return {
    stats,
    isLoading,
    error,
    refresh: fetchStats,
    refreshView,
    refreshAllViews
  };
}

// Hook combinado para dashboard em tempo real
export function useRealTimeDashboard() {
  const realTimeData = useRealTimeData();
  const systemMetrics = useSystemMetrics();
  const processingStatus = useDataProcessingStatus();
  const viewStats = useMaterializedViewStats();

  // Escutar mudanças em tempo real nas tabelas principais
  useSupabaseRealtime('lead_tracking', (payload) => {
    // Atualizar dados quando há novos leads
    realTimeData.refresh();
  });

  useSupabaseRealtime('tracking_events', (payload) => {
    // Atualizar dados quando há novos eventos
    realTimeData.refresh();
  });

  return {
    realTimeData: realTimeData.data,
    systemMetrics: systemMetrics.metrics,
    processingStatus: processingStatus.status,
    viewStats: viewStats.stats,
    isLoading: realTimeData.isLoading || systemMetrics.isLoading || viewStats.isLoading,
    error: realTimeData.error || systemMetrics.error || viewStats.error,
    actions: {
      refreshRealTime: realTimeData.refresh,
      refreshSystemMetrics: systemMetrics.refresh,
      refreshViewStats: viewStats.refresh,
      startProcessing: processingStatus.start,
      stopProcessing: processingStatus.stop,
      forceProcess: processingStatus.forceProcess,
      refreshView: viewStats.refreshView,
      refreshAllViews: viewStats.refreshAllViews
    }
  };
}