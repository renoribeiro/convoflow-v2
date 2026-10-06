// =============================================================================
// instance-access.ts — quem pode USAR uma instância de WhatsApp pelo inbox
// =============================================================================
// Regra pura, zero I/O (mesma convenção de `store-slots.ts`), para o Vitest
// testar sem Deno. Quem chama resolve o perfil e a instância e passa aqui.
//
// O DEFEITO QUE ISTO EXISTE PARA CONSERTAR (achado em 2026-09-14):
//
//   A migração 20260909000004 deu ao gerente INSERT/UPDATE em messages /
//   conversations / contacts / tags das Lojas filhas — o inbox grava. Mas as
//   edge functions que falam com a Meta (`whatsapp-send-message`,
//   `list-whatsapp-templates`) continuaram exigindo
//   `instance.tenant_id === callerProfile.tenant_id`. Resultado medido como a
//   Helena (gerente da Conta própria, VagaCerta é Loja filha): a mensagem
//   grava com status `failed` e a função devolve 403 — o cliente do outro lado
//   não recebe nada.
//
// A REGRA espelha `public.gerente_child_store_ids()` do banco, que é o que as
// policies de escrita usam: gerente ATIVO + instância numa Loja (`kind =
// 'store'`) cujo `parent_tenant_id` é a Conta do gerente. Só filha DIRETA.
// Superadmin passa; qualquer cargo passa na própria Conta/Loja.
//
// Se essa regra e a função SQL divergirem, o inbox grava e a Meta não envia
// (ou o contrário). Mantenha as duas iguais.
// =============================================================================

import { normalizeRole } from './capabilities.ts';

export interface InstanceAccessCaller {
  tenant_id: string | null;
  role: string | null;
  status?: string | null;
}

export interface InstanceAccessInstance {
  tenant_id: string;
}

/** A linha de `tenants` da instância; só os campos que a regra olha. */
export interface InstanceAccessTenant {
  id: string;
  kind: string | null;
  parent_tenant_id: string | null;
}

export type InstanceAccessDecision =
  | { allowed: true; reason: 'superadmin' | 'own_tenant' | 'gerente_child_store' }
  | { allowed: false; reason: 'inactive' | 'no_tenant' | 'foreign_tenant' };

/**
 * Decide se `caller` pode usar `instance` pelo inbox (enviar, listar templates).
 *
 * `instanceTenant` é a linha de `tenants` da instância; pode ser `null` quando
 * quem chamou não a buscou (ou não achou) — aí só os dois primeiros caminhos
 * valem, e o gerente de Conta cai em `foreign_tenant`.
 */
export function decideInstanceAccess(
  caller: InstanceAccessCaller,
  instance: InstanceAccessInstance,
  instanceTenant: InstanceAccessTenant | null,
): InstanceAccessDecision {
  // Item 14, lote 4 (H5): só perfil ATIVO usa instância — superadmin e a
  // própria Loja inclusive. Antes o status só valia no caminho do gerente, e
  // um suspenso (ou excluído, ou convite pendente) seguia enviando pela Meta.
  // Status ausente conta como inativo: quem chama TEM de buscar o campo.
  if (caller.status !== 'active') return { allowed: false, reason: 'inactive' };
  if (!caller.tenant_id) return { allowed: false, reason: 'no_tenant' };

  const role = normalizeRole(caller.role);
  if (role === 'superadmin') return { allowed: true, reason: 'superadmin' };
  if (instance.tenant_id === caller.tenant_id) return { allowed: true, reason: 'own_tenant' };

  // Mesmas quatro condições de `gerente_child_store_ids()` + `is_gerente_safe()`
  // (o status ativo já foi conferido acima).
  if (
    role === 'gerente' &&
    instanceTenant &&
    instanceTenant.id === instance.tenant_id &&
    instanceTenant.kind === 'store' &&
    instanceTenant.parent_tenant_id !== null &&
    instanceTenant.parent_tenant_id === caller.tenant_id
  ) {
    return { allowed: true, reason: 'gerente_child_store' };
  }

  return { allowed: false, reason: 'foreign_tenant' };
}
