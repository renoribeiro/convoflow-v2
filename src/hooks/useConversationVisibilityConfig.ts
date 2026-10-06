import { useTenant } from '@/contexts/TenantContext';
import { normalizeRole, type AnyUserRole } from '@/types/userHierarchy';

/**
 * Quanto da caixa de entrada um ATENDENTE enxerga (migração 20260914000001).
 *
 *   'all'         todas as conversas da Loja — o comportamento de sempre e o
 *                 padrão quando nada foi gravado.
 *   'unassigned'  as sem responsável + as dele + as em que já respondeu + as
 *                 que ele mesmo passou adiante.
 *   'own'         as dele + as em que já respondeu + as que ele mesmo passou
 *                 adiante.
 *
 * Quem decide de verdade é o RLS (policy de SELECT de `conversations` e de
 * `messages`, via `conversation_visibility_level()`). Este hook só lê a mesma
 * preferência para a tela saber o que explicar — nunca para filtrar.
 */
export type AtendenteVisibility = 'all' | 'unassigned' | 'own';

export const ATENDENTE_VISIBILITY_VALUES: readonly AtendenteVisibility[] = ['all', 'unassigned', 'own'];

export const DEFAULT_ATENDENTE_VISIBILITY: AtendenteVisibility = 'all';
export const DEFAULT_ATENDENTE_CAN_TRANSFER = true;

/** Formato guardado em `tenants.settings` (duas chaves soltas, como as de SLA ficam sob `sla`). */
export interface VisibilitySettings {
  atendente_visibility: AtendenteVisibility;
  atendente_can_transfer: boolean;
}

/** Texto único para cada opção — o mesmo na aba de Configurações e na Ajuda. */
export const ATENDENTE_VISIBILITY_LABELS: Record<AtendenteVisibility, { title: string; explanation: string }> = {
  all: {
    title: 'Todas as conversas da Loja',
    explanation: 'O atendente vê e abre qualquer conversa da Loja, como hoje.',
  },
  unassigned: {
    title: 'Sem responsável + as dele',
    explanation:
      'O atendente vê as conversas que ninguém assumiu, as que estão com ele e as em que já respondeu. Não vê as que estão com um colega.',
  },
  own: {
    title: 'Só as dele',
    explanation:
      'O atendente vê apenas as conversas que estão com ele e as em que já respondeu. Não vê a fila sem responsável nem as dos colegas.',
  },
};

/**
 * Uma frase, usada em todo lugar em que um número da Loja inteira aparece para
 * um atendente restrito. Não invente variações.
 */
export const LOJA_WIDE_LABEL = 'Toda a Loja';
export const LOJA_WIDE_HINT = 'Este número cobre toda a Loja, não só as suas conversas.';

export const isAtendenteVisibility = (value: unknown): value is AtendenteVisibility =>
  typeof value === 'string' && (ATENDENTE_VISIBILITY_VALUES as readonly string[]).includes(value);

/** Lê as duas chaves do JSON de settings, com os defaults. Puro, testável. */
export const parseVisibilitySettings = (settings: unknown): VisibilitySettings => {
  const raw = (settings && typeof settings === 'object' ? settings : {}) as Record<string, unknown>;
  const visibility = raw.atendente_visibility;
  const canTransfer = raw.atendente_can_transfer;
  return {
    atendente_visibility: isAtendenteVisibility(visibility) ? visibility : DEFAULT_ATENDENTE_VISIBILITY,
    atendente_can_transfer: typeof canTransfer === 'boolean' ? canTransfer : DEFAULT_ATENDENTE_CAN_TRANSFER,
  };
};

export interface UseConversationVisibilityConfigResult extends VisibilitySettings {
  /** True só para ATENDENTE com nível diferente de 'all'. Gestor/gerente/superadmin nunca. */
  isRestricted: boolean;
  /** True quando quem está logado NÃO pode transferir (atendente com a chave desligada). */
  transferBlocked: boolean;
  isLoading: boolean;
}

export const useConversationVisibilityConfig = (): UseConversationVisibilityConfigResult => {
  const { tenant, profile, loading } = useTenant();
  // Mesma derivação de `useRole()`, lida direto do contexto para o hook depender
  // de UMA coisa só (useTenant) — é o que os testes dos consumidores mockam.
  const role = normalizeRole(profile?.role as AnyUserRole | undefined);

  const parsed = parseVisibilitySettings(tenant?.settings);
  const isAtendente = role === 'atendente';

  return {
    ...parsed,
    isRestricted: isAtendente && parsed.atendente_visibility !== 'all',
    transferBlocked: isAtendente && !parsed.atendente_can_transfer,
    isLoading: loading,
  };
};
