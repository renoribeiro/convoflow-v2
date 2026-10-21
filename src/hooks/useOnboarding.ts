/**
 * Onboarding guiado: o estado da pessoa (user_onboarding) e a lista
 * "Primeiros passos" (onboarding_checklist), prontos para a tela.
 *
 * Erro ou carregamento NUNCA mostram nada: a boas-vindas e a lista só
 * aparecem com o dado lido. Falhar em silêncio aqui é o certo — onboarding que
 * aparece por engano para quem já usa o sistema incomoda mais do que um que
 * deixa de aparecer uma vez.
 */
import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRole, useTenant } from '@/contexts/TenantContext';
import { useHelpVisibility } from '@/hooks/useHelpVisibility';
import {
  ONBOARDING_CHECKLIST_KEY,
  fetchChecklistStatus,
  fetchOnboardingState,
  onboardingStateKey,
  patchOnboardingState,
} from '@/lib/onboarding/api';
import { buildChecklist, decideChecklistView, type ChecklistSummary } from '@/lib/onboarding/checklist';
import { isOnboardingRole, resetOnboardingState, type OnboardingState } from '@/lib/onboarding/state';

export function useOnboardingState() {
  const { profile } = useTenant();
  const role = useRole();
  const userId = (profile?.user_id as string | undefined) ?? null;
  const queryClient = useQueryClient();
  const enabled = !!userId && isOnboardingRole(role);

  const query = useQuery({
    queryKey: onboardingStateKey(userId),
    queryFn: () => fetchOnboardingState(userId as string),
    enabled,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const update = useCallback(
    async (muda: (state: OnboardingState) => OnboardingState) => {
      if (!userId) return false;
      return patchOnboardingState(queryClient, userId, muda);
    },
    [queryClient, userId],
  );

  const reset = useCallback(() => update(() => resetOnboardingState()), [update]);

  return {
    userId,
    role,
    enabled,
    state: enabled && query.isSuccess ? query.data : null,
    isLoading: enabled && query.isLoading,
    update,
    reset,
  };
}

export function useOnboardingChecklist() {
  const { tenantId } = useTenant();
  const role = useRole();
  const { canAccess, isLoading: modulesLoading } = useHelpVisibility();
  const onboarding = useOnboardingState();
  const enabled = !!tenantId && isOnboardingRole(role);

  const query = useQuery({
    queryKey: [ONBOARDING_CHECKLIST_KEY, tenantId, role],
    queryFn: () => fetchChecklistStatus(tenantId as string),
    enabled,
    // O feito muda em outra tela (conectou o número, convidou alguém): ao
    // voltar ao Dashboard a lista tem de ler de novo, não esperar 5 min.
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const status = enabled && query.isSuccess ? query.data : null;

  const summary: ChecklistSummary | null = useMemo(() => {
    if (!status || !isOnboardingRole(role) || modulesLoading) return null;
    return buildChecklist(role, status, canAccess);
  }, [status, role, canAccess, modulesLoading]);

  const view = decideChecklistView({ role, state: onboarding.state, status, summary });

  return { role, status, summary, view, onboarding };
}
