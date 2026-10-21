/**
 * Leitura e gravação do estado do onboarding (public.user_onboarding) e da
 * lista "Primeiros passos" (rpc onboarding_checklist).
 *
 * A gravação é otimista: o cache do TanStack Query muda na hora (a tela não
 * espera o banco para fechar a boas-vindas) e o upsert vai em seguida. Se o
 * banco recusar, o cache é relido e a próxima visita mostra o que valeu.
 */
import type { QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { logger } from '@/lib/logger';
import { parseOnboardingState, type OnboardingState } from './state';
import { parseChecklistStatus, type ChecklistStatus } from './checklist';

export const ONBOARDING_STATE_KEY = 'user-onboarding';
export const ONBOARDING_CHECKLIST_KEY = 'onboarding-checklist';

export const onboardingStateKey = (userId: string | null) => [ONBOARDING_STATE_KEY, userId] as const;

export async function fetchOnboardingState(userId: string): Promise<OnboardingState> {
  const { data, error } = await supabase
    .from('user_onboarding')
    .select('state')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  // Sem linha = pessoa nova: estado vazio, a boas-vindas aparece.
  return parseOnboardingState(data?.state ?? {});
}

export async function saveOnboardingState(userId: string, state: OnboardingState): Promise<void> {
  const { error } = await supabase
    .from('user_onboarding')
    .upsert({ user_id: userId, state: state as unknown as Json }, { onConflict: 'user_id' });
  if (error) throw error;
}

/**
 * Lê (do cache, ou do banco), aplica `muda` e grava. Sem estado conhecido e
 * sem conseguir ler, NÃO grava: sobrescrever às cegas apagaria a marca de
 * veterano de quem já usava o sistema.
 */
export async function patchOnboardingState(
  queryClient: QueryClient,
  userId: string,
  muda: (state: OnboardingState) => OnboardingState,
): Promise<boolean> {
  const key = onboardingStateKey(userId);
  let atual = queryClient.getQueryData<OnboardingState>(key);
  if (!atual) {
    try {
      atual = await fetchOnboardingState(userId);
    } catch (error) {
      logger.warn('[onboarding] estado ilegível; nada gravado', { error });
      return false;
    }
  }
  const proximo = muda(atual);
  queryClient.setQueryData(key, proximo);
  try {
    await saveOnboardingState(userId, proximo);
    return true;
  } catch (error) {
    logger.warn('[onboarding] falha ao gravar o estado', { error });
    void queryClient.invalidateQueries({ queryKey: key });
    return false;
  }
}

export async function fetchChecklistStatus(tenantId: string): Promise<ChecklistStatus | null> {
  const { data, error } = await supabase.rpc('onboarding_checklist', { p_tenant_id: tenantId });
  if (error) throw error;
  return parseChecklistStatus(data);
}
