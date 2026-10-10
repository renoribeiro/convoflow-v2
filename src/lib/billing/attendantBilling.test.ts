/**
 * Cobrança dos atendentes extras (limite por Loja, entrega 2).
 *
 * O núcleo vive em supabase/functions/_shared/attendant-billing.ts (roda no
 * Deno, sem importar nada do Deno). Aqui o Stripe e o banco são dublês que
 * registram cada chamada.
 *
 * Trava:
 *   1. O item é reconhecido pelo PRODUTO "Atendente extra", nunca pelo preço, e
 *      o item de Loja extra (e o do plano) nunca é tocado. (O modo sabotagem do
 *      relatório faz o webhook contar os atendentes pelo preço de Loja extra, e
 *      os testes do webhook ficam vermelhos.)
 *   2. Criar, mudar a quantidade e remover o item, com proporcional na próxima
 *      fatura; trocar o preço sem proporcional.
 *   3. Teste grátis, Conta com acesso manual, assinatura na conta antiga,
 *      pagamento pendente, sem preço, sem produto configurado.
 *   4. Checkout leva o item quando a Conta já tem vagas extras.
 *   5. O webhook grava atendentes_extra_cobrados.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  PRICE_SWAP_PRORATION,
  QUANTITY_PRORATION,
  attendantQuantityFromSubscription,
  attendantStatus,
  chargedAttendants,
  checkAttendantPrice,
  decideCheckoutAttendants,
  ensureAttendantProduct,
  findAttendantItems,
  isAttendantItem,
  planAttendantItem,
  productIdOf,
  setAttendantPrice,
  syncAttendantItem,
  validatePriceCents,
  type AttendantBillingDeps,
} from '../../../supabase/functions/_shared/attendant-billing.ts';
import { syncSubscriptionFromEvent } from '../../../supabase/functions/_shared/stripe-webhook-sync.ts';
import { subscriptionMrr } from '../../../supabase/functions/_shared/stripe-admin-core.ts';

// ---------------------------------------------------------------------------
// Ids inventados (regra de dado pessoal: Stripe com FAKE, UUID óbvio)
// ---------------------------------------------------------------------------

const PRODUTO = 'prod_FAKEatendente';
const PRODUTO_LOJA = 'prod_FAKElojaextra';
const PRECO_PLANO = 'price_FAKEplano';
const PRECO_LOJA = 'price_FAKElojaextra';
const CONTA = 'aaaaaaaa-0000-4000-8000-000000000001';
const OUTRA = 'aaaaaaaa-0000-4000-8000-000000000002';
const LOJA_1 = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const LOJA_2 = 'aaaaaaaa-0000-4000-8000-0000000000a2';
const SUB = 'sub_FAKEconta';
const ATOR = 'aaaaaaaa-0000-4000-8000-0000000000ff';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

function preco(id: string, product: string, unit: number, tenant: string | null = CONTA, extra: Record<string, unknown> = {}) {
  return {
    id,
    product,
    active: true,
    currency: 'brl',
    unit_amount: unit,
    recurring: { interval: 'month', interval_count: 1 },
    metadata: tenant ? { tenant_id: tenant, convoflow_kind: 'atendente_extra' } : {},
    ...extra,
  };
}

const PRECO_CONTA = preco('price_FAKEatendenteConta', PRODUTO, 4990);
const PLANO = preco(PRECO_PLANO, 'prod_FAKEplano', 49990, null);
const LOJA_EXTRA = preco(PRECO_LOJA, PRODUTO_LOJA, 9990, null);

function assinatura(status: string, itens: Array<{ id: string; quantity: number; price: Record<string, unknown> }>, tenant = CONTA) {
  return { id: SUB, status, metadata: { tenant_id: tenant }, items: { data: itens } };
}
const itemPlano = () => ({ id: 'si_FAKEplano', quantity: 1, price: clone(PLANO) });
const itemLoja = (q = 2) => ({ id: 'si_FAKElojaextra', quantity: q, price: clone(LOJA_EXTRA) });
const itemAtendente = (q: number, price = PRECO_CONTA, id = 'si_FAKEatendente') => ({ id, quantity: q, price: clone(price) });

// ---------------------------------------------------------------------------
// Stripe falso
// ---------------------------------------------------------------------------

function missing(what: string) {
  return Object.assign(new Error(`No such ${what}`), { code: 'resource_missing' });
}

type Mundo = { subs: Record<string, any>; prices: Record<string, any>; products: any[] };

function fakeStripe(mundo: Mundo) {
  const calls: Array<[string, ...unknown[]]> = [];
  let seq = 0;
  const acharItem = (id: string) => {
    for (const s of Object.values(mundo.subs)) {
      const i = s.items.data.find((x: any) => x.id === id);
      if (i) return { s, i };
    }
    throw missing(`subscription item ${id}`);
  };
  const stripe = {
    subscriptions: {
      retrieve: async (id: string) => {
        calls.push(['subscriptions.retrieve', id]);
        const s = mundo.subs[id];
        if (!s) throw missing(`subscription ${id}`);
        return clone(s);
      },
    },
    subscriptionItems: {
      create: async (p: any) => {
        calls.push(['items.create', clone(p)]);
        const s = mundo.subs[p.subscription];
        const item = { id: `si_FAKEnovo${++seq}`, quantity: p.quantity, price: clone(mundo.prices[p.price]) };
        s.items.data.push(item);
        return clone(item);
      },
      update: async (id: string, p: any) => {
        calls.push(['items.update', id, clone(p)]);
        const { i } = acharItem(id);
        if (typeof p.quantity === 'number') i.quantity = p.quantity;
        if (p.price) i.price = clone(mundo.prices[p.price]);
        return clone(i);
      },
      del: async (id: string, p: any) => {
        calls.push(['items.del', id, clone(p)]);
        const { s } = acharItem(id);
        s.items.data = s.items.data.filter((x: any) => x.id !== id);
        return { id, deleted: true };
      },
    },
    prices: {
      retrieve: async (id: string) => {
        calls.push(['prices.retrieve', id]);
        const p = mundo.prices[id];
        if (!p) throw missing(`price ${id}`);
        return clone(p);
      },
      create: async (p: any) => {
        calls.push(['prices.create', clone(p)]);
        const id = `price_FAKEnovo${++seq}`;
        mundo.prices[id] = {
          id,
          product: p.product,
          active: true,
          currency: p.currency,
          unit_amount: p.unit_amount,
          recurring: { interval: p.recurring.interval, interval_count: 1 },
          metadata: p.metadata,
        };
        return clone(mundo.prices[id]);
      },
      update: async (id: string, p: any) => {
        calls.push(['prices.update', id, clone(p)]);
        Object.assign(mundo.prices[id], p);
        return clone(mundo.prices[id]);
      },
    },
    products: {
      retrieve: async (id: string) => {
        calls.push(['products.retrieve', id]);
        const p = mundo.products.find((x) => x.id === id);
        if (!p) throw missing(`product ${id}`);
        return clone(p);
      },
      list: async () => {
        calls.push(['products.list']);
        return { data: clone(mundo.products), has_more: false };
      },
      create: async (p: any) => {
        calls.push(['products.create', clone(p)]);
        const novo = { id: `prod_FAKEnovo${++seq}`, active: true, ...p };
        mundo.products.push(novo);
        return clone(novo);
      },
    },
  };
  /** Toda chamada que mexeu em item de assinatura. */
  const escritasEmItem = () => calls.filter(([n]) => n.startsWith('items.'));
  return { stripe, calls, escritasEmItem };
}

// ---------------------------------------------------------------------------
// Banco falso
// ---------------------------------------------------------------------------

type Row = Record<string, any>;

function fakeDb(tables: Record<string, Row[]>) {
  const writes: Array<{ table: string; op: 'insert' | 'update'; payload: Row; filters: [string, unknown][] }> = [];
  function from(table: string) {
    const q = { op: 'select' as 'select' | 'insert' | 'update', payload: null as Row | null, filters: [] as [string, unknown][], one: false };
    const run = () => {
      const rows = tables[table] ?? (tables[table] = []);
      const casa = (r: Row) => q.filters.every(([c, v]) => r[c] === v);
      if (q.op === 'insert') {
        writes.push({ table, op: 'insert', payload: q.payload as Row, filters: [] });
        rows.push({ ...(q.payload as Row) });
        return { data: null, error: null };
      }
      if (q.op === 'update') {
        writes.push({ table, op: 'update', payload: q.payload as Row, filters: q.filters });
        for (const r of rows.filter(casa)) Object.assign(r, q.payload);
        return { data: null, error: null };
      }
      const achados = rows.filter(casa).map((r) => ({ ...r }));
      return { data: q.one ? achados[0] ?? null : achados, error: null };
    };
    const b: any = {
      select: () => b,
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
      maybeSingle: () => {
        q.one = true;
        return b;
      },
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve().then(run).then(res, rej),
    };
    return b;
  }
  return { db: { from }, writes, tables };
}

function conta(o: Row = {}): Row {
  return {
    id: CONTA,
    name: 'Conta Exemplo',
    kind: 'account',
    subscription_id: SUB,
    subscription_status: 'active',
    manual_access_granted: false,
    atendente_extra_preco_centavos: 4990,
    atendente_extra_price_id: PRECO_CONTA.id,
    atendentes_extra_cobrados: null,
    ...o,
  };
}
const loja = (id: string, extra: number, pai = CONTA): Row => ({ id, kind: 'store', parent_tenant_id: pai, atendentes_extra: extra });

function montar(opts: {
  conta?: Row;
  lojas?: Row[];
  sub?: Record<string, any> | null;
  productId?: string | null;
  prices?: Record<string, any>;
}) {
  const mundo: Mundo = {
    subs: opts.sub ? { [SUB]: clone(opts.sub) } : {},
    prices: { [PRECO_CONTA.id]: clone(PRECO_CONTA), [PRECO_PLANO]: clone(PLANO), [PRECO_LOJA]: clone(LOJA_EXTRA), ...(opts.prices ?? {}) },
    products: [{ id: PRODUTO, name: 'Atendente extra', active: true, metadata: { convoflow_kind: 'atendente_extra' } }],
  };
  const st = fakeStripe(mundo);
  const banco = fakeDb({ tenants: [opts.conta ?? conta(), ...(opts.lojas ?? [loja(LOJA_1, 2), loja(LOJA_2, 1), loja('aaaaaaaa-0000-4000-8000-0000000000b1', 5, OUTRA)])] });
  const deps: AttendantBillingDeps = {
    stripe: st.stripe,
    db: banco.db,
    productId: opts.productId === undefined ? PRODUTO : opts.productId,
    now: () => new Date('2026-10-10T12:00:00Z'),
    actorUserId: ATOR,
  };
  const contaNoBanco = () => (banco.tables.tenants ?? []).find((r) => r.id === CONTA) as Row;
  return { deps, mundo, ...st, ...banco, contaNoBanco };
}

/** Nenhuma chamada de item tocou o item do plano ou o de Loja extra. */
function naoTocouPlanoNemLoja(chamadas: Array<[string, ...unknown[]]>) {
  for (const [nome, a, b] of chamadas) {
    if (!nome.startsWith('items.')) continue;
    expect(a).not.toBe('si_FAKElojaextra');
    expect(a).not.toBe('si_FAKEplano');
    expect(JSON.stringify([a, b])).not.toContain(PRECO_LOJA);
    expect(JSON.stringify([a, b])).not.toContain(PRECO_PLANO);
  }
}

// ---------------------------------------------------------------------------
// 1. Reconhecimento pelo produto
// ---------------------------------------------------------------------------

describe('o item é reconhecido pelo PRODUTO, nunca pelo preço', () => {
  it('produto vem como id ou expandido', () => {
    expect(productIdOf({ product: PRODUTO })).toBe(PRODUTO);
    expect(productIdOf({ product: { id: PRODUTO } })).toBe(PRODUTO);
    expect(productIdOf({ product: null })).toBeNull();
  });

  it('item de Loja extra e do plano não são de atendente', () => {
    expect(isAttendantItem(itemLoja(), PRODUTO)).toBe(false);
    expect(isAttendantItem(itemPlano(), PRODUTO)).toBe(false);
    expect(isAttendantItem(itemAtendente(3), PRODUTO)).toBe(true);
    // Sem produto configurado, nada é de atendente.
    expect(isAttendantItem(itemAtendente(3), null)).toBe(false);
  });

  it('qualquer preço do produto conta (cada Conta tem o seu)', () => {
    const outroPreco = preco('price_FAKEoutraConta', PRODUTO, 3990, OUTRA);
    const s = assinatura('active', [itemPlano(), itemLoja(2), itemAtendente(3, outroPreco)]);
    expect(findAttendantItems(s, PRODUTO).map((i) => i.id)).toEqual(['si_FAKEatendente']);
    expect(attendantQuantityFromSubscription(s, PRODUTO)).toBe(3);
  });

  it('cobrados: teste conta, cancelada é zero, sem produto não mexe', () => {
    expect(chargedAttendants(assinatura('trialing', [itemPlano(), itemLoja(2), itemAtendente(3)]), PRODUTO)).toBe(3);
    expect(chargedAttendants(assinatura('past_due', [itemAtendente(3)]), PRODUTO)).toBe(3);
    expect(chargedAttendants(assinatura('canceled', [itemAtendente(3)]), PRODUTO)).toBe(0);
    expect(chargedAttendants(assinatura('active', [itemAtendente(3)]), null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. O plano de operações
// ---------------------------------------------------------------------------

describe('planAttendantItem', () => {
  const base = () => [itemPlano(), itemLoja(2)];

  it('sem item → cria, proporcional na próxima fatura', () => {
    expect(planAttendantItem(assinatura('active', base()), PRODUTO, PRECO_CONTA.id, 3)).toEqual([
      { op: 'create', price: PRECO_CONTA.id, quantity: 3, proration: 'create_prorations' },
    ]);
  });

  it('com item → muda a quantidade, proporcional', () => {
    expect(planAttendantItem(assinatura('active', [...base(), itemAtendente(1)]), PRODUTO, PRECO_CONTA.id, 3)).toEqual([
      { op: 'set_quantity', itemId: 'si_FAKEatendente', quantity: 3, proration: QUANTITY_PRORATION },
    ]);
  });

  it('desejado 0 → remove o item; sem item → nada', () => {
    expect(planAttendantItem(assinatura('active', [...base(), itemAtendente(2)]), PRODUTO, PRECO_CONTA.id, 0)).toEqual([
      { op: 'delete', itemId: 'si_FAKEatendente', proration: 'create_prorations' },
    ]);
    expect(planAttendantItem(assinatura('active', base()), PRODUTO, null, 0)).toEqual([]);
  });

  it('mesma quantidade e mesmo preço → nada', () => {
    expect(planAttendantItem(assinatura('active', [...base(), itemAtendente(3)]), PRODUTO, PRECO_CONTA.id, 3)).toEqual([]);
  });

  it('preço da Conta mudou → troca o preço SEM proporcional', () => {
    const antigo = preco('price_FAKEantigo', PRODUTO, 3990);
    expect(planAttendantItem(assinatura('active', [...base(), itemAtendente(3, antigo)]), PRODUTO, PRECO_CONTA.id, 3)).toEqual([
      { op: 'swap_price', itemId: 'si_FAKEatendente', price: PRECO_CONTA.id, proration: PRICE_SWAP_PRORATION },
    ]);
    expect(PRICE_SWAP_PRORATION).toBe('none');
  });

  it('item duplicado → fica um só', () => {
    const ops = planAttendantItem(
      assinatura('active', [...base(), itemAtendente(1, PRECO_CONTA, 'si_FAKEa'), itemAtendente(1, PRECO_CONTA, 'si_FAKEb')]),
      PRODUTO,
      PRECO_CONTA.id,
      2,
    );
    expect(ops).toEqual([
      { op: 'set_quantity', itemId: 'si_FAKEa', quantity: 2, proration: 'create_prorations' },
      { op: 'delete', itemId: 'si_FAKEb', proration: 'create_prorations' },
    ]);
  });

  it('nunca gera operação no item do plano nem no de Loja extra', () => {
    for (const desejado of [0, 1, 5]) {
      for (const itens of [base(), [...base(), itemAtendente(2)]]) {
        const ops = planAttendantItem(assinatura('active', itens), PRODUTO, PRECO_CONTA.id, desejado);
        for (const o of ops) {
          if ('itemId' in o) expect(['si_FAKElojaextra', 'si_FAKEplano']).not.toContain(o.itemId);
          if ('price' in o) expect([PRECO_LOJA, PRECO_PLANO]).not.toContain(o.price);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Preço
// ---------------------------------------------------------------------------

describe('preço da Conta', () => {
  it('faixa de R$ 1,00 a R$ 1.000,00, inteiro em centavos', () => {
    expect(validatePriceCents(4990)).toEqual({ ok: true, value: 4990 });
    expect(validatePriceCents('100')).toEqual({ ok: true, value: 100 });
    expect(validatePriceCents(99).ok).toBe(false);
    expect(validatePriceCents(100001).ok).toBe(false);
    expect(validatePriceCents(49.9).ok).toBe(false);
    expect(validatePriceCents(null).ok).toBe(false);
  });

  it('o preço salvo precisa ser do produto, ativo, em reais, mensal e desta Conta', () => {
    expect(checkAttendantPrice(PRECO_CONTA, PRODUTO, CONTA)).toBeNull();
    expect(checkAttendantPrice(LOJA_EXTRA, PRODUTO, CONTA)).toMatch(/não é do produto/);
    expect(checkAttendantPrice({ ...PRECO_CONTA, active: false }, PRODUTO, CONTA)).toMatch(/arquivado/);
    expect(checkAttendantPrice({ ...PRECO_CONTA, currency: 'usd' }, PRODUTO, CONTA)).toMatch(/reais/);
    expect(checkAttendantPrice({ ...PRECO_CONTA, recurring: { interval: 'year' } }, PRODUTO, CONTA)).toMatch(/mensal/);
    expect(checkAttendantPrice(PRECO_CONTA, PRODUTO, OUTRA)).toMatch(/outra Conta/);
    expect(checkAttendantPrice(null, PRODUTO, CONTA)).toMatch(/não existe/);
  });
});

// ---------------------------------------------------------------------------
// 4. Sincronizar a assinatura
// ---------------------------------------------------------------------------

describe('syncAttendantItem', () => {
  it('assinatura ativa sem item → cria com a soma das Lojas, ao preço da Conta, e grava cobrados', async () => {
    const t = montar({ sub: assinatura('active', [itemPlano(), itemLoja(2)]) });
    const r = await syncAttendantItem(t.deps, CONTA);
    expect(r.state).toBe('synced');
    expect(r.concedidos).toBe(3);
    expect(r.cobrados).toBe(3);
    expect(r.message).toMatch(/proporcional na próxima fatura/);
    expect(t.escritasEmItem()).toEqual([
      ['items.create', { subscription: SUB, price: PRECO_CONTA.id, quantity: 3, proration_behavior: 'create_prorations' }],
    ]);
    expect(t.contaNoBanco().atendentes_extra_cobrados).toBe(3);
    // O item de Loja extra continua igual.
    expect(t.mundo.subs[SUB].items.data.find((i: any) => i.id === 'si_FAKElojaextra').quantity).toBe(2);
    naoTocouPlanoNemLoja(t.calls);
  });

  it('teste grátis → cria igual (o Stripe não cobra até o fim do teste) e diz isso', async () => {
    const t = montar({ sub: assinatura('trialing', [itemPlano()]) });
    const r = await syncAttendantItem(t.deps, CONTA);
    expect(r.state).toBe('synced');
    expect(r.subscriptionStatus).toBe('trialing');
    expect(r.message).toMatch(/No teste grátis nada é cobrado/);
    expect(t.escritasEmItem()).toHaveLength(1);
    expect(t.escritasEmItem()[0]?.[1]).toMatchObject({ proration_behavior: 'create_prorations', quantity: 3 });
  });

  it('mais vagas → muda a quantidade, proporcional', async () => {
    const t = montar({ sub: assinatura('active', [itemPlano(), itemLoja(2), itemAtendente(1)]) });
    await syncAttendantItem(t.deps, CONTA);
    expect(t.escritasEmItem()).toEqual([
      ['items.update', 'si_FAKEatendente', { quantity: 3, proration_behavior: 'create_prorations' }],
    ]);
    naoTocouPlanoNemLoja(t.calls);
  });

  it('vagas zeradas → remove o item, proporcional (crédito na próxima fatura)', async () => {
    const t = montar({
      sub: assinatura('active', [itemPlano(), itemLoja(2), itemAtendente(3)]),
      lojas: [loja(LOJA_1, 0), loja(LOJA_2, 0)],
    });
    const r = await syncAttendantItem(t.deps, CONTA);
    expect(t.escritasEmItem()).toEqual([['items.del', 'si_FAKEatendente', { proration_behavior: 'create_prorations' }]]);
    expect(r.cobrados).toBe(0);
    expect(t.contaNoBanco().atendentes_extra_cobrados).toBe(0);
    expect(t.mundo.subs[SUB].items.data.map((i: any) => i.id)).toEqual(['si_FAKEplano', 'si_FAKElojaextra']);
  });

  it('já em dia → não chama o Stripe para escrever', async () => {
    const t = montar({ sub: assinatura('active', [itemPlano(), itemAtendente(3)]) });
    const r = await syncAttendantItem(t.deps, CONTA);
    expect(r.state).toBe('synced');
    expect(t.escritasEmItem()).toEqual([]);
  });

  it('Conta com acesso manual, sem assinatura → nada no Stripe, sem cobrança', async () => {
    const t = montar({ conta: conta({ subscription_id: null, subscription_status: null, manual_access_granted: true }), sub: null });
    const r = await syncAttendantItem(t.deps, CONTA);
    expect(r.state).toBe('no_subscription');
    expect(r.message).toMatch(/sem cobrança/);
    expect(t.calls).toEqual([]);
    expect(t.writes).toEqual([]);
  });

  it('assinatura na conta antiga do Stripe → não toca em nada', async () => {
    const t = montar({ sub: null });
    const r = await syncAttendantItem(t.deps, CONTA);
    expect(r.state).toBe('legacy');
    expect(t.escritasEmItem()).toEqual([]);
    expect(t.writes).toEqual([]);
  });

  it('pagamento pendente → não muda o item', async () => {
    const t = montar({ sub: assinatura('past_due', [itemPlano(), itemAtendente(1)]) });
    const r = await syncAttendantItem(t.deps, CONTA);
    expect(r.state).toBe('past_due');
    expect(r.cobrados).toBe(1);
    expect(t.escritasEmItem()).toEqual([]);
  });

  it('assinatura cancelada → nada a cobrar, não mexe', async () => {
    const t = montar({ sub: assinatura('canceled', [itemPlano(), itemAtendente(1)]) });
    const r = await syncAttendantItem(t.deps, CONTA);
    expect(r.state).toBe('subscription_ended');
    expect(t.escritasEmItem()).toEqual([]);
  });

  it('sem preço na Conta → não cria nada e pede o preço', async () => {
    const t = montar({ conta: conta({ atendente_extra_preco_centavos: null, atendente_extra_price_id: null }), sub: assinatura('active', [itemPlano()]) });
    const r = await syncAttendantItem(t.deps, CONTA);
    expect(r.state).toBe('no_price');
    expect(t.escritasEmItem()).toEqual([]);
  });

  it('preço de outra Conta → recusa', async () => {
    const alheio = preco('price_FAKEalheio', PRODUTO, 3990, OUTRA);
    const t = montar({ conta: conta({ atendente_extra_price_id: alheio.id }), prices: { [alheio.id]: alheio }, sub: assinatura('active', [itemPlano()]) });
    const r = await syncAttendantItem(t.deps, CONTA);
    expect(r.state).toBe('invalid_price');
    expect(r.message).toMatch(/outra Conta/);
    expect(t.escritasEmItem()).toEqual([]);
  });

  it('produto não configurado → nem consulta o Stripe', async () => {
    const t = montar({ productId: null, sub: assinatura('active', [itemPlano()]) });
    const r = await syncAttendantItem(t.deps, CONTA);
    expect(r.state).toBe('not_configured');
    expect(t.calls).toEqual([]);
  });

  it('assinatura de outra Conta gravada nesta → 409, nada muda', async () => {
    const t = montar({ sub: assinatura('active', [itemPlano()], OUTRA) });
    await expect(syncAttendantItem(t.deps, CONTA)).rejects.toMatchObject({ status: 409 });
    expect(t.escritasEmItem()).toEqual([]);
  });

  it('Loja não é Conta', async () => {
    const t = montar({ sub: assinatura('active', [itemPlano()]) });
    await expect(syncAttendantItem(t.deps, LOJA_1)).rejects.toMatchObject({ status: 400 });
  });
});

// ---------------------------------------------------------------------------
// 5. Definir o preço
// ---------------------------------------------------------------------------

describe('setAttendantPrice', () => {
  it('cria um preço NOVO marcado com a Conta, grava com histórico e troca no item sem proporcional', async () => {
    const t = montar({ sub: assinatura('active', [itemPlano(), itemLoja(2), itemAtendente(3)]) });
    const r = await setAttendantPrice(t.deps, CONTA, 5990, 'aviso enviado em 01/09');
    expect(r.changed).toBe(true);
    const criado = t.calls.find(([n]) => n === 'prices.create')?.[1] as any;
    expect(criado).toMatchObject({
      product: PRODUTO,
      currency: 'brl',
      unit_amount: 5990,
      recurring: { interval: 'month' },
      metadata: { tenant_id: CONTA, convoflow_kind: 'atendente_extra' },
    });
    expect(t.contaNoBanco()).toMatchObject({ atendente_extra_preco_centavos: 5990, atendente_extra_price_id: r.priceId });
    const evento = t.writes.find((w) => w.table === 'account_attendant_price_events');
    expect(evento?.payload).toMatchObject({
      tenant_id: CONTA,
      preco_antes: 4990,
      preco_depois: 5990,
      price_id_antes: PRECO_CONTA.id,
      price_id_depois: r.priceId,
      actor_user_id: ATOR,
      note: 'aviso enviado em 01/09',
    });
    expect(t.escritasEmItem()).toEqual([
      ['items.update', 'si_FAKEatendente', { price: r.priceId, proration_behavior: 'none' }],
    ]);
    // O anterior é arquivado depois da troca.
    expect(t.calls.find(([n]) => n === 'prices.update')).toEqual(['prices.update', PRECO_CONTA.id, { active: false }]);
    expect(r.archivedPrevious).toBe(true);
    naoTocouPlanoNemLoja(t.calls);
  });

  it('primeiro preço de uma Conta com acesso manual: grava, sem Stripe de assinatura', async () => {
    const t = montar({
      conta: conta({ subscription_id: null, subscription_status: null, atendente_extra_preco_centavos: null, atendente_extra_price_id: null }),
      sub: null,
    });
    const r = await setAttendantPrice(t.deps, CONTA, 3990, '');
    expect(r.sync.state).toBe('no_subscription');
    expect(t.escritasEmItem()).toEqual([]);
    expect(t.contaNoBanco().atendente_extra_preco_centavos).toBe(3990);
  });

  it('mesmo preço → não cria outro', async () => {
    const t = montar({ sub: assinatura('active', [itemPlano(), itemAtendente(3)]) });
    const r = await setAttendantPrice(t.deps, CONTA, 4990, null);
    expect(r.changed).toBe(false);
    expect(t.calls.some(([n]) => n === 'prices.create')).toBe(false);
  });

  it('pagamento pendente: grava o preço, não troca no item e NÃO arquiva o antigo', async () => {
    const t = montar({ sub: assinatura('past_due', [itemPlano(), itemAtendente(3)]) });
    const r = await setAttendantPrice(t.deps, CONTA, 5990, null);
    expect(r.sync.state).toBe('past_due');
    expect(t.escritasEmItem()).toEqual([]);
    expect(r.archivedPrevious).toBe(false);
  });

  it('valor fora da faixa ou produto não configurado → recusa antes do Stripe', async () => {
    const t = montar({ sub: assinatura('active', [itemPlano()]) });
    await expect(setAttendantPrice(t.deps, CONTA, 50, null)).rejects.toMatchObject({ status: 400 });
    const sem = montar({ productId: null, sub: assinatura('active', [itemPlano()]) });
    await expect(setAttendantPrice(sem.deps, CONTA, 4990, null)).rejects.toMatchObject({ status: 409 });
    expect(t.calls).toEqual([]);
    expect(sem.calls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 6. Estado para a janela, e o produto
// ---------------------------------------------------------------------------

describe('attendantStatus e ensureAttendantProduct', () => {
  it('Conta que já cobra extras → mudar o preço exige o aviso de 30 dias', async () => {
    const t = montar({ sub: assinatura('active', [itemPlano(), itemAtendente(3)]) });
    const s = await attendantStatus(t.deps, CONTA);
    expect(s).toMatchObject({
      configured: true,
      concedidos: 3,
      subscription: { state: 'live', status: 'active' },
      item: { quantity: 3, priceId: PRECO_CONTA.id, unitAmount: 4990 },
      priceChangeNeedsNotice: true,
    });
    expect(t.escritasEmItem()).toEqual([]);
  });

  it('sem assinatura → sem aviso; conta antiga → legacy', async () => {
    const manual = montar({ conta: conta({ subscription_id: null }), sub: null });
    expect(await attendantStatus(manual.deps, CONTA)).toMatchObject({ subscription: { state: 'none' }, priceChangeNeedsNotice: false });
    const antiga = montar({ sub: null });
    expect((await attendantStatus(antiga.deps, CONTA)).subscription.state).toBe('legacy');
  });

  it('produto: acha o existente pelo metadata, não cria outro', async () => {
    const t = montar({});
    const r = await ensureAttendantProduct(t.stripe, null);
    expect(r).toMatchObject({ productId: PRODUTO, created: false, matchesSecret: false });
    expect(t.calls.some(([n]) => n === 'products.create')).toBe(false);
    const r2 = await ensureAttendantProduct(t.stripe, PRODUTO);
    expect(r2.matchesSecret).toBe(true);
  });

  it('produto: cria quando não há nenhum', async () => {
    const t = montar({});
    t.mundo.products.length = 0;
    const r = await ensureAttendantProduct(t.stripe, null);
    expect(r.created).toBe(true);
    expect(t.calls.find(([n]) => n === 'products.create')?.[1]).toMatchObject({
      name: 'Atendente extra',
      metadata: { convoflow_kind: 'atendente_extra' },
    });
  });
});

// ---------------------------------------------------------------------------
// 7. Checkout
// ---------------------------------------------------------------------------

describe('checkout de uma Conta que já tem vagas extras', () => {
  const base = { productId: PRODUTO, priceId: PRECO_CONTA.id, price: PRECO_CONTA, tenantId: CONTA };

  it('leva o item, com a soma das Lojas', () => {
    expect(decideCheckoutAttendants({ ...base, concedidos: 3 })).toEqual({ kind: 'add', price: PRECO_CONTA.id, quantity: 3 });
  });
  it('sem vagas extras → nada', () => {
    expect(decideCheckoutAttendants({ ...base, concedidos: 0 })).toEqual({ kind: 'none' });
  });
  it('sem preço, preço inválido ou sem produto → checkout recusado (409), nunca vaga de graça', () => {
    for (const v of [
      { ...base, concedidos: 2, priceId: null, price: null },
      { ...base, concedidos: 2, price: { ...PRECO_CONTA, metadata: { tenant_id: OUTRA } } },
      { ...base, concedidos: 2, productId: null },
    ]) {
      const d = decideCheckoutAttendants(v);
      expect(d.kind).toBe('blocked');
      if (d.kind === 'blocked') {
        expect(d.status).toBe(409);
        expect(d.error).toMatch(/contato@convoflow\.com\.br/);
      }
    }
  });

  it('create-checkout-session decide antes de criar o cliente e põe o item na sessão', () => {
    const HERE = path.dirname(fileURLToPath(import.meta.url));
    const src = fs
      .readFileSync(path.resolve(HERE, '..', '..', '..', 'supabase', 'functions', 'create-checkout-session', 'index.ts'), 'utf8')
      .replace(/\r\n/g, '\n');
    const corpo = src.slice(src.indexOf('serve(async'));
    expect(corpo.indexOf('decideCheckoutAttendants(')).toBeGreaterThan(0);
    expect(corpo.indexOf('decideCheckoutAttendants(')).toBeLessThan(corpo.indexOf('await clienteDaConta('));
    expect(corpo).toContain('lineItems.push({ price: atendentes.price, quantity: atendentes.quantity });');
    expect(corpo).toContain('extra_attendants: String(extraAttendants)');
  });
});

// ---------------------------------------------------------------------------
// 8. Webhook e receita: atendente pelo produto, Loja extra pelo preço
// ---------------------------------------------------------------------------

describe('stripe-webhook grava os atendentes extras cobrados', () => {
  function depsWebhook(sub: Record<string, any>, attendantProductId: string | undefined) {
    const patches: Record<string, unknown>[] = [];
    return {
      patches,
      deps: {
        retrieveSubscription: async () => clone(sub),
        loadTenantById: async () => null,
        loadTenantBySubscriptionId: async () => ({ id: CONTA, kind: 'account', subscription_id: SUB, subscription_status: 'active' }),
        updateTenant: async (_id: string, patch: Record<string, unknown>) => {
          patches.push(patch);
        },
        slotPriceId: PRECO_LOJA,
        attendantProductId,
        now: () => new Date('2026-10-10T12:00:00Z'),
      },
    };
  }
  const evento = { type: 'customer.subscription.updated', data: { object: { id: SUB } } };

  it('Loja extra pelo preço (2) e atendente pelo produto (3), cada um na sua coluna', async () => {
    const w = depsWebhook(assinatura('active', [itemPlano(), itemLoja(2), itemAtendente(3)]), PRODUTO);
    await syncSubscriptionFromEvent(evento, w.deps);
    expect(w.patches[0]).toMatchObject({ store_slots_extra: 2, atendentes_extra_cobrados: 3 });
  });

  it('assinatura sem item de atendente → 0; cancelada → 0', async () => {
    const a = depsWebhook(assinatura('active', [itemPlano(), itemLoja(2)]), PRODUTO);
    await syncSubscriptionFromEvent(evento, a.deps);
    expect(a.patches[0]).toMatchObject({ store_slots_extra: 2, atendentes_extra_cobrados: 0 });
    const c = depsWebhook(assinatura('canceled', [itemPlano(), itemAtendente(3)]), PRODUTO);
    await syncSubscriptionFromEvent(evento, c.deps);
    expect(c.patches[0]).toMatchObject({ atendentes_extra_cobrados: 0 });
  });

  it('produto não configurado → não mexe na coluna', async () => {
    const w = depsWebhook(assinatura('active', [itemPlano(), itemAtendente(3)]), undefined);
    await syncSubscriptionFromEvent(evento, w.deps);
    expect(w.patches[0]).not.toHaveProperty('atendentes_extra_cobrados');
  });

  it('receita mensal: atendente extra numa linha própria, nunca somado à Loja extra', () => {
    const r = subscriptionMrr(
      assinatura('active', [itemPlano(), itemLoja(2), itemAtendente(3)]),
      { gerente: PRECO_PLANO, storeSlot: PRECO_LOJA, attendantProduct: PRODUTO },
      Date.parse('2026-10-10T12:00:00Z'),
    );
    expect(r).toMatchObject({ plan: 49990, extraStores: 19980, extraAttendants: 14970, other: 0, gross: 84940 });
  });
});
