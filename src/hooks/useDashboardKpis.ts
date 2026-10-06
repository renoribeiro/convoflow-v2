import { useSupabaseQuery, useSupabaseCount } from './useSupabaseQuery';
import { useTenant } from '@/contexts/TenantContext';
import { startOfDay, subDays, format } from 'date-fns';
import type { UsePeriodFilterResult } from './usePeriodFilter';
import {
  sumCounts,
  useLojaConversationCounts,
  useLojaMessageCounts,
} from './useLojaStats';

/**
 * KPIs do Dashboard — versão "CRM" com valor principal, variação vs. período
 * anterior e sparkline de 7 dias por métrica.
 *
 * Os números de CONTATOS continuam vindo das queries leves de sempre
 * (useSupabaseCount / useSupabaseQuery com `silent`). Os de CONVERSAS e
 * MENSAGENS passaram a vir das funções `loja_*` (useLojaStats) desde a
 * migração 20260914000001: quando uma Loja restringe o que um atendente vê,
 * o RLS de `messages`/`conversations` devolve só o que é dele — e o Dashboard,
 * por decisão de produto, continua mostrando a Loja inteira. As funções
 * devolvem só contagens por balde; a matemática aqui é a mesma de antes, só
 * que feita no banco em vez de sobre linhas baixadas.
 *
 * O tempo de resposta SAIU daqui (2026-09-21): o cartão único de "Tempo Médio
 * de Resposta" misturava bot e pessoa (loja_response_time não distinguia) e
 * usava média. Agora são dois números, em mediana, em `useAttendanceMetrics`.
 *
 * As sparklines são SEMPRE dos últimos 7 dias (mini-tendência), independente do
 * período — por isso suas queries usam janelas normalizadas por dia (estáveis
 * dentro do mesmo dia, sem refetch em loop).
 */

export interface KpiMetric {
  value: number;
  /** Valor no período anterior (null quando a comparação não se aplica). */
  previousValue: number | null;
  /** Variação percentual assinada vs. período anterior (null = sem comparação). */
  deltaPct: number | null;
  /** Série de 7 pontos para o mini-gráfico. */
  sparkline: SparkPoint[];
  loading: boolean;
}

export interface SparkPoint {
  date: string;
  value: number;
}

export interface DashboardKpis {
  activeConversations: KpiMetric;
  newContacts: KpiMetric;
  conversionRate: KpiMetric;
  messagesSent: KpiMetric;
}

type FunnelStageRow = { id: string; order: number; is_final: boolean | null };

const SPARK_DAYS = 7;

const deltaPct = (current: number, previous: number): number => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
};

/** Os 7 dias da sparkline, em ordem, com a chave yyyy-MM-dd de cada um. */
function sparkDays(): Array<{ key: string; label: string }> {
  const days: Array<{ key: string; label: string }> = [];
  for (let i = SPARK_DAYS - 1; i >= 0; i--) {
    const d = subDays(new Date(), i);
    days.push({ key: format(d, 'yyyy-MM-dd'), label: format(d, 'dd/MM') });
  }
  return days;
}

/** Buckets diários (últimos `days` dias) por contagem de linhas. */
function dailyCountSpark(rows: Array<Record<string, any>>, dateField: string): SparkPoint[] {
  const buckets = new Map<string, number>();
  for (const d of sparkDays()) buckets.set(d.key, 0);
  for (const r of rows) {
    const raw = r[dateField];
    if (!raw) continue;
    const key = format(new Date(raw), 'yyyy-MM-dd');
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return Array.from(buckets.entries()).map(([date, value]) => ({
    date: format(new Date(date), 'dd/MM'),
    value,
  }));
}

/**
 * Mesma sparkline, mas a partir de linhas JÁ agregadas por dia pelo banco
 * (`bucket` = meia-noite local do dia, `n` = contagem). Dias sem linha valem 0.
 */
function dailyBucketSpark(rows: Array<{ bucket: string | null; n: number }>): SparkPoint[] {
  const buckets = new Map<string, number>();
  for (const d of sparkDays()) buckets.set(d.key, 0);
  for (const r of rows) {
    if (!r.bucket) continue;
    const key = format(new Date(r.bucket), 'yyyy-MM-dd');
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + r.n);
  }
  return Array.from(buckets.entries()).map(([date, value]) => ({
    date: format(new Date(date), 'dd/MM'),
    value,
  }));
}

export function useDashboardKpis(period: UsePeriodFilterResult): DashboardKpis {
  const { tenant } = useTenant();
  const enabled = !!tenant?.id;

  const { startISO, endISO, prevStartISO, prevEndISO } = period;
  const spark7dISO = startOfDay(subDays(new Date(), SPARK_DAYS - 1)).toISOString();

  // ===== Conversas Ativas (snapshot) + variação por conversas criadas =====
  const { data: convAll = [], isLoading: activeLoading } = useLojaConversationCounts({
    enabled,
    keySuffix: ['snapshot'],
  });
  const activeConversations = sumCounts(convAll, (r) => !r.is_archived);
  const { data: convPeriodRows = [] } = useLojaConversationCounts({
    from: startISO,
    to: endISO,
    enabled,
    keySuffix: ['period'],
  });
  const { data: convPrevRows = [] } = useLojaConversationCounts({
    from: prevStartISO,
    to: prevEndISO,
    enabled,
    keySuffix: ['prev'],
  });
  const convCreatedPeriod = sumCounts(convPeriodRows);
  const convCreatedPrev = sumCounts(convPrevRows);
  const { data: convSparkRows = [] } = useLojaConversationCounts({
    from: spark7dISO,
    bucket: 'day',
    enabled,
    keySuffix: ['spark'],
  });

  // ===== Novos Contatos (período) =====
  const { data: contactsPeriod = 0, isLoading: contactsLoading } = useSupabaseCount(
    'contacts',
    [
      { column: 'created_at', operator: 'gte', value: startISO },
      { column: 'created_at', operator: 'lte', value: endISO },
    ],
    { silent: true, enabled },
  );
  const { data: contactsPrev = 0 } = useSupabaseCount(
    'contacts',
    [
      { column: 'created_at', operator: 'gte', value: prevStartISO },
      { column: 'created_at', operator: 'lte', value: prevEndISO },
    ],
    { silent: true, enabled },
  );
  const { data: contactsSparkRows = [] } = useSupabaseQuery({
    table: 'contacts',
    queryKey: ['dashboard-charts', 'contacts-spark'],
    select: 'created_at',
    filters: [{ column: 'created_at', operator: 'gte', value: spark7dISO }],
    limit: 5000,
    enabled,
    silent: true,
  });

  // ===== Taxa de Conversão (snapshot) =====
  const { data: stagesData = [], isLoading: stagesLoading } = useSupabaseQuery({
    table: 'funnel_stages',
    queryKey: ['dashboard-metrics', 'funnel-stages-kpi'],
    select: 'id, order, is_final',
    enabled,
    silent: true,
  });
  const stages = stagesData as unknown as FunnelStageRow[];
  const flagged = stages.filter((s) => s.is_final);
  const maxOrder = stages.length > 0 ? Math.max(...stages.map((s) => s.order)) : -1;
  const finalStageIds = (flagged.length > 0 ? flagged : stages.filter((s) => s.order === maxOrder)).map(
    (s) => s.id,
  );

  const { data: convertedCount = 0, isLoading: convertedLoading } = useSupabaseCount(
    'contacts',
    [{ column: 'current_stage_id', operator: 'in', value: finalStageIds }],
    { silent: true, enabled: enabled && finalStageIds.length > 0 },
  );
  const { data: totalContacts = 0, isLoading: totalLoading } = useSupabaseCount(
    'contacts',
    [],
    { silent: true, enabled },
  );
  const conversionRateValue = totalContacts > 0 ? (convertedCount / totalContacts) * 100 : 0;

  // Variação da conversão: contatos que ENTRARAM em estágio final no período.
  const { data: convertedPeriod = 0 } = useSupabaseCount(
    'contacts',
    [
      { column: 'current_stage_id', operator: 'in', value: finalStageIds },
      { column: 'stage_entered_at', operator: 'gte', value: startISO },
      { column: 'stage_entered_at', operator: 'lte', value: endISO },
    ],
    { silent: true, enabled: enabled && finalStageIds.length > 0 },
  );
  const { data: convertedPrev = 0 } = useSupabaseCount(
    'contacts',
    [
      { column: 'current_stage_id', operator: 'in', value: finalStageIds },
      { column: 'stage_entered_at', operator: 'gte', value: prevStartISO },
      { column: 'stage_entered_at', operator: 'lte', value: prevEndISO },
    ],
    { silent: true, enabled: enabled && finalStageIds.length > 0 },
  );
  const { data: convSpark = [] } = useSupabaseQuery({
    table: 'contacts',
    queryKey: ['dashboard-charts', 'conversion-spark'],
    select: 'stage_entered_at',
    filters: [
      { column: 'current_stage_id', operator: 'in', value: finalStageIds },
      { column: 'stage_entered_at', operator: 'gte', value: spark7dISO },
    ],
    limit: 5000,
    enabled: enabled && finalStageIds.length > 0,
    silent: true,
  });

  // ===== Mensagens Enviadas (outbound no período) =====
  const { data: msgsPeriodRows = [], isLoading: sentLoading } = useLojaMessageCounts({
    from: startISO,
    to: endISO,
    enabled,
    keySuffix: ['period'],
  });
  const { data: msgsPrevRows = [] } = useLojaMessageCounts({
    from: prevStartISO,
    to: prevEndISO,
    enabled,
    keySuffix: ['prev'],
  });
  const sentPeriod = sumCounts(msgsPeriodRows, (r) => r.direction === 'outbound');
  const sentPrev = sumCounts(msgsPrevRows, (r) => r.direction === 'outbound');
  // Últimos 7 dias, por dia: sparkline de enviadas.
  const { data: msgs7dRows = [] } = useLojaMessageCounts({
    from: spark7dISO,
    bucket: 'day',
    enabled,
    keySuffix: ['spark'],
  });
  const sentSparkRows = msgs7dRows.filter((r) => r.direction === 'outbound');

  return {
    activeConversations: {
      value: activeConversations,
      previousValue: convCreatedPrev,
      deltaPct: deltaPct(convCreatedPeriod, convCreatedPrev),
      sparkline: dailyBucketSpark(convSparkRows),
      loading: activeLoading,
    },
    newContacts: {
      value: contactsPeriod,
      previousValue: contactsPrev,
      deltaPct: deltaPct(contactsPeriod, contactsPrev),
      sparkline: dailyCountSpark(contactsSparkRows as any[], 'created_at'),
      loading: contactsLoading,
    },
    conversionRate: {
      value: conversionRateValue,
      previousValue: convertedPrev,
      deltaPct: deltaPct(convertedPeriod, convertedPrev),
      sparkline: dailyCountSpark(convSpark as any[], 'stage_entered_at'),
      loading: stagesLoading || convertedLoading || totalLoading,
    },
    messagesSent: {
      value: sentPeriod,
      previousValue: sentPrev,
      deltaPct: deltaPct(sentPeriod, sentPrev),
      sparkline: dailyBucketSpark(sentSparkRows),
      loading: sentLoading,
    },
  };
}
