import { useSupabaseQuery } from './useSupabaseQuery';
import { useTenant } from '@/contexts/TenantContext';
import { getChartColor } from '@/lib/chartColors';

/**
 * Distribuição de contatos por estágio do funil (mini-funil visual do Dashboard).
 * Conta contatos agrupados por `current_stage_id`, ordenado por `funnel_stages.order`.
 * Usa a cor cadastrada em funnel_stages.color, com fallback para a paleta da marca.
 */

export interface FunnelStageDatum {
  id: string;
  name: string;
  count: number;
  percentage: number;
  color: string;
}

export interface UseFunnelDistributionResult {
  stages: FunnelStageDatum[];
  total: number;
  isLoading: boolean;
}

type StageRow = { id: string; name: string; order: number; color: string | null };
type ContactRow = { current_stage_id: string | null };

export function useFunnelDistribution(): UseFunnelDistributionResult {
  const { tenant } = useTenant();
  const enabled = !!tenant?.id;

  const { data: stagesData = [], isLoading: stagesLoading } = useSupabaseQuery({
    table: 'funnel_stages',
    queryKey: ['dashboard-charts', 'funnel-stages-dist'],
    select: 'id, name, order, color',
    orderBy: [{ column: 'order', ascending: true }],
    enabled,
    silent: true,
  });

  const { data: contactsData = [], isLoading: contactsLoading } = useSupabaseQuery({
    table: 'contacts',
    queryKey: ['dashboard-charts', 'funnel-contacts'],
    select: 'current_stage_id',
    limit: 50000,
    enabled,
    silent: true,
  });

  const stageRows = stagesData as unknown as StageRow[];
  const contacts = contactsData as unknown as ContactRow[];

  const countByStage = new Map<string, number>();
  for (const c of contacts) {
    if (!c.current_stage_id) continue;
    countByStage.set(c.current_stage_id, (countByStage.get(c.current_stage_id) ?? 0) + 1);
  }

  const total = stageRows.reduce((sum, s) => sum + (countByStage.get(s.id) ?? 0), 0);

  const stages: FunnelStageDatum[] = stageRows.map((s, i) => {
    const count = countByStage.get(s.id) ?? 0;
    return {
      id: s.id,
      name: s.name,
      count,
      percentage: total > 0 ? (count / total) * 100 : 0,
      color: s.color || getChartColor(i),
    };
  });

  return { stages, total, isLoading: stagesLoading || contactsLoading };
}
