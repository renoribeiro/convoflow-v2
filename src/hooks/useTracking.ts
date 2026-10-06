import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useTenant } from '@/contexts/TenantContext';
import { useSupabaseQuery } from './useSupabaseQuery';

// Interfaces para tipos de dados
export interface TrafficSource {
  id: string;
  tenant_id: string;
  name: string;
  type: 'organic' | 'paid' | 'social' | 'direct' | 'referral' | 'email';
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LeadTracking {
  id: string;
  tenant_id: string;
  contact_id?: string;
  session_id?: string;
  traffic_source_id?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  referrer_url?: string;
  landing_page?: string;
  ip_address?: string;
  user_agent?: string;
  device_type?: string;
  browser?: string;
  os?: string;
  country?: string;
  city?: string;
  converted: boolean;
  conversion_date?: string;
  conversion_value?: number;
  created_at: string;
}

export interface TrackingEvent {
  id: string;
  tenant_id: string;
  lead_tracking_id?: string;
  contact_id?: string;
  event_type: string;
  event_data?: any;
  page_url?: string;
  timestamp: string;
}

export interface TrackingMetrics {
  totalLeads: number;
  totalConversions: number;
  totalRevenue: number;
  conversionRate: number;
  trends: {
    leads: { value: number; isPositive: boolean };
    conversions: { value: number; isPositive: boolean };
    revenue: { value: number; isPositive: boolean };
    rate: { value: number; isPositive: boolean };
  };
}

export interface DateRange {
  from: string;
  to: string;
}

// Hook para buscar métricas de tracking
export function useTrackingMetrics(dateRange?: DateRange) {
  const { tenant } = useTenant();
  
  return useQuery({
    queryKey: ['tracking-metrics', tenant?.id, dateRange],
    queryFn: async () => {
      if (!tenant?.id) throw new Error('Tenant não encontrado');
      
      // View filtrada por Conta no servidor — a matview crua não respeita RLS.
      let query = supabase
        .from('tracking_metrics_daily_filtered')
        .select('*')
        .eq('tenant_id', tenant.id);
      
      if (dateRange && dateRange.from && dateRange.to) {
        query = query
          .gte('date', dateRange.from)
          .lte('date', dateRange.to);
      }
      
      const { data, error } = await query.order('date', { ascending: false });
      
      if (error) throw error;
      
      // Calcular métricas agregadas
      const totalLeads = data?.reduce((sum, item) => sum + (item.total_leads || 0), 0) || 0;
      const totalConversions = data?.reduce((sum, item) => sum + (item.conversions || 0), 0) || 0;
      const totalRevenue = data?.reduce((sum, item) => sum + (item.total_revenue || 0), 0) || 0;
      const conversionRate = totalLeads > 0 ? (totalConversions / totalLeads) * 100 : 0;
      
      // Calcular tendências (comparar com período anterior)
      const currentPeriod = data?.slice(0, Math.floor(data.length / 2)) || [];
      const previousPeriod = data?.slice(Math.floor(data.length / 2)) || [];
      
      const currentLeads = currentPeriod.reduce((sum, item) => sum + (item.total_leads || 0), 0);
      const previousLeads = previousPeriod.reduce((sum, item) => sum + (item.total_leads || 0), 0);
      const leadsChange = previousLeads > 0 ? ((currentLeads - previousLeads) / previousLeads) * 100 : 0;
      
      const currentConversions = currentPeriod.reduce((sum, item) => sum + (item.conversions || 0), 0);
      const previousConversions = previousPeriod.reduce((sum, item) => sum + (item.conversions || 0), 0);
      const conversionsChange = previousConversions > 0 ? ((currentConversions - previousConversions) / previousConversions) * 100 : 0;
      
      const currentRevenue = currentPeriod.reduce((sum, item) => sum + (item.total_revenue || 0), 0);
      const previousRevenue = previousPeriod.reduce((sum, item) => sum + (item.total_revenue || 0), 0);
      const revenueChange = previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : 0;
      
      const currentRate = currentLeads > 0 ? (currentConversions / currentLeads) * 100 : 0;
      const previousRate = previousLeads > 0 ? (previousConversions / previousLeads) * 100 : 0;
      const rateChange = previousRate > 0 ? ((currentRate - previousRate) / previousRate) * 100 : 0;
      
      return {
        totalLeads,
        totalConversions,
        totalRevenue,
        conversionRate,
        trends: {
          leads: { value: leadsChange, isPositive: leadsChange >= 0 },
          conversions: { value: conversionsChange, isPositive: conversionsChange >= 0 },
          revenue: { value: revenueChange, isPositive: revenueChange >= 0 },
          rate: { value: rateChange, isPositive: rateChange >= 0 },
        },
        rawData: data,
      } as TrackingMetrics & { rawData: any[] };
    },
    enabled: !!tenant?.id,
    staleTime: 5 * 60 * 1000, // 5 minutos
    refetchInterval: 30 * 1000, // 30 segundos
  });
}

// Hook para buscar fontes de tráfego
export function useTrafficSources() {
  return useSupabaseQuery({
    table: 'traffic_sources',
    queryKey: ['traffic-sources'],
    select: `
      *,
      lead_tracking(count)
    `,
    filters: [{ column: 'is_active', operator: 'eq', value: true }],
    order: { column: 'created_at', ascending: false },
  });
}

// Hook para buscar tracking de leads
export function useLeadTracking(options?: {
  limit?: number;
  dateRange?: DateRange;
  utmCampaign?: string;
}) {
  const filters = [];
  
  if (options?.dateRange && options.dateRange.from && options.dateRange.to) {
    filters.push(
      { column: 'created_at', operator: 'gte', value: options.dateRange.from },
      { column: 'created_at', operator: 'lte', value: options.dateRange.to }
    );
  }
  
  if (options?.utmCampaign) {
    filters.push({ column: 'utm_campaign', operator: 'eq', value: options.utmCampaign });
  }
  
  return useSupabaseQuery({
    table: 'lead_tracking',
    queryKey: ['lead-tracking', options],
    select: `
      *,
      contacts(id, name, phone),
      traffic_sources(name, type)
    `,
    filters,
    order: { column: 'created_at', ascending: false },
    limit: options?.limit || 100,
  });
}

// Hook para buscar eventos de tracking
export function useTrackingEvents(leadTrackingId?: string) {
  const filters = leadTrackingId 
    ? [{ column: 'lead_tracking_id', operator: 'eq', value: leadTrackingId }]
    : [];
    
  return useSupabaseQuery({
    table: 'tracking_events',
    queryKey: ['tracking-events', leadTrackingId],
    select: '*',
    filters,
    order: { column: 'timestamp', ascending: false },
    limit: 50,
    enabled: !!leadTrackingId,
  });
}

// Hook para performance de campanhas
export function useCampaignPerformance(dateRange?: DateRange) {
  const { tenant } = useTenant();
  
  return useQuery({
    queryKey: ['campaign-performance', tenant?.id, dateRange],
    queryFn: async () => {
      if (!tenant?.id) throw new Error('Tenant não encontrado');
      
      // View filtrada por Conta no servidor — a matview crua não respeita RLS e,
      // desde 20260731000001, nem concede leitura a `authenticated`.
      let query = supabase
        .from('campaign_performance_daily_filtered')
        .select('*')
        .eq('tenant_id', tenant.id);
      
      if (dateRange && dateRange.from && dateRange.to) {
        query = query
          .gte('date', dateRange.from)
          .lte('date', dateRange.to);
      }
      
      const { data, error } = await query.order('date', { ascending: false });
      
      if (error) throw error;
      
      // Agrupar por campanha
      const campaignMap = new Map();
      
      data?.forEach(item => {
        const campaign = item.utm_campaign;
        if (!campaignMap.has(campaign)) {
          campaignMap.set(campaign, {
            campaign,
            leads: 0,
            conversions: 0,
            revenue: 0,
            conversionRate: 0,
            avgOrderValue: 0,
          });
        }
        
        const existing = campaignMap.get(campaign);
        existing.leads += item.leads || 0;
        existing.conversions += item.conversions || 0;
        existing.revenue += item.revenue || 0;
      });
      
      // Calcular métricas finais
      const campaigns = Array.from(campaignMap.values()).map(campaign => ({
        ...campaign,
        conversionRate: campaign.leads > 0 ? (campaign.conversions / campaign.leads) * 100 : 0,
        avgOrderValue: campaign.conversions > 0 ? campaign.revenue / campaign.conversions : 0,
      }));
      
      return campaigns.sort((a, b) => b.revenue - a.revenue);
    },
    enabled: !!tenant?.id,
    staleTime: 5 * 60 * 1000, // 5 minutos
  });
}

// Mutations para criar/atualizar dados
export function useCreateTrafficSource() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { tenant } = useTenant();
  
  return useMutation({
    mutationFn: async (data: Omit<TrafficSource, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>) => {
      if (!tenant?.id) throw new Error('Tenant não encontrado');
      
      const { data: result, error } = await supabase
        .from('traffic_sources')
        .insert({ ...data, tenant_id: tenant.id })
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['traffic-sources'] });
      toast({
        title: 'Sucesso',
        description: 'Fonte de tráfego criada com sucesso',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro',
        description: 'Falha ao criar fonte de tráfego',
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateTrafficSource() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { tenant } = useTenant();

  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<TrafficSource> & { id: string }) => {
      if (!tenant?.id) throw new Error('Conta não encontrada');

      const { data: result, error } = await supabase
        .from('traffic_sources')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('tenant_id', tenant.id)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['traffic-sources'] });
      queryClient.invalidateQueries({ queryKey: ['tracking-metrics'] });
    },
    onError: () => {
      toast({
        title: 'Erro',
        description: 'Falha ao atualizar fonte de tráfego',
        variant: 'destructive',
      });
    },
  });
}

export function useCreateLeadTracking() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { tenant } = useTenant();
  
  return useMutation({
    mutationFn: async (data: Omit<LeadTracking, 'id' | 'tenant_id' | 'created_at'>) => {
      if (!tenant?.id) throw new Error('Tenant não encontrado');
      
      const { data: result, error } = await supabase
        .from('lead_tracking')
        .insert({ ...data, tenant_id: tenant.id })
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-tracking'] });
      queryClient.invalidateQueries({ queryKey: ['tracking-metrics'] });
    },
    onError: (error) => {
      console.error('Erro ao criar lead tracking:', error);
    },
  });
}

export function useCreateTrackingEvent() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { tenant } = useTenant();
  
  return useMutation({
    mutationFn: async (data: Omit<TrackingEvent, 'id' | 'tenant_id' | 'timestamp'>) => {
      if (!tenant?.id) throw new Error('Tenant não encontrado');
      
      const { data: result, error } = await supabase
        .from('tracking_events')
        .insert({ ...data, tenant_id: tenant.id })
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tracking-events'] });
    },
    onError: (error) => {
      console.error('Erro ao criar evento de tracking:', error);
    },
  });
}

// Hook para atualizar conversão
export function useUpdateConversion() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, conversionValue }: { id: string; conversionValue?: number }) => {
      const { data, error } = await supabase
        .from('lead_tracking')
        .update({
          converted: true,
          conversion_date: new Date().toISOString(),
          conversion_value: conversionValue,
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-tracking'] });
      queryClient.invalidateQueries({ queryKey: ['tracking-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['campaign-performance'] });
      toast({
        title: 'Sucesso',
        description: 'Conversão registrada com sucesso',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro',
        description: 'Falha ao registrar conversão',
        variant: 'destructive',
      });
    },
  });
}