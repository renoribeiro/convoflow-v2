import { useMemo } from 'react';
import { useTenant } from '@/contexts/TenantContext';
import {
  DEFAULT_SLA_THRESHOLDS,
  normalizeSlaThresholds,
  type SlaThresholds,
} from '@/components/conversations/slaLevels';

/** Formato guardado em `tenants.settings.sla`. */
export interface SlaSettings {
  enabled: boolean;
  thresholds: SlaThresholds;
}

export interface UseSlaConfigResult extends SlaSettings {
  isLoading: boolean;
}

/**
 * Configuração de sinalização de SLA da Conta/Loja ativa.
 *
 * Lê `tenants.settings.sla`, que já vem carregado no TenantContext — nenhuma
 * query extra. A feature é OPT-IN: sem nada salvo, `enabled` é false e toda a
 * UI de SLA some (não fica desabilitada, some).
 *
 * Quem escreve é `AttendanceSettings`, via `updateTenantSettings`.
 */
export const useSlaConfig = (): UseSlaConfigResult => {
  const { tenant, loading } = useTenant();

  const raw = (tenant?.settings as { sla?: Partial<SlaSettings> } | null)?.sla;
  // Identidade estável: `thresholds` entra em memos da lista de conversas e um
  // objeto novo a cada render refaria filtro e contagens sem necessidade.
  const enabled = raw?.enabled === true;
  const thresholdsRaw = raw?.thresholds;

  const thresholds = useMemo(
    () => (thresholdsRaw ? normalizeSlaThresholds(thresholdsRaw) : DEFAULT_SLA_THRESHOLDS),
    [thresholdsRaw],
  );

  return { enabled, thresholds, isLoading: loading };
};
