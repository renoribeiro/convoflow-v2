import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useRole, useTenant } from '@/contexts/TenantContext';
import { diaIso } from '@/lib/datas/brasilia';
import { lerResumo, type PeriodoRastreamento, type ResumoRastreamento } from '@/lib/rastreamento/resumo';
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

/**
 * Quem a aba Resumo mostra: a Loja (ou Conta) aberta no seletor do topo e,
 * para o Gerente (ou o superadmin) com a CONTA aberta, "Todas as Lojas": a
 * Conta e as Lojas filhas dela, somadas, com a Loja em cada linha.
 */
export function useEscopoDoRastreamento() {
  const { tenant } = useTenant();
  const role = useRole();
  const todasLojas = tenant?.kind === 'account' && (role === 'gerente' || role === 'superadmin');
  return { tenantId: tenant?.id ?? null, todasLojas };
}

/**
 * As ids que a aba Análises filtra: a Loja aberta, ou a Conta e as Lojas
 * filhas em "Todas as Lojas". As visões dela deixam o Gerente ler as Lojas
 * filhas (20261112000001); sem este filtro ele veria as Lojas misturadas.
 */
export function useIdsDoEscopo() {
  const { tenantId, todasLojas } = useEscopoDoRastreamento();
  return useQuery({
    queryKey: ['tracking-escopo', tenantId, todasLojas],
    queryFn: async (): Promise<string[]> => {
      if (!tenantId) return [];
      if (!todasLojas) return [tenantId];
      const { data, error } = await supabase
        .from('tenants')
        .select('id')
        .eq('parent_tenant_id', tenantId)
        .eq('kind', 'store');
      if (error) throw error;
      return [tenantId, ...(data ?? []).map((t) => t.id)];
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * A aba Resumo inteira: cartões, gráfico por dia, fontes, Lojas e conversas
 * iniciadas por anúncio. Dias de Brasília; o banco confere o acesso (42501).
 */
export function useRastreamentoResumo(periodo: PeriodoRastreamento) {
  const { tenantId, todasLojas } = useEscopoDoRastreamento();
  const de = diaIso(periodo.de);
  const ate = diaIso(periodo.ate);

  return useQuery({
    queryKey: ['tracking-resumo', tenantId, todasLojas, de, ate],
    queryFn: async (): Promise<ResumoRastreamento> => {
      if (!tenantId) throw new Error('Loja não encontrada');
      const { data, error } = await supabase.rpc('rastreamento_resumo', {
        p_tenant: tenantId,
        p_de: de,
        p_ate: ate,
        p_todas_lojas: todasLojas,
      });
      if (error) throw error;
      return lerResumo(data);
    },
    enabled: !!tenantId,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });
}

// Hook para buscar fontes de tráfego. A aba Fontes pede também as desligadas
// (decisão D7: fonte com contatos só desliga, e precisa continuar à vista
// para ser ligada de novo); o painel do Rastreamento fica só nas ativas.
export function useTrafficSources(opcoes?: { incluirDesligadas?: boolean }) {
  return useSupabaseQuery({
    table: 'traffic_sources',
    queryKey: ['traffic-sources', opcoes?.incluirDesligadas ? 'todas' : 'ativas'],
    select: `
      *,
      lead_tracking(count)
    `,
    filters: opcoes?.incluirDesligadas ? [] : [{ column: 'is_active', operator: 'eq', value: true }],
    order: { column: 'created_at', ascending: false },
  });
}

/** Intervalo em instantes ISO (filtro de created_at). */
export interface DateRange {
  from: string;
  to: string;
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
        title: 'Fonte criada',
      });
    },
    onError: (error) => {
      toast({
        title: 'Não foi possível criar a fonte',
        description: 'Tente de novo em instantes. Se continuar, fale com o suporte do ConvoFlow.',
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
      queryClient.invalidateQueries({ queryKey: ['tracking-resumo'] });
    },
    onError: () => {
      toast({
        title: 'Não foi possível salvar a fonte',
        description: 'Tente de novo em instantes. Se continuar, fale com o suporte do ConvoFlow.',
        variant: 'destructive',
      });
    },
  });
}

/**
 * Exclui uma fonte SEM contatos (decisão D7). Fonte com contatos o banco
 * recusa (gatilho aa_fonte_com_contatos_so_desliga, 20261029000004): ela só
 * desliga, para os relatórios guardarem a origem.
 */
export function useDeleteTrafficSource() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { tenant } = useTenant();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!tenant?.id) throw new Error('Conta não encontrada');
      const { data, error } = await supabase
        .from('traffic_sources')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenant.id)
        .select('id');
      if (error) throw error;
      // DELETE que não acha a linha não dá erro: só não apaga. Sem linha
      // apagada, a tela não pode dizer "Fonte excluída". Desde a 20261029000005
      // nenhum cargo que vê a lixeira é barrado pela RLS (o Gerente grava nas
      // Lojas filhas); sobra a fonte que já saiu por outro caminho.
      if (!data || data.length === 0) throw Object.assign(new Error('nada excluído'), { code: 'SEM_LINHA' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['traffic-sources'] });
      queryClient.invalidateQueries({ queryKey: ['tracking-resumo'] });
      toast({ title: 'Fonte excluída' });
    },
    onError: (error: { code?: string; message?: string }) => {
      toast({
        title: 'Não foi possível excluir a fonte',
        description:
          error?.code === '23503'
            ? 'Esta fonte já tem contatos. Desligue a fonte em vez de excluir.'
            : error?.code === 'SEM_LINHA'
            ? 'Nada foi excluído: esta fonte já não está nesta Loja. Atualize a página para ver a lista de agora.'
            : 'Tente de novo em instantes. Se continuar, fale com o suporte do ConvoFlow.',
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
      queryClient.invalidateQueries({ queryKey: ['tracking-resumo'] });
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
      queryClient.invalidateQueries({ queryKey: ['tracking-resumo'] });
      toast({
        title: 'Conversão registrada',
      });
    },
    onError: (error) => {
      toast({
        title: 'Não foi possível registrar a conversão',
        description: 'Tente de novo em instantes. Se continuar, fale com o suporte do ConvoFlow.',
        variant: 'destructive',
      });
    },
  });
}