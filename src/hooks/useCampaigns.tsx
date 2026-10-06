import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useTenantId } from '@/contexts/TenantContext';
import { QUERY_KEYS } from '@/lib/queryClient';
import { logger } from '@/lib/logger';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type CampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'active'
  | 'paused'
  | 'completed'
  | 'cancelled';

export type MessageType = 'text' | 'image' | 'video' | 'document' | 'audio';

export type AudienceType = 'csv_import' | 'tags' | 'contact_list';

export interface Campaign {
  id: string;
  tenant_id: string;
  whatsapp_instance_id: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
  message_type: MessageType;
  message_template: string;
  message_templates: string[] | null;
  enable_message_randomization: boolean | null;
  media_url: string | null;
  media_caption: string | null;
  audience_type: AudienceType | null;
  audience_config: Record<string, unknown> | null;
  target_tags: string[] | null;
  target_stages: string[] | null;
  delay_between_messages: number | null;
  min_delay_seconds: number | null;
  max_delay_seconds: number | null;
  respect_business_hours: boolean | null;
  business_hours_start: string | null;
  business_hours_end: string | null;
  daily_send_limit: number | null;
  timezone: string;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  paused_at: string | null;
  cancelled_at: string | null;
  total_recipients: number | null;
  sent_count: number | null;
  failed_count: number | null;
  delivered_count: number | null;
  read_count: number | null;
  replied_count: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  whatsapp_instance?: {
    name: string;
    status: string;
  } | null;
}

export interface CampaignMetrics {
  campaign_id: string;
  total_contacts: number;
  total_sent: number;
  total_delivered: number;
  total_read: number;
  total_replied: number;
  total_failed: number;
  total_pending: number;
  delivery_rate: number;
  read_rate: number;
  reply_rate: number;
  conversion_rate: number;
}

export interface CampaignCreateInput {
  name: string;
  description?: string | null;
  whatsapp_instance_id: string;
  message_type: MessageType;
  message_template: string;
  message_templates?: string[];
  enable_message_randomization?: boolean;
  media_url?: string | null;
  media_caption?: string | null;
  audience_type?: AudienceType;
  audience_config?: Record<string, unknown>;
  target_tags?: string[];
  target_stages?: string[];
  delay_between_messages?: number;
  min_delay_seconds?: number;
  max_delay_seconds?: number;
  respect_business_hours?: boolean;
  business_hours_start?: string | null;
  business_hours_end?: string | null;
  daily_send_limit?: number | null;
  timezone?: string;
  scheduled_at?: string | null;
  status?: CampaignStatus;
  require_opt_in?: boolean;
  is_template?: boolean;
  template_name?: string | null;
  template_language?: string;
  template_params?: string[] | null;
}

// ─────────────────────────────────────────────
// Query keys
// ─────────────────────────────────────────────

const campaignKeys = {
  all: (tenantId: string) => [QUERY_KEYS.CAMPAIGNS, tenantId] as const,
  byStatus: (tenantId: string, status: string) =>
    [QUERY_KEYS.CAMPAIGNS, tenantId, status] as const,
  byId: (tenantId: string, id: string) =>
    [QUERY_KEYS.CAMPAIGNS, tenantId, 'detail', id] as const,
  metrics: (tenantId: string) =>
    [QUERY_KEYS.CAMPAIGNS, tenantId, 'metrics'] as const,
  globalStats: (tenantId: string) =>
    [QUERY_KEYS.CAMPAIGNS, tenantId, 'global-stats'] as const,
  reportMetrics: (tenantId: string, period: string, statusFilter: string) =>
    [QUERY_KEYS.CAMPAIGNS, tenantId, 'report-metrics', period, statusFilter] as const,
  executions: (tenantId: string, campaignId: string) =>
    [QUERY_KEYS.CAMPAIGNS, tenantId, 'executions', campaignId] as const,
};

// ─────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────

/** List campaigns by status, scoped to the current tenant. */
export function useCampaignsByStatus(status: CampaignStatus | 'paused') {
  const tenantId = useTenantId();

  return useQuery({
    queryKey: campaignKeys.byStatus(tenantId ?? '', status),
    queryFn: async () => {
      if (!tenantId) throw new Error('tenant_id obrigatório');

      let query = supabase
        .from('mass_message_campaigns')
        .select(
          `id, tenant_id, whatsapp_instance_id, name, description, status,
           message_type, total_recipients, sent_count, failed_count,
           delivered_count, read_count, replied_count,
           scheduled_at, started_at, completed_at, paused_at, created_at, updated_at,
           whatsapp_instance:whatsapp_instances(name, status)`
        )
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (status === 'active') {
        query = query.in('status', ['active', 'paused']);
      } else {
        query = query.eq('status', status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as Campaign[];
    },
    enabled: !!tenantId,
    refetchInterval: status === 'active' ? 30_000 : undefined,
  });
}

/** Fetch a single campaign by id (full row — all columns). */
export function useCampaignById(id: string | null) {
  const tenantId = useTenantId();

  return useQuery({
    queryKey: campaignKeys.byId(tenantId ?? '', id ?? ''),
    queryFn: async () => {
      if (!tenantId || !id) throw new Error('tenant_id e id obrigatórios');

      const { data, error } = await supabase
        .from('mass_message_campaigns')
        .select('*, whatsapp_instance:whatsapp_instances(name, status)')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .single();

      if (error) throw error;
      return data as unknown as Campaign;
    },
    enabled: !!tenantId && !!id,
  });
}

export interface CampaignExecution {
  id: string;
  contact_name: string | null;
  contact_identifier: string | null;
  status: string;
  error_message: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  updated_at: string;
}

/** Per-recipient executions for a campaign (last 50, desc by updated_at). */
export function useCampaignExecutions(campaignId: string | null) {
  const tenantId = useTenantId();

  return useQuery({
    queryKey: campaignKeys.executions(tenantId ?? '', campaignId ?? ''),
    queryFn: async () => {
      if (!tenantId || !campaignId) throw new Error('tenant_id e campaignId obrigatórios');

      const { data, error } = await supabase
        .from('campaign_executions')
        .select(
          'id, contact_name, contact_identifier, status, error_message, sent_at, delivered_at, read_at, updated_at'
        )
        .eq('campaign_id', campaignId)
        .eq('tenant_id', tenantId)
        .order('updated_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data ?? []) as CampaignExecution[];
    },
    enabled: !!tenantId && !!campaignId,
  });
}

/** Global stats for the page header cards. */
export function useCampaignGlobalStats() {
  const tenantId = useTenantId();

  return useQuery({
    queryKey: campaignKeys.globalStats(tenantId ?? ''),
    queryFn: async () => {
      if (!tenantId) throw new Error('tenant_id obrigatório');

      const { data, error } = await supabase
        .from('mass_message_campaigns')
        .select('status, sent_count')
        .eq('tenant_id', tenantId);

      if (error) throw error;

      const rows = data ?? [];
      const totalCampaigns = rows.length;
      const activeCampaigns = rows.filter(
        (r) => r.status === 'active' || r.status === 'paused'
      ).length;
      const messagesSent = rows.reduce(
        (acc, r) => acc + (r.sent_count ?? 0),
        0
      );

      // Fetch avg delivery_rate from campaign_metrics (table not in generated types yet)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const metricsQuery = (supabase as any)
        .from('campaign_metrics')
        .select('delivery_rate')
        .eq('tenant_id', tenantId);
      const { data: metricsData, error: metricsError } = await metricsQuery;

      if (metricsError) {
        logger.warn('Falha ao buscar campaign_metrics para stats', {
          error: (metricsError as Error).message,
        });
      }

      const metricsRows = (metricsData ?? []) as Array<{ delivery_rate: number | null }>;
      const successRate =
        metricsRows.length > 0
          ? metricsRows.reduce((acc, r) => acc + (r.delivery_rate ?? 0), 0) /
            metricsRows.length
          : 0;

      return { totalCampaigns, activeCampaigns, messagesSent, successRate };
    },
    enabled: !!tenantId,
  });
}

/** Metrics for the reports modal, filtered by period and status. */
export function useCampaignReportMetrics(period: string, statusFilter: string) {
  const tenantId = useTenantId();

  return useQuery({
    queryKey: campaignKeys.reportMetrics(tenantId ?? '', period, statusFilter),
    queryFn: async () => {
      if (!tenantId) throw new Error('tenant_id obrigatório');

      const cutoff = periodToCutoff(period);

      let campaignsQuery = supabase
        .from('mass_message_campaigns')
        .select(
          `id, name, status, sent_count, delivered_count,
           read_count, replied_count, created_at`
        )
        .eq('tenant_id', tenantId)
        .gte('created_at', cutoff);

      if (statusFilter !== 'all') {
        campaignsQuery = campaignsQuery.eq('status', statusFilter);
      }

      const { data: rawCampaigns, error: campaignsError } = await campaignsQuery.order(
        'created_at',
        { ascending: false }
      );

      if (campaignsError) throw campaignsError;

      type ReportRow = Pick<Campaign, 'id' | 'name' | 'status' | 'sent_count' | 'delivered_count' | 'read_count' | 'replied_count' | 'created_at'>;
      const rows = (rawCampaigns ?? []) as unknown as ReportRow[];

      const totalSent = rows.reduce((a, r) => a + (r.sent_count ?? 0), 0);
      const totalDelivered = rows.reduce((a, r) => a + (r.delivered_count ?? 0), 0);
      const totalRead = rows.reduce((a, r) => a + (r.read_count ?? 0), 0);
      const totalReplied = rows.reduce((a, r) => a + (r.replied_count ?? 0), 0);

      return { campaigns: rows, totalSent, totalDelivered, totalRead, totalReplied };
    },
    enabled: !!tenantId,
  });
}

function periodToCutoff(period: string): string {
  const now = new Date();
  const days = period === '7days' ? 7 : period === '90days' ? 90 : 30;
  now.setDate(now.getDate() - days);
  return now.toISOString();
}

// ─────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────

export function useCampaignMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const tenantId = useTenantId();

  const invalidate = () => {
    if (!tenantId) return;
    queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CAMPAIGNS, tenantId] });
  };

  // ── Create ──────────────────────────────────
  const createCampaign = useMutation({
    mutationKey: [QUERY_KEYS.CAMPAIGNS + '-item', 'create'],
    mutationFn: async (input: CampaignCreateInput) => {
      if (!tenantId) throw new Error('tenant_id obrigatório');

      const { data, error } = await supabase
        .from('mass_message_campaigns')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({ ...input, tenant_id: tenantId, status: input.status ?? 'draft' } as any)
        .select()
        .single();

      if (error) throw error;
      return data as unknown as Campaign;
    },
    onSuccess: (data) => {
      invalidate();
      toast({
        title: 'Campanha criada',
        description: `"${data.name}" foi criada com sucesso.`,
      });
    },
    onError: (error: Error) => {
      logger.error('Erro ao criar campanha', { error: error.message });
      toast({
        title: 'Erro ao criar campanha',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // ── Update ──────────────────────────────────
  const updateCampaign = useMutation({
    mutationKey: [QUERY_KEYS.CAMPAIGNS + '-item', 'update'],
    mutationFn: async ({
      id,
      input,
    }: {
      id: string;
      input: Partial<CampaignCreateInput>;
    }) => {
      if (!tenantId) throw new Error('tenant_id obrigatório');

      const { data, error } = await supabase
        .from('mass_message_campaigns')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(input as any)
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select()
        .single();

      if (error) throw error;
      return data as unknown as Campaign;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Campanha atualizada', description: 'As alterações foram salvas.' });
    },
    onError: (error: Error) => {
      logger.error('Erro ao atualizar campanha', { error: error.message });
      toast({
        title: 'Erro ao atualizar campanha',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // ── Schedule (RPC) ───────────────────────────
  const scheduleCampaign = useMutation({
    mutationKey: [QUERY_KEYS.CAMPAIGNS + '-item', 'schedule'],
    mutationFn: async (campaignId: string) => {
      const { error } = await supabase.rpc('schedule_campaign_messages', {
        p_campaign_id: campaignId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Campanha agendada', description: 'Mensagens programadas com sucesso.' });
    },
    onError: (error: Error) => {
      logger.error('Erro ao agendar campanha', { error: error.message });
      toast({
        title: 'Erro ao agendar campanha',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // ── Set status (RPC) ─────────────────────────
  const setCampaignStatus = useMutation({
    mutationKey: [QUERY_KEYS.CAMPAIGNS + '-item', 'set-status'],
    mutationFn: async ({
      campaignId,
      action,
    }: {
      campaignId: string;
      action: 'pause' | 'resume' | 'cancel';
    }) => {
      const { error } = await supabase.rpc('set_campaign_status', {
        p_campaign_id: campaignId,
        p_action: action,
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      invalidate();
      const labels: Record<string, string> = {
        pause: 'pausada',
        resume: 'retomada',
        cancel: 'cancelada',
      };
      toast({
        title: 'Campanha atualizada',
        description: `Campanha ${labels[variables.action] ?? 'atualizada'} com sucesso.`,
      });
    },
    onError: (error: Error) => {
      logger.error('Erro ao alterar status da campanha', { error: error.message });
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // ── Duplicate ────────────────────────────────
  const duplicateCampaign = useMutation({
    mutationKey: [QUERY_KEYS.CAMPAIGNS + '-item', 'duplicate'],
    mutationFn: async (campaign: Campaign) => {
      if (!tenantId) throw new Error('tenant_id obrigatório');

      const {
        id: _id,
        created_at: _c,
        updated_at: _u,
        started_at: _s,
        completed_at: _co,
        paused_at: _pa,
        cancelled_at: _ca,
        sent_count: _sc,
        failed_count: _fc,
        delivered_count: _dc,
        read_count: _rc,
        replied_count: _rpc,
        total_recipients: _tr,
        whatsapp_instance: _wi,
        ...rest
      } = campaign;

      // The generated types are stale and don't include all campaign columns.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const insertPayload: any = {
        ...rest,
        tenant_id: tenantId,
        name: `${campaign.name} (cópia)`,
        status: 'draft',
        scheduled_at: null,
      };
      const { data, error } = await supabase
        .from('mass_message_campaigns')
        .insert(insertPayload)
        .select()
        .single();

      if (error) throw error;
      return data as unknown as Campaign;
    },
    onSuccess: (data) => {
      invalidate();
      toast({
        title: 'Campanha duplicada',
        description: `"${data.name}" criada como rascunho.`,
      });
    },
    onError: (error: Error) => {
      logger.error('Erro ao duplicar campanha', { error: error.message });
      toast({
        title: 'Erro ao duplicar campanha',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // ── Delete ───────────────────────────────────
  const deleteCampaign = useMutation({
    mutationKey: [QUERY_KEYS.CAMPAIGNS + '-item', 'delete'],
    mutationFn: async (campaignId: string) => {
      if (!tenantId) throw new Error('tenant_id obrigatório');

      const { error } = await supabase
        .from('mass_message_campaigns')
        .delete()
        .eq('id', campaignId)
        .eq('tenant_id', tenantId);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Campanha excluída', description: 'A campanha foi removida com sucesso.' });
    },
    onError: (error: Error) => {
      logger.error('Erro ao excluir campanha', { error: error.message });
      toast({
        title: 'Erro ao excluir campanha',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    createCampaign,
    updateCampaign,
    scheduleCampaign,
    setCampaignStatus,
    duplicateCampaign,
    deleteCampaign,
  };
}
