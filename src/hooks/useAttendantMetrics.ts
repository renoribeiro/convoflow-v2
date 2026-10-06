import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { QUERY_KEYS } from '@/lib/queryClient';
import { logger } from '@/lib/logger';
import { useCanManageRotation } from './useConversationRotation';
import { parseAttendantRow, splitAttendantRows, type AttendantMetricsView } from '@/lib/dashboard/attendantMetrics';

/**
 * Métricas por pessoa da Loja ativa (RPC loja_attendant_metrics). O gate é o
 * MESMO da pílula "Responsável indisponível" e do rodízio: `useCanManageRotation`
 * no cliente (só para não montar a seção) e `rotation_admin_scope_ok` no banco
 * (o que vale de verdade — um atendente que chame a RPC recebe zero linhas).
 *
 * `null` quando a RPC devolveu nada: fora do alcance. `undefined` carregando.
 */
export const useAttendantMetrics = () => {
  const { tenant } = useTenant();
  const canManage = useCanManageRotation();

  const query = useQuery<AttendantMetricsView | null>({
    queryKey: [QUERY_KEYS.ATTENDANT_METRICS, tenant?.id],
    enabled: !!tenant?.id && canManage,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('loja_attendant_metrics', {
        p_tenant_id: tenant!.id,
      });
      if (error) {
        logger.error('RPC loja_attendant_metrics falhou', { code: error.code, message: error.message });
        throw error;
      }
      const rows = ((data ?? []) as Record<string, unknown>[]).map(parseAttendantRow);
      if (rows.length === 0) return null;
      return splitAttendantRows(rows);
    },
  });

  return {
    view: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    canManage,
  };
};
