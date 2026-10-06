import { useSupabaseQuery, useSupabaseCount } from './useSupabaseQuery';
import { useTenant } from '@/contexts/TenantContext';
import type { UsePeriodFilterResult } from './usePeriodFilter';

/**
 * Resumo de automações para o Dashboard: total de fluxos ativos + execuções no
 * período agrupadas por status, com taxa de sucesso.
 *
 * Fontes: automation_flows (active=true) e automation_executions (started_at no
 * período). `automation_executions.status` típico: running | completed | failed.
 */

export interface AutomationsSummary {
  activeFlows: number;
  totalExecutions: number;
  byStatus: {
    completed: number;
    failed: number;
    running: number;
    other: number;
  };
  /** Taxa de sucesso = completed / (completed + failed) * 100. */
  successRate: number;
  isLoading: boolean;
}

type ExecRow = { status: string | null };

export function useAutomationsSummary(period: UsePeriodFilterResult): AutomationsSummary {
  const { tenant } = useTenant();
  const enabled = !!tenant?.id;
  const { startISO, endISO } = period;

  const { data: activeFlows = 0, isLoading: flowsLoading } = useSupabaseCount(
    'automation_flows',
    [{ column: 'active', operator: 'eq', value: true }],
    { silent: true, enabled },
  );

  const { data: execData = [], isLoading: execLoading } = useSupabaseQuery({
    table: 'automation_executions',
    queryKey: ['dashboard-charts', 'automation-execs', startISO, endISO],
    select: 'status',
    filters: [
      { column: 'started_at', operator: 'gte', value: startISO },
      { column: 'started_at', operator: 'lte', value: endISO },
    ],
    limit: 10000,
    enabled,
    silent: true,
  });

  const execs = execData as unknown as ExecRow[];
  const byStatus = { completed: 0, failed: 0, running: 0, other: 0 };
  for (const e of execs) {
    switch (e.status) {
      case 'completed':
        byStatus.completed++;
        break;
      case 'failed':
        byStatus.failed++;
        break;
      case 'running':
      case 'in_progress':
        byStatus.running++;
        break;
      default:
        byStatus.other++;
    }
  }

  const finished = byStatus.completed + byStatus.failed;
  const successRate = finished > 0 ? (byStatus.completed / finished) * 100 : 0;

  return {
    activeFlows,
    totalExecutions: execs.length,
    byStatus,
    successRate,
    isLoading: flowsLoading || execLoading,
  };
}
