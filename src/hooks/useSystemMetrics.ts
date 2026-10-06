import { useSupabaseQuery } from './useSupabaseQuery';
import { useTenant } from '@/contexts/TenantContext';
import { subHours, subMinutes } from 'date-fns';

interface SystemAlert {
  id: string;
  type: 'error' | 'warning' | 'info' | 'success';
  title: string;
  message: string;
  timestamp: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  resolved: boolean;
  source: string;
}

interface SystemStatus {
  cpu: number;
  memory: number;
  disk: number;
  uptime: number;
  status: 'healthy' | 'warning' | 'critical';
}

interface SystemMetricsData {
  alerts: SystemAlert[];
  systemStatus: SystemStatus;
  isLoading: boolean;
  error: any;
}

export const useSystemMetrics = (): SystemMetricsData => {
  const { tenant } = useTenant();
  const last24Hours = subHours(new Date(), 24);
  const last5Minutes = subMinutes(new Date(), 5);
  
  // Buscar alertas do sistema
  const { data: systemAlerts = [], isLoading: alertsLoading } = useSupabaseQuery({
    table: 'system_alerts',
    queryKey: ['system-alerts'],
    // Colunas reais de system_alerts: não existem 'resolved', 'source' nem
    // 'created_at'. O equivalente é resolved_at / service_name / triggered_at.
    select: `
      id,
      alert_type,
      title,
      message,
      severity,
      service_name,
      triggered_at,
      resolved_at
    `,
    filters: [
      { column: 'triggered_at', operator: 'gte', value: last24Hours.toISOString() }
    ],
    orderBy: [{ column: 'triggered_at', ascending: false }],
    limit: 20,
    enabled: !!tenant
  });
  
  // Buscar métricas de sistema recentes
  const { data: cpuMetrics = [], isLoading: cpuLoading } = useSupabaseQuery({
    table: 'system_metrics',
    queryKey: ['cpu-metrics'],
    select: 'metric_value, recorded_at',
    filters: [
      { column: 'metric_name', operator: 'eq', value: 'cpu_usage' },
      { column: 'recorded_at', operator: 'gte', value: last5Minutes.toISOString() }
    ],
    orderBy: [{ column: 'recorded_at', ascending: false }],
    limit: 1,
    enabled: !!tenant
  });
  
  const { data: memoryMetrics = [], isLoading: memoryLoading } = useSupabaseQuery({
    table: 'system_metrics',
    queryKey: ['memory-metrics'],
    select: 'metric_value, recorded_at',
    filters: [
      { column: 'metric_name', operator: 'eq', value: 'memory_usage' },
      { column: 'recorded_at', operator: 'gte', value: last5Minutes.toISOString() }
    ],
    orderBy: [{ column: 'recorded_at', ascending: false }],
    limit: 1,
    enabled: !!tenant
  });
  
  const { data: diskMetrics = [], isLoading: diskLoading } = useSupabaseQuery({
    table: 'system_metrics',
    queryKey: ['disk-metrics'],
    select: 'metric_value, recorded_at',
    filters: [
      { column: 'metric_name', operator: 'eq', value: 'disk_usage' },
      { column: 'recorded_at', operator: 'gte', value: last5Minutes.toISOString() }
    ],
    orderBy: [{ column: 'recorded_at', ascending: false }],
    limit: 1,
    enabled: !!tenant
  });
  
  const { data: uptimeMetrics = [], isLoading: uptimeLoading } = useSupabaseQuery({
    table: 'system_metrics',
    queryKey: ['uptime-metrics'],
    select: 'metric_value, recorded_at',
    filters: [
      { column: 'metric_name', operator: 'eq', value: 'uptime' },
      { column: 'recorded_at', operator: 'gte', value: last5Minutes.toISOString() }
    ],
    orderBy: [{ column: 'recorded_at', ascending: false }],
    limit: 1,
    enabled: !!tenant
  });
  
  // Processar alertas
  const processAlerts = (): SystemAlert[] => {
    return systemAlerts.map((alert: any) => ({
      id: alert.id,
      type: mapAlertType(alert.alert_type),
      title: alert.title,
      message: alert.message,
      timestamp: alert.triggered_at,
      severity: alert.severity,
      resolved: alert.resolved_at != null,
      source: alert.service_name || 'Sistema'
    }));
  };
  
  // Mapear tipos de alerta
  const mapAlertType = (alertType: string): SystemAlert['type'] => {
    switch (alertType) {
      case 'error':
      case 'critical':
        return 'error';
      case 'warning':
        return 'warning';
      case 'info':
        return 'info';
      case 'success':
        return 'success';
      default:
        return 'info';
    }
  };
  
  // Processar status do sistema
  const processSystemStatus = (): SystemStatus => {
    const cpu = cpuMetrics[0]?.metric_value ? parseFloat(cpuMetrics[0].metric_value) : 0;
    const memory = memoryMetrics[0]?.metric_value ? parseFloat(memoryMetrics[0].metric_value) : 0;
    const disk = diskMetrics[0]?.metric_value ? parseFloat(diskMetrics[0].metric_value) : 0;
    const uptime = uptimeMetrics[0]?.metric_value ? parseFloat(uptimeMetrics[0].metric_value) : 99.9;
    
    // Determinar status geral do sistema
    let status: SystemStatus['status'] = 'healthy';
    
    if (cpu > 90 || memory > 90 || disk > 95 || uptime < 95) {
      status = 'critical';
    } else if (cpu > 70 || memory > 80 || disk > 85 || uptime < 98) {
      status = 'warning';
    }
    
    return {
      cpu,
      memory,
      disk,
      uptime,
      status
    };
  };
  
  const alerts = processAlerts();
  const systemStatus = processSystemStatus();
  const isLoading = alertsLoading || cpuLoading || memoryLoading || diskLoading || uptimeLoading;
  
  return {
    alerts,
    systemStatus,
    isLoading,
    error: null
  };
};

// Hook para buscar apenas alertas não resolvidos
export const useActiveAlerts = () => {
  const { alerts, isLoading, error } = useSystemMetrics();
  
  const activeAlerts = alerts.filter(alert => !alert.resolved);
  
  return {
    alerts: activeAlerts,
    count: activeAlerts.length,
    criticalCount: activeAlerts.filter(a => a.severity === 'critical').length,
    isLoading,
    error
  };
};

// Hook para métricas de performance específicas
export const usePerformanceMetrics = (timeRange: 'hour' | 'day' | 'week' = 'hour') => {
  const { tenant } = useTenant();
  
  const getTimeFilter = () => {
    switch (timeRange) {
      case 'hour':
        return subHours(new Date(), 1);
      case 'day':
        return subHours(new Date(), 24);
      case 'week':
        return subHours(new Date(), 168);
      default:
        return subHours(new Date(), 1);
    }
  };
  
  const timeFilter = getTimeFilter();
  
  const { data: performanceData = [], isLoading } = useSupabaseQuery({
    table: 'system_metrics',
    queryKey: ['performance-metrics', timeRange],
    select: 'metric_name, metric_value, recorded_at',
    filters: [
      { column: 'recorded_at', operator: 'gte', value: timeFilter.toISOString() },
      { column: 'metric_name', operator: 'in', value: ['cpu_usage', 'memory_usage', 'response_time', 'throughput'] }
    ],
    orderBy: [{ column: 'recorded_at', ascending: true }],
    limit: 1000,
    enabled: !!tenant
  });
  
  // Agrupar dados por métrica
  const groupedData = performanceData.reduce((acc: any, item: any) => {
    if (!acc[item.metric_name]) {
      acc[item.metric_name] = [];
    }
    acc[item.metric_name].push({
      value: parseFloat(item.metric_value),
      timestamp: item.recorded_at
    });
    return acc;
  }, {});
  
  return {
    data: groupedData,
    isLoading,
    error: null
  };
};