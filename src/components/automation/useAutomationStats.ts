/**
 * Estatísticas de automação agregadas por fluxo, em UMA query (execuções do
 * tenant). Usado pela lista e pelo cabeçalho do construtor. Best-effort: se a
 * RLS/consulta falhar, retorna vazio sem quebrar a UI.
 */
import { useMemo } from 'react';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';

export interface FlowStat {
  executions: number;
  completed: number;
  failed: number;
  running: number;
  successRate: number;
  lastRun: string | null;
}

const EMPTY: FlowStat = { executions: 0, completed: 0, failed: 0, running: 0, successRate: 0, lastRun: null };

export function useAutomationStats() {
  const { data: rows = [], isLoading } = useSupabaseQuery({
    table: 'automation_executions',
    queryKey: ['automation-stats'],
    select: 'flow_id, status, started_at',
    silent: true,
  });

  const byFlow = useMemo(() => {
    const map = new Map<string, FlowStat>();
    for (const r of rows as { flow_id: string; status: string; started_at: string }[]) {
      if (!r.flow_id) continue;
      const cur = map.get(r.flow_id) ?? { ...EMPTY };
      cur.executions++;
      if (r.status === 'completed') cur.completed++;
      else if (r.status === 'failed') cur.failed++;
      else if (r.status === 'running') cur.running++;
      if (!cur.lastRun || r.started_at > cur.lastRun) cur.lastRun = r.started_at;
      map.set(r.flow_id, cur);
    }
    map.forEach((v) => {
      v.successRate = v.executions > 0 ? Math.round((v.completed / v.executions) * 100) : 0;
    });
    return map;
  }, [rows]);

  return { byFlow, isLoading };
}

/** "há 2h", "há 3 dias", "—" */
export function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d} dia${d > 1 ? 's' : ''}`;
  const mo = Math.floor(d / 30);
  return `há ${mo} mês${mo > 1 ? 'es' : ''}`;
}
