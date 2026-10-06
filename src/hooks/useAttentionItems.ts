import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSupabaseQuery } from './useSupabaseQuery';
import { useTenant } from '@/contexts/TenantContext';
import { supabase } from '@/integrations/supabase/client';
import { subHours, subDays } from 'date-fns';
import { toast } from 'sonner';

/**
 * "Precisa de Atenção" — itens acionáveis do Dashboard, unificados e ordenados
 * por urgência (mais antigo = mais urgente). Combina três sinais:
 *
 *  1. Conversas sem resposta há > 2h  (proxy: unread_count > 0 e last_message_at antigo)
 *  2. Follow-ups atrasados            (status pending/in_progress/overdue com due_date < agora)
 *  3. Contatos parados no funil > 7d   (stage_entered_at antigo, estágio não-final)
 *
 * Limitação conhecida (item 1): a tabela `conversations` não guarda a direção da
 * última mensagem; usamos `unread_count > 0` como proxy de "mensagem recebida sem
 * resposta". Ver relatório.
 */

export type AttentionType = 'no_reply' | 'overdue_followup' | 'stalled_contact';

export interface AttentionItem {
  /** Chave única na lista unificada. */
  key: string;
  type: AttentionType;
  contactId: string | null;
  contactName: string;
  /** Timestamp de referência (ISO) — usado para ordenação por urgência. */
  since: string;
  ageMs: number;
  /** Texto curto de contexto (estágio, tarefa, etc.). */
  detail?: string;
  /** Destino de navegação da ação rápida. */
  href: string;
  /** Presente apenas em follow-ups: permite concluir direto do painel. */
  followupId?: string;
}

export interface UseAttentionItemsResult {
  items: AttentionItem[];
  total: number;
  counts: Record<AttentionType, number>;
  isLoading: boolean;
  completeFollowup: (id: string) => void;
  isCompleting: boolean;
}

type FunnelStageRow = { id: string; is_final: boolean | null; order: number; name: string };

const MAX_ITEMS = 5;

export function useAttentionItems(): UseAttentionItemsResult {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const enabled = !!tenant?.id;

  const twoHoursAgo = subHours(new Date(), 2).toISOString();
  const sevenDaysAgo = subDays(new Date(), 7).toISOString();
  const nowISO = new Date().toISOString();

  // --- Estágios (para saber quais são finais) ---
  const { data: stagesData = [], isLoading: stagesLoading } = useSupabaseQuery({
    table: 'funnel_stages',
    queryKey: ['dashboard-attention', 'stages'],
    select: 'id, is_final, order, name',
    enabled,
    silent: true,
  });
  const stages = stagesData as unknown as FunnelStageRow[];
  const flagged = stages.filter((s) => s.is_final);
  const maxOrder = stages.length > 0 ? Math.max(...stages.map((s) => s.order)) : -1;
  const finalStageIds = (flagged.length > 0 ? flagged : stages.filter((s) => s.order === maxOrder)).map(
    (s) => s.id,
  );

  // --- 1. Conversas sem resposta há > 2h ---
  const { data: noReplyConvs = [], isLoading: convLoading } = useSupabaseQuery({
    table: 'conversations',
    queryKey: ['dashboard-attention', 'no-reply'],
    select: `
      id,
      last_message_at,
      unread_count,
      is_archived,
      contacts!conversations_contact_id_fkey ( id, name, phone )
    `,
    filters: [
      { column: 'is_archived', operator: 'eq', value: false },
      { column: 'unread_count', operator: 'gt', value: 0 },
      { column: 'last_message_at', operator: 'lte', value: twoHoursAgo },
    ],
    orderBy: [{ column: 'last_message_at', ascending: true }],
    limit: 15,
    enabled,
    silent: true,
  });

  // --- 2. Follow-ups atrasados ---
  const { data: overdueFollowups = [], isLoading: fuLoading } = useSupabaseQuery({
    table: 'individual_followups',
    queryKey: ['dashboard-attention', 'overdue-followups'],
    select: `
      id,
      due_date,
      status,
      task,
      contact_id,
      contacts!individual_followups_contact_id_fkey ( id, name, phone )
    `,
    filters: [
      { column: 'status', operator: 'in', value: ['pending', 'in_progress', 'overdue'] },
      { column: 'due_date', operator: 'lt', value: nowISO },
    ],
    orderBy: [{ column: 'due_date', ascending: true }],
    limit: 15,
    enabled,
    silent: true,
  });

  // --- 3. Contatos parados no funil > 7 dias (estágio não-final) ---
  const { data: stalledContacts = [], isLoading: stalledLoading } = useSupabaseQuery({
    table: 'contacts',
    queryKey: ['dashboard-attention', 'stalled-contacts'],
    select: `
      id,
      name,
      phone,
      stage_entered_at,
      current_stage_id,
      funnel_stages!contacts_current_stage_id_fkey ( name )
    `,
    // O PostgREST suportado por useSupabaseQuery não tem "not in"/"is not null";
    // filtramos estágio nulo/final no cliente (ver finalSet abaixo).
    filters: [{ column: 'stage_entered_at', operator: 'lt', value: sevenDaysAgo }],
    orderBy: [{ column: 'stage_entered_at', ascending: true }],
    limit: 15,
    enabled,
    silent: true,
  });

  const now = Date.now();
  const items: AttentionItem[] = [];

  for (const c of noReplyConvs as any[]) {
    if (!c.last_message_at) continue;
    items.push({
      key: `no_reply-${c.id}`,
      type: 'no_reply',
      contactId: c.contacts?.id ?? null,
      contactName: c.contacts?.name || c.contacts?.phone || 'Contato',
      since: c.last_message_at,
      ageMs: now - new Date(c.last_message_at).getTime(),
      detail: `${c.unread_count} não lida(s)`,
      href: '/dashboard/conversations',
    });
  }

  for (const f of overdueFollowups as any[]) {
    if (!f.due_date) continue;
    items.push({
      key: `overdue_followup-${f.id}`,
      type: 'overdue_followup',
      contactId: f.contacts?.id ?? f.contact_id ?? null,
      contactName: f.contacts?.name || f.contacts?.phone || 'Contato',
      since: f.due_date,
      ageMs: now - new Date(f.due_date).getTime(),
      detail: f.task || undefined,
      href: '/dashboard/followups',
      followupId: f.id,
    });
  }

  // Filtra estágios finais no cliente (o filtro "not in" do PostgREST exige sintaxe
  // especial; mantemos a exclusão aqui para robustez).
  const finalSet = new Set(finalStageIds);
  for (const c of stalledContacts as any[]) {
    if (!c.stage_entered_at || !c.current_stage_id) continue;
    if (finalSet.has(c.current_stage_id)) continue;
    items.push({
      key: `stalled_contact-${c.id}`,
      type: 'stalled_contact',
      contactId: c.id,
      contactName: c.name || c.phone || 'Contato',
      since: c.stage_entered_at,
      ageMs: now - new Date(c.stage_entered_at).getTime(),
      detail: c.funnel_stages?.name ? `em ${c.funnel_stages.name}` : undefined,
      href: '/dashboard/funnel',
    });
  }

  // Ordena por urgência (mais antigo primeiro).
  items.sort((a, b) => new Date(a.since).getTime() - new Date(b.since).getTime());

  const counts: Record<AttentionType, number> = {
    no_reply: items.filter((i) => i.type === 'no_reply').length,
    overdue_followup: items.filter((i) => i.type === 'overdue_followup').length,
    stalled_contact: items.filter((i) => i.type === 'stalled_contact').length,
  };

  const completeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('individual_followups')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', id)
        .eq('tenant_id', tenant?.id ?? '');
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Follow-up concluído!');
      queryClient.invalidateQueries({ queryKey: ['dashboard-attention'] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Erro ao concluir follow-up');
    },
  });

  return {
    items: items.slice(0, MAX_ITEMS),
    total: items.length,
    counts,
    isLoading: stagesLoading || convLoading || fuLoading || stalledLoading,
    completeFollowup: (id: string) => completeMutation.mutate(id),
    isCompleting: completeMutation.isPending,
  };
}
