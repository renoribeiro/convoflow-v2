// =============================================================================
// connect-target.ts — em que Loja um número NOVO nasce, e este chamador pode?
// =============================================================================
// Regra pura, zero I/O (mesma convenção de `instance-access.ts`), para o Vitest
// testar sem Deno. Quem chama busca o perfil e a linha de `tenants` da Loja
// pedida e passa aqui ANTES de falar com o provedor.
//
// O DEFEITO QUE ISTO EXISTE PARA CONSERTAR (lote 6b do checkup, B2):
//
//   evolution-provision e waha-provision gravavam o número em
//   `profiles.tenant_id` de quem chamava. Para o Gerente isso é a CONTA, não a
//   Loja aberta no topo: o número nascia na Conta, onde nenhuma Loja o via. O
//   formulário manual da API Oficial fazia o mesmo, gravando pelo navegador.
//   Em 2026-10-29 havia dois números presos em Conta (movidos pela migração
//   20261029000001).
//
// A REGRA (decisão D1 do dono, 2026-10-29): número de WhatsApp é sempre de uma
// Loja, nunca da Conta, igual ao Instagram. O navegador manda a Loja aberta no
// topo; o servidor confere, nesta ordem:
//   1. perfil ativo e `whatsapp.configure` (o atendente para aqui);
//   2. a Loja pedida existe e o chamador a alcança, com a MESMA regra do
//      caminho do Facebook (meta-signup.ts → instance-access.ts): superadmin;
//      a própria Loja do perfil; Gerente numa Loja filha direta da Conta dele;
//   3. o destino é Loja (`kind = 'store'`). Conta = recusa `not_store`.
// Sem Loja no pedido vale a do perfil: para o Gestor é a Loja dele; para o
// Gerente é a Conta, e cai no passo 3.
//
// Inexistente e fora do alcance dão a MESMA resposta (não revela se existe).
// O alcance vem antes do `kind` pelo mesmo motivo.
//
// ESPELHO NO BANCO — o trigger `ac_guard_instance_in_store` (migração
// 20261029000001) recusa linha de whatsapp_instances fora de Loja, e
// `meta_signup_check` recusa `not_store` na primeira conexão.
// =============================================================================

import { can, CAPABILITY_DENIAL_MESSAGES, normalizeRole, statusDenialMessage } from './capabilities.ts';
import { decideInstanceAccess, type InstanceAccessTenant } from './instance-access.ts';

export interface ConnectTargetCaller {
  tenant_id: string | null;
  role: string | null;
  status: string | null;
  capabilities?: unknown;
}

export type ConnectAccess = 'superadmin' | 'own_tenant' | 'gerente_child_store';

export type ConnectTargetRefusal =
  | 'no_profile'
  | 'inactive'
  | 'forbidden'
  | 'invalid_tenant'
  | 'tenant_required'
  | 'forbidden_tenant'
  | 'not_store';

export type ConnectTargetDecision =
  | { ok: true; tenantId: string; access: ConnectAccess }
  | { ok: false; reason: ConnectTargetRefusal; status: number; message: string };

/** Mensagens em pt-BR, sem dizer de quem é a Loja. */
export const CONNECT_TARGET_MESSAGES: Record<Exclude<ConnectTargetRefusal, 'inactive' | 'forbidden'>, string> = {
  no_profile: 'Perfil sem Conta vinculada.',
  invalid_tenant: 'A Loja escolhida não é válida. Escolha a Loja no topo da tela e tente de novo.',
  tenant_required: 'Escolha no topo da tela a Loja em que o número vai ficar.',
  forbidden_tenant: 'Você não pode conectar número nesta Loja.',
  not_store: 'O número fica numa Loja, não na Conta. Escolha a Loja no topo da tela e tente de novo.',
};

const STATUS: Record<ConnectTargetRefusal, number> = {
  no_profile: 403,
  inactive: 403,
  forbidden: 403,
  invalid_tenant: 400,
  tenant_required: 400,
  forbidden_tenant: 403,
  not_store: 400,
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function refuse(reason: ConnectTargetRefusal, message: string): ConnectTargetDecision {
  return { ok: false, reason, status: STATUS[reason], message };
}

/**
 * Lê o `tenant_id` do corpo do pedido. `undefined`/`null`/vazio = não mandou
 * (vale a do perfil); qualquer outra coisa que não seja uuid = inválido.
 */
export function parseRequestedTenantId(raw: unknown): { ok: true; value: string | null } | { ok: false } {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: null };
  if (typeof raw !== 'string' || !UUID_PATTERN.test(raw.trim())) return { ok: false };
  return { ok: true, value: raw.trim() };
}

/**
 * Alcance de uma Conta/Loja de destino: superadmin primeiro (não tem
 * tenant_id próprio, e decideInstanceAccess devolveria no_tenant); depois a
 * regra de instance-access.ts tal qual. Usada também por meta-signup.ts.
 */
export function canReachTenant(
  caller: { tenant_id: string | null; role: string | null; status?: string | null },
  targetTenantId: string,
  targetTenant: InstanceAccessTenant | null,
): ConnectAccess | null {
  if (normalizeRole(caller.role) === 'superadmin') return 'superadmin';
  const d = decideInstanceAccess(caller, { tenant_id: targetTenantId }, targetTenant);
  return d.allowed ? d.reason : null;
}

export interface ConnectTargetInput {
  caller: ConnectTargetCaller | null;
  /** O `tenant_id` cru do corpo do pedido (a Loja aberta no topo). */
  requestedTenantId: unknown;
  /**
   * A linha de `tenants` do destino (o pedido ou, sem pedido, o perfil).
   * null quando não existe. Use `targetTenantIdFor` para saber qual buscar.
   */
  targetTenant: InstanceAccessTenant | null;
}

/** Qual linha de `tenants` quem chama precisa buscar antes de decidir. */
export function targetTenantIdFor(caller: ConnectTargetCaller | null, requestedTenantId: unknown): string | null {
  const parsed = parseRequestedTenantId(requestedTenantId);
  if (!parsed.ok) return null;
  return parsed.value ?? caller?.tenant_id ?? null;
}

export function decideConnectTarget(input: ConnectTargetInput): ConnectTargetDecision {
  const { caller } = input;
  if (!caller) return refuse('no_profile', CONNECT_TARGET_MESSAGES.no_profile);
  if (caller.status !== 'active') return refuse('inactive', statusDenialMessage(caller.status ?? ''));
  if (!can(caller.role, 'whatsapp.configure', caller.capabilities as Record<string, unknown> | null)) {
    return refuse('forbidden', CAPABILITY_DENIAL_MESSAGES['whatsapp.configure']);
  }

  const parsed = parseRequestedTenantId(input.requestedTenantId);
  if (!parsed.ok) return refuse('invalid_tenant', CONNECT_TARGET_MESSAGES.invalid_tenant);
  const target = parsed.value ?? caller.tenant_id ?? null;
  if (!target) return refuse('tenant_required', CONNECT_TARGET_MESSAGES.tenant_required);

  const tenant = input.targetTenant && input.targetTenant.id === target ? input.targetTenant : null;
  // Inexistente e fora do alcance: a MESMA resposta.
  if (!tenant) return refuse('forbidden_tenant', CONNECT_TARGET_MESSAGES.forbidden_tenant);
  const access = canReachTenant(caller, target, tenant);
  if (!access) return refuse('forbidden_tenant', CONNECT_TARGET_MESSAGES.forbidden_tenant);

  if (tenant.kind !== 'store') return refuse('not_store', CONNECT_TARGET_MESSAGES.not_store);

  return { ok: true, tenantId: target, access };
}
