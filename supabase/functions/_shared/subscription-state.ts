// =============================================================================
// subscription-state.ts — o estado da assinatura da Conta, DERIVADO do Stripe
// =============================================================================
// Mesma convenção de `store-slots.ts`: só decisão, zero I/O, para o Vitest
// (Node) testar sem Deno e sem Stripe. Quem faz I/O é o `stripe-webhook`
// (via `stripe-webhook-sync.ts`) e o `create-checkout-session`.
//
// O DEFEITO QUE ISTO EXISTE PARA CONSERTAR (teste grátis, entrega 1, 2026-09-26)
//
//   O webhook gravava `subscription_status: 'active'` FIXO no
//   checkout.session.completed e no invoice.payment_succeeded. Com teste grátis
//   isso é errado dos dois lados:
//     - a fatura de R$ 0 do início do teste é "paga" e marcaria o teste como
//       assinatura paga;
//     - se o cartão falhar no fim do teste e o evento que conta isso não chegar
//       (ou chegar ANTES de um evento velho que grava 'active'), a Conta fica
//       liberada para sempre.
//
//   A correção é a mesma das vagas: parar de confiar no evento e RELER a
//   assinatura. Todo evento vira "vá ao Stripe e copie o estado de agora".
//   O que chega, em que ordem e quantas vezes deixa de importar.
// =============================================================================

// -----------------------------------------------------------------------------
// Quais status do Stripe liberam o sistema
// -----------------------------------------------------------------------------

/**
 * Status de assinatura que LIBERAM a Conta.
 *
 *   active    pagando em dia
 *   trialing  no teste grátis (o cartão já foi cadastrado no checkout)
 *   past_due  o cartão falhou e o Stripe ainda está tentando de novo: é a
 *             carência. A Conta só tranca quando o Stripe desiste e a
 *             assinatura vira `canceled` ou `unpaid`.
 *
 * Todo o resto tranca: canceled, unpaid, incomplete, incomplete_expired,
 * paused e nulo. Liberação manual do superadmin continua valendo por fora.
 *
 * TRÊS CÓPIAS, DE PROPÓSITO, VIGIADAS POR TESTE:
 *   - esta (edge functions)
 *   - `SUBSCRIPTION_UNLOCKING_STATUSES` em src/lib/access/tenantAccess.ts
 *   - o `IN (...)` de `public.tenant_access_state` (migração 20260926000001)
 * `src/lib/access/subscriptionStatusParity.test.ts` falha se divergirem.
 */
export const SUBSCRIPTION_UNLOCKING_STATUSES = ['active', 'trialing', 'past_due'] as const;

export function subscriptionUnlocks(status: string | null | undefined): boolean {
  return (SUBSCRIPTION_UNLOCKING_STATUSES as readonly string[]).includes(status ?? '');
}

/** Dias de teste grátis de toda assinatura nova. */
export const TRIAL_DAYS = 7;

// -----------------------------------------------------------------------------
// O estado que a Conta guarda, lido da assinatura
// -----------------------------------------------------------------------------

/** O mínimo que lemos de uma assinatura do Stripe (API 2024-12-18.acacia). */
export interface StripeSubscriptionLike {
  id?: unknown;
  status?: unknown;
  customer?: unknown;
  trial_end?: unknown;
  cancel_at?: unknown;
  cancel_at_period_end?: unknown;
  current_period_end?: unknown;
  metadata?: Record<string, unknown> | null;
  items?: { data?: Array<{ current_period_end?: unknown }> | null } | null;
}

/** As colunas de `tenants` que o webhook escreve a partir da assinatura. */
export interface SubscriptionState {
  subscription_id: string;
  subscription_status: string;
  stripe_customer_id: string | null;
  /** Fim do teste grátis (ISO). Fica gravado depois do teste, como histórico. */
  trial_ends_at: string | null;
  /** Há cancelamento agendado? (ex.: cancelou durante o teste) */
  subscription_will_cancel: boolean;
  /** Quando o cancelamento agendado vale (ISO). Nulo sem agendamento. */
  subscription_cancel_at: string | null;
}

/** Status em que a assinatura já acabou: não há o que "agendar". */
const STATUS_ENCERRADOS = ['canceled', 'incomplete_expired'];

function unixParaIso(v: unknown): string | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return null;
  return new Date(v * 1000).toISOString();
}

function idDe(v: unknown): string | null {
  if (typeof v === 'string' && v) return v;
  if (v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string') {
    return (v as { id: string }).id || null;
  }
  return null;
}

/**
 * Fim do período corrente. Na API acacia ele mora na assinatura; nas versões
 * novas (basil em diante) mudou para os itens. Lê os dois para a troca de
 * versão não quebrar isto em silêncio.
 */
function fimDoPeriodo(sub: StripeSubscriptionLike): unknown {
  if (typeof sub.current_period_end === 'number') return sub.current_period_end;
  const fins = (sub.items?.data ?? [])
    .map((i) => i?.current_period_end)
    .filter((n): n is number => typeof n === 'number');
  return fins.length ? Math.max(...fins) : null;
}

/**
 * Lê a assinatura e devolve o que a Conta passa a guardar.
 *
 * LANÇA quando a assinatura não tem id ou status — é defeito (objeto errado),
 * não estado. O webhook deixa o erro subir: responde 500 e o Stripe reenvia,
 * em vez de gravar um status inventado.
 */
export function deriveSubscriptionState(raw: unknown): SubscriptionState {
  const sub = (raw ?? {}) as StripeSubscriptionLike;
  const id = typeof sub.id === 'string' ? sub.id : '';
  const status = typeof sub.status === 'string' ? sub.status : '';
  if (!id || !status) {
    throw new Error('Assinatura do Stripe sem id ou status; nada foi gravado.');
  }

  const encerrada = STATUS_ENCERRADOS.includes(status);

  // Cancelamento agendado. Dois jeitos de o Stripe dizer isso:
  //   cancel_at_period_end = true  (modo clássico, "cancelar no fim do período")
  //   cancel_at = <data>           (portal no modo flexível, ou data escolhida)
  // Durante o teste, o fim do período É o fim do teste.
  const noFimDoPeriodo = sub.cancel_at_period_end === true;
  const cancelAt =
    unixParaIso(sub.cancel_at) ??
    (noFimDoPeriodo ? unixParaIso(fimDoPeriodo(sub)) ?? unixParaIso(sub.trial_end) : null);
  const vaiCancelar = !encerrada && (noFimDoPeriodo || cancelAt !== null);

  return {
    subscription_id: id,
    subscription_status: status,
    stripe_customer_id: idDe(sub.customer),
    trial_ends_at: unixParaIso(sub.trial_end),
    subscription_will_cancel: vaiCancelar,
    subscription_cancel_at: vaiCancelar ? cancelAt : null,
  };
}

// -----------------------------------------------------------------------------
// De qual Conta é esta assinatura, e se ela pode escrever
// -----------------------------------------------------------------------------

/** O que precisamos da linha da Conta para decidir. */
export interface TenantBillingRow {
  id: string;
  kind: string | null;
  subscription_id: string | null;
  subscription_status: string | null;
}

export type WriteDecision =
  | { action: 'update' }   // é a assinatura que a Conta já tem
  | { action: 'adopt' }    // a Conta passa a ter esta assinatura
  | { action: 'ignore'; reason: string };

/**
 * Esta assinatura pode escrever nesta Conta?
 *
 *   mesma assinatura que a Conta já tem          → atualiza
 *   Conta sem assinatura nenhuma                 → adota
 *   Conta com OUTRA assinatura:
 *     a nova libera e a antiga não libera mais   → adota (assinou de novo
 *                                                  depois de cancelar)
 *     qualquer outro caso                        → ignora
 *
 * O "ignora" é o que impede o evento atrasado de uma assinatura morta
 * (cancelada em junho, reentregue em julho) de trancar a Conta que já assinou
 * de novo. E impede uma segunda assinatura viva de roubar a Conta de outra
 * viva — a trava de checkout duplicado existe para isso nunca acontecer, e se
 * acontecer o log grita em vez de trocar em silêncio.
 *
 * Assinatura só mora em Conta (kind='account'). Loja nunca assina.
 */
export function decideSubscriptionWrite(
  tenant: TenantBillingRow,
  state: SubscriptionState,
): WriteDecision {
  if (tenant.kind !== 'account') return { action: 'ignore', reason: 'not_account' };
  if (tenant.subscription_id === state.subscription_id) return { action: 'update' };
  if (!tenant.subscription_id) return { action: 'adopt' };
  if (subscriptionUnlocks(state.subscription_status) && !subscriptionUnlocks(tenant.subscription_status)) {
    return { action: 'adopt' };
  }
  return { action: 'ignore', reason: 'other_subscription' };
}

/**
 * O UPDATE de `tenants`. `extraSlots` nulo = não mexer nas vagas (Price de
 * vaga não configurado). `extraAttendants` nulo = não mexer nos atendentes
 * extras cobrados (produto "Atendente extra" não configurado).
 * `stripe_customer_id` nulo nunca apaga o que existe.
 */
export function buildTenantPatch(
  state: SubscriptionState,
  decision: { action: 'update' | 'adopt' },
  extraSlots: number | null,
  nowIso: string,
  extraAttendants: number | null = null,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    subscription_status: state.subscription_status,
    trial_ends_at: state.trial_ends_at,
    subscription_will_cancel: state.subscription_will_cancel,
    subscription_cancel_at: state.subscription_cancel_at,
    updated_at: nowIso,
  };
  if (state.stripe_customer_id) patch.stripe_customer_id = state.stripe_customer_id;
  if (extraSlots !== null) patch.store_slots_extra = extraSlots;
  if (extraAttendants !== null) patch.atendentes_extra_cobrados = extraAttendants;
  if (decision.action === 'adopt') {
    patch.subscription_id = state.subscription_id;
    patch.plan_type = 'gerente';
  }
  return patch;
}

// -----------------------------------------------------------------------------
// O que o evento aponta
// -----------------------------------------------------------------------------

export interface EventPointer {
  /** A assinatura a reler. Nulo = evento que não é de assinatura. */
  subscriptionId: string | null;
  /** Conta indicada pelo próprio evento (metadata do checkout). */
  tenantHint: string | null;
}

/**
 * Tira do evento SÓ o ponteiro: qual assinatura reler e, no checkout, de qual
 * Conta ela é. O status que o evento carrega é ignorado de propósito — ele é
 * uma foto do passado e pode chegar fora de ordem.
 */
export function pointerFromEvent(event: { type?: unknown; data?: { object?: unknown } | null }): EventPointer {
  const type = typeof event?.type === 'string' ? event.type : '';
  const obj = (event?.data?.object ?? {}) as Record<string, unknown>;
  const nenhum: EventPointer = { subscriptionId: null, tenantHint: null };

  if (type === 'checkout.session.completed') {
    if (obj.mode !== 'subscription') return nenhum;
    const meta = (obj.metadata ?? {}) as Record<string, unknown>;
    const hint =
      (typeof meta.tenant_id === 'string' && meta.tenant_id) ||
      // Sessões anteriores ao metadata usavam o client_reference_id. Hoje ele
      // pode ser o referral do Rewardful — um id que não é de Conta nenhuma e
      // por isso não acha linha; a decisão cai no subscription_id.
      (typeof obj.client_reference_id === 'string' && obj.client_reference_id) ||
      null;
    return { subscriptionId: idDe(obj.subscription), tenantHint: hint };
  }

  if (type.startsWith('customer.subscription.')) {
    return { subscriptionId: idDe(obj.id), tenantHint: null };
  }

  if (type.startsWith('invoice.')) {
    // acacia: invoice.subscription. basil em diante:
    // invoice.parent.subscription_details.subscription.
    const parent = (obj.parent ?? {}) as { subscription_details?: { subscription?: unknown } };
    const sub = idDe(obj.subscription) ?? idDe(parent.subscription_details?.subscription);
    return { subscriptionId: sub, tenantHint: null };
  }

  return nenhum;
}

// -----------------------------------------------------------------------------
// Checkout
// -----------------------------------------------------------------------------

/**
 * Por que esta Conta NÃO pode abrir outro checkout (null = pode).
 *
 * Qualquer assinatura que libera o sistema bloqueia um segundo checkout: um
 * segundo checkout criaria uma SEGUNDA assinatura cobrando em paralelo. Quem
 * está com assinatura cancelada/unpaid pode assinar de novo.
 */
export function checkoutBlockReason(status: string | null | undefined): string | null {
  switch (status) {
    case 'active':
      return 'Esta Conta já possui uma assinatura ativa.';
    case 'trialing':
      return 'Esta Conta já está no período de teste. A cobrança começa sozinha no fim do teste; não é preciso assinar de novo.';
    case 'past_due':
      return 'Esta Conta já tem uma assinatura, com um pagamento pendente. Atualize o cartão pelo link do e-mail do Stripe em vez de assinar de novo.';
    default:
      return null;
  }
}

/**
 * Dias de teste do checkout desta Conta: 7 na primeira assinatura, nenhum
 * depois. `subscription_id` preenchido quer dizer que a Conta já assinou antes
 * (com ou sem teste) — sem isto, cancelar no 6º dia e assinar de novo daria
 * teste grátis sem fim.
 */
export function trialDaysForCheckout(tenant: { subscription_id: string | null }): number | null {
  return tenant.subscription_id ? null : TRIAL_DAYS;
}
