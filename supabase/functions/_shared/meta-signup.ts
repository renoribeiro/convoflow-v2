// =============================================================================
// meta-signup.ts — Embedded Signup: é reconexão ou primeira conexão, e este
// chamador pode?
// =============================================================================
// Regra pura, zero I/O (mesma convenção de `instance-access.ts`), para o Vitest
// testar sem Deno. A edge function meta-oauth-exchange busca as linhas e passa
// aqui ANTES de falar com a Meta — o código de autorização é de uso único e o
// subscribed_apps muda estado na Meta; se vamos recusar, recusamos antes de
// gastar qualquer um dos dois.
//
// O DEFEITO QUE ISTO EXISTE PARA CONSERTAR (medido em 2026-09-19):
//
//   meta-oauth-exchange sempre inseria. A gerente reconectando o número que
//   já existia batia em `whatsapp_instances_instance_key_key` DEPOIS de a Meta
//   ter consumido o código e inscrito o app novo na WABA. Nada era salvo e
//   ela não conseguia repetir sem rodar o diálogo de novo.
//
// LOOKUP — quem chama procura por phoneNumberId nas DUAS colunas
// (`instance_key` e `connection_config->>'phoneNumberId'`) e passa TODAS as
// linhas que casaram. Hoje as duas concordam em toda linha viva. Se uma linha
// casou por qualquer uma das duas, é ela; se casaram linhas diferentes, a
// decisão é `ambiguous` — não se adivinha. Não se casa por telefone (muda em
// port-in) nem por wabaId (uma WABA tem vários números).
//
// ACESSO — reutiliza decideInstanceAccess (a regra de 2026-09-14):
//   reconexão:        a Conta é a DA LINHA; a pergunta é "alcança a instância?"
//   primeira conexão: a Conta é a que o navegador mandou (a ativa no seletor);
//                     a pergunta é "pode gravar nesta Conta/Loja?" — a mesma
//                     regra, com a Conta de destino no lugar da instância.
//   Superadmin passa antes da checagem de "tem Conta no perfil" porque ele
//   não tem tenant_id próprio — mas na primeira conexão precisa mandar a Conta
//   de destino.
//
// ESPELHO — `public.meta_signup_check(text, uuid)` (migração 20260919000002)
// aplica a mesma regra dentro da transação que grava. Se as duas divergirem,
// a edge function deixa passar e o banco recusa (ou o contrário). Mantenha as
// duas iguais.
// =============================================================================

import { normalizeRole } from './capabilities.ts';
import {
  decideInstanceAccess,
  type InstanceAccessCaller,
  type InstanceAccessTenant,
} from './instance-access.ts';

/** O que a edge function lê de cada linha candidata de `whatsapp_instances`. */
export interface MetaSignupExistingInstance {
  id: string;
  tenant_id: string;
  provider: string | null;
  instance_key: string;
  registered_at: string | null;
  connection_config: Record<string, unknown> | null;
}

export interface MetaSignupInput {
  caller: InstanceAccessCaller;
  /** phoneNumberId que veio do diálogo da Meta (já validado como numérico). */
  phoneNumberId: string;
  /** Linhas que casaram por instance_key OU por connection_config.phoneNumberId. */
  candidates: MetaSignupExistingInstance[];
  /** A linha de `tenants` da instância candidata (quando há exatamente uma). */
  candidateTenant: InstanceAccessTenant | null;
  /** Conta/Loja ativa no seletor, mandada pelo navegador. Só vale na primeira conexão. */
  requestedTenantId: string | null;
  /** A linha de `tenants` de requestedTenantId (null se não existe). */
  requestedTenant: InstanceAccessTenant | null;
}

export type MetaSignupRefusal =
  | 'ambiguous'
  | 'provider_mismatch'
  | 'foreign_instance'
  | 'tenant_required'
  | 'forbidden_tenant';

export type MetaSignupDecision =
  | {
      ok: true;
      mode: 'reconnect';
      tenantId: string;
      existing: MetaSignupExistingInstance;
      /** instance_key ou connection_config.phoneNumberId não bate com o diálogo. */
      keyMismatch: boolean;
      /** registered_at já preenchido: o passo de registro é PULADO. */
      skipRegister: boolean;
      access: 'superadmin' | 'own_tenant' | 'gerente_child_store';
    }
  | {
      ok: true;
      mode: 'connect';
      tenantId: string;
      existing: null;
      keyMismatch: false;
      skipRegister: false;
      access: 'superadmin' | 'own_tenant' | 'gerente_child_store';
    }
  | { ok: false; reason: MetaSignupRefusal; status: number; message: string };

/** Mensagens em pt-BR, sem dizer de quem é o número. Mesmas da função SQL. */
export const META_SIGNUP_REFUSAL_MESSAGES: Record<MetaSignupRefusal, string> = {
  ambiguous:
    'Este número aparece em mais de uma instância. Nada foi alterado. Escreva para contato@convoflow.com.br antes de tentar de novo.',
  provider_mismatch:
    'Este identificador já é usado por uma instância de outro provedor. Nada foi alterado.',
  foreign_instance:
    'Este número já está conectado em outra Conta ou Loja que você não administra. Se ele é seu, escreva para contato@convoflow.com.br.',
  tenant_required: 'Escolha a Conta ou Loja em que o número vai ser conectado.',
  forbidden_tenant: 'Você não pode conectar número nesta Conta ou Loja.',
};

const META_SIGNUP_REFUSAL_STATUS: Record<MetaSignupRefusal, number> = {
  ambiguous: 409,
  provider_mismatch: 409,
  foreign_instance: 403,
  tenant_required: 400,
  forbidden_tenant: 403,
};

function refuse(reason: MetaSignupRefusal): MetaSignupDecision {
  return {
    ok: false,
    reason,
    status: META_SIGNUP_REFUSAL_STATUS[reason],
    message: META_SIGNUP_REFUSAL_MESSAGES[reason],
  };
}

/**
 * Superadmin primeiro (não tem tenant_id próprio, e decideInstanceAccess
 * devolveria no_tenant); depois a regra de instance-access.ts tal qual.
 */
function canReach(
  caller: InstanceAccessCaller,
  targetTenantId: string,
  targetTenant: InstanceAccessTenant | null,
): 'superadmin' | 'own_tenant' | 'gerente_child_store' | null {
  if (normalizeRole(caller.role) === 'superadmin') return 'superadmin';
  const d = decideInstanceAccess(caller, { tenant_id: targetTenantId }, targetTenant);
  return d.allowed ? d.reason : null;
}

export function decideMetaSignup(input: MetaSignupInput): MetaSignupDecision {
  const { caller, phoneNumberId, candidates } = input;

  if (candidates.length > 1) return refuse('ambiguous');

  const existing = candidates.length === 1 ? candidates[0] : undefined;
  if (existing) {
    // ============================ RECONEXÃO ============================
    if ((existing.provider ?? 'evolution') !== 'official') return refuse('provider_mismatch');

    const tenantOfRow =
      input.candidateTenant && input.candidateTenant.id === existing.tenant_id
        ? input.candidateTenant
        : null;
    const access = canReach(caller, existing.tenant_id, tenantOfRow);
    if (!access) return refuse('foreign_instance');

    const cfgPhoneNumberId = String(existing.connection_config?.phoneNumberId ?? '');
    return {
      ok: true,
      mode: 'reconnect',
      tenantId: existing.tenant_id,
      existing,
      keyMismatch: existing.instance_key !== phoneNumberId || cfgPhoneNumberId !== phoneNumberId,
      skipRegister: existing.registered_at !== null && existing.registered_at !== undefined,
      access,
    };
  }

  // ============================ PRIMEIRA CONEXÃO ============================
  const requested = input.requestedTenantId?.trim() || null;
  if (!requested) return refuse('tenant_required');
  // Conta inexistente e Conta fora do alcance dão a MESMA resposta.
  if (!input.requestedTenant || input.requestedTenant.id !== requested) return refuse('forbidden_tenant');

  const access = canReach(caller, requested, input.requestedTenant);
  if (!access) return refuse('forbidden_tenant');

  return {
    ok: true,
    mode: 'connect',
    tenantId: requested,
    existing: null,
    keyMismatch: false,
    skipRegister: false,
    access,
  };
}

/**
 * Filtro PostgREST para o lookup pelas duas colunas. O phoneNumberId já foi
 * validado como numérico pela edge function, então não há vírgula nem
 * parêntese para escapar.
 */
export function metaSignupLookupFilter(phoneNumberId: string): string {
  return `instance_key.eq.${phoneNumberId},connection_config->>phoneNumberId.eq.${phoneNumberId}`;
}

/** phoneNumberId da Meta é uma string numérica. Nada além disso entra no filtro. */
export const META_PHONE_NUMBER_ID_PATTERN = /^[0-9]{1,40}$/;
