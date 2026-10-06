import { useSupabaseQuery, useSupabaseCount } from './useSupabaseQuery';
import { useTenant } from '@/contexts/TenantContext';
import { subDays, startOfDay, endOfDay, subHours } from 'date-fns';

interface DashboardMetrics {
  activeConversations: number;
  newContacts: number;
  conversionRate: number;
  avgResponseTime: number;
  messagesSent: number;

  // Trends (today vs yesterday). Omitidos em métricas onde comparação diária
  // não tem significado claro (active count, conversion rate).
  contactsTrend: number;
  responseTimeTrend: number;
  messagesTrend: number;

  loading: {
    activeConversations: boolean;
    newContacts: boolean;
    conversionRate: boolean;
    avgResponseTime: boolean;
    messagesSent: boolean;
  };

  isLoading: boolean;
  error: unknown;
}

type FunnelStageRow = { id: string; order: number };
type MessageRow = { conversation_id: string; direction: string; created_at: string };

const calcAvgResponseTimeMinutes = (msgs: MessageRow[]) => {
  // Agrupa por conversa; para cada conversa pega o primeiro inbound e o
  // primeiro outbound posterior. Diferença em minutos. Conversas sem
  // resposta no período são ignoradas (não há tempo de resposta a medir).
  const byConv = new Map<string, MessageRow[]>();
  for (const m of msgs) {
    const list = byConv.get(m.conversation_id);
    if (list) list.push(m);
    else byConv.set(m.conversation_id, [m]);
  }

  const diffsMin: number[] = [];
  for (const list of byConv.values()) {
    let firstInbound: MessageRow | null = null;
    for (const msg of list) {
      if (!firstInbound && msg.direction === 'inbound') {
        firstInbound = msg;
      } else if (firstInbound && msg.direction === 'outbound') {
        const ms =
          new Date(msg.created_at).getTime() -
          new Date(firstInbound.created_at).getTime();
        if (ms >= 0) diffsMin.push(ms / 1000 / 60);
        break;
      }
    }
  }

  if (diffsMin.length === 0) return 0;
  return diffsMin.reduce((a, b) => a + b, 0) / diffsMin.length;
};

const trend = (current: number, previous: number) => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
};

export const useDashboardMetrics = (): DashboardMetrics => {
  const { tenant } = useTenant();

  const today = new Date();
  const yesterday = subDays(today, 1);
  const last24Hours = subHours(today, 24);
  const previous24Hours = subHours(today, 48);

  // === Conversas Ativas — não arquivadas (a tabela não tem coluna 'status'; ===
  // === conversa "em andamento" = is_archived=false) ===
  const { data: activeConversations = 0, isLoading: conversationsLoading } =
    useSupabaseCount(
      'conversations',
      [{ column: 'is_archived', operator: 'eq', value: false }],
      { silent: true, enabled: !!tenant },
    );

  // === Novos Contatos — hoje vs ontem ===
  const { data: newContactsToday = 0, isLoading: contactsLoading } =
    useSupabaseCount(
      'contacts',
      [
        { column: 'created_at', operator: 'gte', value: startOfDay(today).toISOString() },
        { column: 'created_at', operator: 'lte', value: endOfDay(today).toISOString() },
      ],
      { silent: true, enabled: !!tenant },
    );

  const { data: newContactsYesterday = 0 } = useSupabaseCount(
    'contacts',
    [
      { column: 'created_at', operator: 'gte', value: startOfDay(yesterday).toISOString() },
      { column: 'created_at', operator: 'lte', value: endOfDay(yesterday).toISOString() },
    ],
    { silent: true, enabled: !!tenant },
  );

  // === Mensagens Enviadas — outbound hoje vs ontem ===
  const { data: messagesSentToday = 0, isLoading: messagesLoading } =
    useSupabaseCount(
      'messages',
      [
        { column: 'created_at', operator: 'gte', value: startOfDay(today).toISOString() },
        { column: 'created_at', operator: 'lte', value: endOfDay(today).toISOString() },
        { column: 'direction', operator: 'eq', value: 'outbound' },
      ],
      { silent: true, enabled: !!tenant },
    );

  const { data: messagesSentYesterday = 0 } = useSupabaseCount(
    'messages',
    [
      { column: 'created_at', operator: 'gte', value: startOfDay(yesterday).toISOString() },
      { column: 'created_at', operator: 'lte', value: endOfDay(yesterday).toISOString() },
      { column: 'direction', operator: 'eq', value: 'outbound' },
    ],
    { silent: true, enabled: !!tenant },
  );

  // === Taxa de Conversão — contatos no estágio final do funil / total ===
  const { data: stagesData = [], isLoading: stagesLoading } = useSupabaseQuery({
    table: 'funnel_stages',
    queryKey: ['dashboard-metrics', 'funnel-stages', tenant?.id],
    select: 'id, order',
    enabled: !!tenant,
    silent: true,
  });

  const stages = stagesData as unknown as FunnelStageRow[];
  const maxOrder = stages.length > 0 ? Math.max(...stages.map((s) => s.order)) : -1;
  const finalStageIds = stages.filter((s) => s.order === maxOrder).map((s) => s.id);

  const { data: convertedCount = 0, isLoading: convertedLoading } = useSupabaseCount(
    'contacts',
    [{ column: 'current_stage_id', operator: 'in', value: finalStageIds }],
    { silent: true, enabled: !!tenant && finalStageIds.length > 0 },
  );

  const { data: totalContactsCount = 0, isLoading: totalContactsLoading } =
    useSupabaseCount('contacts', [], { silent: true, enabled: !!tenant });

  const conversionRate =
    totalContactsCount > 0 ? (convertedCount / totalContactsCount) * 100 : 0;
  const conversionLoading = stagesLoading || convertedLoading || totalContactsLoading;

  // === Tempo Médio de Resposta — calc direto da tabela messages ===
  const { data: messagesLast24hData = [], isLoading: responseTimeLoading } =
    useSupabaseQuery({
      table: 'messages',
      queryKey: ['dashboard-metrics', 'messages-last-24h', tenant?.id],
      select: 'conversation_id, direction, created_at',
      filters: [
        { column: 'created_at', operator: 'gte', value: last24Hours.toISOString() },
      ],
      orderBy: [{ column: 'created_at', ascending: true }],
      limit: 1000,
      enabled: !!tenant,
      silent: true,
    });

  const { data: messagesPrev24hData = [] } = useSupabaseQuery({
    table: 'messages',
    queryKey: ['dashboard-metrics', 'messages-prev-24h', tenant?.id],
    select: 'conversation_id, direction, created_at',
    filters: [
      { column: 'created_at', operator: 'gte', value: previous24Hours.toISOString() },
      { column: 'created_at', operator: 'lt', value: last24Hours.toISOString() },
    ],
    orderBy: [{ column: 'created_at', ascending: true }],
    limit: 1000,
    enabled: !!tenant,
    silent: true,
  });

  const avgResponseTime = calcAvgResponseTimeMinutes(
    messagesLast24hData as unknown as MessageRow[],
  );
  const avgResponseTimeYesterday = calcAvgResponseTimeMinutes(
    messagesPrev24hData as unknown as MessageRow[],
  );

  return {
    activeConversations,
    newContacts: newContactsToday,
    conversionRate,
    avgResponseTime,
    messagesSent: messagesSentToday,

    contactsTrend: trend(newContactsToday, newContactsYesterday),
    // Tempo de resposta: menor é melhor — comparamos ontem - hoje
    responseTimeTrend: trend(avgResponseTimeYesterday, avgResponseTime),
    messagesTrend: trend(messagesSentToday, messagesSentYesterday),

    loading: {
      activeConversations: conversationsLoading,
      newContacts: contactsLoading,
      conversionRate: conversionLoading,
      avgResponseTime: responseTimeLoading,
      messagesSent: messagesLoading,
    },

    isLoading:
      conversationsLoading ||
      contactsLoading ||
      messagesLoading ||
      conversionLoading ||
      responseTimeLoading,
    error: null,
  };
};
