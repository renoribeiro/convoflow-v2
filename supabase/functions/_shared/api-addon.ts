// =============================================================================
// api-addon — cobrança do complemento "API e integrações" (A1)
// =============================================================================
// Decisões do dono (2026-10-23):
//   - UM produto no Stripe, "API e integrações", UM preço: R$ 99,90 por mês,
//     em reais. O item da assinatura é reconhecido pelo PRODUTO (secret
//     STRIPE_PRODUCT_API), nunca pelo preço: um preço novo no futuro continua
//     sendo reconhecido. O preço usado para criar o item é a secret
//     STRIPE_PRICE_API. Nada aqui olha, cria, muda ou remove item de outro
//     produto (plano, Loja extra, Atendente extra).
//   - Ligar no meio do mês: proporcional na próxima fatura (create_prorations).
//   - Desligar: o item sai SEM crédito (proration_behavior 'none') e as chaves
//     seguem até o fim do mês já pago (tenants.api_addon_ate = fim do período).
//   - Religar antes do fim do mês já pago: o item volta SEM cobrança
//     proporcional ('none'), porque o mês está pago; o mês seguinte cobra cheio.
//   - Não existe no teste grátis.
//   - Conta de acesso manual: o superadmin liga pelo interruptor
//     (api_addon_liberar_manual, no banco); nada acontece no Stripe.
//   - Pagamento pendente (past_due): não liga nem desliga — o cartão está
//     recusando (mesma regra da Loja extra).
//
// As regras são puras e testadas no Vitest (src/lib/billing/apiAddon.test.ts);
// o orquestrador recebe o Stripe e o banco por parâmetro. Sem import de Deno.
// =============================================================================

import { can, normalizeRole, type Capability } from './capabilities.ts';

export const API_PRODUCT_ENV = 'STRIPE_PRODUCT_API';
export const API_PRICE_ENV = 'STRIPE_PRICE_API';
export const API_PRODUCT_NAME = 'API e integrações';
export const API_KIND = 'api_addon';
/** R$ 99,90 por mês. */
export const API_PRICE_CENTS = 9990;

/** Mesmo recorte de quem contrata Loja extra: gerente (e superadmin). */
export const API_ADDON_CAPABILITY: Capability = 'billing.view';

export const CHARGING_STATUSES: readonly string[] = ['active', 'trialing', 'past_due'];

export const MSG_TESTE_GRATIS = 'Disponível depois do teste grátis.';
export const MSG_PAGAMENTO_PENDENTE = 'Há um pagamento pendente nesta Conta. Atualize o cartão antes de mexer na API.';
export const MSG_SEM_ASSINATURA = 'Esta Conta ainda não tem uma assinatura ativa. Assine o plano antes de contratar a API.';
export const MSG_MANUAL = 'A API desta Conta é liberada pelo ConvoFlow.';
export const MSG_NAO_CONFIGURADO = 'A cobrança da API ainda não está ligada no servidor (falta o produto "API e integrações").';
export const MSG_DESLIGADO = 'A API ainda não está disponível.';

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
}

export interface ItemLike {
  id?: string | null;
  quantity?: number | null;
  price?: PriceLike | null;
  current_period_end?: number | null;
}

export interface SubscriptionLike {
  id?: string | null;
  status?: string | null;
  metadata?: Record<string, unknown> | null;
  current_period_end?: number | null;
  items?: { data?: ItemLike[] | null } | null;
}

export function productIdOf(price: PriceLike | null | undefined): string | null {
  const p = price?.product;
  if (typeof p === 'string') return p || null;
  if (p && typeof p === 'object' && typeof p.id === 'string') return p.id || null;
  return null;
}

export function findApiItems(sub: SubscriptionLike | null | undefined, productId: string | null | undefined): ItemLike[] {
  if (!productId) return [];
  return (sub?.items?.data ?? []).filter((i) => productIdOf(i?.price) === productId && (i?.quantity ?? 1) > 0);
}

/**
 * O que o webhook grava em tenants.api_addon_cobrado. Produto não configurado
 * → null (não mexe). Assinatura que não cobra mais → false.
 */
export function apiCharged(sub: SubscriptionLike | null | undefined, productId: string | null | undefined): boolean | null {
  if (!productId) return null;
  if (!CHARGING_STATUSES.includes(sub?.status ?? '')) return false;
  return findApiItems(sub, productId).length > 0;
}

/** Fim do período pago (ISO), do item ou da assinatura (o Stripe mudou o lugar). */
export function fimDoPeriodo(sub: SubscriptionLike | null | undefined, item?: ItemLike | null): string | null {
  const s = item?.current_period_end ?? sub?.current_period_end ?? null;
  return typeof s === 'number' && s > 0 ? new Date(s * 1000).toISOString() : null;
}

/** O preço configurado serve? null = serve; texto = o motivo. */
export function checkApiPrice(price: PriceLike | null | undefined, productId: string): string | null {
  if (!price?.id) return 'O preço da API não existe na conta do Stripe.';
  if (productIdOf(price) !== productId) return 'O preço da API não é do produto "API e integrações".';
  if (price.active === false) return 'O preço da API foi arquivado no Stripe.';
  if ((price.currency ?? '').toLowerCase() !== 'brl') return 'O preço da API não é em reais.';
  if (price.recurring?.interval !== 'month' || (price.recurring?.interval_count ?? 1) !== 1) return 'O preço da API não é mensal.';
  if (price.unit_amount !== API_PRICE_CENTS) return 'O preço da API não é R$ 99,90.';
  return null;
}

// -----------------------------------------------------------------------------
// Quem pode, e a Conta está em condição de mudar
// -----------------------------------------------------------------------------

export interface Caller {
  role: string;
  tenant_id: string | null;
  status: string;
  capabilities: Record<string, unknown> | null;
}

export interface ContaApi {
  id: string;
  kind: string | null;
  subscription_id: string | null;
  subscription_status: string | null;
  manual_access_granted: boolean | null;
  api_addon_cobrado: boolean | null;
  api_addon_ate: string | null;
}

export type Authz = { ok: true } | { ok: false; status: number; error: string };

export function authorizeApiAddonChange(caller: Caller, conta: ContaApi | null): Authz {
  if (caller.status !== 'active') return { ok: false, status: 403, error: 'Sua conta não está ativa.' };
  if (!can(normalizeRole(caller.role) ?? '', API_ADDON_CAPABILITY, caller.capabilities)) {
    return { ok: false, status: 403, error: 'Só o Gerente da Conta contrata a API.' };
  }
  if (!conta) return { ok: false, status: 404, error: 'Conta não encontrada.' };
  if (conta.kind !== 'account') return { ok: false, status: 403, error: 'A API é contratada pela Conta, não pela Loja.' };
  if (conta.subscription_status === 'trialing') return { ok: false, status: 409, error: MSG_TESTE_GRATIS };
  if (conta.subscription_status === 'past_due' && conta.subscription_id) {
    return { ok: false, status: 409, error: MSG_PAGAMENTO_PENDENTE };
  }
  if (!conta.subscription_id || conta.subscription_status !== 'active') {
    return { ok: false, status: 409, error: conta.manual_access_granted ? MSG_MANUAL : MSG_SEM_ASSINATURA };
  }
  return { ok: true };
}

// -----------------------------------------------------------------------------
// O que fazer no item
// -----------------------------------------------------------------------------

export type Proration = 'create_prorations' | 'none';

export type ApiOp =
  | { op: 'create'; price: string; proration: Proration }
  | { op: 'delete'; itemId: string; proration: Proration };

export interface ApiPlan {
  ops: ApiOp[];
  /** O que gravar em tenants.api_addon_ate (undefined = não mexe). */
  ate: string | null | undefined;
}

/**
 * Ligar: sem item → cria (proporcional; ou sem proporcional se o mês ainda
 * está pago por um desligamento recente); com item → nada; limpa o "até".
 * Desligar: remove todo item do produto sem crédito; "até" = fim do período
 * pago. Sem item → nada (o "até" fica como está).
 */
export function planApiAddon(
  sub: SubscriptionLike | null | undefined,
  productId: string,
  priceId: string | null,
  ligar: boolean,
  conta: Pick<ContaApi, 'api_addon_ate'>,
  agora: Date,
): ApiPlan {
  const itens = findApiItems(sub, productId).filter((i) => typeof i.id === 'string' && i.id);
  if (ligar) {
    if (itens.length > 0) {
      // Já ligado. Item duplicado (dois cliques, mão no painel): fica um só.
      return { ops: itens.slice(1).map((i) => ({ op: 'delete', itemId: i.id as string, proration: 'none' })), ate: null };
    }
    if (!priceId) throw new Error('planApiAddon: sem preço não há o que criar.');
    const mesPago = !!conta.api_addon_ate && Date.parse(conta.api_addon_ate) > agora.getTime();
    return { ops: [{ op: 'create', price: priceId, proration: mesPago ? 'none' : 'create_prorations' }], ate: null };
  }
  if (itens.length === 0) return { ops: [], ate: undefined };
  return {
    ops: itens.map((i) => ({ op: 'delete', itemId: i.id as string, proration: 'none' })),
    ate: fimDoPeriodo(sub, itens[0]) ?? undefined,
  };
}

/**
 * Chave de idempotência: dois cliques iguais no mesmo minuto viram UMA
 * operação no Stripe. Por minuto, e não por dia, porque desligar e religar no
 * mesmo dia é legítimo: com a chave do dia, o segundo "criar" devolveria o
 * item já apagado e nada seria criado.
 */
export function apiIdempotencyKey(contaId: string, subscriptionId: string, op: ApiOp, minuto: string): string {
  return `api-addon:${contaId}:${subscriptionId}:${op.op}:${op.op === 'delete' ? op.itemId : op.price}:${minuto}`;
}

// -----------------------------------------------------------------------------
// Orquestração (Stripe e banco por parâmetro)
// -----------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
export type StripeLike = any;

export class ApiAddonError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export interface ApiAddonDeps {
  stripe: StripeLike;
  productId: string | null;
  priceId: string | null;
  loadConta(id: string): Promise<ContaApi | null>;
  /** Grava cobrado/ate na Conta (servidor). Deve LANÇAR se o banco recusar. */
  saveConta(id: string, patch: { api_addon_cobrado: boolean; api_addon_ate?: string | null }): Promise<void>;
  now(): Date;
  log?: (level: 'info' | 'warn' | 'error', msg: string, ctx?: Record<string, unknown>) => void;
}

export interface ApiAddonResult {
  cobrado: boolean;
  ate: string | null;
  ops: ApiOp['op'][];
}

/**
 * Liga ou desliga o complemento na assinatura da Conta. Relê a assinatura no
 * fim: o que fica gravado vem do Stripe, não do que foi pedido.
 */
export async function changeApiAddon(deps: ApiAddonDeps, caller: Caller, ligar: unknown): Promise<ApiAddonResult> {
  if (typeof ligar !== 'boolean') throw new ApiAddonError('Diga se liga ou desliga (ligar: true ou false).', 400);
  if (!caller.tenant_id) throw new ApiAddonError('Usuário sem Conta associada.', 400);
  const conta = await deps.loadConta(caller.tenant_id);
  const authz = authorizeApiAddonChange(caller, conta);
  if (!authz.ok) throw new ApiAddonError(authz.error, authz.status);
  const c = conta as ContaApi;

  if (!deps.productId || !deps.priceId) throw new ApiAddonError(MSG_NAO_CONFIGURADO, 500);
  if (ligar) {
    let price: PriceLike | null = null;
    try {
      price = await deps.stripe.prices.retrieve(deps.priceId);
    } catch (e) {
      if ((e as { code?: string })?.code !== 'resource_missing') throw e;
    }
    const problema = checkApiPrice(price, deps.productId);
    if (problema) throw new ApiAddonError(`${problema} ${MSG_NAO_CONFIGURADO}`, 500);
  }

  const subscriptionId = c.subscription_id as string;
  const sub: SubscriptionLike = await deps.stripe.subscriptions.retrieve(subscriptionId);
  const dona = sub?.metadata?.tenant_id;
  if (typeof dona === 'string' && dona && dona !== c.id) {
    throw new ApiAddonError('A assinatura gravada nesta Conta é de outra Conta no Stripe. Nada foi alterado.', 409);
  }
  if (sub?.status !== 'active') {
    throw new ApiAddonError(sub?.status === 'trialing' ? MSG_TESTE_GRATIS : MSG_SEM_ASSINATURA, 409);
  }

  const agora = deps.now();
  const plano = planApiAddon(sub, deps.productId, deps.priceId, ligar, c, agora);
  const minuto = agora.toISOString().slice(0, 16);
  for (const op of plano.ops) {
    const idempotencyKey = apiIdempotencyKey(c.id, subscriptionId, op, minuto);
    if (op.op === 'create') {
      await deps.stripe.subscriptionItems.create(
        { subscription: subscriptionId, price: op.price, quantity: 1, proration_behavior: op.proration },
        { idempotencyKey },
      );
    } else {
      await deps.stripe.subscriptionItems.del(op.itemId, { proration_behavior: op.proration }, { idempotencyKey });
    }
  }

  const relida: SubscriptionLike = plano.ops.length ? await deps.stripe.subscriptions.retrieve(subscriptionId) : sub;
  const cobrado = apiCharged(relida, deps.productId) === true;
  const patch: { api_addon_cobrado: boolean; api_addon_ate?: string | null } = { api_addon_cobrado: cobrado };
  if (plano.ate !== undefined) patch.api_addon_ate = plano.ate;
  await deps.saveConta(c.id, patch);
  deps.log?.('info', 'api-addon', { conta: c.id, ligar, cobrado, ops: plano.ops.map((o) => o.op) });
  return {
    cobrado,
    ate: plano.ate !== undefined ? plano.ate : c.api_addon_ate,
    ops: plano.ops.map((o) => o.op),
  };
}

/**
 * Garante o produto "API e integrações" e o preço de R$ 99,90/mês e devolve os
 * ids. Idempotente: procura primeiro (metadata convoflow_kind = api_addon).
 */
export async function ensureApiProduct(
  stripe: StripeLike,
  configuredProduct: string | null,
  configuredPrice: string | null,
): Promise<{
  productId: string;
  priceId: string;
  createdProduct: boolean;
  createdPrice: boolean;
  productMatchesSecret: boolean;
  priceMatchesSecret: boolean;
}> {
  const naoExiste = (e: unknown) => (e as { code?: string })?.code === 'resource_missing';
  let productId: string | null = null;
  let createdProduct = false;

  if (configuredProduct) {
    try {
      const p = await stripe.products.retrieve(configuredProduct);
      if (p?.id && !p.deleted) productId = p.id;
    } catch (e) {
      if (!naoExiste(e)) throw e;
    }
  }
  if (!productId) {
    let depois: string | undefined;
    for (let pagina = 0; pagina < 10 && !productId; pagina++) {
      const lote = await stripe.products.list({ limit: 100, active: true, ...(depois ? { starting_after: depois } : {}) });
      const dados = (lote?.data ?? []) as Array<{ id: string; metadata?: Record<string, unknown> }>;
      productId = dados.find((p) => p?.metadata?.convoflow_kind === API_KIND)?.id ?? null;
      if (!lote?.has_more || dados.length === 0) break;
      depois = dados[dados.length - 1]?.id;
    }
  }
  if (!productId) {
    const p = await stripe.products.create({
      name: API_PRODUCT_NAME,
      description: 'Acesso por chave de API e conexão com agentes de IA, só leitura. Por Conta.',
      metadata: { convoflow_kind: API_KIND },
    });
    productId = p.id as string;
    createdProduct = true;
  }

  let priceId: string | null = null;
  let createdPrice = false;
  if (configuredPrice) {
    try {
      const pr = await stripe.prices.retrieve(configuredPrice);
      if (!checkApiPrice(pr, productId)) priceId = pr.id;
    } catch (e) {
      if (!naoExiste(e)) throw e;
    }
  }
  if (!priceId) {
    const lista = await stripe.prices.list({ product: productId, active: true, limit: 100 });
    const achado = ((lista?.data ?? []) as PriceLike[]).find((pr) => !checkApiPrice(pr, productId as string));
    priceId = (achado?.id as string) ?? null;
  }
  if (!priceId) {
    const pr = await stripe.prices.create({
      product: productId,
      currency: 'brl',
      unit_amount: API_PRICE_CENTS,
      recurring: { interval: 'month' },
      nickname: `${API_PRODUCT_NAME} · R$ 99,90/mês`,
      metadata: { convoflow_kind: API_KIND },
    });
    priceId = pr.id as string;
    createdPrice = true;
  }

  return {
    productId,
    priceId,
    createdProduct,
    createdPrice,
    productMatchesSecret: !!configuredProduct && configuredProduct === productId,
    priceMatchesSecret: !!configuredPrice && configuredPrice === priceId,
  };
}
