/**
 * O coração do `stripe-webhook`: evento → reler a assinatura → gravar na Conta.
 *
 * Recebe o I/O por parâmetro (Stripe e banco) para o Vitest simular sequências
 * de eventos fora de ordem sem Deno nem rede — mesma convenção de
 * `stripe-slot-sync.ts`.
 *
 * O evento só diz QUAL assinatura olhar. O estado vem sempre da releitura, então
 * todo evento de uma mesma assinatura grava a mesma coisa: a fatura de R$ 0 do
 * início do teste grava `trialing` (e não `active`), e um
 * `customer.subscription.updated` velho reentregue depois de um mais novo grava
 * o estado de AGORA, não o da foto que ele carrega.
 *
 * Falhas:
 *   - releitura da assinatura falhou → LANÇA. Sem o estado não há o que gravar,
 *     e gravar o status do evento seria voltar ao defeito. O handler responde
 *     500 e o Stripe reenvia (até 3 dias).
 *   - UPDATE do banco falhou → LANÇA, pelo mesmo motivo.
 *   - vagas: seguem a regra de `deriveExtraSlots` (defeito de derivação lança;
 *     sem Price de vaga configurado, não mexe).
 */
import { deriveExtraSlots } from './stripe-slot-sync.ts';
import { chargedAttendants, type SubscriptionLike as AttendantSubscriptionLike } from './attendant-billing.ts';
import {
  buildTenantPatch,
  decideSubscriptionWrite,
  deriveSubscriptionState,
  pointerFromEvent,
  type SubscriptionState,
  type TenantBillingRow,
} from './subscription-state.ts';

export interface StripeSyncDeps {
  /** Relê a assinatura no Stripe. Deve LANÇAR se não conseguir. */
  retrieveSubscription: (subscriptionId: string) => Promise<unknown>;
  loadTenantById: (tenantId: string) => Promise<TenantBillingRow | null>;
  loadTenantBySubscriptionId: (subscriptionId: string) => Promise<TenantBillingRow | null>;
  /** Grava o patch. Deve LANÇAR se o banco recusar. */
  updateTenant: (tenantId: string, patch: Record<string, unknown>) => Promise<void>;
  /** Price da vaga de Loja extra; vazio = não mexe nas vagas. */
  slotPriceId: string;
  /**
   * Produto "Atendente extra" (secret STRIPE_PRODUCT_ATTENDANT); vazio = não
   * mexe em atendentes_extra_cobrados. Reconhecido pelo PRODUTO, nunca pelo
   * preço de Loja extra.
   */
  attendantProductId?: string;
  now: () => Date;
}

export type SyncOutcome =
  | { result: 'not_subscription_event' }
  | { result: 'no_tenant'; subscriptionId: string; status: string }
  | { result: 'ignored'; subscriptionId: string; tenantId: string; status: string; reason: string }
  | { result: 'written'; subscriptionId: string; tenantId: string; status: string; action: 'update' | 'adopt'; patch: Record<string, unknown> };

/**
 * Qual Conta responde por esta assinatura. Ordem:
 *   1. a Conta que já tem ESTA assinatura (o vínculo mais forte);
 *   2. a Conta do metadata da assinatura (o create-checkout-session grava);
 *   3. a Conta do metadata do checkout (só no checkout.session.completed).
 * Os dois metadatas permitem que um `customer.subscription.created` que chega
 * ANTES do checkout.session.completed já encontre a Conta.
 */
async function acharConta(
  deps: StripeSyncDeps,
  state: SubscriptionState,
  metadataTenant: string | null,
  eventTenant: string | null,
): Promise<TenantBillingRow | null> {
  const vinculada = await deps.loadTenantBySubscriptionId(state.subscription_id);
  if (vinculada) return vinculada;
  for (const id of [metadataTenant, eventTenant]) {
    if (!id) continue;
    const conta = await deps.loadTenantById(id);
    if (conta) return conta;
  }
  return null;
}

export async function syncSubscriptionFromEvent(
  event: { type?: unknown; data?: { object?: unknown } | null },
  deps: StripeSyncDeps,
): Promise<SyncOutcome> {
  const ponteiro = pointerFromEvent(event);
  if (!ponteiro.subscriptionId) return { result: 'not_subscription_event' };

  const raw = await deps.retrieveSubscription(ponteiro.subscriptionId);
  const state = deriveSubscriptionState(raw);

  const meta = ((raw as { metadata?: Record<string, unknown> | null })?.metadata ?? {}) as Record<string, unknown>;
  const metadataTenant = typeof meta.tenant_id === 'string' && meta.tenant_id ? meta.tenant_id : null;

  const conta = await acharConta(deps, state, metadataTenant, ponteiro.tenantHint);
  if (!conta) {
    return { result: 'no_tenant', subscriptionId: state.subscription_id, status: state.subscription_status };
  }

  const decisao = decideSubscriptionWrite(conta, state);
  if (decisao.action === 'ignore') {
    return {
      result: 'ignored',
      subscriptionId: state.subscription_id,
      tenantId: conta.id,
      status: state.subscription_status,
      reason: decisao.reason,
    };
  }

  // Mesma assinatura já relida: a busca devolve o objeto em mãos, sem outra
  // chamada ao Stripe. As regras de erro das vagas continuam as de sempre.
  const extras = await deriveExtraSlots(async () => raw, state.subscription_id, deps.slotPriceId);

  // Atendentes extras na assinatura (0 se ela não cobra mais; null = produto
  // não configurado, não mexe).
  const atendentes = chargedAttendants(raw as AttendantSubscriptionLike, deps.attendantProductId ?? null);

  const patch = buildTenantPatch(state, decisao, extras, deps.now().toISOString(), atendentes);
  await deps.updateTenant(conta.id, patch);

  return {
    result: 'written',
    subscriptionId: state.subscription_id,
    tenantId: conta.id,
    status: state.subscription_status,
    action: decisao.action,
    patch,
  };
}
