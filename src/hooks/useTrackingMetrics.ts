import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

interface LeadData {
  id: string;
  source: string;
  status: 'new' | 'contacted' | 'qualified' | 'converted' | 'lost';
  createdAt: string;
  convertedAt?: string;
  revenue?: number;
  cost?: number;
  email: string;
  phone?: string;
  name: string;
  tags: string[];
  customFields: Record<string, any>;
}

interface TrackingMetrics {
  totalLeads: number;
  totalConversions: number;
  totalRevenue: number;
  conversionRate: number;
  averageRevenuePerLead: number;
  averageCostPerLead: number;
  roi: number;
  leadsBySource: Record<string, number>;
  conversionsBySource: Record<string, number>;
  revenueBySource: Record<string, number>;
  dailyMetrics: Record<string, {
    leads: number;
    conversions: number;
    revenue: number;
    sources: Record<string, {
      leads: number;
      conversions: number;
      revenue: number;
      cost?: number;
    }>;
  }>;
  trends: {
    leadsGrowth: number;
    conversionsGrowth: number;
    revenueGrowth: number;
  };
}

interface UseTrackingMetricsOptions {
  dateRange: {
    start: Date;
    end: Date;
  };
  sources?: string[];
  status?: string[];
  refreshInterval?: number;
}

// Simulação de API - em produção, isso viria de um serviço real
const fetchLeadsData = async (options: UseTrackingMetricsOptions): Promise<LeadData[]> => {
  // Simular delay de API
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Dados simulados
  const sources = ['Google Ads', 'Facebook Ads', 'Organic Search', 'Direct', 'Email', 'LinkedIn'];
  const statuses: LeadData['status'][] = ['new', 'contacted', 'qualified', 'converted', 'lost'];
  
  const leads: LeadData[] = [];
  const { start, end } = options.dateRange;
  const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  
  for (let i = 0; i < daysDiff; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    
    // Gerar leads para cada dia
    const leadsPerDay = Math.floor(Math.random() * 50) + 10;
    
    for (let j = 0; j < leadsPerDay; j++) {
      const source = sources[Math.floor(Math.random() * sources.length)];
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      const isConverted = status === 'converted';
      
      const lead: LeadData = {
        id: `lead-${i}-${j}`,
        source,
        status,
        createdAt: date.toISOString(),
        convertedAt: isConverted ? new Date(date.getTime() + Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString() : undefined,
        revenue: isConverted ? Math.floor(Math.random() * 5000) + 500 : undefined,
        cost: Math.floor(Math.random() * 100) + 10,
        email: `lead${i}${j}@example.com`,
        phone: `+55 11 9${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
        name: `Lead ${i}-${j}`,
        tags: ['tag1', 'tag2'].slice(0, Math.floor(Math.random() * 3)),
        customFields: {
          company: `Company ${j}`,
          position: 'Manager'
        }
      };
      
      leads.push(lead);
    }
  }
  
  return leads.filter(lead => {
    if (options.sources && !options.sources.includes(lead.source)) return false;
    if (options.status && !options.status.includes(lead.status)) return false;
    return true;
  });
};

export const useTrackingMetrics = (options: UseTrackingMetricsOptions) => {
  const {
    data: leadsData,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['tracking-metrics', options],
    queryFn: () => fetchLeadsData(options),
    refetchInterval: options.refreshInterval || 30000, // Atualizar a cada 30 segundos
    staleTime: 10000 // Considerar dados obsoletos após 10 segundos
  });

  const metrics = useMemo((): TrackingMetrics | null => {
    if (!leadsData) return null;

    const totalLeads = leadsData.length;
    const conversions = leadsData.filter(lead => lead.status === 'converted');
    const totalConversions = conversions.length;
    const totalRevenue = conversions.reduce((sum, lead) => sum + (lead.revenue || 0), 0);
    const totalCost = leadsData.reduce((sum, lead) => sum + (lead.cost || 0), 0);
    
    const conversionRate = totalLeads > 0 ? (totalConversions / totalLeads) * 100 : 0;
    const averageRevenuePerLead = totalLeads > 0 ? totalRevenue / totalLeads : 0;
    const averageCostPerLead = totalLeads > 0 ? totalCost / totalLeads : 0;
    const roi = totalCost > 0 ? ((totalRevenue - totalCost) / totalCost) * 100 : 0;

    // Agrupar por fonte
    const leadsBySource: Record<string, number> = {};
    const conversionsBySource: Record<string, number> = {};
    const revenueBySource: Record<string, number> = {};

    leadsData.forEach(lead => {
      leadsBySource[lead.source] = (leadsBySource[lead.source] || 0) + 1;
      
      if (lead.status === 'converted') {
        conversionsBySource[lead.source] = (conversionsBySource[lead.source] || 0) + 1;
        revenueBySource[lead.source] = (revenueBySource[lead.source] || 0) + (lead.revenue || 0);
      }
    });

    // Métricas diárias
    const dailyMetrics: Record<string, {
      leads: number;
      conversions: number;
      revenue: number;
      sources: Record<string, {
        leads: number;
        conversions: number;
        revenue: number;
        cost?: number;
      }>;
    }> = {};

    leadsData.forEach(lead => {
      const date = new Date(lead.createdAt).toISOString().split('T')[0];
      
      if (!dailyMetrics[date]) {
        dailyMetrics[date] = {
          leads: 0,
          conversions: 0,
          revenue: 0,
          sources: {}
        };
      }

      dailyMetrics[date].leads += 1;
      
      if (lead.status === 'converted') {
        dailyMetrics[date].conversions += 1;
        dailyMetrics[date].revenue += lead.revenue || 0;
      }

      // Agrupar por fonte dentro do dia
      if (!dailyMetrics[date].sources[lead.source]) {
        dailyMetrics[date].sources[lead.source] = {
          leads: 0,
          conversions: 0,
          revenue: 0,
          cost: 0
        };
      }

      dailyMetrics[date].sources[lead.source].leads += 1;
      dailyMetrics[date].sources[lead.source].cost = (dailyMetrics[date].sources[lead.source].cost || 0) + (lead.cost || 0);
      
      if (lead.status === 'converted') {
        dailyMetrics[date].sources[lead.source].conversions += 1;
        dailyMetrics[date].sources[lead.source].revenue += lead.revenue || 0;
      }
    });

    // Calcular tendências (comparar primeira e segunda metade do período)
    const dates = Object.keys(dailyMetrics).sort();
    const midPoint = Math.floor(dates.length / 2);
    
    const firstHalf = dates.slice(0, midPoint);
    const secondHalf = dates.slice(midPoint);
    
    const firstHalfMetrics = firstHalf.reduce((acc, date) => {
      acc.leads += dailyMetrics[date].leads;
      acc.conversions += dailyMetrics[date].conversions;
      acc.revenue += dailyMetrics[date].revenue;
      return acc;
    }, { leads: 0, conversions: 0, revenue: 0 });
    
    const secondHalfMetrics = secondHalf.reduce((acc, date) => {
      acc.leads += dailyMetrics[date].leads;
      acc.conversions += dailyMetrics[date].conversions;
      acc.revenue += dailyMetrics[date].revenue;
      return acc;
    }, { leads: 0, conversions: 0, revenue: 0 });

    const leadsGrowth = firstHalfMetrics.leads > 0 
      ? ((secondHalfMetrics.leads - firstHalfMetrics.leads) / firstHalfMetrics.leads) * 100 
      : 0;
    
    const conversionsGrowth = firstHalfMetrics.conversions > 0 
      ? ((secondHalfMetrics.conversions - firstHalfMetrics.conversions) / firstHalfMetrics.conversions) * 100 
      : 0;
    
    const revenueGrowth = firstHalfMetrics.revenue > 0 
      ? ((secondHalfMetrics.revenue - firstHalfMetrics.revenue) / firstHalfMetrics.revenue) * 100 
      : 0;

    return {
      totalLeads,
      totalConversions,
      totalRevenue,
      conversionRate,
      averageRevenuePerLead,
      averageCostPerLead,
      roi,
      leadsBySource,
      conversionsBySource,
      revenueBySource,
      dailyMetrics,
      trends: {
        leadsGrowth,
        conversionsGrowth,
        revenueGrowth
      }
    };
  }, [leadsData]);

  return {
    metrics,
    leadsData,
    isLoading,
    error,
    refetch
  };
};

// Hook para métricas em tempo real
export const useRealTimeMetrics = () => {
  const [realTimeData, setRealTimeData] = useState({
    activeVisitors: 0,
    leadsToday: 0,
    conversionsToday: 0,
    revenueToday: 0
  });

  useEffect(() => {
    // Simular atualizações em tempo real
    const interval = setInterval(() => {
      setRealTimeData(prev => ({
        activeVisitors: Math.floor(Math.random() * 100) + 50,
        leadsToday: prev.leadsToday + Math.floor(Math.random() * 3),
        conversionsToday: prev.conversionsToday + (Math.random() > 0.8 ? 1 : 0),
        revenueToday: prev.revenueToday + (Math.random() > 0.8 ? Math.floor(Math.random() * 1000) + 100 : 0)
      }));
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return realTimeData;
};

// Hook para comparação de períodos
export const usePeriodComparison = (
  currentPeriod: { start: Date; end: Date },
  comparisonPeriod: { start: Date; end: Date }
) => {
  const currentMetrics = useTrackingMetrics({ dateRange: currentPeriod });
  const comparisonMetrics = useTrackingMetrics({ dateRange: comparisonPeriod });

  const comparison = useMemo(() => {
    if (!currentMetrics.metrics || !comparisonMetrics.metrics) return null;

    const current = currentMetrics.metrics;
    const previous = comparisonMetrics.metrics;

    return {
      leadsChange: previous.totalLeads > 0 
        ? ((current.totalLeads - previous.totalLeads) / previous.totalLeads) * 100 
        : 0,
      conversionsChange: previous.totalConversions > 0 
        ? ((current.totalConversions - previous.totalConversions) / previous.totalConversions) * 100 
        : 0,
      revenueChange: previous.totalRevenue > 0 
        ? ((current.totalRevenue - previous.totalRevenue) / previous.totalRevenue) * 100 
        : 0,
      conversionRateChange: previous.conversionRate > 0 
        ? ((current.conversionRate - previous.conversionRate) / previous.conversionRate) * 100 
        : 0
    };
  }, [currentMetrics.metrics, comparisonMetrics.metrics]);

  return {
    current: currentMetrics,
    previous: comparisonMetrics,
    comparison,
    isLoading: currentMetrics.isLoading || comparisonMetrics.isLoading
  };
};