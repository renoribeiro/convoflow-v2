// =============================================================================
// stripe-admin (núcleo) — Faturamento da Administração (superadmin)
// =============================================================================
// O index.ts da função só liga isto ao Deno, ao Supabase e ao Stripe. Toda
// decisão mora aqui, sem nada do Deno, para o Vitest testar
// (src/lib/billing/stripeAdminCore.test.ts).
//
// UMA CHAVE SÓ (item 10, 2026-09-29): o cliente do Stripe nasce SEMPRE da secret
// STRIPE_SECRET_KEY — a mesma do create-checkout-session, do stripe-webhook, do
// manage-subscription e do update-store-slots. A tabela `stripe_config` não é
// lida nem gravada: antes, uma chave salva pela tela tinha prioridade sobre a
// secret e mandava cupons e números para OUTRA conta do Stripe, em silêncio,
// enquanto o checkout seguia na secret. Trocar de conta do Stripe agora é
// trocar as secrets, num lugar só.
//
// QUEM CHAMA:
//   superadmin (login conferido no index.ts) → todas as ações;
//   backend    (x-cron-secret do Vault ou a chave sb_secret_, a mesma regra dos
//               workers — _shared/backend-caller.ts) → só BACKEND_ACTIONS: ler o
//               estado, os números e os cupons, e criar/arquivar cupom. É o que
//               deixa conferir o Stripe por SQL (pg_net) sem uma sessão de
//               superadmin. Quem tem essas credenciais já tem o banco inteiro.
//
// VALORES: tudo que vem do Stripe sai em CENTAVOS. Cupom continua como antes:
// `discount_value` em REAIS no banco, convertido só na chamada ao Stripe.
// =============================================================================

import {
  ATTENDANT_PRODUCT_ENV,
  AttendantBillingError,
  attendantStatus,
  ensureAttendantProduct,
  setAttendantPrice,
  syncAttendantItem,
  type AttendantBillingDeps,
} from './attendant-billing.ts';

// ---------------------------------------------------------------------------
// Contrato
// ---------------------------------------------------------------------------

export type StripeAdminAction =
  // Atendentes extras (limite por Loja, entrega 2 — ver attendant-billing.ts)
  | 'attendant_status'
  | 'set_attendant_price'
  | 'sync_attendant_item'
  | 'ensure_attendant_product'
  | 'get_status'
  | 'billing_overview'
  | 'get_config'
  | 'save_config'
  | 'test_connection'
  | 'get_account_info'
  | 'get_balance'
  | 'get_transaction_stats'
  | 'process_batch_commissions'
  | 'create_coupon'
  | 'list_coupons'
  | 'archive_coupon';

/**
 * O que o backend (pg_net / chave secreta) pode pedir. Dos atendentes extras,
 * só ler o estado de uma Conta e garantir o produto (idempotente, sem dinheiro
 * envolvido). Mudar preço ou item da assinatura é só com login de superadmin.
 */
export const BACKEND_ACTIONS: readonly StripeAdminAction[] = [
  'get_status',
  'billing_overview',
  'list_coupons',
  'create_coupon',
  'archive_coupon',
  'attendant_status',
  'ensure_attendant_product',
];

export type AdminCaller =
  | { kind: 'superadmin'; userId?: string | null }
  | { kind: 'backend' }
  | { kind: 'other' }
  | null;

/** A única fonte da chave do Stripe. */
export const STRIPE_SECRET_ENV = 'STRIPE_SECRET_KEY';
export const PRICE_GERENTE_ENV = 'STRIPE_PRICE_GERENTE';
export const PRICE_STORE_SLOT_ENV = 'STRIPE_PRICE_STORE_SLOT';

/**
 * Os 6 eventos que o stripe-webhook precisa receber
 * (docs/RUNBOOK_teste_gratis.md, etapa 1b).
 */
export const WEBHOOK_EVENTS: readonly string[] = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
];

export const WEBHOOK_FUNCTION = 'stripe-webhook';

/** Janela da receita por mês e dos pagamentos que falharam. */
export const REVENUE_MONTHS = 12;
export const FAILED_PAYMENTS_DAYS = 90;
const MAX_PAGES = 10;
const MAX_UPCOMING_CALLS = 50;
const TIME_ZONE = 'America/Sao_Paulo';

export const SAVE_CONFIG_DISABLED =
  'Salvar a chave do Stripe pela tela foi desativado. A chave é a secret STRIPE_SECRET_KEY do projeto no Supabase.';

/** Erro com status HTTP. O handler devolve { error } com esse status. */
export class AdminError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Portas (o index.ts liga ao supabase-js e ao SDK do Stripe)
// ---------------------------------------------------------------------------

/**
 * O pedaço do SDK do Stripe que usamos. Tipado solto de propósito: o Vitest
 * injeta um dublê e o index.ts entrega o SDK real.
 */
// deno-lint-ignore no-explicit-any
export type StripeLike = any;
// deno-lint-ignore no-explicit-any
export type DbLike = { from: (table: string) => any };

export interface StripeAdminDeps {
  caller: AdminCaller;
  getEnv: (name: string) => string | undefined;
  /** Cria o cliente do Stripe a partir da chave. */
  createStripe: (secretKey: string) => StripeLike;
  /** Cliente de serviço do Supabase. */
  db: DbLike;
  now: () => Date;
  log?: (level: 'info' | 'warn' | 'error', msg: string, ctx?: Record<string, unknown>) => void;
}

export interface AdminResult {
  status: number;
  body: unknown;
}

// ---------------------------------------------------------------------------
// Quem pode
// ---------------------------------------------------------------------------

export function authorize(action: string, caller: AdminCaller): AdminError | null {
  if (!caller || caller.kind === 'other') {
    return new AdminError(
      caller ? 'Forbidden: Only superadmin can perform Stripe admin actions' : 'Unauthorized',
    );
  }
  if (caller.kind === 'superadmin') return null;
  if ((BACKEND_ACTIONS as readonly string[]).includes(action)) return null;
  return new AdminError('Forbidden: action not available to backend callers');
}

// ---------------------------------------------------------------------------
// O cliente do Stripe — SÓ a secret
// ---------------------------------------------------------------------------

export type StripeMode = 'live' | 'test' | 'unknown';

export function modeFromKey(key: string | undefined | null): StripeMode {
  if (!key) return 'unknown';
  if (/^(sk|rk)_live_/.test(key)) return 'live';
  if (/^(sk|rk)_test_/.test(key)) return 'test';
  return 'unknown';
}

/**
 * O cliente do Stripe do ConvoFlow. Lê SÓ a secret STRIPE_SECRET_KEY — a mesma
 * da cobrança. `stripe_config` não entra aqui (ver o cabeçalho).
 */
export async function getStripeClient(deps: StripeAdminDeps): Promise<{ stripe: StripeLike; mode: StripeMode }> {
  const secretKey = deps.getEnv(STRIPE_SECRET_ENV)?.trim();
  if (!secretKey) {
    throw new AdminError(
      'Stripe não configurado: defina a secret STRIPE_SECRET_KEY no projeto do Supabase.',
    );
  }
  return { stripe: deps.createStripe(secretKey), mode: modeFromKey(secretKey) };
}

// ---------------------------------------------------------------------------
// Cupons de desconto (superadmin)
// -----------------------------------------------------------------------------
// Modelo: cada cupom nosso vira DOIS objetos no Stripe —
//   1. Coupon         → carrega o desconto (percent_off / amount_off + duration)
//   2. Promotion Code → é o texto que o cliente digita no Checkout. O
//                       create-checkout-session já manda allow_promotion_codes,
//                       então o cupom funciona ponta-a-ponta sem tocar nele.
//
// Convenção de valores: discount_value é gravado em REAIS no nosso banco e só
// é convertido para centavos (× 100) na chamada ao Stripe.
// ---------------------------------------------------------------------------

const COUPON_CURRENCY = 'brl';
const COUPON_DURATIONS = ['once', 'repeating', 'forever'];

/** Código de erro do Postgres para "coluna não existe" (migração pendente). */
const PG_UNDEFINED_COLUMN = '42703';

/**
 * Valida e normaliza o payload de create_coupon. Lança Error com mensagem em
 * pt-BR — o handler devolve { error } com status 400.
 */
// deno-lint-ignore no-explicit-any
export function parseCouponPayload(payload: any) {
  // Stripe só aceita letras e dígitos no code do Promotion Code.
  const code = String(payload?.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!code) throw new Error('Informe o código do cupom (apenas letras e números).');
  if (code.length > 40) throw new Error('O código do cupom deve ter no máximo 40 caracteres.');

  const discountType = payload?.discount_type;
  if (discountType !== 'percent' && discountType !== 'amount') {
    throw new Error("Tipo de desconto inválido. Use 'percent' ou 'amount'.");
  }

  const discountValue = Number(payload?.discount_value);
  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    throw new Error('O valor do desconto deve ser maior que zero.');
  }
  if (discountType === 'percent' && discountValue > 100) {
    throw new Error('O desconto percentual não pode passar de 100%.');
  }

  const duration = payload?.duration ?? 'once';
  if (!COUPON_DURATIONS.includes(duration)) {
    throw new Error("Duração inválida. Use 'once', 'repeating' ou 'forever'.");
  }

  let durationInMonths: number | null = null;
  if (duration === 'repeating') {
    durationInMonths = Math.floor(Number(payload?.duration_in_months));
    if (!Number.isFinite(durationInMonths) || durationInMonths < 1) {
      throw new Error('Informe a quantidade de meses (mínimo 1) para cupons recorrentes.');
    }
  }

  let maxUses: number | null = null;
  const rawMaxUses = payload?.max_uses;
  if (rawMaxUses !== null && rawMaxUses !== undefined && rawMaxUses !== '') {
    maxUses = Math.floor(Number(rawMaxUses));
    if (!Number.isFinite(maxUses) || maxUses < 1) {
      throw new Error('O limite de usos deve ser um número inteiro maior que zero.');
    }
  }

  let validUntil: Date | null = null;
  if (payload?.valid_until) {
    validUntil = new Date(payload.valid_until);
    if (Number.isNaN(validUntil.getTime())) throw new Error('Data de validade inválida.');
    // O Stripe rejeita expires_at no passado.
    if (validUntil.getTime() <= Date.now()) {
      throw new Error('A data de validade precisa ser no futuro.');
    }
  }

  return { code, discountType, discountValue, duration, durationInMonths, maxUses, validUntil };
}

// deno-lint-ignore no-explicit-any
async function createCoupon(deps: StripeAdminDeps, payload: any) {
  const { stripe } = await getStripeClient(deps);
  const input = parseCouponPayload(payload);

  // --- 1) Coupon no Stripe (o desconto em si) ---
  // deno-lint-ignore no-explicit-any
  const couponParams: Record<string, any> = {
    name: input.code,
    duration: input.duration,
  };
  if (input.discountType === 'percent') {
    couponParams.percent_off = input.discountValue;
  } else {
    // Reais → centavos. Única conversão do fluxo.
    couponParams.amount_off = Math.round(input.discountValue * 100);
    couponParams.currency = COUPON_CURRENCY;
  }
  if (input.duration === 'repeating') {
    couponParams.duration_in_months = input.durationInMonths;
  }

  const stripeCoupon = await stripe.coupons.create(couponParams);

  // --- 2) Promotion Code (o texto digitado no Checkout) ---
  // deno-lint-ignore no-explicit-any
  let promotionCode: any;
  try {
    // deno-lint-ignore no-explicit-any
    const promoParams: Record<string, any> = {
      coupon: stripeCoupon.id,
      code: input.code,
    };
    if (input.maxUses !== null) promoParams.max_redemptions = input.maxUses;
    if (input.validUntil) {
      promoParams.expires_at = Math.floor(input.validUntil.getTime() / 1000);
    }
    promotionCode = await stripe.promotionCodes.create(promoParams);
  } catch (promoError) {
    // Não deixa Coupon órfão no Stripe se o code já existir, por exemplo.
    await stripe.coupons.del(stripeCoupon.id).catch(() => {});
    throw promoError;
  }

  // --- 3) Persiste no nosso banco ---
  const { data: row, error: insertError } = await deps.db
    .from('coupons')
    .insert({
      code: input.code,
      stripe_coupon_id: stripeCoupon.id,
      stripe_promotion_code_id: promotionCode.id,
      discount_type: input.discountType,
      discount_value: input.discountValue,
      duration: input.duration,
      duration_in_months: input.durationInMonths,
      max_uses: input.maxUses,
      valid_until: input.validUntil ? input.validUntil.toISOString() : null,
      is_active: true,
    })
    .select()
    .single();

  if (insertError) {
    // Rollback: o cupom não pode existir no Stripe sem existir aqui.
    await stripe.promotionCodes.update(promotionCode.id, { active: false }).catch(() => {});
    await stripe.coupons.del(stripeCoupon.id).catch(() => {});

    if (insertError.code === PG_UNDEFINED_COLUMN) {
      throw new Error(
        'A tabela coupons está desatualizada. Rode a migração ' +
        '20260811000001_coupons_duration_and_promo_code.sql antes de criar cupons.',
      );
    }
    throw new Error(`Falha ao salvar o cupom: ${insertError.message}`);
  }

  return {
    success: true,
    coupon_id: stripeCoupon.id,
    promotion_code_id: promotionCode.id,
    coupon: row,
  };
}

async function listCoupons(deps: StripeAdminDeps) {
  const { data, error } = await deps.db
    .from('coupons')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;

  // deno-lint-ignore no-explicit-any
  const rows: any[] = data ?? [];

  // Quem conta resgate é o Stripe (times_redeemed do Promotion Code):
  // nada no nosso banco incrementa current_uses, então a coluna nascia e
  // morria em 0. Puxamos os codes em lote e sobrescrevemos o valor.
  //
  // Best-effort de propósito: se o Stripe estiver fora, a lista ainda
  // renderiza com o último valor gravado em vez de estourar a tela.
  try {
    const { stripe } = await getStripeClient(deps);

    const redeemedByPromoId = new Map<string, number>();
    let startingAfter: string | undefined;

    // 100 por página; o teto de 10 voltas é só trava contra loop infinito.
    for (let page = 0; page < 10; page++) {
      const batch = await stripe.promotionCodes.list({
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });

      for (const promo of batch.data) {
        redeemedByPromoId.set(promo.id, promo.times_redeemed ?? 0);
      }

      if (!batch.has_more || batch.data.length === 0) break;
      startingAfter = batch.data[batch.data.length - 1].id;
    }

    for (const row of rows) {
      const uses = row.stripe_promotion_code_id
        ? redeemedByPromoId.get(row.stripe_promotion_code_id)
        : undefined;

      if (uses === undefined || uses === row.current_uses) continue;

      row.current_uses = uses;

      // Grava de volta para a coluna parar de mentir para quem ler a
      // tabela direto (relatórios, SQL editor, futuras telas).
      await deps.db
        .from('coupons')
        .update({ current_uses: uses })
        .eq('id', row.id);
    }
  } catch (syncError: unknown) {
    deps.log?.('error', 'list_coupons: falha ao sincronizar usos com o Stripe', {
      erro: (syncError as { message?: string })?.message ?? String(syncError),
    });
  }

  return rows;
}

// deno-lint-ignore no-explicit-any
async function archiveCoupon(deps: StripeAdminDeps, payload: any) {
  const { stripe } = await getStripeClient(deps);

  const couponId = payload?.coupon_id;
  if (!couponId) throw new Error('Informe o cupom a ser arquivado.');

  // O banco é a fonte da verdade; o payload é só um atalho do frontend.
  const { data: existing } = await deps.db
    .from('coupons')
    .select('*')
    .eq('id', couponId)
    .maybeSingle();

  const stripeCouponId = existing?.stripe_coupon_id ?? payload?.stripe_coupon_id ?? null;
  const storedPromoId = existing?.stripe_promotion_code_id ?? null;

  // O que impede o resgate é desativar o Promotion Code — o Coupon do
  // Stripe não tem flag `active`, só pode ser deletado (o que NÃO afeta
  // assinaturas que já o aplicaram, apenas bloqueia novos resgates).
  const warnings: string[] = [];

  try {
    if (storedPromoId) {
      await stripe.promotionCodes.update(storedPromoId, { active: false });
    } else if (stripeCouponId) {
      // Linhas antigas não têm o id salvo: varre os codes do cupom.
      const promos = await stripe.promotionCodes.list({
        coupon: stripeCouponId,
        active: true,
        limit: 100,
      });
      for (const promo of promos.data) {
        await stripe.promotionCodes.update(promo.id, { active: false });
      }
    }
  } catch (e: unknown) {
    warnings.push(`Promotion Code: ${(e as Error).message}`);
  }

  if (stripeCouponId) {
    try {
      await stripe.coupons.del(stripeCouponId);
    } catch (e: unknown) {
      // Já deletado no dashboard, por exemplo — não bloqueia o arquivamento.
      warnings.push(`Coupon: ${(e as Error).message}`);
    }
  }

  const { error: updateError } = await deps.db
    .from('coupons')
    .update({ is_active: false, updated_at: deps.now().toISOString() })
    .eq('id', couponId);

  if (updateError) throw updateError;

  return { success: true, warnings };
}

// ---------------------------------------------------------------------------
// Estado da conexão (aba Conexão) — só leitura
// ---------------------------------------------------------------------------

export interface PriceCheck {
  env: string;
  configured: boolean;
  found: boolean;
  id: string | null;
  active: boolean | null;
  unitAmount: number | null;
  currency: string | null;
  interval: string | null;
  intervalCount: number | null;
  productName: string | null;
  error: string | null;
}

export interface WebhookCheck {
  url: string;
  expectedEvents: string[];
  found: boolean;
  enabled: boolean | null;
  missingEvents: string[];
  error: string | null;
}

export interface StripeStatus {
  secretConfigured: boolean;
  connected: boolean;
  mode: StripeMode;
  error: string | null;
  account: { id: string; name: string | null; email: string | null; country: string | null } | null;
  prices: { gerente: PriceCheck; storeSlot: PriceCheck };
  /** Produto "Atendente extra" (secret STRIPE_PRODUCT_ATTENDANT). */
  attendantProduct: ProductCheck;
  webhook: WebhookCheck;
}

export interface ProductCheck {
  env: string;
  configured: boolean;
  found: boolean;
  id: string | null;
  active: boolean | null;
  name: string | null;
  error: string | null;
}

function emptyProduct(env: string, id: string | undefined): ProductCheck {
  return { env, configured: !!id, found: false, id: id ?? null, active: null, name: null, error: null };
}

async function checkProduct(stripe: StripeLike, env: string, id: string | undefined): Promise<ProductCheck> {
  const vazio = emptyProduct(env, id);
  if (!id) return { ...vazio, error: `A secret ${env} não está definida: atendentes extras não são cobrados.` };
  try {
    const p = await stripe.products.retrieve(id);
    if (p?.deleted) return { ...vazio, error: `O produto de ${env} foi apagado no Stripe.` };
    return { ...vazio, found: true, active: p?.active ?? null, name: p?.name ?? null };
  } catch (e) {
    const naoExiste = (e as { code?: string })?.code === 'resource_missing';
    return {
      ...vazio,
      error: naoExiste
        ? `O produto de ${env} não existe na conta do Stripe conectada.`
        : `Não foi possível ler o produto de ${env}: ${mensagem(e)}`,
    };
  }
}

export function webhookUrl(getEnv: (n: string) => string | undefined): string {
  const base = (getEnv('SUPABASE_URL') ?? '').replace(/\/+$/, '');
  return `${base}/functions/v1/${WEBHOOK_FUNCTION}`;
}

function mensagem(e: unknown): string {
  return (e as { message?: string })?.message ?? String(e);
}

// deno-lint-ignore no-explicit-any
function resumoDaConta(account: any) {
  return {
    id: String(account?.id ?? ''),
    name: account?.business_profile?.name ?? account?.settings?.dashboard?.display_name ?? null,
    email: account?.email ?? null,
    country: account?.country ?? null,
  };
}

async function checkPrice(stripe: StripeLike, env: string, id: string | undefined): Promise<PriceCheck> {
  const vazio = emptyPrice(env, id);
  if (!id) return { ...vazio, error: `A secret ${env} não está definida.` };
  try {
    const price = await stripe.prices.retrieve(id, { expand: ['product'] });
    return {
      ...vazio,
      found: true,
      active: price?.active ?? null,
      unitAmount: typeof price?.unit_amount === 'number' ? price.unit_amount : null,
      currency: price?.currency ?? null,
      interval: price?.recurring?.interval ?? null,
      intervalCount: price?.recurring?.interval_count ?? null,
      productName: typeof price?.product === 'object' ? price.product?.name ?? null : null,
    };
  } catch (e) {
    const naoExiste = (e as { code?: string })?.code === 'resource_missing';
    return {
      ...vazio,
      error: naoExiste
        ? `O preço de ${env} não existe na conta do Stripe conectada.`
        : `Não foi possível ler o preço de ${env}: ${mensagem(e)}`,
    };
  }
}

async function checkWebhook(stripe: StripeLike, url: string): Promise<WebhookCheck> {
  const base: WebhookCheck = {
    url,
    expectedEvents: [...WEBHOOK_EVENTS],
    found: false,
    enabled: null,
    missingEvents: [...WEBHOOK_EVENTS],
    error: null,
  };
  try {
    const list = await stripe.webhookEndpoints.list({ limit: 100 });
    // deno-lint-ignore no-explicit-any
    const endpoint = (list?.data ?? []).find((e: any) => e?.url === url);
    if (!endpoint) return base;
    const eventos: string[] = endpoint.enabled_events ?? [];
    const todos = eventos.includes('*');
    return {
      ...base,
      found: true,
      enabled: endpoint.status === 'enabled',
      missingEvents: todos ? [] : WEBHOOK_EVENTS.filter((ev) => !eventos.includes(ev)),
    };
  } catch (e) {
    return { ...base, error: `Não foi possível listar os webhooks: ${mensagem(e)}` };
  }
}

export async function getStatus(deps: StripeAdminDeps): Promise<StripeStatus> {
  const url = webhookUrl(deps.getEnv);
  const gerenteId = deps.getEnv(PRICE_GERENTE_ENV)?.trim() || undefined;
  const slotId = deps.getEnv(PRICE_STORE_SLOT_ENV)?.trim() || undefined;
  const attendantId = deps.getEnv(ATTENDANT_PRODUCT_ENV)?.trim() || undefined;
  const semConexao = (secretConfigured: boolean, mode: StripeMode, error: string): StripeStatus => ({
    secretConfigured,
    connected: false,
    mode,
    error,
    account: null,
    prices: {
      gerente: emptyPrice(PRICE_GERENTE_ENV, gerenteId),
      storeSlot: emptyPrice(PRICE_STORE_SLOT_ENV, slotId),
    },
    attendantProduct: emptyProduct(ATTENDANT_PRODUCT_ENV, attendantId),
    webhook: {
      url,
      expectedEvents: [...WEBHOOK_EVENTS],
      found: false,
      enabled: null,
      missingEvents: [...WEBHOOK_EVENTS],
      error: null,
    },
  });

  let cliente: { stripe: StripeLike; mode: StripeMode };
  try {
    cliente = await getStripeClient(deps);
  } catch (e) {
    return semConexao(false, 'unknown', mensagem(e));
  }

  let account: StripeStatus['account'];
  try {
    account = resumoDaConta(await cliente.stripe.accounts.retrieve());
  } catch (e) {
    return semConexao(true, cliente.mode, `A chave não conectou ao Stripe: ${mensagem(e)}`);
  }

  const [gerente, storeSlot, attendantProduct, webhook] = await Promise.all([
    checkPrice(cliente.stripe, PRICE_GERENTE_ENV, gerenteId),
    checkPrice(cliente.stripe, PRICE_STORE_SLOT_ENV, slotId),
    checkProduct(cliente.stripe, ATTENDANT_PRODUCT_ENV, attendantId),
    checkWebhook(cliente.stripe, url),
  ]);

  return {
    secretConfigured: true,
    connected: true,
    mode: cliente.mode,
    error: null,
    account,
    prices: { gerente, storeSlot },
    attendantProduct,
    webhook,
  };
}

function emptyPrice(env: string, id: string | undefined): PriceCheck {
  return {
    env,
    configured: !!id,
    found: false,
    id: id ?? null,
    active: null,
    unitAmount: null,
    currency: null,
    interval: null,
    intervalCount: null,
    productName: null,
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Números ao vivo do Stripe (billing_overview)
// ---------------------------------------------------------------------------
// Só a conta do Stripe da secret. Uma Conta cuja assinatura não existe nesta
// conta do Stripe (hoje: a assinatura feita na conta ANTIGA) sai em `legacy`,
// separada, e não entra em nenhum outro número.
// ---------------------------------------------------------------------------

export interface ContaRef {
  id: string;
  name: string | null;
  subscription_id: string | null;
  subscription_status: string | null;
  stripe_customer_id: string | null;
}

export interface MrrBreakdown {
  /** Receita mensal recorrente líquida (já com descontos), em centavos. */
  net: number;
  gross: number;
  plan: number;
  extraStores: number;
  /** Atendentes extras (produto "Atendente extra", preço de cada Conta). */
  extraAttendants: number;
  other: number;
  discounts: number;
  /** Assinaturas que entram na conta (ativas ou com pagamento pendente). */
  subscriptions: number;
}

export interface UpcomingCharge {
  tenantId: string | null;
  contaName: string;
  subscriptionId: string;
  status: string;
  date: string | null;
  amount: number | null;
  currency: string;
}

export interface MonthRevenue {
  /** 'AAAA-MM' no fuso de Brasília. */
  month: string;
  amount: number;
  invoices: number;
}

export interface FailedPayment {
  tenantId: string | null;
  contaName: string;
  chargeId: string;
  date: string;
  amount: number;
  currency: string;
  reason: string | null;
  /** A fatura dessa tentativa foi paga depois. */
  recovered: boolean;
}

export interface LegacyConta {
  tenantId: string;
  contaName: string;
  subscriptionId: string;
  subscriptionStatus: string | null;
}

export interface BillingOverview {
  generatedAt: string;
  mode: StripeMode;
  currency: string;
  mrr: MrrBreakdown;
  upcoming: UpcomingCharge[];
  revenueByMonth: MonthRevenue[];
  failedPayments: FailedPayment[];
  legacy: LegacyConta[];
  warnings: string[];
}

const MRR_STATUSES = ['active', 'past_due'];
const UPCOMING_STATUSES = ['active', 'trialing', 'past_due'];

/** Valor mensal de um item (centavos), normalizado pelo intervalo do preço. */
// deno-lint-ignore no-explicit-any
export function monthlyItemAmount(item: any): number | null {
  const price = item?.price;
  const unit = price?.unit_amount;
  if (typeof unit !== 'number') return null;
  const qty = typeof item?.quantity === 'number' ? item.quantity : 1;
  const interval = price?.recurring?.interval ?? 'month';
  const count = price?.recurring?.interval_count || 1;
  const bruto = unit * qty;
  switch (interval) {
    case 'month':
      return bruto / count;
    case 'year':
      return bruto / (12 * count);
    case 'week':
      return (bruto * 52) / 12 / count;
    case 'day':
      return (bruto * 365) / 12 / count;
    default:
      return null;
  }
}

/** Descontos em vigor na assinatura (o `discount` antigo e/ou `discounts` expandido). */
// deno-lint-ignore no-explicit-any
function activeDiscounts(sub: any, nowMs: number): any[] {
  // deno-lint-ignore no-explicit-any
  const lista: any[] = [];
  if (sub?.discount && typeof sub.discount === 'object') lista.push(sub.discount);
  for (const d of Array.isArray(sub?.discounts) ? sub.discounts : []) {
    if (d && typeof d === 'object' && !lista.some((x) => x?.id && x.id === d.id)) lista.push(d);
  }
  return lista.filter((d) => {
    const fim = typeof d?.end === 'number' ? d.end * 1000 : null;
    const inicio = typeof d?.start === 'number' ? d.start * 1000 : null;
    return (fim === null || fim > nowMs) && (inicio === null || inicio <= nowMs) && d?.coupon;
  });
}

/**
 * Receita mensal de UMA assinatura: plano, lojas extras, atendentes extras,
 * outros e o desconto dos cupons em vigor. Plano e Loja extra pelo PREÇO;
 * atendente extra pelo PRODUTO (cada Conta tem o seu preço). Percentual incide sobre o total; valor fixo desconta
 * por mês, sem passar de zero.
 */
export function subscriptionMrr(
  // deno-lint-ignore no-explicit-any
  sub: any,
  prices: { gerente?: string; storeSlot?: string; attendantProduct?: string },
  nowMs: number,
): { gross: number; plan: number; extraStores: number; extraAttendants: number; other: number; discounts: number; net: number; unknownItems: number } {
  let plan = 0;
  let extraStores = 0;
  let extraAttendants = 0;
  let other = 0;
  let unknownItems = 0;
  for (const item of sub?.items?.data ?? []) {
    const valor = monthlyItemAmount(item);
    if (valor === null) {
      unknownItems++;
      continue;
    }
    const priceId = item?.price?.id;
    const produto = typeof item?.price?.product === 'string' ? item.price.product : item?.price?.product?.id;
    if (prices.storeSlot && priceId === prices.storeSlot) extraStores += valor;
    else if (prices.gerente && priceId === prices.gerente) plan += valor;
    else if (prices.attendantProduct && produto === prices.attendantProduct) extraAttendants += valor;
    else other += valor;
  }
  const gross = plan + extraStores + extraAttendants + other;
  let discounts = 0;
  for (const d of activeDiscounts(sub, nowMs)) {
    const c = d.coupon;
    if (typeof c.percent_off === 'number') discounts += (gross - discounts) * (c.percent_off / 100);
    else if (typeof c.amount_off === 'number') discounts += c.amount_off;
  }
  discounts = Math.min(gross, discounts);
  return {
    gross: Math.round(gross),
    plan: Math.round(plan),
    extraStores: Math.round(extraStores),
    extraAttendants: Math.round(extraAttendants),
    other: Math.round(other),
    discounts: Math.round(discounts),
    net: Math.round(gross - discounts),
    unknownItems,
  };
}

/** 'AAAA-MM' de um instante, no fuso de Brasília. */
export function monthKey(date: Date): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const ano = partes.find((p) => p.type === 'year')?.value ?? '0000';
  const mes = partes.find((p) => p.type === 'month')?.value ?? '00';
  return `${ano}-${mes}`;
}

/** Os últimos `n` meses ('AAAA-MM'), do mais antigo ao atual. */
export function lastMonths(now: Date, n: number): string[] {
  const [ano = 0, mes = 1] = monthKey(now).split('-').map(Number);
  const meses: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const total = ano * 12 + (mes - 1) - i;
    const a = Math.floor(total / 12);
    const m = (total % 12) + 1;
    meses.push(`${a}-${String(m).padStart(2, '0')}`);
  }
  return meses;
}

function isoDe(unix: unknown): string | null {
  return typeof unix === 'number' && Number.isFinite(unix) ? new Date(unix * 1000).toISOString() : null;
}

function idDe(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string') return (v as { id: string }).id;
  return null;
}

/** Lê uma lista paginada do Stripe (até MAX_PAGES páginas de 100). */
async function listAll(
  // deno-lint-ignore no-explicit-any
  listar: (params: Record<string, unknown>) => Promise<any>,
  params: Record<string, unknown>,
  warnings: string[],
  nome: string,
  // deno-lint-ignore no-explicit-any
): Promise<any[]> {
  // deno-lint-ignore no-explicit-any
  const todos: any[] = [];
  let depois: string | undefined;
  for (let pagina = 0; pagina < MAX_PAGES; pagina++) {
    const lote = await listar({ ...params, limit: 100, ...(depois ? { starting_after: depois } : {}) });
    const dados = lote?.data ?? [];
    todos.push(...dados);
    if (!lote?.has_more || dados.length === 0) return todos;
    depois = dados[dados.length - 1].id;
  }
  warnings.push(`${nome}: mais de ${MAX_PAGES * 100} registros; só os ${MAX_PAGES * 100} mais recentes entraram.`);
  return todos;
}

export async function billingOverview(deps: StripeAdminDeps): Promise<BillingOverview> {
  const { stripe, mode } = await getStripeClient(deps);
  const now = deps.now();
  const nowMs = now.getTime();
  const warnings: string[] = [];
  const prices = {
    gerente: deps.getEnv(PRICE_GERENTE_ENV)?.trim() || undefined,
    storeSlot: deps.getEnv(PRICE_STORE_SLOT_ENV)?.trim() || undefined,
    attendantProduct: deps.getEnv(ATTENDANT_PRODUCT_ENV)?.trim() || undefined,
  };

  // --- As Contas (só Conta assina; Loja herda) ---
  const { data: contasData, error: contasError } = await deps.db
    .from('tenants')
    .select('id, name, subscription_id, subscription_status, stripe_customer_id')
    .eq('kind', 'account');
  if (contasError) throw new Error(`Falha ao ler as Contas: ${contasError.message}`);
  const contas: ContaRef[] = contasData ?? [];
  const porId = new Map(contas.map((c) => [c.id, c]));
  const porAssinatura = new Map(contas.filter((c) => c.subscription_id).map((c) => [c.subscription_id as string, c]));
  const porCliente = new Map(contas.filter((c) => c.stripe_customer_id).map((c) => [c.stripe_customer_id as string, c]));

  // --- Assinaturas desta conta do Stripe ---
  const assinaturas = await listAll(
    (p) => stripe.subscriptions.list(p),
    { status: 'all' },
    warnings,
    'Assinaturas',
  );
  const idsNestaConta = new Set<string>(assinaturas.map((s) => s.id));

  // Cliente → Conta também pelas assinaturas (o checkout grava o tenant_id no metadata).
  // deno-lint-ignore no-explicit-any
  const contaDaAssinatura = (s: any): ContaRef | null =>
    porAssinatura.get(s.id) ??
    (s?.metadata?.tenant_id ? porId.get(s.metadata.tenant_id) ?? null : null) ??
    (idDe(s.customer) ? porCliente.get(idDe(s.customer) as string) ?? null : null);
  for (const s of assinaturas) {
    const c = contaDaAssinatura(s);
    const cliente = idDe(s.customer);
    if (c && cliente && !porCliente.has(cliente)) porCliente.set(cliente, c);
  }
  const nomeDa = (c: ContaRef | null) => c?.name ?? 'Sem Conta no ConvoFlow';

  // --- Contas cuja assinatura NÃO está nesta conta do Stripe ---
  const legacy: LegacyConta[] = [];
  for (const c of contas) {
    if (!c.subscription_id || idsNestaConta.has(c.subscription_id)) continue;
    // A lista pode ter parado no teto: confirma uma a uma antes de rotular.
    try {
      const s = await stripe.subscriptions.retrieve(c.subscription_id);
      if (s?.id) {
        idsNestaConta.add(s.id);
        assinaturas.push(s);
        continue;
      }
    } catch (e) {
      if ((e as { code?: string })?.code !== 'resource_missing') {
        warnings.push(`Não foi possível conferir a assinatura da Conta ${nomeDa(c)}: ${mensagem(e)}`);
        continue;
      }
    }
    legacy.push({
      tenantId: c.id,
      contaName: nomeDa(c),
      subscriptionId: c.subscription_id,
      subscriptionStatus: c.subscription_status,
    });
  }

  // --- Receita mensal recorrente ---
  const mrr: MrrBreakdown = { net: 0, gross: 0, plan: 0, extraStores: 0, extraAttendants: 0, other: 0, discounts: 0, subscriptions: 0 };
  for (const s of assinaturas) {
    if (!MRR_STATUSES.includes(s.status)) continue;
    const r = subscriptionMrr(s, prices, nowMs);
    if (r.unknownItems > 0) warnings.push(`Assinatura ${s.id}: ${r.unknownItems} item(ns) sem valor fixo ficaram fora da receita mensal.`);
    mrr.subscriptions++;
    mrr.gross += r.gross;
    mrr.plan += r.plan;
    mrr.extraStores += r.extraStores;
    mrr.extraAttendants += r.extraAttendants;
    mrr.other += r.other;
    mrr.discounts += r.discounts;
    mrr.net += r.net;
  }

  // --- Próximas cobranças (uma por assinatura viva sem cancelamento agendado) ---
  const upcoming: UpcomingCharge[] = [];
  let chamadas = 0;
  for (const s of assinaturas) {
    if (!UPCOMING_STATUSES.includes(s.status)) continue;
    if (s.cancel_at_period_end || s.cancel_at) continue;
    const c = contaDaAssinatura(s);
    const data = isoDe(s.status === 'trialing' ? s.trial_end ?? s.current_period_end : s.current_period_end);
    let amount: number | null = null;
    let currency = String(s.currency ?? 'brl');
    if (chamadas < MAX_UPCOMING_CALLS) {
      chamadas++;
      try {
        const fatura = await stripe.invoices.retrieveUpcoming({ subscription: s.id });
        amount = typeof fatura?.amount_due === 'number' ? fatura.amount_due : null;
        currency = String(fatura?.currency ?? currency);
      } catch (e) {
        warnings.push(`Próxima cobrança de ${nomeDa(c)}: ${mensagem(e)}`);
      }
    }
    upcoming.push({
      tenantId: c?.id ?? null,
      contaName: nomeDa(c),
      subscriptionId: s.id,
      status: s.status,
      date: data,
      amount,
      currency,
    });
  }
  upcoming.sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));

  // --- Receita recebida por mês (faturas pagas) ---
  const meses = lastMonths(now, REVENUE_MONTHS);
  const [anoIni = 0, mesIni = 1] = (meses[0] ?? monthKey(now)).split('-').map(Number);
  // Um dia antes do 1º dia do mês mais antigo, em UTC: o agrupamento real é
  // pelo fuso de Brasília, logo abaixo.
  const inicio = Math.floor(Date.UTC(anoIni, mesIni - 1, 1) / 1000) - 86400;
  const pagas = await listAll(
    (p) => stripe.invoices.list(p),
    { status: 'paid', created: { gte: inicio } },
    warnings,
    'Faturas pagas',
  );
  const porMes = new Map(meses.map((m) => [m, { month: m, amount: 0, invoices: 0 }]));
  const faturasPagas = new Set<string>();
  for (const f of pagas) {
    faturasPagas.add(f.id);
    const pagoEm = f?.status_transitions?.paid_at ?? f?.created;
    if (typeof pagoEm !== 'number') continue;
    const linha = porMes.get(monthKey(new Date(pagoEm * 1000)));
    if (!linha) continue;
    const valor = typeof f.amount_paid === 'number' ? f.amount_paid : 0;
    linha.amount += valor;
    if (valor > 0) linha.invoices++;
  }
  const revenueByMonth = meses.map((m) => porMes.get(m) as MonthRevenue);

  // --- Pagamentos que falharam (cobranças recusadas) ---
  const desde = Math.floor(nowMs / 1000) - FAILED_PAYMENTS_DAYS * 86400;
  const cobrancas = await listAll(
    (p) => stripe.charges.list(p),
    { created: { gte: desde } },
    warnings,
    'Cobranças',
  );
  const failedPayments: FailedPayment[] = cobrancas
    .filter((ch) => ch?.status === 'failed')
    .map((ch) => {
      const c = idDe(ch.customer) ? porCliente.get(idDe(ch.customer) as string) ?? null : null;
      const fatura = idDe(ch.invoice);
      return {
        tenantId: c?.id ?? null,
        contaName: nomeDa(c),
        chargeId: String(ch.id),
        date: isoDe(ch.created) ?? now.toISOString(),
        amount: typeof ch.amount === 'number' ? ch.amount : 0,
        currency: String(ch.currency ?? 'brl'),
        reason: ch.failure_message ?? ch.outcome?.seller_message ?? null,
        recovered: !!fatura && faturasPagas.has(fatura),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    generatedAt: now.toISOString(),
    mode,
    currency: 'brl',
    mrr,
    upcoming,
    revenueByMonth,
    failedPayments,
    legacy,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Ações antigas da aba Configurações — só leitura agora
// ---------------------------------------------------------------------------

async function transactionStats(deps: StripeAdminDeps) {
  const { stripe } = await getStripeClient(deps);
  // Stripe doesn't have an endpoint purely for aggregate stats, we must fetch charges/balance_transactions
  // For brevity and simplicity per current frontend logic
  const charges = await stripe.charges.list({ limit: 100 });
  // deno-lint-ignore no-explicit-any
  const data: any[] = charges.data;

  return {
    total_transactions: data.length,
    total_amount: data.reduce((sum, charge) => sum + charge.amount, 0),
    successful_transactions: data.filter((c) => c.status === 'succeeded').length,
    failed_transactions: data.filter((c) => c.status === 'failed').length,
    pending_transactions: data.filter((c) => c.status === 'pending').length,
    net_amount: data.reduce((sum, charge) => sum + charge.amount, 0), // Simplifying net
    total_fees: 0,
    commission_amount: 0,
    average_transaction_value: data.length ? data.reduce((sum, charge) => sum + charge.amount, 0) / data.length : 0,
  };
}

// deno-lint-ignore no-explicit-any
async function batchCommissions(deps: StripeAdminDeps, payload: any) {
  const { stripe } = await getStripeClient(deps);
  const payments = payload?.payments ?? [];

  const results = [];
  for (const payment of payments) {
    try {
      // Assume we are doing a transfer for affiliate payment
      const transfer = await stripe.transfers.create({
        amount: payment.amount,
        currency: payment.currency,
        destination: payment.affiliateId,
        description: payment.description || 'Commission Payment',
      });

      await deps.db
        .from('commission_payments')
        .update({ status: 'completed', stripe_transfer_id: transfer.id, updated_at: deps.now().toISOString() })
        .eq('id', payment.id);

      results.push({ id: payment.id, status: 'success', transferId: transfer.id });
    } catch (e: unknown) {
      await deps.db
        .from('commission_payments')
        .update({ status: 'failed', metadata: { error: (e as Error).message }, updated_at: deps.now().toISOString() })
        .eq('id', payment.id);
      results.push({ id: payment.id, status: 'error', error: (e as Error).message });
    }
  }

  return { success: true, results };
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

export async function handleStripeAdmin(
  action: unknown,
  payload: unknown,
  deps: StripeAdminDeps,
): Promise<AdminResult> {
  const nome = typeof action === 'string' ? action : '';
  const negado = authorize(nome, deps.caller);
  if (negado) return { status: negado.status, body: { error: negado.message } };

  const ok = (body: unknown): AdminResult => ({ status: 200, body });

  try {
    switch (nome as StripeAdminAction) {
      case 'get_status':
        return ok(await getStatus(deps));

      case 'billing_overview':
        return ok(await billingOverview(deps));

      // Compatibilidade com a tela antiga até o próximo deploy do site: diz se
      // a SECRET existe. Nunca lê stripe_config.
      case 'get_config': {
        const chave = deps.getEnv(STRIPE_SECRET_ENV)?.trim();
        return ok({
          configured: !!chave,
          publishableKey: null,
          environment: modeFromKey(chave) === 'live' ? 'live' : 'test',
        });
      }

      case 'save_config':
        return { status: 410, body: { error: SAVE_CONFIG_DISABLED } };

      // Só leitura: confere a secret. Não grava nada.
      case 'test_connection': {
        const { stripe } = await getStripeClient(deps);
        const account = await stripe.accounts.retrieve();
        const r = resumoDaConta(account);
        return ok({
          success: true,
          accountInfo: { id: r.id, email: r.email, country: r.country, business_profile: { name: r.name } },
        });
      }

      case 'get_account_info': {
        const { stripe } = await getStripeClient(deps);
        const r = resumoDaConta(await stripe.accounts.retrieve());
        return ok({ id: r.id, email: r.email, country: r.country, business_profile: { name: r.name } });
      }

      case 'get_balance': {
        const { stripe } = await getStripeClient(deps);
        return ok(await stripe.balance.retrieve());
      }

      case 'get_transaction_stats':
        return ok(await transactionStats(deps));

      case 'process_batch_commissions':
        return ok(await batchCommissions(deps, payload));

      case 'create_coupon':
        return ok(await createCoupon(deps, payload));

      case 'list_coupons':
        return ok(await listCoupons(deps));

      case 'archive_coupon':
        return ok(await archiveCoupon(deps, payload));

      // ---- Atendentes extras (attendant-billing.ts) ----
      case 'attendant_status':
        return ok(await attendantStatus(await attendantDeps(deps), tenantDoPayload(payload)));

      case 'set_attendant_price': {
        const p = (payload ?? {}) as { tenantId?: unknown; priceCents?: unknown; note?: unknown };
        return ok(await setAttendantPrice(await attendantDeps(deps), p.tenantId, p.priceCents, p.note));
      }

      case 'sync_attendant_item':
        return ok(await syncAttendantItem(await attendantDeps(deps), tenantDoPayload(payload)));

      case 'ensure_attendant_product': {
        const { stripe } = await getStripeClient(deps);
        const configurado = deps.getEnv(ATTENDANT_PRODUCT_ENV)?.trim() || null;
        return ok({ env: ATTENDANT_PRODUCT_ENV, ...(await ensureAttendantProduct(stripe, configurado)) });
      }

      default:
        return { status: 400, body: { error: `Unknown action: ${nome}` } };
    }
  } catch (e: unknown) {
    // Como antes: 400 com a mensagem (o dialog de cupom mostra o texto).
    const status = e instanceof AdminError || e instanceof AttendantBillingError ? e.status : 400;
    return { status, body: { error: mensagem(e) } };
  }
}

function tenantDoPayload(payload: unknown): unknown {
  return (payload as { tenantId?: unknown } | null)?.tenantId;
}

/** O Stripe da secret, o banco de serviço e o produto da secret, para attendant-billing.ts. */
async function attendantDeps(deps: StripeAdminDeps): Promise<AttendantBillingDeps> {
  const { stripe } = await getStripeClient(deps);
  return {
    stripe,
    db: deps.db,
    productId: deps.getEnv(ATTENDANT_PRODUCT_ENV)?.trim() || null,
    now: deps.now,
    actorUserId: deps.caller?.kind === 'superadmin' ? deps.caller.userId ?? null : null,
    log: deps.log,
  };
}
