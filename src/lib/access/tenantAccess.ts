// =============================================================================
// tenantAccess — de qual linha vem o acesso de um tenant
// =============================================================================
// REGRA DE NEGÓCIO: só uma CONTA (kind='account') tem assinatura. Uma LOJA
// nunca tem assinatura própria — o acesso dela vem da Conta pai. Não existe
// bloqueio por Loja: se a Conta está liberada, todas as Lojas dela funcionam.
//
// ESTE ARQUIVO É UM ESPELHO. A fonte da verdade em produção é a função
// `public.tenant_access_state(uuid)` (migrações 20260818000001 e
// 20260926000001, a dos status que liberam), porque só ela
// consegue ler a linha da Conta pai — o RLS de `tenants` não deixa quem está
// dentro de uma Loja enxergar a Conta, e isso é de propósito.
//
// Este módulo existe por dois motivos:
//   1. Escreve a regra num lugar que o Vitest alcança, com as formas de linha
//      que existem em produção fixadas em teste.
//   2. É o caminho de DEGRADAÇÃO do `useTenantAccess`: se a RPC não responde
//      (função ainda não aplicada, rede caindo), o hook avalia a linha que já
//      tem em mãos em vez de trancar todo mundo. Com `parent = null` o
//      resultado é exatamente o comportamento anterior a esta mudança — ou
//      seja, a degradação nunca é pior do que era antes.
//
// Se mudar a regra aqui, mude na função SQL junto. Os dois textos são curtos de
// propósito para que a divergência salte aos olhos numa revisão.
// =============================================================================

/**
 * Status de assinatura do Stripe que LIBERAM a Conta.
 *
 *   active    pagando em dia
 *   trialing  no teste grátis
 *   past_due  o cartão falhou e o Stripe está tentando de novo (carência)
 *
 * canceled, unpaid e todo o resto trancam. É o mesmo `IN (...)` da função SQL
 * (migração 20260926000001) e a mesma lista de
 * supabase/functions/_shared/subscription-state.ts —
 * `subscriptionStatusParity.test.ts` falha se os três divergirem.
 */
export const SUBSCRIPTION_UNLOCKING_STATUSES = ['active', 'trialing', 'past_due'] as const;

/** A assinatura, sozinha, libera a Conta? */
export function subscriptionUnlocks(status: string | null | undefined): boolean {
  return (SUBSCRIPTION_UNLOCKING_STATUSES as readonly string[]).includes(status ?? '');
}

/** De onde vem o acesso. Mesma união do `useTenantAccess`. */
export type AccessSource = 'bypass' | 'paid' | 'manual' | 'locked';

/** As quatro colunas de `tenants` que decidem acesso. Nenhuma outra importa. */
export interface AccessRow {
  kind?: string | null;
  parent_tenant_id?: string | null;
  subscription_status?: string | null;
  manual_access_granted?: boolean | null;
}

export interface AccessDecision {
  unlocked: boolean;
  /** `bypass` nunca sai daqui: ele é decidido por cargo, antes de olhar linha. */
  source: Exclude<AccessSource, 'bypass'>;
}

/**
 * Qual linha responde pela cobrança de `row`.
 *
 *   Loja COM pai            → a Conta pai (`parent`).
 *   Conta, ou Loja SEM pai  → ela mesma.
 *
 * O segundo caso não é detalhe. Até 2026-08-20 existiam duas Lojas órfãs em
 * produção, com a liberação manual na própria linha, e tratar a subida como um
 * join obrigatório trancava as duas. Elas foram removidas
 * (`docs/remover_lojas_orfas.sql`) e hoje não há nenhuma — a regra fica de pé
 * assim mesmo: nada no schema impede uma Loja com `parent_tenant_id` nulo, e um
 * join obrigatório trancaria a próxima que aparecer.
 *
 * `parent` nulo com uma Loja que TEM pai significa "não consegui carregar a
 * Conta" — cai na própria linha em vez de trancar.
 */
export function billingRowFor<T extends AccessRow>(
  row: T | null | undefined,
  parent: T | null | undefined,
): T | null {
  if (!row) return null;
  if (row.kind === 'store' && row.parent_tenant_id) return parent ?? row;
  return row;
}

/**
 * Decide o acesso. Assinatura ganha de liberação manual — mesma ordem de
 * sempre. `source` continua 'paid' para os três status que liberam (é o que a
 * função SQL devolve); quem precisa distinguir teste de pago lê o
 * `subscription_status` da linha.
 */
export function resolveTenantAccess(
  row: AccessRow | null | undefined,
  parent: AccessRow | null | undefined,
): AccessDecision {
  const cobranca = billingRowFor(row, parent);

  if (!cobranca) return { unlocked: false, source: 'locked' };
  if (subscriptionUnlocks(cobranca.subscription_status)) return { unlocked: true, source: 'paid' };
  if (cobranca.manual_access_granted === true) return { unlocked: true, source: 'manual' };

  return { unlocked: false, source: 'locked' };
}

/**
 * Normaliza o que a RPC devolveu para a união do front. Texto inesperado vindo
 * do banco não vira acesso: sem `unlocked`, é sempre `locked`.
 */
export function normalizeAccessDecision(raw: {
  unlocked?: unknown;
  source?: unknown;
}): AccessDecision {
  if (raw?.unlocked !== true) return { unlocked: false, source: 'locked' };
  return { unlocked: true, source: raw.source === 'paid' ? 'paid' : 'manual' };
}
