import { useSupabaseQuery } from './useSupabaseQuery';
import { useTenant } from '@/contexts/TenantContext';
import { subDays, format, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CHART_SERIES } from '@/lib/chartColors';

interface ChartDataPoint {
  date: string;
  value: number;
  label?: string;
}

interface ChannelData {
  name: string;
  value: number;
  percentage: number;
  color: string;
}

interface DashboardChartsData {
  // Dados para gráfico de mensagens ao longo do tempo
  messagesChart: ChartDataPoint[];
  
  // Dados para gráfico de conversões
  conversionsChart: ChartDataPoint[];
  
  // Dados para gráfico de canais
  channelsData: ChannelData[];
  
  // Dados para gráfico de funil
  funnelData: {
    stage: string;
    count: number;
    percentage: number;
  }[];
  
  // Estados
  isLoading: boolean;
  error: any;
}

export const useDashboardCharts = (days: number = 7): DashboardChartsData => {
  const { tenant } = useTenant();
  const startDate = subDays(new Date(), days);
  
  // Buscar dados de mensagens por dia
  const { data: messagesData = [], isLoading: messagesLoading } = useSupabaseQuery({
    table: 'messages',
    queryKey: ['messages-chart', days],
    select: 'created_at, direction',
    filters: [
      { column: 'created_at', operator: 'gte', value: startDate.toISOString() }
    ],
    enabled: !!tenant
  });
  
  // Buscar dados de contatos por estágio (funil)
  const { data: funnelData = [], isLoading: funnelLoading } = useSupabaseQuery({
    table: 'contacts',
    queryKey: ['funnel-data'],
    select: `
      current_stage_id,
      funnel_stages!contacts_current_stage_id_fkey(
        id,
        name,
        order
      )
    `,
    enabled: !!tenant
  });
  
  // Buscar dados de conversões (mudanças de estágio)
  const { data: conversionsData = [], isLoading: conversionsLoading } = useSupabaseQuery({
    table: 'tracking_events',
    queryKey: ['conversions-chart', days],
    // tracking_events data a coluna de tempo como 'timestamp' (não 'created_at').
    select: 'timestamp, event_type, event_data',
    filters: [
      { column: 'timestamp', operator: 'gte', value: startDate.toISOString() },
      { column: 'event_type', operator: 'eq', value: 'stage_change' }
    ],
    enabled: !!tenant
  });
  
  // Buscar dados de canais (WhatsApp instances)
  const { data: channelsData = [], isLoading: channelsLoading } = useSupabaseQuery({
    table: 'whatsapp_instances',
    queryKey: ['channels-data'],
    select: `
      id,
      name,
      status,
      messages!messages_whatsapp_instance_id_fkey(
        id,
        created_at
      )
    `,
    filters: [
      { column: 'status', operator: 'eq', value: 'connected' }
    ],
    enabled: !!tenant
  });
  
  // Processar dados do gráfico de mensagens
  const processMessagesChart = (): ChartDataPoint[] => {
    const dailyData: { [key: string]: number } = {};
    
    // Inicializar todos os dias com 0
    for (let i = 0; i < days; i++) {
      const date = subDays(new Date(), i);
      const dateKey = format(date, 'yyyy-MM-dd');
      dailyData[dateKey] = 0;
    }
    
    // Contar mensagens por dia
    messagesData.forEach((message: any) => {
      const dateKey = format(new Date(message.created_at), 'yyyy-MM-dd');
      if (dailyData.hasOwnProperty(dateKey)) {
        dailyData[dateKey]++;
      }
    });
    
    // Converter para array e ordenar
    return Object.entries(dailyData)
      .map(([date, value]) => ({
        date: format(new Date(date), 'dd/MM', { locale: ptBR }),
        value,
        label: format(new Date(date), 'dd \\de MMMM', { locale: ptBR })
      }))
      .reverse(); // Mais antigo primeiro
  };
  
  // Processar dados do gráfico de conversões
  const processConversionsChart = (): ChartDataPoint[] => {
    const dailyConversions: { [key: string]: number } = {};
    
    // Inicializar todos os dias com 0
    for (let i = 0; i < days; i++) {
      const date = subDays(new Date(), i);
      const dateKey = format(date, 'yyyy-MM-dd');
      dailyConversions[dateKey] = 0;
    }
    
    // Contar conversões por dia
    conversionsData.forEach((conversion: any) => {
      const dateKey = format(new Date(conversion.timestamp), 'yyyy-MM-dd');
      if (dailyConversions.hasOwnProperty(dateKey)) {
        dailyConversions[dateKey]++;
      }
    });
    
    return Object.entries(dailyConversions)
      .map(([date, value]) => ({
        date: format(new Date(date), 'dd/MM', { locale: ptBR }),
        value,
        label: format(new Date(date), 'dd \\de MMMM', { locale: ptBR })
      }))
      .reverse();
  };
  
  // Processar dados dos canais
  const processChannelsData = (): ChannelData[] => {
    // Paleta de cores derivada da marca ConvoFlow
    const channelColors = CHART_SERIES;
    
    const channelStats = channelsData.map((channel: any, index: number) => {
      const messageCount = channel.messages?.length || 0;
      return {
        name: channel.name || `Canal ${index + 1}`,
        value: messageCount,
        color: channelColors[index % channelColors.length]
      };
    });
    
    const totalMessages = channelStats.reduce((sum, channel) => sum + channel.value, 0);
    
    return channelStats.map(channel => ({
      ...channel,
      percentage: totalMessages > 0 ? (channel.value / totalMessages) * 100 : 0
    }));
  };
  
  // Processar dados do funil
  const processFunnelData = () => {
    const stageStats: { [key: string]: { name: string; count: number; order: number } } = {};
    
    // Contar contatos por estágio
    funnelData.forEach((contact: any) => {
      if (contact.funnel_stages) {
        const stageId = contact.funnel_stages.id;
        if (!stageStats[stageId]) {
          stageStats[stageId] = {
            name: contact.funnel_stages.name,
            count: 0,
            order: contact.funnel_stages.order || 0
          };
        }
        stageStats[stageId].count++;
      }
    });
    
    const totalContacts = Object.values(stageStats).reduce((sum, stage) => sum + stage.count, 0);
    
    return Object.values(stageStats)
      .sort((a, b) => a.order - b.order)
      .map(stage => ({
        stage: stage.name,
        count: stage.count,
        percentage: totalContacts > 0 ? (stage.count / totalContacts) * 100 : 0
      }));
  };
  
  const messagesChart = processMessagesChart();
  const conversionsChart = processConversionsChart();
  const channelsDataProcessed = processChannelsData();
  const funnelDataProcessed = processFunnelData();
  
  const isLoading = messagesLoading || funnelLoading || conversionsLoading || channelsLoading;
  
  return {
    messagesChart,
    conversionsChart,
    channelsData: channelsDataProcessed,
    funnelData: funnelDataProcessed,
    isLoading,
    error: null
  };
};

// Hook específico para dados de performance ao longo do tempo
export const usePerformanceChart = (metric: 'response_time' | 'throughput' | 'cpu_usage' | 'memory_usage', hours: number = 24) => {
  const { tenant } = useTenant();
  const startTime = subDays(new Date(), hours / 24);
  
  const { data: performanceData = [], isLoading } = useSupabaseQuery({
    table: 'system_metrics',
    queryKey: ['performance-chart', metric, hours],
    select: 'metric_value, recorded_at',
    filters: [
      { column: 'metric_name', operator: 'eq', value: metric },
      { column: 'recorded_at', operator: 'gte', value: startTime.toISOString() }
    ],
    orderBy: [{ column: 'recorded_at', ascending: true }],
    limit: 100,
    enabled: !!tenant
  });
  
  const chartData: ChartDataPoint[] = performanceData.map((item: any) => ({
    date: format(new Date(item.recorded_at), 'HH:mm'),
    value: parseFloat(item.metric_value),
    label: format(new Date(item.recorded_at), 'HH:mm - dd/MM')
  }));
  
  return {
    data: chartData,
    isLoading,
    error: null
  };
};

// Hook para dados de heatmap de atividade
export const useActivityHeatmap = (days: number = 30) => {
  const { tenant } = useTenant();
  const startDate = subDays(new Date(), days);
  
  const { data: activityData = [], isLoading } = useSupabaseQuery({
    table: 'messages',
    queryKey: ['activity-heatmap', days],
    select: 'created_at',
    filters: [
      { column: 'created_at', operator: 'gte', value: startDate.toISOString() }
    ],
    enabled: !!tenant
  });
  
  // Processar dados para heatmap (hora do dia vs dia da semana)
  const heatmapData = Array.from({ length: 7 }, () => Array(24).fill(0));
  
  activityData.forEach((message: any) => {
    const date = new Date(message.created_at);
    const dayOfWeek = date.getDay(); // 0 = Domingo
    const hour = date.getHours();
    heatmapData[dayOfWeek][hour]++;
  });
  
  return {
    data: heatmapData,
    isLoading,
    error: null
  };
};