// =============================================================================
// gerente-sobre-pessoa.ts — o Gerente pode agir sobre esta pessoa?
// =============================================================================
// Regra pura, zero I/O (mesma convenção de `connect-target.ts`), para o Vitest
// testar sem Deno. O manage-user (ensureCanManage, ramo do Gerente) busca a
// árvore de pessoas e a linha de `tenants` da pessoa e passa aqui.
//
// O FURO QUE ISTO FECHA (revisão de 2026-11-26):
//
//   O ramo do Gerente só olhava a árvore de pessoas (profiles.parent_id, via
//   descendant_profile_ids). Se o superadmin mudasse alguém de Conta
//   (tenant_id) sem trocar o responsável, o Gerente antigo seguia podendo
//   suspender, excluir, editar e mandar troca de senha para essa pessoa, já em
//   outra Conta. Em 2026-11-26 havia 0 casos; a regra não dependia disso.
//
// A REGRA: as duas coisas juntas.
//   1. a pessoa está na árvore do Gerente;
//   2. a pessoa está na Conta do Gerente ou numa Loja dessa Conta. É o mesmo
//      alcance de `canReachTenant` (connect-target.ts → instance-access.ts):
//      Gerente ativo, a própria Conta, ou Loja filha direta da Conta.
// Pessoa sem tenant_id (superadmin) fica fora: o Gerente não a alcança.
// =============================================================================

import { canReachTenant } from './connect-target.ts';
import type { InstanceAccessTenant } from './instance-access.ts';

export const PESSOA_FORA_DA_CONTA = 'Este usuário não pertence à sua Conta.';

export interface GerenteSobrePessoaInput {
  caller: { tenant_id: string | null; role: string | null; status: string | null };
  alvoId: string;
  /** ids devolvidos por descendant_profile_ids(caller.id). */
  descendentes: string[];
  /** profiles.tenant_id da pessoa alvo. */
  alvoTenantId: string | null;
  /** A linha de `tenants` de alvoTenantId; null quando não existe ou não foi buscada. */
  alvoTenant: InstanceAccessTenant | null;
}

export type GerenteSobrePessoaDecision =
  | { ok: true }
  | { ok: false; status: 403; message: string };

export function decidirGerenteSobrePessoa(input: GerenteSobrePessoaInput): GerenteSobrePessoaDecision {
  const negado: GerenteSobrePessoaDecision = { ok: false, status: 403, message: PESSOA_FORA_DA_CONTA };
  if (!input.descendentes.includes(input.alvoId)) return negado;
  if (!input.alvoTenantId) return negado;
  const alcance = canReachTenant(input.caller, input.alvoTenantId, input.alvoTenant);
  // O ramo é só do Gerente: 'superadmin' aqui seria chamada errada.
  if (alcance === 'own_tenant' || alcance === 'gerente_child_store') return { ok: true };
  return negado;
}
