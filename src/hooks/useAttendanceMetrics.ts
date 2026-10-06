import { useTenant } from '@/contexts/TenantContext';
import type { UsePeriodFilterResult } from './usePeriodFilter';
import { useLojaConversationMetrics } from './useLojaStats';
import { buildAttendanceCards, type AttendanceCardModel } from '@/lib/dashboard/attendanceMetrics';

/**
 * Os cartões de atendimento do Dashboard (seção "Atendimento"), a partir de
 * `loja_conversation_metrics` — duas chamadas: o período escolhido e o
 * anterior, para a variação das duas medianas. Loja inteira, como os outros
 * números do Dashboard (ver useLojaStats).
 */
export interface UseAttendanceMetricsResult {
  cards: AttendanceCardModel[];
  isLoading: boolean;
  /** True quando a RPC respondeu vazio: chamador fora do alcance. */
  unavailable: boolean;
}

export function useAttendanceMetrics(period: UsePeriodFilterResult): UseAttendanceMetricsResult {
  const { tenant } = useTenant();
  const enabled = !!tenant?.id;
  const { startISO, endISO, prevStartISO, prevEndISO } = period;

  const current = useLojaConversationMetrics({ from: startISO, to: endISO, enabled, keySuffix: ['period'] });
  const previous = useLojaConversationMetrics({ from: prevStartISO, to: prevEndISO, enabled, keySuffix: ['prev'] });

  return {
    cards: buildAttendanceCards(current.data, previous.data),
    isLoading: current.isLoading,
    unavailable: !current.isLoading && current.data === null,
  };
}
