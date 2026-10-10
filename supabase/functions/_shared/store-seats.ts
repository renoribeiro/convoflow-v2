// =============================================================================
// Vagas de atendente por Loja (migração 20261009000003_atendentes_por_loja).
// =============================================================================
// A regra mora no banco (trigger enforce_store_membership_limits); isto é a
// cópia que o manage-user usa para responder ANTES de mexer em qualquer coisa —
// antes de mandar o convite (que deixaria um usuário órfão no Auth) e antes de
// liberar o login de quem vai ser reativado.
//
//   - Ocupam vaga: atendente 'active' e 'pending' (convite). Suspenso e
//     excluído não.
//   - Limite da Loja = atendentes_incluidos (2 por padrão) + atendentes_extra
//     (combinadas com o ConvoFlow; só o superadmin muda).
//   - Atendente só existe dentro de uma Loja (kind='store'), nunca na Conta.
//   - O gestor não ocupa vaga de atendente; a regra dele (1 por Loja) não mudou.
//
// As frases são as MESMAS do trigger, palavra por palavra: quem esbarra no
// limite pela tela ou pelo banco lê a mesma coisa. src/lib/users/storeSeats.test.ts
// confere as duas cópias.
//
// Sem import de Deno: o vitest do app testa este arquivo direto.
// =============================================================================

export const CONTATO_CONVOFLOW = 'contato@convoflow.com.br';

/** Atendentes padrão de toda Loja, inclusive as extras. */
export const ATENDENTES_INCLUIDOS_PADRAO = 2;

export const ATENDENTE_FORA_DA_LOJA = 'Atendente só pode entrar em uma Loja, não na Conta.';

export const EXCLUIDO_NAO_REATIVA =
  'Quem foi excluído não volta por "Reativar". Para essa pessoa voltar, convide de novo.';

/** As dicas (HINT) que o banco põe nos erros desta regra. */
export const SEAT_ERROR_HINTS = [
  'LOJA_CHEIA',
  'ATENDENTE_FORA_DA_LOJA',
  'LOJA_COM_GESTOR',
  'ABAIXO_DO_USO',
] as const;

export function lojaCheiaMessage(usados: number, limite: number): string {
  return `Esta Loja já tem ${usados} de ${limite} atendentes. Para ter mais, fale com o ConvoFlow: ${CONTATO_CONVOFLOW}`;
}

/** Status que ocupam uma vaga de atendente. */
export function occupiesSeat(status: string | null | undefined): boolean {
  return status === 'active' || status === 'pending';
}

export interface StoreSeatRow {
  kind: string | null;
  atendentes_incluidos: number | null;
  atendentes_extra: number | null;
}

export function seatLimit(store: Pick<StoreSeatRow, 'atendentes_incluidos' | 'atendentes_extra'>): number {
  const incluidos = store.atendentes_incluidos ?? ATENDENTES_INCLUIDOS_PADRAO;
  const extra = store.atendentes_extra ?? 0;
  return incluidos + extra;
}

export type SeatCheck =
  | { ok: true; usados: number; limite: number }
  | { ok: false; code: 'STORE_FULL' | 'ATTENDANT_OUTSIDE_STORE'; message: string; status: 409 };

/**
 * Cabe mais um atendente nesta Loja?
 *
 * `usadosOutros` = atendentes ativos e pendentes da Loja, SEM contar a própria
 * pessoa (na reativação ela ainda está suspensa e não entra na conta).
 */
export function checkAttendantEntry(store: StoreSeatRow | null, usadosOutros: number): SeatCheck {
  if (!store || store.kind !== 'store') {
    return { ok: false, code: 'ATTENDANT_OUTSIDE_STORE', message: ATENDENTE_FORA_DA_LOJA, status: 409 };
  }
  const limite = seatLimit(store);
  if (usadosOutros >= limite) {
    return { ok: false, code: 'STORE_FULL', message: lojaCheiaMessage(usadosOutros, limite), status: 409 };
  }
  return { ok: true, usados: usadosOutros, limite };
}

export type ReactivationPlan =
  /** Excluído não volta por "Reativar" (precisa de convite novo). */
  | 'refuse_deleted'
  /** Atendente suspenso: volta a ocupar vaga, então precisa de vaga livre. */
  | 'needs_seat'
  /** Pendente já ocupa a vaga; gestor/gerente não usam vaga de atendente. */
  | 'no_seat_needed';

export function reactivationPlan(target: { role: string | null; status: string | null }): ReactivationPlan {
  if (target.status === 'deleted') return 'refuse_deleted';
  if (target.role === 'atendente' && !occupiesSeat(target.status)) return 'needs_seat';
  return 'no_seat_needed';
}

export interface DbErrorLike {
  code?: string | null;
  message?: string | null;
  hint?: string | null;
}

/**
 * Erro do banco que é desta regra → a frase dele (já em português), para ir
 * direto à tela. Qualquer outro erro → null, e quem chamou decide.
 */
export function seatErrorFromDb(error: DbErrorLike | null | undefined): string | null {
  if (!error || error.code !== '23514') return null;
  if (!error.hint || !(SEAT_ERROR_HINTS as readonly string[]).includes(error.hint)) return null;
  return error.message?.trim() || null;
}
