/**
 * Estado do onboarding de UMA pessoa — a coluna `state` de public.user_onboarding
 * (migração 20261021000001). Só preferência de tela: o que já está FEITO na
 * configuração não mora aqui, vem de onboarding_checklist() (ver checklist.ts).
 *
 *   boas_vindas_em      quando a pessoa fechou a boas-vindas ("Começar",
 *                       "Agora não" ou o X: qualquer saída conta, para não
 *                       voltar a cada visita ao Dashboard)
 *   tours               id do tour → quando terminou ou fechou
 *   lista_escondida_em  quando escondeu a lista "Primeiros passos"
 *   veterano            só nas linhas do backfill: quem já usava o sistema
 *                       em 2026-10-21. Para ele a lista só aparece com passo
 *                       OBRIGATÓRIO pendente.
 *
 * "Ver tutorial de novo" (Ajuda) grava {} por cima: tudo volta, inclusive para
 * o veterano, que passa a ser tratado como gente nova.
 *
 * Funções puras, para o teste provar as regras sem banco.
 */
import type { UserRole } from '@/types/userHierarchy';

export interface OnboardingState {
  v?: number;
  boas_vindas_em?: string | null;
  tours?: Record<string, string>;
  lista_escondida_em?: string | null;
  veterano?: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isoOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null;

/** Lê o JSON do banco sem confiar nele: campo de tipo errado vira ausente. */
export function parseOnboardingState(raw: unknown): OnboardingState {
  if (!isRecord(raw)) return {};
  const state: OnboardingState = {};
  if (typeof raw.v === 'number') state.v = raw.v;
  const boasVindas = isoOrNull(raw.boas_vindas_em);
  if (boasVindas) state.boas_vindas_em = boasVindas;
  const escondida = isoOrNull(raw.lista_escondida_em);
  if (escondida) state.lista_escondida_em = escondida;
  if (raw.veterano === true) state.veterano = true;
  if (isRecord(raw.tours)) {
    const tours: Record<string, string> = {};
    for (const [id, quando] of Object.entries(raw.tours)) {
      const iso = isoOrNull(quando);
      if (iso) tours[id] = iso;
    }
    if (Object.keys(tours).length > 0) state.tours = tours;
  }
  return state;
}

/** Cargos que têm onboarding. Superadmin opera a plataforma: nada aparece para ele. */
export const ONBOARDING_ROLES = ['gerente', 'gestor', 'atendente'] as const;
export type OnboardingRole = (typeof ONBOARDING_ROLES)[number];

export function isOnboardingRole(role: UserRole | null | undefined): role is OnboardingRole {
  return role === 'gerente' || role === 'gestor' || role === 'atendente';
}

/**
 * A boas-vindas aparece UMA vez: cargo com onboarding, estado lido com
 * sucesso (`state` nulo = ainda carregando ou erro, e aí nada aparece) e
 * nenhuma marca de que já foi vista.
 */
export function shouldShowWelcome(
  role: UserRole | null | undefined,
  state: OnboardingState | null | undefined,
): boolean {
  if (!isOnboardingRole(role) || !state) return false;
  return !state.boas_vindas_em;
}

export const markWelcomeSeen = (state: OnboardingState, nowIso: string): OnboardingState => ({
  ...state,
  v: 1,
  boas_vindas_em: nowIso,
});

export const markTourDone = (state: OnboardingState, tourId: string, nowIso: string): OnboardingState => ({
  ...state,
  v: 1,
  tours: { ...(state.tours ?? {}), [tourId]: nowIso },
});

export const hideChecklist = (state: OnboardingState, nowIso: string): OnboardingState => ({
  ...state,
  v: 1,
  lista_escondida_em: nowIso,
});

/** "Ver tutorial de novo": estado vazio, como o de quem acabou de chegar. */
export const resetOnboardingState = (): OnboardingState => ({});
