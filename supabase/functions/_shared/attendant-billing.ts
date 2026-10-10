// =============================================================================
// attendant-billing — cobrança dos atendentes extras (limite por Loja, entrega 2)
// =============================================================================
// Decisões do dono (2026-10-10):
//   - UM produto no Stripe, "Atendente extra". O item da assinatura é
//     reconhecido pelo PRODUTO (id na secret STRIPE_PRODUCT_ATTENDANT), nunca
//     pelo preço — cada Conta tem o seu preço — e nunca confundido com o item de
//     Loja extra (que é reconhecido pelo PREÇO STRIPE_PRICE_STORE_SLOT, em
//     store-slots.ts). Nada aqui olha, cria, muda ou remove item de outro produto.
//   - Cada Conta tem o próprio preço nesse produto, definido pelo superadmin e
//     marcado com o id da Conta (metadata.tenant_id). Quantidade do item = soma
//     das vagas extras (tenants.atendentes_extra) das Lojas da Conta.
//   - Vaga extra no meio do ciclo: proporcional na próxima fatura
//     (create_prorations). No teste grátis não custa nada até o fim do teste
//     (o Stripe gera fatura de R$ 0 para item novo em teste).
//   - Conta sem assinatura (acesso manual): o superadmin aumenta as vagas sem
//     cobrança; nada é feito no Stripe.
//   - Trocar o preço cria um preço NOVO e troca no item, sem proporcional
//     (proration_behavior 'none'): o valor novo entra no ciclo seguinte. A tela
//     avisa que os Termos (4.1) pedem 30 dias de aviso antes.
//   - Assinatura que não existe na conta atual do Stripe (a conta antiga, hoje
//     só uma Conta) não é tocada: estado 'legacy'.
//
// As regras são puras e testadas no Vitest (src/lib/billing/attendantBilling.test.ts);
// os orquestradores recebem o Stripe e o banco por parâmetro.
// Sem import de Deno.
// =============================================================================

export const ATTENDANT_PRODUCT_ENV = 'STRIPE_PRODUCT_ATTENDANT';
export const ATTENDANT_PRODUCT_NAME = 'Atendente extra';
export const ATTENDANT_KIND = 'atendente_extra';
export const CONTATO_CONVOFLOW = 'contato@convoflow.com.br';

/** Preço por atendente extra, por mês, em centavos: de R$ 1,00 a R$ 1.000,00. */
export const PRICE_MIN_CENTS = 100;
export const PRICE_MAX_CENTS = 100_000;

/** Assinatura que cobra (ou vai cobrar no fim do teste). */
export const CHARGING_STATUSES: readonly string[] = ['active', 'trialing', 'past_due'];
/** Assinatura em que o item pode mudar agora. past_due não: o cartão está recusando. */
export const SYNC_STATUSES: readonly string[] = ['active', 'trialing'];

export type Proration = 'create_prorations' | 'none';
/** Mudança de quantidade (e criar/remover o item): proporcional na próxima fatura. */
export const QUANTITY_PRORATION: Proration = 'create_prorations';
/** Troca de preço: sem proporcional, vale a partir do próximo ciclo. */
export const PRICE_SWAP_PRORATION: Proration = 'none';

export const MSG_NAO_CONFIGURADO =
  'A cobrança de atendentes extras ainda não está ligada no servidor (falta o produto "Atendente extra"). As vagas valem, mas nada é cobrado.';
export const MSG_CHECKOUT_SEM_PRECO =
  `Esta Conta tem atendentes extras combinados com o ConvoFlow, mas o preço deles ainda não foi registrado. Fale com o ConvoFlow: ${CONTATO_CONVOFLOW}.`;
export const MSG_CHECKOUT_NAO_CONFIGURADO =
  `Esta Conta tem atendentes extras, e a cobrança deles ainda não está ligada. Fale com o ConvoFlow: ${CONTATO_CONVOFLOW}.`;

// -----------------------------------------------------------------------------
// Formas mínimas do Stripe
// -----------------------------------------------------------------------------

export interface PriceLike {
  id?: string | null;
  product?: string | { id?: string | null } | null;
  active?: boolean | null;
  currency?: string | null;
  unit_amount?: number | null;
  recurring?: { interval?: string | null; interval_count?: number | null } | null;
  metadata?: Record<string, unknown> | null;
}

export interface ItemLike {
  id?: string | null;
  quantity?: number | null;
  price?: PriceLike | null;
}

export interface SubscriptionLike {
  id?: string | null;
  status?: string | null;
  metadata?: Record<string, unknown> | null;
  items?: { data?: ItemLike[] | null } | null;
}

/** O produto de um preço, venha ele como id ou expandido. */
export function productIdOf(price: PriceLike | null | undefined): string | null {
  const p = price?.product;
  if (typeof p === 'string') return p || null;
  if (p && typeof p === 'object' && typeof p.id === 'string') return p.id || null;
  return null;
}

/** Item de atendente extra = item cujo PREÇO é do produto "Atendente extra". */
export function isAttendantItem(item: ItemLike | null | undefined, productId: string | null | undefined): boolean {
  if (!productId) return false;
  return productIdOf(item?.price) === productId;
}

export function findAttendantItems(
  subscription: SubscriptionLike | null | undefined,
  productId: string | null | undefined,
): ItemLike[] {
  return (subscription?.items?.data ?? []).filter((i) => isAttendantItem(i, productId));
}

/** Quantos atendentes extras a assinatura tem HOJE (soma, se houver item duplicado). */
export function attendantQuantityFromSubscription(
  subscription: SubscriptionLike | null | undefined,
  productId: string | null | undefined,
): number {
  let total = 0;
  for (const item of findAttendantItems(subscription, productId)) {
    const q = item?.quantity;
    if (typeof q === 'number' && Number.isFinite(q) && q > 0) total += Math.floor(q);
  }
  return total;
}

/**
 * O que o webhook grava em tenants.atendentes_extra_cobrados. Produto não
 * configurado → null (não mexe). Assinatura que não cobra mais (cancelada,
 * expirada) → 0: nada está sendo cobrado.
 */
export function chargedAttendants(
  subscription: SubscriptionLike | null | undefined,
  productId: string | null | undefined,
): number | null {
  if (!productId) return null;
  if (!CHARGING_STATUSES.includes(subscription?.status ?? '')) return 0;
  return attendantQuantityFromSubscription(subscription, productId);
}

// -----------------------------------------------------------------------------
// O que fazer no item
// -----------------------------------------------------------------------------

export type AttendantOp =
  | { op: 'create'; price: string; quantity: number; proration: Proration }
  | { op: 'set_quantity'; itemId: string; quantity: number; proration: Proration }
  | { op: 'swap_price'; itemId: string; price: string; proration: Proration }
  | { op: 'delete'; itemId: string; proration: Proration };

/**
 * As operações para a assinatura passar a ter `desejado` atendentes extras ao
 * preço `priceId`:
 *
 *   desejado = 0                → remove todo item de atendente extra
 *   sem item                    → cria (preço da Conta, quantidade desejada)
 *   com item                    → troca o preço se não for o da Conta (sem
 *                                 proporcional) e acerta a quantidade (com)
 *   item duplicado (corrida de
 *   dois cliques, mão no painel) → fica um só; os outros saem
 *
 * Só toca em item do produto "Atendente extra". O item do plano e o de Loja
 * extra nunca aparecem aqui.
 */
export function planAttendantItem(
  subscription: SubscriptionLike | null | undefined,
  productId: string,
  priceId: string | null,
  desejado: number,
): AttendantOp[] {
  const itens = findAttendantItems(subscription, productId).filter((i) => typeof i.id === 'string' && i.id);
  if (desejado <= 0) {
    return itens.map((i) => ({ op: 'delete', itemId: i.id as string, proration: QUANTITY_PRORATION }));
  }
  if (!priceId) {
    throw new Error('planAttendantItem: sem preço da Conta não há o que criar nem trocar.');
  }

  const fica = itens.find((i) => i.price?.id === priceId) ?? itens[0];
  const ops: AttendantOp[] = [];
  if (!fica) {
    ops.push({ op: 'create', price: priceId, quantity: desejado, proration: QUANTITY_PRORATION });
    return ops;
  }
  const itemId = fica.id as string;
  if (fica.price?.id !== priceId) {
    ops.push({ op: 'swap_price', itemId, price: priceId, proration: PRICE_SWAP_PRORATION });
  }
  if ((fica.quantity ?? 0) !== desejado) {
    ops.push({ op: 'set_quantity', itemId, quantity: desejado, proration: QUANTITY_PRORATION });
  }
  for (const outro of itens) {
    if (outro !== fica) ops.push({ op: 'delete', itemId: outro.id as string, proration: QUANTITY_PRORATION });
  }
  return ops;
}

// -----------------------------------------------------------------------------
// Preço da Conta
// -----------------------------------------------------------------------------

export type PriceCentsCheck = { ok: true; value: number } | { ok: false; error: string };

/** Centavos inteiros, de R$ 1,00 a R$ 1.000,00. */
export function validatePriceCents(input: unknown): PriceCentsCheck {
  const n = typeof input === 'number' ? input : typeof input === 'string' && input.trim() ? Number(input) : NaN;
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return { ok: false, error: 'Informe o preço em centavos, um número inteiro.' };
  }
  if (n < PRICE_MIN_CENTS || n > PRICE_MAX_CENTS) {
    return { ok: false, error: 'O preço por atendente extra vai de R$ 1,00 a R$ 1.000,00 por mês.' };
  }
  return { ok: true, value: n };
}

/**
 * O preço guardado na Conta serve para cobrar? null = serve; texto = o motivo.
 * Precisa ser do produto "Atendente extra", ativo, em reais, mensal e desta Conta.
 */
export function checkAttendantPrice(
  price: PriceLike | null | undefined,
  productId: string,
  tenantId: string,
): string | null {
  if (!price?.id) return 'O preço salvo não existe na conta do Stripe.';
  if (productIdOf(price) !== productId) return 'O preço salvo não é do produto "Atendente extra".';
  if (price.active === false) return 'O preço salvo foi arquivado no Stripe.';
  if ((price.currency ?? '').toLowerCase() !== 'brl') return 'O preço salvo não é em reais.';
  if (price.recurring?.interval !== 'month' || (price.recurring?.interval_count ?? 1) !== 1) {
    return 'O preço salvo não é mensal.';
  }
  const dono = price.metadata?.tenant_id;
  if (dono !== tenantId) return 'O preço salvo é de outra Conta.';
  if (typeof price.unit_amount !== 'number' || price.unit_amount <= 0) return 'O preço salvo não tem valor.';
  return null;
}

/** Parâmetros do preço novo de uma Conta. */
export function attendantPriceParams(input: {
  productId: string;
  tenantId: string;
  tenantName: string | null;
  cents: number;
}) {
  return {
    product: input.productId,
    currency: 'brl',
    unit_amount: input.cents,
    recurring: { interval: 'month' as const },
    nickname: `${ATTENDANT_PRODUCT_NAME} · ${input.tenantName ?? input.tenantId}`.slice(0, 250),
    metadata: { tenant_id: input.tenantId, convoflow_kind: ATTENDANT_KIND },
  };
}

// -----------------------------------------------------------------------------
// Checkout
// -----------------------------------------------------------------------------

export type CheckoutAttendantDecision =
  | { kind: 'none' }
  | { kind: 'add'; price: string; quantity: number }
  | { kind: 'blocked'; status: number; error: string; reason: string };

/**
 * Conta que já tem vagas extras e vai assinar: o checkout leva o item junto.
 * Sem produto ou sem preço válido, o checkout NÃO sai — vaga extra de graça
 * numa assinatura paga não é opção.
 */
export function decideCheckoutAttendants(input: {
  concedidos: number;
  productId: string | null;
  priceId: string | null;
  price: PriceLike | null;
  tenantId: string;
}): CheckoutAttendantDecision {
  if (!(input.concedidos > 0)) return { kind: 'none' };
  if (!input.productId) {
    return { kind: 'blocked', status: 409, error: MSG_CHECKOUT_NAO_CONFIGURADO, reason: 'produto não configurado' };
  }
  if (!input.priceId) {
    return { kind: 'blocked', status: 409, error: MSG_CHECKOUT_SEM_PRECO, reason: 'Conta sem preço' };
  }
  const problema = checkAttendantPrice(input.price, input.productId, input.tenantId);
  if (problema) return { kind: 'blocked', status: 409, error: MSG_CHECKOUT_SEM_PRECO, reason: problema };
  return { kind: 'add', price: input.priceId, quantity: Math.floor(input.concedidos) };
}

// -----------------------------------------------------------------------------
// Orquestração (Stripe e banco por parâmetro)
// -----------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
export type StripeLike = any;
// deno-lint-ignore no-explicit-any
export type DbLike = { from: (table: string) => any };

export class AttendantBillingError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export interface AttendantBillingDeps {
  stripe: StripeLike;
  db: DbLike;
  /** Id do produto "Atendente extra" (secret). Vazio = cobrança desligada. */
  productId: string | null;
  now: () => Date;
  /** Quem fez a mudança (auth.users.id), para o histórico. */
  actorUserId?: string | null;
  log?: (level: 'info' | 'warn' | 'error', msg: string, ctx?: Record<string, unknown>) => void;
}

export interface AttendantConta {
  id: string;
  name: string | null;
  kind: string | null;
  subscription_id: string | null;
  subscription_status: string | null;
  manual_access_granted: boolean | null;
  atendente_extra_preco_centavos: number | null;
  atendente_extra_price_id: string | null;
  atendentes_extra_cobrados: number | null;
}

const COLUNAS_CONTA =
  'id, name, kind, subscription_id, subscription_status, manual_access_granted, atendente_extra_preco_centavos, atendente_extra_price_id, atendentes_extra_cobrados';

export async function loadAttendantConta(db: DbLike, tenantId: unknown): Promise<AttendantConta> {
  if (typeof tenantId !== 'string' || !/^[0-9a-f-]{36}$/i.test(tenantId)) {
    throw new AttendantBillingError('Conta inválida.', 400);
  }
  const { data, error } = await db.from('tenants').select(COLUNAS_CONTA).eq('id', tenantId).maybeSingle();
  if (error) throw new AttendantBillingError(`Falha ao ler a Conta: ${error.message}`, 500);
  if (!data) throw new AttendantBillingError('Conta não encontrada.', 404);
  if (data.kind !== 'account') {
    throw new AttendantBillingError('A cobrança é da Conta, não da Loja.', 400);
  }
  return data as AttendantConta;
}

/** Soma das vagas extras de atendente das Lojas da Conta (o que foi concedido). */
export async function grantedAttendants(db: DbLike, tenantId: string): Promise<number> {
  const { data, error } = await db
    .from('tenants')
    .select('atendentes_extra')
    .eq('parent_tenant_id', tenantId)
    .eq('kind', 'store');
  if (error) throw new AttendantBillingError(`Falha ao ler as Lojas da Conta: ${error.message}`, 500);
  let total = 0;
  for (const linha of (data ?? []) as Array<{ atendentes_extra?: number | null }>) {
    const n = linha?.atendentes_extra;
    if (typeof n === 'number' && n > 0) total += n;
  }
  return total;
}

function naoExiste(e: unknown): boolean {
  return (e as { code?: unknown } | null)?.code === 'resource_missing';
}

export type SyncState =
  | 'not_configured'
  | 'no_subscription'
  | 'legacy'
  | 'subscription_ended'
  | 'past_due'
  | 'no_price'
  | 'invalid_price'
  | 'synced';

export interface SyncResult {
  state: SyncState;
  /** Vagas extras concedidas (soma das Lojas). */
  concedidos: number;
  /** Atendentes extras na assinatura depois da sincronização (null = não lido). */
  cobrados: number | null;
  subscriptionStatus: string | null;
  ops: AttendantOp['op'][];
  message: string;
}

function mensagemDoEstado(state: SyncState, r: { concedidos: number; cobrados: number | null; status: string | null; detalhe?: string }): string {
  switch (state) {
    case 'not_configured':
      return MSG_NAO_CONFIGURADO;
    case 'no_subscription':
      return 'Esta Conta não tem assinatura no Stripe (acesso manual ou sem assinatura): as vagas extras valem sem cobrança.';
    case 'legacy':
      return 'A assinatura desta Conta está na conta antiga do Stripe: nada foi alterado lá.';
    case 'subscription_ended':
      return 'A assinatura desta Conta está encerrada: nada é cobrado agora. Se ela assinar de novo, o checkout já inclui os atendentes extras.';
    case 'past_due':
      return 'Há um pagamento pendente nesta Conta: a cobrança dos atendentes extras não foi mudada. Sincronize de novo quando o pagamento for regularizado.';
    case 'no_price':
      return 'Defina o preço do atendente extra desta Conta para cobrar as vagas extras.';
    case 'invalid_price':
      return `${r.detalhe ?? 'O preço salvo não serve.'} Salve o preço de novo.`;
    case 'synced': {
      const n = r.cobrados ?? 0;
      if (n === 0) return 'Sem atendentes extras: nada a cobrar na assinatura.';
      const qtd = n === 1 ? '1 atendente extra' : `${n} atendentes extras`;
      return r.status === 'trialing'
        ? `Cobrança em dia: ${qtd}. No teste grátis nada é cobrado; a cobrança começa no fim do teste, junto com o plano.`
        : `Cobrança em dia: ${qtd}. Mudança no meio do mês entra proporcional na próxima fatura.`;
    }
  }
}

async function gravarCobrados(deps: AttendantBillingDeps, tenantId: string, cobrados: number): Promise<void> {
  const { error } = await deps.db
    .from('tenants')
    .update({ atendentes_extra_cobrados: cobrados, updated_at: deps.now().toISOString() })
    .eq('id', tenantId);
  if (error) {
    throw new AttendantBillingError(`A assinatura foi atualizada, mas a Conta não: ${error.message}`, 500);
  }
}

async function executar(deps: AttendantBillingDeps, subscriptionId: string, ops: AttendantOp[]): Promise<void> {
  for (const o of ops) {
    switch (o.op) {
      case 'create':
        await deps.stripe.subscriptionItems.create({
          subscription: subscriptionId,
          price: o.price,
          quantity: o.quantity,
          proration_behavior: o.proration,
        });
        break;
      case 'set_quantity':
        await deps.stripe.subscriptionItems.update(o.itemId, { quantity: o.quantity, proration_behavior: o.proration });
        break;
      case 'swap_price':
        await deps.stripe.subscriptionItems.update(o.itemId, { price: o.price, proration_behavior: o.proration });
        break;
      case 'delete':
        await deps.stripe.subscriptionItems.del(o.itemId, { proration_behavior: o.proration });
        break;
    }
  }
}

/**
 * Faz a assinatura da Conta cobrar exatamente as vagas extras concedidas, ao
 * preço da Conta, e grava o que ficou cobrado. Relê a assinatura no fim: o
 * número gravado vem do Stripe, não do que foi pedido.
 */
export async function syncAttendantItem(deps: AttendantBillingDeps, tenantId: unknown): Promise<SyncResult> {
  const conta = await loadAttendantConta(deps.db, tenantId);
  const concedidos = await grantedAttendants(deps.db, conta.id);
  const base = { concedidos, cobrados: conta.atendentes_extra_cobrados, subscriptionStatus: conta.subscription_status, ops: [] as AttendantOp['op'][] };
  const fim = (state: SyncState, extra: Partial<SyncResult> = {}, detalhe?: string): SyncResult => {
    const r = { ...base, ...extra, state };
    return { ...r, message: mensagemDoEstado(state, { concedidos: r.concedidos, cobrados: r.cobrados, status: r.subscriptionStatus, detalhe }) };
  };

  if (!deps.productId) return fim('not_configured');
  if (!conta.subscription_id) return fim('no_subscription');

  let sub: SubscriptionLike;
  try {
    sub = await deps.stripe.subscriptions.retrieve(conta.subscription_id);
  } catch (e) {
    if (naoExiste(e)) return fim('legacy');
    throw e;
  }
  const status = sub?.status ?? null;
  const dona = sub?.metadata?.tenant_id;
  if (typeof dona === 'string' && dona && dona !== conta.id) {
    throw new AttendantBillingError('A assinatura gravada nesta Conta é de outra Conta no Stripe. Nada foi alterado.', 409);
  }
  if (!CHARGING_STATUSES.includes(status ?? '')) {
    return fim('subscription_ended', { subscriptionStatus: status });
  }
  if (!SYNC_STATUSES.includes(status ?? '')) {
    return fim('past_due', { subscriptionStatus: status, cobrados: attendantQuantityFromSubscription(sub, deps.productId) });
  }

  if (concedidos > 0) {
    if (!conta.atendente_extra_price_id) {
      return fim('no_price', { subscriptionStatus: status, cobrados: attendantQuantityFromSubscription(sub, deps.productId) });
    }
    let price: PriceLike | null = null;
    try {
      price = await deps.stripe.prices.retrieve(conta.atendente_extra_price_id);
    } catch (e) {
      if (!naoExiste(e)) throw e;
    }
    const problema = checkAttendantPrice(price, deps.productId, conta.id);
    if (problema) {
      return fim('invalid_price', { subscriptionStatus: status, cobrados: attendantQuantityFromSubscription(sub, deps.productId) }, problema);
    }
  }

  const ops = planAttendantItem(sub, deps.productId, conta.atendente_extra_price_id, concedidos);
  await executar(deps, conta.subscription_id, ops);

  const relida: SubscriptionLike = ops.length ? await deps.stripe.subscriptions.retrieve(conta.subscription_id) : sub;
  const cobrados = attendantQuantityFromSubscription(relida, deps.productId);
  await gravarCobrados(deps, conta.id, cobrados);
  deps.log?.('info', 'atendentes extras sincronizados', { conta: conta.id, concedidos, cobrados, ops: ops.map((o) => o.op) });
  return fim('synced', { subscriptionStatus: relida?.status ?? status, cobrados, ops: ops.map((o) => o.op) });
}

export interface SetPriceResult {
  changed: boolean;
  priceId: string | null;
  priceCents: number | null;
  /** O preço anterior foi arquivado no Stripe. */
  archivedPrevious: boolean;
  sync: SyncResult;
}

/**
 * Define o preço do atendente extra da Conta: cria um preço NOVO no produto,
 * grava na Conta com histórico e sincroniza a assinatura (que troca o preço no
 * item sem proporcional). O preço anterior é arquivado depois da troca.
 */
export async function setAttendantPrice(
  deps: AttendantBillingDeps,
  tenantId: unknown,
  centsInput: unknown,
  note: unknown,
): Promise<SetPriceResult> {
  if (!deps.productId) throw new AttendantBillingError(MSG_NAO_CONFIGURADO, 409);
  const cents = validatePriceCents(centsInput);
  if (!cents.ok) throw new AttendantBillingError(cents.error, 400);
  const conta = await loadAttendantConta(deps.db, tenantId);

  if (conta.atendente_extra_preco_centavos === cents.value && conta.atendente_extra_price_id) {
    return {
      changed: false,
      priceId: conta.atendente_extra_price_id,
      priceCents: cents.value,
      archivedPrevious: false,
      sync: await syncAttendantItem(deps, conta.id),
    };
  }

  const novo = await deps.stripe.prices.create(
    attendantPriceParams({ productId: deps.productId, tenantId: conta.id, tenantName: conta.name, cents: cents.value }),
  );
  if (!novo?.id) throw new AttendantBillingError('O Stripe não devolveu o preço criado.', 502);

  const { error: updErr } = await deps.db
    .from('tenants')
    .update({
      atendente_extra_preco_centavos: cents.value,
      atendente_extra_price_id: novo.id,
      updated_at: deps.now().toISOString(),
    })
    .eq('id', conta.id);
  if (updErr) {
    // Sem gravar na Conta o preço novo não é usado; arquiva para não sobrar solto.
    try {
      await deps.stripe.prices.update(novo.id, { active: false });
    } catch {
      // fica ativo e órfão; inofensivo
    }
    throw new AttendantBillingError(`Falha ao gravar o preço na Conta: ${updErr.message}`, 500);
  }

  const texto = typeof note === 'string' ? note.trim().slice(0, 500) : '';
  const { error: evErr } = await deps.db.from('account_attendant_price_events').insert({
    tenant_id: conta.id,
    preco_antes: conta.atendente_extra_preco_centavos,
    preco_depois: cents.value,
    price_id_antes: conta.atendente_extra_price_id,
    price_id_depois: novo.id,
    actor_user_id: deps.actorUserId ?? null,
    note: texto || null,
  });
  if (evErr) deps.log?.('error', 'histórico do preço não gravado', { conta: conta.id, erro: evErr.message });

  const sync = await syncAttendantItem(deps, conta.id);

  // O preço antigo só sai depois de o item ter trocado (ou de não haver item).
  // Em past_due/legacy/no_subscription o item, se existir, segue no antigo: não arquiva.
  let archivedPrevious = false;
  const anterior = conta.atendente_extra_price_id;
  const itemTrocou = sync.state === 'synced' || sync.state === 'no_subscription' || sync.state === 'subscription_ended';
  if (anterior && anterior !== novo.id && itemTrocou) {
    try {
      await deps.stripe.prices.update(anterior, { active: false });
      archivedPrevious = true;
    } catch (e) {
      deps.log?.('warn', 'preço anterior não arquivado', { conta: conta.id, erro: (e as Error)?.message });
    }
  }

  return { changed: true, priceId: novo.id, priceCents: cents.value, archivedPrevious, sync };
}

export interface AttendantStatus {
  configured: boolean;
  productId: string | null;
  priceCents: number | null;
  priceId: string | null;
  concedidos: number;
  cobrados: number | null;
  /** Estado da assinatura para a cobrança, sem mudar nada. */
  subscription: { state: 'none' | 'legacy' | 'ended' | 'past_due' | 'live'; status: string | null };
  /** O item de atendente extra na assinatura, se houver. */
  item: { quantity: number; priceId: string | null; unitAmount: number | null } | null;
  /** A Conta já cobra atendentes extras: mudar o preço exige o aviso de 30 dias. */
  priceChangeNeedsNotice: boolean;
}

/** Só leitura: o que a janela de Atendentes mostra sobre a cobrança. */
export async function attendantStatus(deps: AttendantBillingDeps, tenantId: unknown): Promise<AttendantStatus> {
  const conta = await loadAttendantConta(deps.db, tenantId);
  const concedidos = await grantedAttendants(deps.db, conta.id);
  const base: AttendantStatus = {
    configured: !!deps.productId,
    productId: deps.productId,
    priceCents: conta.atendente_extra_preco_centavos,
    priceId: conta.atendente_extra_price_id,
    concedidos,
    cobrados: conta.atendentes_extra_cobrados,
    subscription: { state: 'none', status: conta.subscription_status },
    item: null,
    priceChangeNeedsNotice: false,
  };
  if (!conta.subscription_id) return base;

  let sub: SubscriptionLike;
  try {
    sub = await deps.stripe.subscriptions.retrieve(conta.subscription_id);
  } catch (e) {
    if (naoExiste(e)) return { ...base, subscription: { state: 'legacy', status: conta.subscription_status } };
    throw e;
  }
  const status = sub?.status ?? null;
  const state = !CHARGING_STATUSES.includes(status ?? '') ? 'ended' : status === 'past_due' ? 'past_due' : 'live';
  const itens = findAttendantItems(sub, deps.productId);
  const item = itens[0]
    ? {
        quantity: attendantQuantityFromSubscription(sub, deps.productId),
        priceId: itens[0].price?.id ?? null,
        unitAmount: typeof itens[0].price?.unit_amount === 'number' ? itens[0].price.unit_amount : null,
      }
    : null;
  return {
    ...base,
    subscription: { state, status },
    item,
    priceChangeNeedsNotice: state !== 'ended' && !!item && item.quantity > 0,
  };
}

/**
 * Garante o produto "Atendente extra" na conta do Stripe e devolve o id.
 * Idempotente: procura primeiro pelo metadata convoflow_kind.
 */
export async function ensureAttendantProduct(
  stripe: StripeLike,
  configuredId: string | null,
): Promise<{ productId: string; created: boolean; matchesSecret: boolean; name: string; active: boolean }> {
  const resumo = (p: { id: string; name?: string; active?: boolean }, created: boolean) => ({
    productId: p.id,
    created,
    matchesSecret: !!configuredId && configuredId === p.id,
    name: p.name ?? ATTENDANT_PRODUCT_NAME,
    active: p.active !== false,
  });

  if (configuredId) {
    try {
      const p = await stripe.products.retrieve(configuredId);
      if (p?.id && !p.deleted) return resumo(p, false);
    } catch (e) {
      if (!naoExiste(e)) throw e;
    }
  }
  let depois: string | undefined;
  for (let pagina = 0; pagina < 10; pagina++) {
    const lote = await stripe.products.list({ limit: 100, active: true, ...(depois ? { starting_after: depois } : {}) });
    const dados = (lote?.data ?? []) as Array<{ id: string; name?: string; active?: boolean; metadata?: Record<string, unknown> }>;
    const achado = dados.find((p) => p?.metadata?.convoflow_kind === ATTENDANT_KIND);
    if (achado) return resumo(achado, false);
    if (!lote?.has_more || dados.length === 0) break;
    depois = dados[dados.length - 1]?.id;
  }
  const criado = await stripe.products.create({
    name: ATTENDANT_PRODUCT_NAME,
    description: 'Vaga de atendente além das 2 incluídas em cada Loja. Preço definido por Conta.',
    unit_label: 'atendente',
    metadata: { convoflow_kind: ATTENDANT_KIND },
  });
  return resumo(criado, true);
}
