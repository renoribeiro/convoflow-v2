import { useSupabaseQuery } from './useSupabaseQuery';
import { useTenant } from '@/contexts/TenantContext';
import { getChartColor } from '@/lib/chartColors';
import type { UsePeriodFilterResult } from './usePeriodFilter';

/**
 * Distribuição de contatos por fonte de lead (lead_sources) dentro do período.
 * Alimenta o DonutChart "Contatos por Fonte". Contatos sem fonte são agrupados
 * em "Sem fonte".
 */

export interface LeadSourceDatum {
  name: string;
  value: number;
  percentage: number;
  color: string;
}

export interface UseLeadSourcesResult {
  data: LeadSourceDatum[];
  total: number;
  isLoading: boolean;
}

type SourceRow = { id: string; name: string };
type ContactRow = { lead_source_id: string | null };

const NO_SOURCE_KEY = '__none__';

export function useLeadSourcesDistribution(period: UsePeriodFilterResult): UseLeadSourcesResult {
  const { tenant } = useTenant();
  const enabled = !!tenant?.id;
  const { startISO, endISO } = period;

  const { data: sourcesData = [], isLoading: sourcesLoading } = useSupabaseQuery({
    table: 'lead_sources',
    queryKey: ['dashboard-charts', 'lead-sources'],
    select: 'id, name',
    enabled,
    silent: true,
  });

  const { data: contactsData = [], isLoading: contactsLoading } = useSupabaseQuery({
    table: 'contacts',
    queryKey: ['dashboard-charts', 'lead-source-contacts', startISO, endISO],
    select: 'lead_source_id',
    filters: [
      { column: 'created_at', operator: 'gte', value: startISO },
      { column: 'created_at', operator: 'lte', value: endISO },
    ],
    limit: 50000,
    enabled,
    silent: true,
  });

  const sources = sourcesData as unknown as SourceRow[];
  const contacts = contactsData as unknown as ContactRow[];

  const nameById = new Map(sources.map((s) => [s.id, s.name]));
  const countByKey = new Map<string, number>();
  for (const c of contacts) {
    const key = c.lead_source_id ?? NO_SOURCE_KEY;
    countByKey.set(key, (countByKey.get(key) ?? 0) + 1);
  }

  const total = contacts.length;

  const entries = Array.from(countByKey.entries())
    .map(([key, value]) => ({
      name: key === NO_SOURCE_KEY ? 'Sem fonte' : nameById.get(key) || 'Fonte removida',
      value,
    }))
    .sort((a, b) => b.value - a.value);

  const data: LeadSourceDatum[] = entries.map((e, i) => ({
    ...e,
    percentage: total > 0 ? (e.value / total) * 100 : 0,
    color: getChartColor(i),
  }));

  return { data, total, isLoading: sourcesLoading || contactsLoading };
}
