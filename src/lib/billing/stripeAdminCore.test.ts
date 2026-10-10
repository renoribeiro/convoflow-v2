/**
 * stripe-admin (núcleo) — Faturamento da Administração, item 10.
 *
 * O núcleo vive em supabase/functions/_shared/stripe-admin-core.ts (roda no
 * Deno, sem importar nada do Deno). Aqui o Stripe e o banco são dublês que
 * registram cada chamada.
 *
 * Trava:
 *   1. A chave do Stripe vem SÓ da secret STRIPE_SECRET_KEY. Uma linha em
 *      stripe_config com outra chave não pode mudar nada — e a tabela nem é
 *      tocada. (O modo sabotagem do relatório faz getStripeClient ler
 *      stripe_config de novo e estes testes ficam vermelhos.)
 *   2. Salvar chave pela tela está desligado; testar a conexão não grava nada.
 *   3. Os cupons se comportam como antes (criar, listar com usos do Stripe,
 *      arquivar, desfazer no Stripe se o banco recusar).
 *   4. A Conta cuja assinatura não está nesta conta do Stripe sai em `legacy`
 *      e não entra em receita, próximas cobranças nem nada.
 */
import { describe, expect, it } from 'vitest';

import {
  BACKEND_ACTIONS,
  SAVE_CONFIG_DISABLED,
  WEBHOOK_EVENTS,
  authorize,
  handleStripeAdmin,
  lastMonths,
  monthKey,
  subscriptionMrr,
  type AdminCaller,
  type BillingOverview,
  type StripeAdminDeps,
  type StripeStatus,
} from '../../../supabase/functions/_shared/stripe-admin-core.ts';

// ---------------------------------------------------------------------------
// Banco falso (imita o encadeamento do supabase-js que o núcleo usa)
// ---------------------------------------------------------------------------

type Row = Record<string, any>;

function fakeDb(tables: Record<string, Row[]>, opts: { insertError?: { code?: string; message: string } } = {}) {
  const touched: string[] = [];
  const writes: { table: string; op: 'insert' | 'update'; payload: Row; filters: [string, unknown][] }[] = [];
  let seq = 0;

  function from(table: string) {
    touched.push(table);
    const q = {
      op: 'select' as 'select' | 'insert' | 'update',
      payload: null as Row | null,
      filters: [] as [string, unknown][],
      single: false,
      maybe: false,
    };
    const run = () => {
      const rows = tables[table] ?? (tables[table] = []);
      const match = (r: Row) => q.filters.every(([c, v]) => r[c] === v);
      if (q.op === 'insert') {
        writes.push({ table, op: 'insert', payload: q.payload as Row, filters: [] });
        if (opts.insertError) return { data: null, error: opts.insertError };
        const row = { id: `row-${++seq}`, current_uses: 0, created_at: '2026-09-29T12:00:00Z', ...(q.payload as Row) };
        rows.push(row);
        return { data: row, error: null };
      }
      if (q.op === 'update') {
        writes.push({ table, op: 'update', payload: q.payload as Row, filters: q.filters });
        for (const r of rows.filter(match)) Object.assign(r, q.payload);
        return { data: null, error: null };
      }
      const found = rows.filter(match).map((r) => ({ ...r }));
      if (q.single || q.maybe) return { data: found[0] ?? null, error: null };
      return { data: found, error: null };
    };
    const b: any = {
      select: () => b,
      order: () => b,
      limit: () => b,
      eq: (c: string, v: unknown) => {
        q.filters.push([c, v]);
        return b;
      },
      insert: (p: Row) => {
        q.op = 'insert';
        q.payload = p;
        return b;
      },
      update: (p: Row) => {
        q.op = 'update';
        q.payload = p;
        return b;
      },
      single: () => {
        q.single = true;
        return b;
      },
      maybeSingle: () => {
        q.maybe = true;
        return b;
      },
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve().then(run).then(res, rej),
    };
    return b;
  }

  return { db: { from }, touched, writes, tables };
}

// ---------------------------------------------------------------------------
// Stripe falso
// ---------------------------------------------------------------------------

function missing(what: string) {
  return Object.assign(new Error(`No such ${what}`), { code: 'resource_missing' });
}

function page<T>(data: T[]) {
  return { data, has_more: false };
}

interface World {
  account?: Row;
  prices?: Record<string, Row>;
  webhooks?: Row[];
  subscriptions?: Row[];
  upcoming?: Record<string, Row>;
  invoices?: Row[];
  charges?: Row[];
  promotionCodes?: Row[];
  promoCreateError?: Error;
}

function fakeStripe(w: World) {
  const calls: { method: string; args: unknown[] }[] = [];
  const log = (method: string, ...args: unknown[]) => calls.push({ method, args });
  let n = 0;
  const stripe = {
    accounts: {
      retrieve: async () => {
        log('accounts.retrieve');
        return w.account ?? { id: 'acct_nova', email: 'fin@convoflow.test', country: 'BR', business_profile: { name: 'ConvoFlow' } };
      },
    },
    balance: { retrieve: async () => (log('balance.retrieve'), { available: [] }) },
    prices: {
      retrieve: async (id: string, params?: unknown) => {
        log('prices.retrieve', id, params);
        const p = w.prices?.[id];
        if (!p) throw missing('price');
        return p;
      },
    },
    webhookEndpoints: { list: async (p: unknown) => (log('webhookEndpoints.list', p), page(w.webhooks ?? [])) },
    subscriptions: {
      list: async (p: unknown) => (log('subscriptions.list', p), page(w.subscriptions ?? [])),
      retrieve: async (id: string) => {
        log('subscriptions.retrieve', id);
        const s = (w.subscriptions ?? []).find((x) => x.id === id);
        if (!s) throw missing('subscription');
        return s;
      },
    },
    invoices: {
      list: async (p: unknown) => (log('invoices.list', p), page(w.invoices ?? [])),
      retrieveUpcoming: async (p: { subscription: string }) => {
        log('invoices.retrieveUpcoming', p);
        const u = w.upcoming?.[p.subscription];
        if (!u) throw new Error('no upcoming');
        return u;
      },
    },
    charges: { list: async (p: unknown) => (log('charges.list', p), page(w.charges ?? [])) },
    transfers: { create: async (p: unknown) => (log('transfers.create', p), { id: 'tr_1' }) },
    coupons: {
      create: async (p: Row) => (log('coupons.create', p), { id: `cpn_${++n}` }),
      del: async (id: string) => (log('coupons.del', id), { id, deleted: true }),
    },
    promotionCodes: {
      create: async (p: Row) => {
        log('promotionCodes.create', p);
        if (w.promoCreateError) throw w.promoCreateError;
        return { id: `promo_${++n}` };
      },
      update: async (id: string, p: Row) => (log('promotionCodes.update', id, p), { id }),
      list: async (p: unknown) => (log('promotionCodes.list', p), page(w.promotionCodes ?? [])),
    },
  };
  return { stripe, calls };
}

// ---------------------------------------------------------------------------
// Montagem
// ---------------------------------------------------------------------------

const SECRET = 'sk_live_DA_SECRET';
const TABELA = 'sk_test_DA_TABELA_STRIPE_CONFIG';
const PRICE_GERENTE = 'price_gerente_nova';
const PRICE_SLOT = 'price_slot_nova';
const NOW = new Date('2026-09-29T15:00:00Z');

function env(over: Record<string, string | undefined> = {}) {
  const base: Record<string, string | undefined> = {
    STRIPE_SECRET_KEY: SECRET,
    STRIPE_PRICE_GERENTE: PRICE_GERENTE,
    STRIPE_PRICE_STORE_SLOT: PRICE_SLOT,
    SUPABASE_URL: 'https://proj.supabase.co',
    ...over,
  };
  return (name: string) => base[name];
}

function setup(o: {
  world?: World;
  tables?: Record<string, Row[]>;
  caller?: AdminCaller;
  envOver?: Record<string, string | undefined>;
  insertError?: { code?: string; message: string };
} = {}) {
  const { stripe, calls } = fakeStripe(o.world ?? {});
  const tables = {
    // A armadilha: uma chave diferente na tabela antiga.
    stripe_config: [{ id: 'cfg', secret_key: TABELA, publishable_key: 'pk_test_x', environment: 'test' }],
    coupons: [],
    tenants: [],
    ...(o.tables ?? {}),
  };
  const db = fakeDb(tables, { insertError: o.insertError });
  const keys: string[] = [];
  const deps: StripeAdminDeps = {
    caller: o.caller === undefined ? { kind: 'superadmin' } : o.caller,
    getEnv: env(o.envOver),
    createStripe: (k) => {
      keys.push(k);
      return stripe;
    },
    db: db.db,
    now: () => NOW,
  };
  const call = (action: string, payload?: unknown) => handleStripeAdmin(action, payload ?? null, deps);
  return { call, calls, keys, db, deps };
}

// ---------------------------------------------------------------------------
// 1. Uma chave só
// ---------------------------------------------------------------------------

describe('chave do Stripe: só a secret STRIPE_SECRET_KEY', () => {
  it.each([
    ['get_status'],
    ['billing_overview'],
    ['list_coupons'],
    ['test_connection'],
    ['get_account_info'],
    ['get_balance'],
    ['get_transaction_stats'],
  ])('%s usa a secret e não toca em stripe_config', async (action) => {
    const t = setup({ world: { charges: [] } });
    const r = await t.call(action);
    expect(r.status).toBe(200);
    expect(t.keys.length).toBeGreaterThan(0);
    expect(new Set(t.keys)).toEqual(new Set([SECRET]));
    expect(t.db.touched).not.toContain('stripe_config');
  });

  it('create_coupon e archive_coupon também', async () => {
    const t = setup();
    const criado = await t.call('create_coupon', {
      code: 'X1',
      discount_type: 'percent',
      discount_value: 10,
      duration: 'once',
    });
    expect(criado.status).toBe(200);
    const id = (criado.body as any).coupon.id;
    expect((await t.call('archive_coupon', { coupon_id: id })).status).toBe(200);
    expect(new Set(t.keys)).toEqual(new Set([SECRET]));
    expect(t.db.touched).not.toContain('stripe_config');
  });

  it('sem a secret: recusa com a frase certa, mesmo com chave em stripe_config', async () => {
    const t = setup({ envOver: { STRIPE_SECRET_KEY: undefined } });
    const r = await t.call('list_coupons');
    // A lista ainda sai do banco (best-effort), mas o Stripe não é criado.
    expect(r.status).toBe(200);
    expect(t.keys).toEqual([]);

    const s = await t.call('create_coupon', { code: 'A', discount_type: 'percent', discount_value: 5 });
    expect(s.status).toBe(400);
    expect((s.body as any).error).toMatch(/STRIPE_SECRET_KEY/);
    expect(t.keys).toEqual([]);
    expect(t.db.touched).not.toContain('stripe_config');
  });

  it('get_config responde pela secret (modo live), sem ler stripe_config', async () => {
    const t = setup();
    const r = await t.call('get_config');
    expect(r.body).toEqual({ configured: true, publishableKey: null, environment: 'live' });
    expect(t.db.touched).not.toContain('stripe_config');
  });

  it('save_config está desligado e não grava nada', async () => {
    const t = setup();
    const r = await t.call('save_config', { secretKey: 'sk_live_OUTRA', publishableKey: 'pk_live_x' });
    expect(r.status).toBe(410);
    expect((r.body as any).error).toBe(SAVE_CONFIG_DISABLED);
    expect(t.db.writes).toEqual([]);
    expect(t.db.touched).toEqual([]);
  });

  it('test_connection só lê: nenhuma escrita no banco', async () => {
    const t = setup();
    const r = await t.call('test_connection');
    expect(r.body).toEqual({
      success: true,
      accountInfo: { id: 'acct_nova', email: 'fin@convoflow.test', country: 'BR', business_profile: { name: 'ConvoFlow' } },
    });
    expect(t.db.writes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. Quem pode
// ---------------------------------------------------------------------------

describe('quem pode chamar', () => {
  it('sem login: Unauthorized; login que não é superadmin: Forbidden', async () => {
    expect((await setup({ caller: null }).call('list_coupons')).body).toEqual({ error: 'Unauthorized' });
    const outro = await setup({ caller: { kind: 'other' } }).call('list_coupons');
    expect((outro.body as any).error).toMatch(/Forbidden/);
  });

  it('backend: só as ações da lista curta', () => {
    expect([...BACKEND_ACTIONS].sort()).toEqual(
      [
        'archive_coupon', 'billing_overview', 'create_coupon', 'get_status', 'list_coupons',
        // atendentes extras: só ler o estado e garantir o produto (sem dinheiro)
        'attendant_status', 'ensure_attendant_product',
      ].sort(),
    );
    for (const a of BACKEND_ACTIONS) expect(authorize(a, { kind: 'backend' })).toBeNull();
    for (const a of ['process_batch_commissions', 'get_balance', 'save_config', 'get_transaction_stats', 'test_connection', 'set_attendant_price', 'sync_attendant_item']) {
      expect(authorize(a, { kind: 'backend' })?.message).toMatch(/Forbidden/);
    }
  });

  it('backend recusado não chega ao Stripe', async () => {
    const t = setup({ caller: { kind: 'backend' } });
    const r = await t.call('process_batch_commissions', { payments: [{ id: 'p', amount: 1, currency: 'brl' }] });
    expect(r.status).toBe(400);
    expect(t.calls).toEqual([]);
  });

  it('superadmin: tudo', () => {
    for (const a of ['get_balance', 'process_batch_commissions', 'list_coupons']) {
      expect(authorize(a, { kind: 'superadmin' })).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Cupons (comportamento de antes)
// ---------------------------------------------------------------------------

describe('cupons', () => {
  it('cria Coupon + Promotion Code e grava a linha (100 %, 2 meses, 10 usos)', async () => {
    const t = setup();
    const r = await t.call('create_coupon', {
      code: 'convoflow-2meses',
      discount_type: 'percent',
      discount_value: 100,
      duration: 'repeating',
      duration_in_months: 2,
      max_uses: 10,
    });
    expect(r.status).toBe(200);
    const cupom = t.calls.find((c) => c.method === 'coupons.create')?.args[0];
    expect(cupom).toEqual({ name: 'CONVOFLOW2MESES', duration: 'repeating', percent_off: 100, duration_in_months: 2 });
    const promo = t.calls.find((c) => c.method === 'promotionCodes.create')?.args[0] as Row;
    expect(promo).toMatchObject({ code: 'CONVOFLOW2MESES', max_redemptions: 10 });
    expect(promo.expires_at).toBeUndefined();
    const insert = t.db.writes.find((w) => w.op === 'insert')?.payload;
    expect(insert).toMatchObject({
      code: 'CONVOFLOW2MESES',
      discount_type: 'percent',
      discount_value: 100,
      duration: 'repeating',
      duration_in_months: 2,
      max_uses: 10,
      valid_until: null,
      is_active: true,
    });
  });

  it('valor fixo vai em centavos, só na chamada ao Stripe', async () => {
    const t = setup();
    await t.call('create_coupon', { code: 'MENOS50', discount_type: 'amount', discount_value: 49.9, duration: 'once' });
    expect(t.calls.find((c) => c.method === 'coupons.create')?.args[0]).toEqual({
      name: 'MENOS50',
      duration: 'once',
      amount_off: 4990,
      currency: 'brl',
    });
    expect(t.db.writes.find((w) => w.op === 'insert')?.payload.discount_value).toBe(49.9);
  });

  it('banco recusou: desativa o code e apaga o Coupon no Stripe', async () => {
    const t = setup({ insertError: { code: '23505', message: 'duplicate key' } });
    const r = await t.call('create_coupon', { code: 'DUP', discount_type: 'percent', discount_value: 10 });
    expect(r.status).toBe(400);
    expect((r.body as any).error).toBe('Falha ao salvar o cupom: duplicate key');
    expect(t.calls.map((c) => c.method)).toEqual([
      'coupons.create',
      'promotionCodes.create',
      'promotionCodes.update',
      'coupons.del',
    ]);
  });

  it('code repetido no Stripe: apaga o Coupon órfão', async () => {
    const t = setup({ world: { promoCreateError: new Error('code already exists') } });
    const r = await t.call('create_coupon', { code: 'JA', discount_type: 'percent', discount_value: 10 });
    expect((r.body as any).error).toBe('code already exists');
    expect(t.calls.map((c) => c.method)).toEqual(['coupons.create', 'promotionCodes.create', 'coupons.del']);
    expect(t.db.writes).toEqual([]);
  });

  it('lista com os usos contados pelo Stripe e grava de volta', async () => {
    const t = setup({
      tables: {
        coupons: [
          { id: 'c1', code: 'A', stripe_promotion_code_id: 'promo_a', current_uses: 0 },
          { id: 'c2', code: 'B', stripe_promotion_code_id: 'promo_velho', current_uses: 0 },
        ],
      },
      world: { promotionCodes: [{ id: 'promo_a', times_redeemed: 3 }] },
    });
    const r = await t.call('list_coupons');
    const rows = r.body as Row[];
    expect(rows.find((x) => x.id === 'c1')?.current_uses).toBe(3);
    // Code de outra conta do Stripe: fica com o valor gravado.
    expect(rows.find((x) => x.id === 'c2')?.current_uses).toBe(0);
    expect(t.db.writes).toEqual([
      { table: 'coupons', op: 'update', payload: { current_uses: 3 }, filters: [['id', 'c1']] },
    ]);
  });

  it('Stripe fora: a lista ainda sai do banco', async () => {
    const t = setup({ tables: { coupons: [{ id: 'c1', code: 'A', current_uses: 1 }] } });
    (t.deps as any).createStripe = () => {
      throw new Error('rede');
    };
    const r = await t.call('list_coupons');
    expect(r.status).toBe(200);
    expect(r.body).toEqual([{ id: 'c1', code: 'A', current_uses: 1 }]);
  });

  it('arquiva: desativa o code salvo, apaga o Coupon e marca inativo', async () => {
    const t = setup({
      tables: { coupons: [{ id: 'c1', code: 'A', stripe_coupon_id: 'cpn_a', stripe_promotion_code_id: 'promo_a', is_active: true }] },
    });
    const r = await t.call('archive_coupon', { coupon_id: 'c1' });
    expect(r.body).toEqual({ success: true, warnings: [] });
    expect(t.calls.map((c) => [c.method, c.args[0]])).toEqual([
      ['promotionCodes.update', 'promo_a'],
      ['coupons.del', 'cpn_a'],
    ]);
    expect(t.db.tables.coupons?.[0]?.is_active).toBe(false);
  });

  it('arquiva linha antiga sem o id do code: varre os codes ativos do cupom', async () => {
    const t = setup({
      tables: { coupons: [{ id: 'c1', code: 'A', stripe_coupon_id: 'cpn_a', is_active: true }] },
      world: { promotionCodes: [{ id: 'promo_1' }, { id: 'promo_2' }] },
    });
    await t.call('archive_coupon', { coupon_id: 'c1' });
    expect(t.calls.find((c) => c.method === 'promotionCodes.list')?.args[0]).toEqual({ coupon: 'cpn_a', active: true, limit: 100 });
    expect(t.calls.filter((c) => c.method === 'promotionCodes.update').map((c) => c.args[0])).toEqual(['promo_1', 'promo_2']);
  });

  it('validação em pt-BR', async () => {
    const t = setup();
    expect((await t.call('create_coupon', { code: '', discount_type: 'percent', discount_value: 1 })).body).toEqual({
      error: 'Informe o código do cupom (apenas letras e números).',
    });
    expect((await t.call('create_coupon', { code: 'A', discount_type: 'percent', discount_value: 101 })).body).toEqual({
      error: 'O desconto percentual não pode passar de 100%.',
    });
    expect(
      (await t.call('create_coupon', { code: 'A', discount_type: 'percent', discount_value: 5, duration: 'repeating' })).body,
    ).toEqual({ error: 'Informe a quantidade de meses (mínimo 1) para cupons recorrentes.' });
    expect(t.calls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. Estado da conexão
// ---------------------------------------------------------------------------

describe('get_status', () => {
  const precos = {
    [PRICE_GERENTE]: { id: PRICE_GERENTE, active: true, unit_amount: 49990, currency: 'brl', recurring: { interval: 'month', interval_count: 1 }, product: { name: 'Conta Gerente' } },
    [PRICE_SLOT]: { id: PRICE_SLOT, active: true, unit_amount: 9990, currency: 'brl', recurring: { interval: 'month', interval_count: 1 }, product: { name: 'Loja extra' } },
  };

  it('conectado: conta, os dois preços e o webhook com os 6 eventos', async () => {
    const t = setup({
      world: {
        prices: precos,
        webhooks: [
          { id: 'we_1', url: 'https://outro.site/hook', status: 'enabled', enabled_events: ['*'] },
          { id: 'we_2', url: 'https://proj.supabase.co/functions/v1/stripe-webhook', status: 'enabled', enabled_events: [...WEBHOOK_EVENTS] },
        ],
      },
    });
    const s = (await t.call('get_status')).body as StripeStatus;
    expect(s.connected).toBe(true);
    expect(s.mode).toBe('live');
    expect(s.account).toEqual({ id: 'acct_nova', name: 'ConvoFlow', email: 'fin@convoflow.test', country: 'BR' });
    expect(s.prices.gerente).toMatchObject({ found: true, id: PRICE_GERENTE, unitAmount: 49990, interval: 'month', productName: 'Conta Gerente', error: null });
    expect(s.prices.storeSlot).toMatchObject({ found: true, unitAmount: 9990 });
    expect(s.webhook).toMatchObject({ url: 'https://proj.supabase.co/functions/v1/stripe-webhook', found: true, enabled: true, missingEvents: [] });
    expect(s.webhook.expectedEvents).toEqual([...WEBHOOK_EVENTS]);
    expect(t.db.writes).toEqual([]);
  });

  it('preço de outra conta do Stripe e webhook sem 2 eventos: aparece como problema', async () => {
    const t = setup({
      world: {
        prices: { [PRICE_GERENTE]: precos[PRICE_GERENTE] },
        webhooks: [
          {
            id: 'we_2',
            url: 'https://proj.supabase.co/functions/v1/stripe-webhook',
            status: 'disabled',
            enabled_events: ['checkout.session.completed', 'invoice.payment_succeeded', 'customer.subscription.deleted', 'invoice.payment_failed'],
          },
        ],
      },
    });
    const s = (await t.call('get_status')).body as StripeStatus;
    expect(s.prices.storeSlot.found).toBe(false);
    expect(s.prices.storeSlot.error).toBe('O preço de STRIPE_PRICE_STORE_SLOT não existe na conta do Stripe conectada.');
    expect(s.webhook.enabled).toBe(false);
    expect(s.webhook.missingEvents).toEqual(['customer.subscription.created', 'customer.subscription.updated']);
  });

  it('sem webhook para o nosso endereço', async () => {
    const t = setup({ world: { prices: precos, webhooks: [] } });
    const s = (await t.call('get_status')).body as StripeStatus;
    expect(s.webhook.found).toBe(false);
    expect(s.webhook.missingEvents).toEqual([...WEBHOOK_EVENTS]);
  });

  it('sem a secret: não conectado, com a frase', async () => {
    const t = setup({ envOver: { STRIPE_SECRET_KEY: undefined } });
    const s = (await t.call('get_status')).body as StripeStatus;
    expect(s).toMatchObject({ secretConfigured: false, connected: false });
    expect(s.error).toMatch(/STRIPE_SECRET_KEY/);
  });

  it('chave recusada pelo Stripe: não conectado', async () => {
    const t = setup();
    (t.deps as any).createStripe = () => ({
      accounts: {
        retrieve: async () => {
          throw new Error('Invalid API Key provided');
        },
      },
    });
    const s = (await t.call('get_status')).body as StripeStatus;
    expect(s).toMatchObject({ secretConfigured: true, connected: false });
    expect(s.error).toBe('A chave não conectou ao Stripe: Invalid API Key provided');
  });
});

// ---------------------------------------------------------------------------
// 5. Números ao vivo
// ---------------------------------------------------------------------------

const unix = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

function sub(id: string, o: Row = {}): Row {
  return {
    id,
    status: 'active',
    customer: `cus_${id}`,
    currency: 'brl',
    metadata: {},
    cancel_at_period_end: false,
    cancel_at: null,
    current_period_end: unix('2026-10-15T12:00:00Z'),
    items: { data: [{ price: { id: PRICE_GERENTE, unit_amount: 49990, recurring: { interval: 'month', interval_count: 1 } }, quantity: 1 }] },
    discount: null,
    ...o,
  };
}

describe('subscriptionMrr', () => {
  const precos = { gerente: PRICE_GERENTE, storeSlot: PRICE_SLOT };

  it('plano + 2 lojas extras, sem desconto', () => {
    const s = sub('a', {
      items: {
        data: [
          { price: { id: PRICE_GERENTE, unit_amount: 49990, recurring: { interval: 'month' } }, quantity: 1 },
          { price: { id: PRICE_SLOT, unit_amount: 9990, recurring: { interval: 'month' } }, quantity: 2 },
        ],
      },
    });
    expect(subscriptionMrr(s, precos, NOW.getTime())).toMatchObject({ plan: 49990, extraStores: 19980, gross: 69970, discounts: 0, net: 69970 });
  });

  it('cupom de 100 % em vigor zera; vencido não conta', () => {
    const vigente = sub('a', { discount: { coupon: { percent_off: 100 }, start: unix('2026-09-08T00:00:00Z'), end: unix('2026-11-08T00:00:00Z') } });
    expect(subscriptionMrr(vigente, precos, NOW.getTime()).net).toBe(0);
    const vencido = sub('b', { discount: { coupon: { percent_off: 100 }, start: unix('2026-06-01T00:00:00Z'), end: unix('2026-08-01T00:00:00Z') } });
    expect(subscriptionMrr(vencido, precos, NOW.getTime()).net).toBe(49990);
  });

  it('valor fixo desconta por mês e não passa de zero', () => {
    expect(subscriptionMrr(sub('a', { discount: { coupon: { amount_off: 10000 } } }), precos, NOW.getTime()).net).toBe(39990);
    expect(subscriptionMrr(sub('b', { discount: { coupon: { amount_off: 900000 } } }), precos, NOW.getTime()).net).toBe(0);
  });

  it('anual vira mensal', () => {
    const s = sub('a', { items: { data: [{ price: { id: 'price_anual', unit_amount: 120000, recurring: { interval: 'year' } }, quantity: 1 }] } });
    expect(subscriptionMrr(s, precos, NOW.getTime())).toMatchObject({ other: 10000, net: 10000 });
  });
});

describe('meses no fuso de Brasília', () => {
  it('1º de setembro às 02:00 UTC ainda é agosto em Brasília', () => {
    expect(monthKey(new Date('2026-09-01T02:00:00Z'))).toBe('2026-08');
    expect(monthKey(new Date('2026-09-01T03:00:00Z'))).toBe('2026-09');
  });
  it('12 meses até o atual', () => {
    const m = lastMonths(NOW, 12);
    expect(m).toHaveLength(12);
    expect(m[0]).toBe('2025-10');
    expect(m[11]).toBe('2026-09');
  });
});

describe('billing_overview', () => {
  const CONTAS = [
    { id: 't-pago', name: 'Pagante Ltda', kind: 'account', subscription_id: 'sub_pago', subscription_status: 'active', stripe_customer_id: 'cus_sub_pago' },
    { id: 't-teste', name: 'Em Teste SA', kind: 'account', subscription_id: 'sub_teste', subscription_status: 'trialing', stripe_customer_id: null },
    { id: 't-cancela', name: 'Vai Cancelar', kind: 'account', subscription_id: 'sub_cancela', subscription_status: 'active', stripe_customer_id: null },
    { id: 't-antiga', name: 'OTAVIO PRADO', kind: 'account', subscription_id: 'sub_da_conta_antiga', subscription_status: 'active', stripe_customer_id: null },
    { id: 't-manual', name: 'Liberada à mão', kind: 'account', subscription_id: null, subscription_status: null, stripe_customer_id: null },
    { id: 'loja', name: 'Uma Loja', kind: 'store', subscription_id: 'sub_loja_fantasma', subscription_status: 'active', stripe_customer_id: null },
  ];

  function mundo(): World {
    return {
      subscriptions: [
        sub('sub_pago', {
          items: {
            data: [
              { price: { id: PRICE_GERENTE, unit_amount: 49990, recurring: { interval: 'month' } }, quantity: 1 },
              { price: { id: PRICE_SLOT, unit_amount: 9990, recurring: { interval: 'month' } }, quantity: 2 },
            ],
          },
          discount: { coupon: { percent_off: 50 }, end: unix('2026-12-01T00:00:00Z') },
        }),
        sub('sub_teste', { status: 'trialing', trial_end: unix('2026-10-03T12:00:00Z'), metadata: { tenant_id: 't-teste' } }),
        sub('sub_cancela', { cancel_at_period_end: true, current_period_end: unix('2026-10-01T12:00:00Z'), metadata: { tenant_id: 't-cancela' } }),
        sub('sub_morta', { status: 'canceled', metadata: { tenant_id: 't-manual' } }),
      ],
      upcoming: {
        sub_pago: { amount_due: 34985, currency: 'brl' },
        sub_teste: { amount_due: 49990, currency: 'brl' },
      },
      invoices: [
        { id: 'in_1', amount_paid: 49990, status_transitions: { paid_at: unix('2026-09-10T12:00:00Z') } },
        { id: 'in_2', amount_paid: 0, status_transitions: { paid_at: unix('2026-09-12T12:00:00Z') } },
        { id: 'in_3', amount_paid: 9990, status_transitions: { paid_at: unix('2026-09-01T02:00:00Z') } },
      ],
      charges: [
        { id: 'ch_ok', status: 'succeeded', amount: 49990, customer: 'cus_sub_pago', created: unix('2026-09-10T12:00:00Z') },
        { id: 'ch_falha', status: 'failed', amount: 49990, currency: 'brl', customer: 'cus_sub_pago', invoice: 'in_1', created: unix('2026-09-09T12:00:00Z'), failure_message: 'Cartão recusado' },
        { id: 'ch_falha2', status: 'failed', amount: 9990, currency: 'brl', customer: 'cus_desconhecido', invoice: 'in_x', created: unix('2026-09-20T12:00:00Z'), outcome: { seller_message: 'Saldo insuficiente' } },
      ],
    };
  }

  it('Conta da conta antiga sai em legacy e fica fora de todo número do Stripe', async () => {
    const t = setup({ tables: { tenants: CONTAS.map((c) => ({ ...c })) }, world: mundo() });
    const o = (await t.call('billing_overview')).body as BillingOverview;

    expect(o.legacy).toEqual([
      { tenantId: 't-antiga', contaName: 'OTAVIO PRADO', subscriptionId: 'sub_da_conta_antiga', subscriptionStatus: 'active' },
    ]);
    // Confirmou uma a uma antes de rotular.
    expect(t.calls.some((c) => c.method === 'subscriptions.retrieve' && c.args[0] === 'sub_da_conta_antiga')).toBe(true);
    // Loja nunca é lida como assinante.
    expect(t.db.writes).toEqual([]);

    const tudo = JSON.stringify({ mrr: o.mrr, upcoming: o.upcoming, failed: o.failedPayments, revenue: o.revenueByMonth });
    expect(tudo).not.toContain('t-antiga');
    expect(tudo).not.toContain('OTAVIO');
    expect(tudo).not.toContain('sub_da_conta_antiga');
  });

  it('receita mensal: plano, lojas extras e cupom; teste e cancelada fora', async () => {
    const t = setup({ tables: { tenants: CONTAS.map((c) => ({ ...c })) }, world: mundo() });
    const o = (await t.call('billing_overview')).body as BillingOverview;
    // sub_pago: (49990 + 2×9990) × 50 % = 34985; sub_cancela ainda paga até o fim: 49990.
    expect(o.mrr).toEqual({
      subscriptions: 2,
      plan: 99980,
      extraStores: 19980,
      extraAttendants: 0,
      other: 0,
      gross: 119960,
      discounts: 34985,
      net: 84975,
    });
  });

  it('próximas cobranças: por data, com o valor da fatura seguinte, sem quem vai cancelar', async () => {
    const t = setup({ tables: { tenants: CONTAS.map((c) => ({ ...c })) }, world: mundo() });
    const o = (await t.call('billing_overview')).body as BillingOverview;
    expect(o.upcoming.map((u) => [u.contaName, u.status, u.date, u.amount])).toEqual([
      ['Em Teste SA', 'trialing', '2026-10-03T12:00:00.000Z', 49990],
      ['Pagante Ltda', 'active', '2026-10-15T12:00:00.000Z', 34985],
    ]);
  });

  it('receita por mês no fuso de Brasília, 12 meses', async () => {
    const t = setup({ tables: { tenants: CONTAS.map((c) => ({ ...c })) }, world: mundo() });
    const o = (await t.call('billing_overview')).body as BillingOverview;
    expect(o.revenueByMonth).toHaveLength(12);
    expect(o.revenueByMonth.at(-1)).toEqual({ month: '2026-09', amount: 49990, invoices: 1 });
    expect(o.revenueByMonth.at(-2)).toEqual({ month: '2026-08', amount: 9990, invoices: 1 });
  });

  it('pagamentos que falharam: mais recentes primeiro, com a Conta e se foi recuperado', async () => {
    const t = setup({ tables: { tenants: CONTAS.map((c) => ({ ...c })) }, world: mundo() });
    const o = (await t.call('billing_overview')).body as BillingOverview;
    expect(o.failedPayments).toEqual([
      { tenantId: null, contaName: 'Sem Conta no ConvoFlow', chargeId: 'ch_falha2', date: '2026-09-20T12:00:00.000Z', amount: 9990, currency: 'brl', reason: 'Saldo insuficiente', recovered: false },
      { tenantId: 't-pago', contaName: 'Pagante Ltda', chargeId: 'ch_falha', date: '2026-09-09T12:00:00.000Z', amount: 49990, currency: 'brl', reason: 'Cartão recusado', recovered: true },
    ]);
  });

  it('sem assinatura nenhuma nesta conta: zeros, e a Conta antiga continua separada', async () => {
    const t = setup({ tables: { tenants: CONTAS.map((c) => ({ ...c })) }, world: {} });
    const o = (await t.call('billing_overview')).body as BillingOverview;
    expect(o.mrr.net).toBe(0);
    expect(o.upcoming).toEqual([]);
    expect(o.failedPayments).toEqual([]);
    expect(o.legacy.map((l) => l.contaName).sort()).toEqual(['Em Teste SA', 'OTAVIO PRADO', 'Pagante Ltda', 'Vai Cancelar'].sort());
  });
});
