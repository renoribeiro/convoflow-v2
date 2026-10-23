/**
 * Cobrança do complemento "API e integrações" (supabase/functions/_shared/api-addon.ts)
 * e o que o stripe-webhook grava dele (stripe-webhook-sync.ts).
 *
 * O "Stripe" aqui é um simulador em memória: guarda a assinatura, cria e
 * apaga itens e anota o proporcional de cada operação. Ele prova a sequência
 * inteira (ligar → webhook → desligar → webhook → religar). Não substitui a
 * rodada no modo de teste do Stripe de verdade (docs/RUNBOOK_api_publica.md).
 */
import { describe, expect, it } from 'vitest';

import {
  API_PRICE_CENTS,
  apiCharged,
  apiIdempotencyKey,
  authorizeApiAddonChange,
  changeApiAddon,
  checkApiPrice,
  ensureApiProduct,
  fimDoPeriodo,
  findApiItems,
  MSG_MANUAL,
  MSG_PAGAMENTO_PENDENTE,
  MSG_SEM_ASSINATURA,
  MSG_TESTE_GRATIS,
  planApiAddon,
  type Caller,
  type ContaApi,
  type SubscriptionLike,
} from '../../../supabase/functions/_shared/api-addon';
import { syncSubscriptionFromEvent } from '../../../supabase/functions/_shared/stripe-webhook-sync';
import { descricaoDoServico, resumoDaFatura } from '../../../supabase/functions/_shared/nfse/descricao';

const PRODUTO = 'prod_FAKEapi';
const PRECO = 'price_FAKEapi';
const CONTA = 'aaaaaaaa-0000-4000-8000-000000000001';
const SUB = 'sub_FAKEconta';
const FIM = Date.parse('2026-11-08T00:00:00Z') / 1000;

const gerente: Caller = { role: 'gerente', tenant_id: CONTA, status: 'active', capabilities: null };

const contaBase = (extra: Partial<ContaApi> = {}): ContaApi => ({
  id: CONTA,
  kind: 'account',
  subscription_id: SUB,
  subscription_status: 'active',
  manual_access_granted: false,
  api_addon_cobrado: false,
  api_addon_ate: null,
  ...extra,
});

const precoBom = { id: PRECO, product: PRODUTO, active: true, currency: 'brl', unit_amount: API_PRICE_CENTS, recurring: { interval: 'month', interval_count: 1 } };

/** Stripe em memória. */
function stripeFalso(status = 'active') {
  let seq = 0;
  const sub = {
    id: SUB,
    status,
    metadata: { tenant_id: CONTA },
    current_period_end: FIM,
    items: { data: [{ id: 'si_plano', quantity: 1, price: { id: 'price_FAKEplano', product: 'prod_FAKEplano' }, current_period_end: FIM }] as Array<Record<string, unknown>> },
  };
  const ops: Array<{ op: string; proration: string; idempotencyKey?: string }> = [];
  const produtos: Array<Record<string, unknown>> = [];
  const precos: Array<Record<string, unknown>> = [precoBom];
  return {
    sub,
    ops,
    produtos,
    precos,
    subscriptions: { retrieve: async () => JSON.parse(JSON.stringify(sub)) },
    prices: {
      retrieve: async (id: string) => {
        const p = precos.find((x) => x.id === id);
        if (!p) throw Object.assign(new Error('nao existe'), { code: 'resource_missing' });
        return p;
      },
      list: async ({ product }: { product: string }) => ({ data: precos.filter((p) => p.product === product && p.active !== false) }),
      create: async (p: Record<string, unknown>) => {
        const novo = { id: `price_FAKEnovo${++seq}`, active: true, ...p };
        precos.push(novo);
        return novo;
      },
    },
    products: {
      retrieve: async (id: string) => {
        const p = produtos.find((x) => x.id === id);
        if (!p) throw Object.assign(new Error('nao existe'), { code: 'resource_missing' });
        return p;
      },
      list: async () => ({ data: produtos, has_more: false }),
      create: async (p: Record<string, unknown>) => {
        const novo = { id: `prod_FAKEnovo${++seq}`, active: true, ...p };
        produtos.push(novo);
        return novo;
      },
    },
    subscriptionItems: {
      create: async (p: { price: string; proration_behavior: string }, o?: { idempotencyKey?: string }) => {
        ops.push({ op: 'create', proration: p.proration_behavior, idempotencyKey: o?.idempotencyKey });
        const preco = precos.find((x) => x.id === p.price);
        sub.items.data.push({ id: `si_api${++seq}`, quantity: 1, price: preco, current_period_end: FIM });
      },
      del: async (id: string, p: { proration_behavior: string }, o?: { idempotencyKey?: string }) => {
        ops.push({ op: 'delete', proration: p.proration_behavior, idempotencyKey: o?.idempotencyKey });
        sub.items.data = sub.items.data.filter((i) => i.id !== id);
      },
    },
  };
}

function cenario(opts: { status?: string; conta?: Partial<ContaApi> } = {}) {
  const stripe = stripeFalso(opts.status);
  let conta = contaBase(opts.conta);
  const deps = {
    stripe,
    productId: PRODUTO,
    priceId: PRECO,
    now: () => new Date('2026-10-24T12:00:00Z'),
    loadConta: async () => conta,
    saveConta: async (_id: string, patch: Partial<ContaApi>) => {
      conta = { ...conta, ...patch };
    },
  };
  const webhook = () =>
    syncSubscriptionFromEvent(
      { type: 'customer.subscription.updated', data: { object: { id: SUB, object: 'subscription' } } },
      {
        retrieveSubscription: async () => stripe.subscriptions.retrieve(),
        loadTenantById: async () => ({ id: CONTA, kind: 'account', subscription_id: SUB, subscription_status: 'active' }) as never,
        loadTenantBySubscriptionId: async () => ({ id: CONTA, kind: 'account', subscription_id: SUB, subscription_status: conta.subscription_status }) as never,
        updateTenant: async (_id, patch) => {
          conta = { ...conta, ...(patch as Partial<ContaApi>) };
        },
        slotPriceId: 'price_FAKEslot',
        apiProductId: PRODUTO,
        now: () => new Date('2026-10-24T12:00:00Z'),
      },
    );
  return { stripe, deps, webhook, conta: () => conta };
}

describe('reconhecer o item', () => {
  const sub = (status: string, itens: Array<Record<string, unknown>>): SubscriptionLike => ({ status, items: { data: itens } });

  it('pelo PRODUTO, nunca pelo preço', () => {
    const itemNovoPreco = { id: 'si_1', quantity: 1, price: { id: 'price_FAKEoutro', product: PRODUTO } };
    expect(findApiItems(sub('active', [itemNovoPreco]), PRODUTO)).toHaveLength(1);
    expect(findApiItems(sub('active', [{ id: 'si_2', price: { id: PRECO, product: 'prod_FAKEoutro' } }]), PRODUTO)).toHaveLength(0);
  });

  it('o que o webhook grava: null sem produto; false se não cobra; true com o item', () => {
    const com = sub('active', [{ id: 'si_1', quantity: 1, price: { product: { id: PRODUTO } } }]);
    expect(apiCharged(com, null)).toBeNull();
    expect(apiCharged(com, PRODUTO)).toBe(true);
    expect(apiCharged({ ...com, status: 'past_due' }, PRODUTO)).toBe(true);
    expect(apiCharged({ ...com, status: 'canceled' }, PRODUTO)).toBe(false);
    expect(apiCharged(sub('active', []), PRODUTO)).toBe(false);
  });

  it('fim do período: do item (API nova) ou da assinatura', () => {
    expect(fimDoPeriodo({ current_period_end: FIM })).toBe('2026-11-08T00:00:00.000Z');
    expect(fimDoPeriodo({}, { current_period_end: FIM })).toBe('2026-11-08T00:00:00.000Z');
    expect(fimDoPeriodo({})).toBeNull();
  });

  it('o preço tem de ser R$ 99,90 mensal em reais do produto da API', () => {
    expect(checkApiPrice(precoBom, PRODUTO)).toBeNull();
    expect(checkApiPrice({ ...precoBom, unit_amount: 9900 }, PRODUTO)).toMatch(/99,90/);
    expect(checkApiPrice({ ...precoBom, currency: 'usd' }, PRODUTO)).toMatch(/reais/);
    expect(checkApiPrice({ ...precoBom, recurring: { interval: 'year' } }, PRODUTO)).toMatch(/mensal/);
    expect(checkApiPrice({ ...precoBom, product: 'prod_FAKEoutro' }, PRODUTO)).toMatch(/produto/);
    expect(checkApiPrice(null, PRODUTO)).toMatch(/não existe/);
  });
});

describe('quem pode e quando', () => {
  it('teste grátis: "Disponível depois do teste grátis"', () => {
    expect(authorizeApiAddonChange(gerente, contaBase({ subscription_status: 'trialing' }))).toEqual({ ok: false, status: 409, error: MSG_TESTE_GRATIS });
  });
  it('pagamento pendente: atualize o cartão', () => {
    expect(authorizeApiAddonChange(gerente, contaBase({ subscription_status: 'past_due' }))).toMatchObject({ ok: false, error: MSG_PAGAMENTO_PENDENTE });
  });
  it('sem assinatura: assine antes; acesso manual: liberada pelo ConvoFlow', () => {
    expect(authorizeApiAddonChange(gerente, contaBase({ subscription_id: null, subscription_status: null }))).toMatchObject({ error: MSG_SEM_ASSINATURA });
    expect(authorizeApiAddonChange(gerente, contaBase({ subscription_id: null, subscription_status: null, manual_access_granted: true }))).toMatchObject({ error: MSG_MANUAL });
  });
  it('gestor e atendente não; Loja não; conta suspensa não', () => {
    expect(authorizeApiAddonChange({ ...gerente, role: 'gestor' }, contaBase())).toMatchObject({ ok: false, status: 403 });
    expect(authorizeApiAddonChange({ ...gerente, role: 'atendente' }, contaBase())).toMatchObject({ ok: false, status: 403 });
    expect(authorizeApiAddonChange(gerente, contaBase({ kind: 'store' }))).toMatchObject({ ok: false, status: 403 });
    expect(authorizeApiAddonChange({ ...gerente, status: 'suspended' }, contaBase())).toMatchObject({ ok: false, status: 403 });
  });
  it('gerente com assinatura ativa: pode', () => {
    expect(authorizeApiAddonChange(gerente, contaBase())).toEqual({ ok: true });
  });
});

describe('o plano no item', () => {
  const agora = new Date('2026-10-24T12:00:00Z');
  const comItem: SubscriptionLike = { status: 'active', current_period_end: FIM, items: { data: [{ id: 'si_api', quantity: 1, price: { product: PRODUTO } }] } };
  const semItem: SubscriptionLike = { status: 'active', current_period_end: FIM, items: { data: [] } };

  it('ligar sem item: cria com proporcional', () => {
    expect(planApiAddon(semItem, PRODUTO, PRECO, true, { api_addon_ate: null }, agora)).toEqual({
      ops: [{ op: 'create', price: PRECO, proration: 'create_prorations' }], ate: null,
    });
  });
  it('religar antes do fim do mês pago: cria SEM proporcional (o mês está pago)', () => {
    const plano = planApiAddon(semItem, PRODUTO, PRECO, true, { api_addon_ate: '2026-11-08T00:00:00Z' }, agora);
    expect(plano.ops).toEqual([{ op: 'create', price: PRECO, proration: 'none' }]);
  });
  it('ligar com item: nada (e duplicado sai)', () => {
    expect(planApiAddon(comItem, PRODUTO, PRECO, true, { api_addon_ate: null }, agora).ops).toEqual([]);
    const dup: SubscriptionLike = { ...comItem, items: { data: [...(comItem.items?.data ?? []), { id: 'si_dup', quantity: 1, price: { product: PRODUTO } }] } };
    expect(planApiAddon(dup, PRODUTO, PRECO, true, { api_addon_ate: null }, agora).ops).toEqual([{ op: 'delete', itemId: 'si_dup', proration: 'none' }]);
  });
  it('desligar: tira SEM crédito; vale até o fim do período pago', () => {
    expect(planApiAddon(comItem, PRODUTO, PRECO, false, { api_addon_ate: null }, agora)).toEqual({
      ops: [{ op: 'delete', itemId: 'si_api', proration: 'none' }], ate: '2026-11-08T00:00:00.000Z',
    });
  });
  it('desligar sem item: nada, e o "até" não muda', () => {
    expect(planApiAddon(semItem, PRODUTO, PRECO, false, { api_addon_ate: null }, agora)).toEqual({ ops: [], ate: undefined });
  });
  it('idempotência por minuto: dois cliques no mesmo minuto são um; religar mais tarde não reaproveita', () => {
    const op = { op: 'create' as const, price: PRECO, proration: 'none' as const };
    expect(apiIdempotencyKey(CONTA, SUB, op, '2026-10-24T12:00')).toBe(apiIdempotencyKey(CONTA, SUB, op, '2026-10-24T12:00'));
    expect(apiIdempotencyKey(CONTA, SUB, op, '2026-10-24T12:00')).not.toBe(apiIdempotencyKey(CONTA, SUB, op, '2026-10-24T12:01'));
  });
});

describe('a sequência inteira contra o Stripe em memória', () => {
  it('ligar → webhook → desligar → webhook → religar no mesmo mês', async () => {
    const c = cenario();

    const ligar = await changeApiAddon(c.deps, gerente, true);
    expect(ligar).toMatchObject({ cobrado: true, ate: null, ops: ['create'] });
    expect(c.stripe.ops.at(-1)).toMatchObject({ op: 'create', proration: 'create_prorations' });
    await c.webhook();
    expect(c.conta()).toMatchObject({ api_addon_cobrado: true, api_addon_ate: null });

    const desligar = await changeApiAddon(c.deps, gerente, false);
    expect(desligar).toMatchObject({ cobrado: false, ate: '2026-11-08T00:00:00.000Z', ops: ['delete'] });
    expect(c.stripe.ops.at(-1)).toMatchObject({ op: 'delete', proration: 'none' });
    await c.webhook();
    // o webhook tira o "pago", mas não mexe no "até": as chaves seguem até o fim do mês
    expect(c.conta()).toMatchObject({ api_addon_cobrado: false, api_addon_ate: '2026-11-08T00:00:00.000Z' });

    const religar = await changeApiAddon(c.deps, gerente, true);
    expect(religar).toMatchObject({ cobrado: true, ate: null });
    expect(c.stripe.ops.at(-1)).toMatchObject({ op: 'create', proration: 'none' });
    await c.webhook();
    expect(c.conta()).toMatchObject({ api_addon_cobrado: true, api_addon_ate: null });
    // só o plano e UM item da API na assinatura
    expect(c.stripe.sub.items.data.map((i) => i.id)).toEqual(['si_plano', expect.stringMatching(/^si_api/)]);
  });

  it('o item de outro produto (plano, Loja extra) nunca é tocado', async () => {
    const c = cenario();
    await changeApiAddon(c.deps, gerente, true);
    await changeApiAddon(c.deps, gerente, false);
    expect(c.stripe.sub.items.data.map((i) => i.id)).toEqual(['si_plano']);
  });

  it('assinatura em teste no Stripe: recusa mesmo se o banco disser ativa', async () => {
    const c = cenario({ status: 'trialing' });
    await expect(changeApiAddon(c.deps, gerente, true)).rejects.toMatchObject({ status: 409, message: MSG_TESTE_GRATIS });
    expect(c.stripe.ops).toHaveLength(0);
  });

  it('assinatura de outra Conta no Stripe: nada muda', async () => {
    const c = cenario();
    c.stripe.sub.metadata.tenant_id = 'aaaaaaaa-0000-4000-8000-0000000000ff';
    await expect(changeApiAddon(c.deps, gerente, true)).rejects.toMatchObject({ status: 409 });
    expect(c.stripe.ops).toHaveLength(0);
  });

  it('produto ou preço não configurado: recusa sem tocar no Stripe', async () => {
    const c = cenario();
    await expect(changeApiAddon({ ...c.deps, priceId: null }, gerente, true)).rejects.toMatchObject({ status: 500 });
    await expect(changeApiAddon({ ...c.deps, priceId: 'price_FAKEsumiu' }, gerente, true)).rejects.toMatchObject({ status: 500 });
    expect(c.stripe.ops).toHaveLength(0);
  });

  it('corpo sem "ligar" booleano: 400', async () => {
    const c = cenario();
    await expect(changeApiAddon(c.deps, gerente, 'sim')).rejects.toMatchObject({ status: 400 });
  });

  it('webhook com assinatura cancelada: tira o "pago"', async () => {
    const c = cenario();
    await changeApiAddon(c.deps, gerente, true);
    c.stripe.sub.status = 'canceled';
    await c.webhook();
    expect(c.conta().api_addon_cobrado).toBe(false);
  });
});

describe('garantir produto e preço (stripe-admin ensure_api_product)', () => {
  it('cria produto e preço quando não existem; da segunda vez acha os mesmos', async () => {
    const s = stripeFalso();
    s.precos.length = 0;
    const primeira = await ensureApiProduct(s, null, null);
    expect(primeira).toMatchObject({ createdProduct: true, createdPrice: true, productMatchesSecret: false });
    expect(s.produtos[0]).toMatchObject({ name: 'API e integrações', metadata: { convoflow_kind: 'api_addon' } });
    expect(s.precos[0]).toMatchObject({ currency: 'brl', unit_amount: 9990, recurring: { interval: 'month' } });
    const segunda = await ensureApiProduct(s, primeira.productId, primeira.priceId);
    expect(segunda).toMatchObject({
      productId: primeira.productId, priceId: primeira.priceId, createdProduct: false, createdPrice: false,
      productMatchesSecret: true, priceMatchesSecret: true,
    });
    const semSecret = await ensureApiProduct(s, null, null);
    expect(semSecret).toMatchObject({ productId: primeira.productId, priceId: primeira.priceId, createdProduct: false, createdPrice: false });
  });
});

describe('nota fiscal', () => {
  it('a fatura com o item ganha a frase "API e integrações."', () => {
    const fatura = { lines: { data: [
      { price: { id: 'price_FAKEplano', product: 'prod_FAKEplano' }, quantity: 1 },
      { price: { id: PRECO, product: PRODUTO }, quantity: 1 },
    ] } };
    const itens = resumoDaFatura(fatura, { produtoApi: PRODUTO });
    expect(itens.api).toBe(true);
    expect(descricaoDoServico({ inicio: null, fim: null, itens })).toMatch(/API e integrações\.$/);
    expect(resumoDaFatura(fatura, {}).api).toBeUndefined();
  });
});
