import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { logger } from '@/lib/logger';

/**
 * Números da Loja inteira — as funções `loja_*` da migração 20260914000001.
 *
 * Por que existem: quando uma Loja restringe a visibilidade de conversas de
 * um atendente, o RLS de `messages` e `conversations` passa a devolver só o
 * que é dele. Os agregados do Dashboard (conversas ativas, tempo de resposta,
 * mensagens por dia, último contato...) precisam continuar sendo da Loja
 * inteira — decisão de produto — então saem por funções SECURITY DEFINER que
 * devolvem SÓ contagens e médias por balde. Nunca texto, nunca id de mensagem
 * ou de conversa.
 *
 * Para quem não é restrito o resultado é idêntico ao que as queries diretas
 * davam; o alcance por Conta (própria Conta, Lojas filhas do gerente, e para
 * `messages` também o superadmin) espelha o RLS de sempre.
 *
 * As chaves começam com 'loja-stats' de propósito: caem no nível semiStatic do
 * createQueryClient (5 min), como os outros números do Dashboard.
 */

export type LojaBucket = 'all' | 'hour' | 'day';

export interface LojaMessageCountRow {
  /** NULL quando bucket = 'all'. */
  bucket: string | null;
  direction: string;
  is_from_bot: boolean;
  whatsapp_instance_id: string | null;
  n: number;
  last_at: string | null;
}

export interface LojaResponseTimeRow {
  bucket: string | null;
  n: number;
  avg_minutes: number;
}

export interface LojaConversationCountRow {
  bucket: string | null;
  is_archived: boolean;
  n: number;
  n_unread: number;
}

export interface LojaContactLastMessageRow {
  contact_id: string;
  last_at: string;
}

/**
 * Uma linha de `loja_conversation_metrics` (migração 20260921000001). Janela =
 * conversas CRIADAS no período; os "agora" (`n_waiting_*`) são retrato de hoje
 * e ignoram a janela. Medianas em minutos; NULL quando não há o que medir.
 *
 * "Resposta humana" é a definição de sempre (trg_record_conversation_participant
 * e response_rule_turn_start): outbound, não-bot, sem `source`. Bot é outra
 * coluna — os dois nunca se misturam num número só.
 */
export interface LojaConversationMetricsRow {
  n_conversations: number;
  n_bot_touched: number;
  n_no_human_reply: number;
  n_waiting_human: number;
  n_waiting_human_unowned: number;
  n_first_human: number;
  median_first_human_minutes: number | null;
  n_first_bot: number;
  median_first_bot_minutes: number | null;
  median_messages: number | null;
  median_duration_minutes: number | null;
}

/** Fuso do navegador: é nele que o front desenha os dias, então é nele que o banco agrupa. */
export const browserTimeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

interface RangeOptions {
  from?: string | null;
  to?: string | null;
  bucket?: LojaBucket;
  enabled?: boolean;
  /** Segmentos extras da chave, para hooks que chamam a mesma função com janelas diferentes. */
  keySuffix?: unknown[];
}

// As funções ainda não estão nos tipos gerados (types.ts); mesmo padrão dos
// outros RPCs novos do projeto (set_tenant_settings, tenant_access_state).
const rpc = async <T>(fn: string, args: Record<string, unknown>): Promise<T[]> => {
  const { data, error } = await (supabase as any).rpc(fn, args);
  if (error) {
    logger.error(`RPC ${fn} falhou`, { code: error.code, message: error.message });
    throw error;
  }
  return (data ?? []) as T[];
};

const toNumber = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0));

export const useLojaMessageCounts = ({ from = null, to = null, bucket = 'all', enabled = true, keySuffix = [] }: RangeOptions = {}) => {
  const { tenant } = useTenant();
  const tz = browserTimeZone();
  return useQuery<LojaMessageCountRow[]>({
    queryKey: ['loja-stats', 'message-counts', tenant?.id, from, to, bucket, tz, ...keySuffix],
    enabled: enabled && !!tenant?.id,
    queryFn: async () => {
      const rows = await rpc<LojaMessageCountRow>('loja_message_counts', {
        p_tenant_id: tenant!.id,
        p_from: from,
        p_to: to,
        p_bucket: bucket,
        p_tz: tz,
      });
      return rows.map((r) => ({ ...r, n: toNumber(r.n) }));
    },
  });
};

export const useLojaResponseTime = ({ from = null, to = null, bucket = 'all', enabled = true, keySuffix = [] }: RangeOptions = {}) => {
  const { tenant } = useTenant();
  const tz = browserTimeZone();
  return useQuery<LojaResponseTimeRow[]>({
    queryKey: ['loja-stats', 'response-time', tenant?.id, from, to, bucket, tz, ...keySuffix],
    enabled: enabled && !!tenant?.id,
    queryFn: async () => {
      const rows = await rpc<LojaResponseTimeRow>('loja_response_time', {
        p_tenant_id: tenant!.id,
        p_from: from,
        p_to: to,
        p_bucket: bucket,
        p_tz: tz,
      });
      return rows.map((r) => ({ ...r, n: toNumber(r.n), avg_minutes: toNumber(r.avg_minutes) }));
    },
  });
};

export const useLojaConversationCounts = ({ from = null, to = null, bucket = 'all', enabled = true, keySuffix = [] }: RangeOptions = {}) => {
  const { tenant } = useTenant();
  const tz = browserTimeZone();
  return useQuery<LojaConversationCountRow[]>({
    queryKey: ['loja-stats', 'conversation-counts', tenant?.id, from, to, bucket, tz, ...keySuffix],
    enabled: enabled && !!tenant?.id,
    queryFn: async () => {
      const rows = await rpc<LojaConversationCountRow>('loja_conversation_counts', {
        p_tenant_id: tenant!.id,
        p_from: from,
        p_to: to,
        p_bucket: bucket,
        p_tz: tz,
      });
      return rows.map((r) => ({ ...r, n: toNumber(r.n), n_unread: toNumber(r.n_unread) }));
    },
  });
};

const toNullableNumber = (v: unknown): number | null => (v === null || v === undefined ? null : toNumber(v));

/**
 * Métricas por conversa da Loja inteira. Devolve `null` quando a RPC não
 * respondeu linha nenhuma (chamador fora do alcance) — a tela mostra "—" em
 * vez de zeros falsos.
 */
export const useLojaConversationMetrics = ({ from = null, to = null, enabled = true, keySuffix = [] }: Omit<RangeOptions, 'bucket'> = {}) => {
  const { tenant } = useTenant();
  return useQuery<LojaConversationMetricsRow | null>({
    queryKey: ['loja-stats', 'conversation-metrics', tenant?.id, from, to, ...keySuffix],
    enabled: enabled && !!tenant?.id,
    queryFn: async () => {
      const rows = await rpc<Record<string, unknown>>('loja_conversation_metrics', {
        p_tenant_id: tenant!.id,
        p_from: from,
        p_to: to,
      });
      const r = rows[0];
      if (!r) return null;
      return {
        n_conversations: toNumber(r.n_conversations),
        n_bot_touched: toNumber(r.n_bot_touched),
        n_no_human_reply: toNumber(r.n_no_human_reply),
        n_waiting_human: toNumber(r.n_waiting_human),
        n_waiting_human_unowned: toNumber(r.n_waiting_human_unowned),
        n_first_human: toNumber(r.n_first_human),
        median_first_human_minutes: toNullableNumber(r.median_first_human_minutes),
        n_first_bot: toNumber(r.n_first_bot),
        median_first_bot_minutes: toNullableNumber(r.median_first_bot_minutes),
        median_messages: toNullableNumber(r.median_messages),
        median_duration_minutes: toNullableNumber(r.median_duration_minutes),
      };
    },
  });
};

interface ContactLastMessageOptions {
  direction?: 'inbound' | 'outbound' | null;
  contactId?: string | null;
  enabled?: boolean;
}

export const useLojaContactLastMessage = ({ direction = null, contactId = null, enabled = true }: ContactLastMessageOptions = {}) => {
  const { tenant } = useTenant();
  return useQuery<LojaContactLastMessageRow[]>({
    queryKey: ['loja-stats', 'contact-last-message', tenant?.id, direction, contactId],
    enabled: enabled && !!tenant?.id,
    queryFn: () =>
      rpc<LojaContactLastMessageRow>('loja_contact_last_message', {
        p_tenant_id: tenant!.id,
        p_direction: direction,
        p_contact_id: contactId,
      }),
  });
};

/** Soma `n` das linhas que passam no filtro. */
export const sumCounts = <T extends { n: number }>(rows: T[] | undefined, pred: (r: T) => boolean = () => true): number =>
  (rows ?? []).reduce((acc, r) => (pred(r) ? acc + r.n : acc), 0);
