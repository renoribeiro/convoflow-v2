import { useMemo } from 'react';
import { useTenant } from '@/contexts/TenantContext';
import {
  normalizeReplyCancelSettings,
  type ReplyCancelSettings,
} from '@/lib/followups/replySettings';

export interface UseFollowupReplyConfigResult extends ReplyCancelSettings {
  isLoading: boolean;
}

/**
 * O que uma resposta do cliente cancela, na Conta/Loja ativa.
 *
 * Lê `tenants.settings.followups`, que já vem carregado no TenantContext —
 * nenhuma query extra. Diferente do SLA, esta configuração NÃO é opt-in: sem
 * nada salvo valem os padrões (agendado cancela, manual não), porque o
 * comportamento existe no servidor de qualquer jeito.
 *
 * Quem escreve é `FollowupSettings`, via `updateTenantSettings`.
 */
export const useFollowupReplyConfig = (): UseFollowupReplyConfigResult => {
  const { tenant, loading } = useTenant();

  const raw = tenant?.settings;

  // Identidade estável: o objeto entra em `useEffect` do painel de
  // configurações e um objeto novo a cada render reiniciaria o formulário
  // por baixo de quem está digitando.
  const settings = useMemo(() => normalizeReplyCancelSettings(raw), [raw]);

  return { ...settings, isLoading: loading };
};
