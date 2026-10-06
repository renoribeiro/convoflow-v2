/**
 * `stripe-webhook`: o status da Conta é DERIVADO da assinatura relida no
 * Stripe, nunca do evento. (Teste grátis, entrega 1.)
 *
 * Os módulos testados vivem em supabase/functions/_shared porque rodam no Deno,
 * mas não importam nada do Deno — mesma convenção de `stripeSlotSync.test.ts`.
 *
 * O "mundo" abaixo é um Stripe falso (a assinatura como ela está AGORA) e uma
 * tabela `tenants` falsa. Cada evento entregue faz o que o webhook faz: relê a
 * assinatura e grava. Os eventos carregam de propósito um status VELHO no
 * payload, para provar que ele não é usado.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  buildTenantPatch,
  checkoutBlockReason,
  decideSubscriptionWrite,
  deriveSubscriptionState,
  pointerFromEvent,
  subscriptionUnlocks,
  trialDaysForCheckout,
  TRIAL_DAYS,
  type TenantBillingRow,
} from '../../../supabase/functions/_shared/subscription-state.ts';
import { syncSubscriptionFromEvent } from '../../../supabase/functions/_shared/stripe-webhook-sync.ts';

// ---------------------------------------------------------------------------
// Relógio e ids
// ---------------------------------------------------------------------------
const T0 = Date.UTC(2026, 8, 26, 12, 0, 0) / 1000; // início do teste (unix)
const DIA = 86_400;
const FIM_DO_TESTE = T0 + 7 * DIA;
const iso = (unix: number) => new Date(unix * 1000).toISOString();

const CONTA = 'c0000000-0000-4000-8000-000000000001';
const LOJA = 'c0000000-0000-4000-8000-000000000002';
const SUB = 'sub_teste';
const CUS = 'cus_conta';
const PRICE_VAGA = 'price_vaga';

type Sub = Record<string, unknown>;

function assinaturaEmTeste(extra: Partial<Sub> = {}): Sub {
  return {
    id: SUB,
    status: 'trialing',
    customer: CUS,
    trial_end: FIM_DO_TESTE,
    current_period_end: FIM_DO_TESTE,
    cancel_at: null,
    cancel_at_period_end: false,
    metadata: { tenant_id: CONTA, extra_slots: '0' },
    items: { data: [{ id: 'si_plano', price: { id: 'price_plano' }, quantity: 1 }] },
    ...extra,
  };
}

interface LinhaConta extends TenantBillingRow {
  [k: string]: unknown;
}

/** Stripe falso + tabela tenants falsa + o webhook ligado aos dois. */
function mundo(opts: { slotPriceId?: string } = {}) {
  const assinaturas = new Map<string, Sub>();
  const contas = new Map<string, LinhaConta>([
    [CONTA, { id: CONTA, kind: 'account', subscription_id: null, subscription_status: null }],
    [LOJA, { id: LOJA, kind: 'store', subscription_id: null, subscription_status: null }],
  ]);
  const historico: string[] = [];

  const deps = {
    retrieveSubscription: vi.fn(async (id: string) => {
      const s = assinaturas.get(id);
      if (!s) throw new Error(`No such subscription: ${id}`);
      return structuredClone(s);
    }),
    loadTenantById: vi.fn(async (id: string) => {
      const c = contas.get(id);
      return c ? { id: c.id, kind: c.kind, subscription_id: c.subscription_id, subscription_status: c.subscription_status } : null;
    }),
    loadTenantBySubscriptionId: vi.fn(async (sid: string) => {
      const c = [...contas.values()].find((x) => x.subscription_id === sid);
      return c ? { id: c.id, kind: c.kind, subscription_id: c.subscription_id, subscription_status: c.subscription_status } : null;
    }),
    updateTenant: vi.fn(async (id: string, patch: Record<string, unknown>) => {
      Object.assign(contas.get(id)!, patch);
      historico.push(String(patch.subscription_status));
    }),
    slotPriceId: opts.slotPriceId ?? '',
    now: () => new Date('2026-09-26T12:00:00Z'),
  };

  const entregar = (evento: { type: string; data: { object: unknown } }) =>
    syncSubscriptionFromEvent(evento, deps);

  return { assinaturas, contas, historico, deps, entregar, conta: () => contas.get(CONTA)! };
}

// Eventos, cada um com um status VELHO no payload (que não pode ser usado).
const ev = {
  checkoutConcluido: () => ({
    type: 'checkout.session.completed',
    data: { object: { mode: 'subscription', subscription: SUB, customer: CUS, payment_status: 'paid', metadata: { tenant_id: CONTA } } },
  }),
  assinaturaCriada: (statusVelho = 'trialing') => ({
    type: 'customer.subscription.created',
    data: { object: { id: SUB, status: statusVelho } },
  }),
  assinaturaAtualizada: (statusVelho = 'active') => ({
    type: 'customer.subscription.updated',
    data: { object: { id: SUB, status: statusVelho } },
  }),
  assinaturaApagada: () => ({
    type: 'customer.subscription.deleted',
    data: { object: { id: SUB, status: 'canceled' } },
  }),
  faturaZeroPaga: () => ({
    type: 'invoice.payment_succeeded',
    data: { object: { id: 'in_zero', subscription: SUB, amount_paid: 0, billing_reason: 'subscription_create' } },
  }),
  faturaZeroPaid: () => ({
    type: 'invoice.paid',
    data: { object: { id: 'in_zero', subscription: SUB, amount_paid: 0 } },
  }),
  faturaDoPlanoPaga: () => ({
    type: 'invoice.payment_succeeded',
    data: { object: { id: 'in_plano', subscription: SUB, amount_paid: 49990, billing_reason: 'subscription_cycle' } },
  }),
  faturaFalhou: () => ({
    type: 'invoice.payment_failed',
    data: { object: { id: 'in_plano', subscription: SUB, amount_due: 49990 } },
  }),
};

function permutacoes<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutacoes([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

// ---------------------------------------------------------------------------
// deriveSubscriptionState
// ---------------------------------------------------------------------------
describe('deriveSubscriptionState', () => {
  it('assinatura em teste: status, cliente e fim do teste', () => {
    expect(deriveSubscriptionState(assinaturaEmTeste())).toEqual({
      subscription_id: SUB,
      subscription_status: 'trialing',
      stripe_customer_id: CUS,
      trial_ends_at: iso(FIM_DO_TESTE),
      subscription_will_cancel: false,
      subscription_cancel_at: null,
    });
  });

  it('cancelou durante o teste (fim do período): vai cancelar no fim do teste', () => {
    const s = deriveSubscriptionState(assinaturaEmTeste({ cancel_at_period_end: true }));
    expect(s.subscription_status).toBe('trialing');
    expect(s.subscription_will_cancel).toBe(true);
    expect(s.subscription_cancel_at).toBe(iso(FIM_DO_TESTE));
  });

  it('cancelamento por data (cancel_at, modo flexível do portal) também conta', () => {
    const s = deriveSubscriptionState(assinaturaEmTeste({ cancel_at: FIM_DO_TESTE }));
    expect(s.subscription_will_cancel).toBe(true);
    expect(s.subscription_cancel_at).toBe(iso(FIM_DO_TESTE));
  });

  it('cancel_at_period_end sem current_period_end na assinatura (API nova): lê dos itens', () => {
    const s = deriveSubscriptionState(
      assinaturaEmTeste({
        cancel_at_period_end: true,
        current_period_end: undefined,
        items: { data: [{ id: 'si', current_period_end: FIM_DO_TESTE }] },
      }),
    );
    expect(s.subscription_cancel_at).toBe(iso(FIM_DO_TESTE));
  });

  it('assinatura já cancelada não tem cancelamento "agendado"', () => {
    const s = deriveSubscriptionState(
      assinaturaEmTeste({ status: 'canceled', cancel_at_period_end: true, cancel_at: FIM_DO_TESTE }),
    );
    expect(s.subscription_will_cancel).toBe(false);
    expect(s.subscription_cancel_at).toBeNull();
  });

  it('cliente expandido vira o id', () => {
    expect(deriveSubscriptionState(assinaturaEmTeste({ customer: { id: 'cus_x' } })).stripe_customer_id).toBe('cus_x');
  });

  it('sem teste: trial_ends_at nulo', () => {
    expect(deriveSubscriptionState(assinaturaEmTeste({ status: 'active', trial_end: null })).trial_ends_at).toBeNull();
  });

  it.each([{}, { id: SUB }, { status: 'active' }, null])('objeto sem id/status LANÇA: %p', (raw) => {
    expect(() => deriveSubscriptionState(raw)).toThrow(/sem id ou status/);
  });
});

// ---------------------------------------------------------------------------
// pointerFromEvent
// ---------------------------------------------------------------------------
describe('pointerFromEvent — o evento só diz QUAL assinatura olhar', () => {
  it('checkout de assinatura: assinatura + Conta do metadata', () => {
    expect(pointerFromEvent(ev.checkoutConcluido())).toEqual({ subscriptionId: SUB, tenantHint: CONTA });
  });

  it('checkout de pagamento avulso não é de assinatura', () => {
    expect(pointerFromEvent({ type: 'checkout.session.completed', data: { object: { mode: 'payment' } } }))
      .toEqual({ subscriptionId: null, tenantHint: null });
  });

  it.each(['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted',
    'customer.subscription.trial_will_end', 'customer.subscription.paused'])('%s aponta o próprio id', (type) => {
    expect(pointerFromEvent({ type, data: { object: { id: SUB } } }).subscriptionId).toBe(SUB);
  });

  it.each(['invoice.payment_succeeded', 'invoice.paid', 'invoice.payment_failed'])('%s (API acacia)', (type) => {
    expect(pointerFromEvent({ type, data: { object: { subscription: SUB } } }).subscriptionId).toBe(SUB);
  });

  it('fatura no formato das APIs novas (parent.subscription_details)', () => {
    expect(
      pointerFromEvent({
        type: 'invoice.payment_failed',
        data: { object: { parent: { subscription_details: { subscription: SUB } } } },
      }).subscriptionId,
    ).toBe(SUB);
  });

  it('fatura avulsa (sem assinatura) e evento alheio não apontam nada', () => {
    expect(pointerFromEvent({ type: 'invoice.paid', data: { object: {} } }).subscriptionId).toBeNull();
    expect(pointerFromEvent({ type: 'charge.refunded', data: { object: { id: 'ch_1' } } }).subscriptionId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// decideSubscriptionWrite
// ---------------------------------------------------------------------------
describe('decideSubscriptionWrite — esta assinatura pode escrever nesta Conta?', () => {
  const estado = (status: string, id = SUB) => deriveSubscriptionState(assinaturaEmTeste({ id, status }));
  const conta = (sub: string | null, status: string | null, kind = 'account'): TenantBillingRow => ({
    id: CONTA, kind, subscription_id: sub, subscription_status: status,
  });

  it('mesma assinatura: atualiza', () => {
    expect(decideSubscriptionWrite(conta(SUB, 'trialing'), estado('past_due'))).toEqual({ action: 'update' });
  });
  it('Conta sem assinatura: adota', () => {
    expect(decideSubscriptionWrite(conta(null, null), estado('trialing'))).toEqual({ action: 'adopt' });
  });
  it('assinou de novo depois de cancelar: a nova (viva) adota', () => {
    expect(decideSubscriptionWrite(conta('sub_velha', 'canceled'), estado('active', 'sub_nova'))).toEqual({ action: 'adopt' });
  });
  it('evento atrasado da assinatura morta NÃO sobrescreve a nova', () => {
    expect(decideSubscriptionWrite(conta('sub_nova', 'active'), estado('canceled', 'sub_velha')).action).toBe('ignore');
  });
  it('duas vivas: a segunda não rouba a Conta', () => {
    expect(decideSubscriptionWrite(conta('sub_a', 'trialing'), estado('trialing', 'sub_b')).action).toBe('ignore');
  });
  it('assinatura nova ainda incompleta não troca uma morta', () => {
    expect(decideSubscriptionWrite(conta('sub_velha', 'canceled'), estado('incomplete', 'sub_nova')).action).toBe('ignore');
  });
  it('Loja nunca recebe assinatura', () => {
    expect(decideSubscriptionWrite(conta(null, null, 'store'), estado('trialing'))).toEqual({ action: 'ignore', reason: 'not_account' });
  });
});

describe('buildTenantPatch', () => {
  const s = deriveSubscriptionState(assinaturaEmTeste());
  it('adotar grava o vínculo e o plano', () => {
    const p = buildTenantPatch(s, { action: 'adopt' }, null, 'agora');
    expect(p).toMatchObject({ subscription_id: SUB, plan_type: 'gerente', subscription_status: 'trialing' });
    expect(p).not.toHaveProperty('store_slots_extra');
  });
  it('atualizar não mexe no vínculo', () => {
    const p = buildTenantPatch(s, { action: 'update' }, 2, 'agora');
    expect(p).not.toHaveProperty('subscription_id');
    expect(p.store_slots_extra).toBe(2);
  });
  it('cliente nulo nunca apaga o que a Conta tem', () => {
    const p = buildTenantPatch({ ...s, stripe_customer_id: null }, { action: 'update' }, null, 'agora');
    expect(p).not.toHaveProperty('stripe_customer_id');
  });
});

// ---------------------------------------------------------------------------
// O webhook de ponta a ponta, com eventos fora de ordem
// ---------------------------------------------------------------------------
describe('início do teste: os 4 eventos, em QUALQUER ordem, deixam a Conta em teste', () => {
  const eventos = [ev.checkoutConcluido, () => ev.assinaturaCriada(), ev.faturaZeroPaga, ev.faturaZeroPaid];

  it.each(permutacoes([0, 1, 2, 3]).map((p) => [p.join(','), p] as const))('ordem %s', async (_r, ordem) => {
    const m = mundo();
    m.assinaturas.set(SUB, assinaturaEmTeste());
    for (const i of ordem) await m.entregar(eventos[i]!());

    expect(m.conta()).toMatchObject({
      subscription_id: SUB,
      subscription_status: 'trialing',
      stripe_customer_id: CUS,
      trial_ends_at: iso(FIM_DO_TESTE),
      subscription_will_cancel: false,
      plan_type: 'gerente',
    });
    // Em NENHUM momento o teste passou por 'active'.
    expect(m.historico).not.toContain('active');
    expect(m.historico.every((s) => s === 'trialing')).toBe(true);
  });
});

describe('a fatura de R$ 0 nunca marca o teste como pago', () => {
  it('invoice.payment_succeeded de R$ 0 sozinho, antes de tudo: grava trialing', async () => {
    const m = mundo();
    m.assinaturas.set(SUB, assinaturaEmTeste());
    const r = await m.entregar(ev.faturaZeroPaga());
    expect(r).toMatchObject({ result: 'written', status: 'trialing', action: 'adopt' });
    expect(m.conta().subscription_status).toBe('trialing');
  });

  it('checkout com payment_status "paid" (é assim que o Stripe descreve o teste) não vira active', async () => {
    const m = mundo();
    m.assinaturas.set(SUB, assinaturaEmTeste());
    await m.entregar(ev.checkoutConcluido());
    expect(m.conta().subscription_status).toBe('trialing');
  });
});

describe('dia 7, cartão aprovado', () => {
  it.each(permutacoes([0, 1]).map((p) => [p.join(','), p] as const))('vira active em qualquer ordem (%s)', async (_r, ordem) => {
    const m = mundo();
    m.assinaturas.set(SUB, assinaturaEmTeste());
    await m.entregar(ev.checkoutConcluido());

    m.assinaturas.set(SUB, assinaturaEmTeste({ status: 'active', current_period_end: FIM_DO_TESTE + 30 * DIA }));
    const eventos = [ev.faturaDoPlanoPaga, () => ev.assinaturaAtualizada('active')];
    for (const i of ordem) await m.entregar(eventos[i]!());

    expect(m.conta().subscription_status).toBe('active');
    expect(m.conta().trial_ends_at).toBe(iso(FIM_DO_TESTE)); // fica como histórico
  });

  it('evento velho do início (created com payload "trialing") reentregue depois: continua active', async () => {
    const m = mundo();
    m.assinaturas.set(SUB, assinaturaEmTeste({ status: 'active' }));
    await m.entregar(ev.checkoutConcluido());
    await m.entregar(ev.assinaturaCriada('trialing'));
    expect(m.conta().subscription_status).toBe('active');
  });
});

describe('dia 7, cartão recusado: carência e depois trava', () => {
  it('past_due em qualquer ordem, e a fatura de R$ 0 reentregue depois NÃO devolve active', async () => {
    for (const ordem of permutacoes([0, 1, 2])) {
      const m = mundo();
      m.assinaturas.set(SUB, assinaturaEmTeste());
      await m.entregar(ev.checkoutConcluido());

      m.assinaturas.set(SUB, assinaturaEmTeste({ status: 'past_due' }));
      const eventos = [ev.faturaFalhou, () => ev.assinaturaAtualizada('active'), ev.faturaZeroPaga];
      for (const i of ordem) await m.entregar(eventos[i]!());

      expect(m.conta().subscription_status).toBe('past_due');
      expect(subscriptionUnlocks(m.conta().subscription_status)).toBe(true); // carência: segue liberada
    }
  });

  it.each(['unpaid', 'canceled'])('o Stripe desiste (%s): a Conta tranca', async (fim) => {
    const m = mundo();
    m.assinaturas.set(SUB, assinaturaEmTeste({ status: 'past_due' }));
    await m.entregar(ev.checkoutConcluido());

    m.assinaturas.set(SUB, assinaturaEmTeste({ status: fim }));
    await m.entregar(fim === 'canceled' ? ev.assinaturaApagada() : ev.assinaturaAtualizada('past_due'));

    expect(m.conta().subscription_status).toBe(fim);
    expect(subscriptionUnlocks(m.conta().subscription_status)).toBe(false);
  });

  it('o payload do evento é ignorado: updated dizendo "active" com a assinatura em past_due grava past_due', async () => {
    const m = mundo();
    m.assinaturas.set(SUB, assinaturaEmTeste({ status: 'past_due' }));
    await m.entregar(ev.checkoutConcluido());
    await m.entregar(ev.assinaturaAtualizada('active'));
    expect(m.conta().subscription_status).toBe('past_due');
  });
});

describe('cancelou durante o teste', () => {
  it('fica liberada até o fim do teste, com o cancelamento agendado; depois tranca', async () => {
    const m = mundo();
    m.assinaturas.set(SUB, assinaturaEmTeste());
    await m.entregar(ev.checkoutConcluido());

    m.assinaturas.set(SUB, assinaturaEmTeste({ cancel_at_period_end: true }));
    await m.entregar(ev.assinaturaAtualizada('trialing'));
    expect(m.conta()).toMatchObject({
      subscription_status: 'trialing',
      subscription_will_cancel: true,
      subscription_cancel_at: iso(FIM_DO_TESTE),
    });
    expect(subscriptionUnlocks(m.conta().subscription_status)).toBe(true);

    m.assinaturas.set(SUB, assinaturaEmTeste({ status: 'canceled', cancel_at_period_end: true }));
    await m.entregar(ev.assinaturaApagada());
    expect(m.conta()).toMatchObject({
      subscription_status: 'canceled',
      subscription_will_cancel: false,
      subscription_cancel_at: null,
    });
    expect(subscriptionUnlocks(m.conta().subscription_status)).toBe(false);
  });

  it('desistiu de cancelar: o agendamento some', async () => {
    const m = mundo();
    m.assinaturas.set(SUB, assinaturaEmTeste({ cancel_at_period_end: true }));
    await m.entregar(ev.checkoutConcluido());
    m.assinaturas.set(SUB, assinaturaEmTeste({ cancel_at_period_end: false }));
    await m.entregar(ev.assinaturaAtualizada('trialing'));
    expect(m.conta()).toMatchObject({ subscription_will_cancel: false, subscription_cancel_at: null });
  });
});

describe('assinou de novo depois de cancelar', () => {
  it('evento atrasado da assinatura velha não tranca a Conta', async () => {
    const m = mundo();
    m.assinaturas.set('sub_velha', assinaturaEmTeste({ id: 'sub_velha', status: 'canceled' }));
    m.assinaturas.set(SUB, assinaturaEmTeste({ status: 'active', trial_end: null }));
    Object.assign(m.conta(), { subscription_id: 'sub_velha', subscription_status: 'canceled' });

    await m.entregar(ev.checkoutConcluido());                          // nova adota
    await m.entregar({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_velha' } } });

    expect(m.conta()).toMatchObject({ subscription_id: SUB, subscription_status: 'active' });
  });
});

describe('falhas', () => {
  it('Stripe fora do ar na releitura: LANÇA e não grava nada (o Stripe reenvia)', async () => {
    const m = mundo();
    m.deps.retrieveSubscription.mockRejectedValueOnce(new Error('timeout'));
    await expect(m.entregar(ev.checkoutConcluido())).rejects.toThrow('timeout');
    expect(m.deps.updateTenant).not.toHaveBeenCalled();
    expect(m.conta().subscription_status).toBeNull();
  });

  it('banco recusou o UPDATE: LANÇA', async () => {
    const m = mundo();
    m.assinaturas.set(SUB, assinaturaEmTeste());
    m.deps.updateTenant.mockRejectedValueOnce(new Error('db down'));
    await expect(m.entregar(ev.checkoutConcluido())).rejects.toThrow('db down');
  });

  it('assinatura sem Conta: não grava', async () => {
    const m = mundo();
    m.assinaturas.set(SUB, assinaturaEmTeste({ metadata: {} }));
    const r = await m.entregar(ev.assinaturaCriada());
    expect(r).toMatchObject({ result: 'no_tenant' });
    expect(m.deps.updateTenant).not.toHaveBeenCalled();
  });

  it('metadata apontando uma Loja: não grava na Loja', async () => {
    const m = mundo();
    m.assinaturas.set(SUB, assinaturaEmTeste({ metadata: { tenant_id: LOJA } }));
    const r = await m.entregar(ev.assinaturaCriada());
    expect(r).toMatchObject({ result: 'ignored', reason: 'not_account' });
  });

  it('evento que não é de assinatura: nem relê', async () => {
    const m = mundo();
    const r = await m.entregar({ type: 'charge.refunded', data: { object: { id: 'ch_1' } } });
    expect(r).toEqual({ result: 'not_subscription_event' });
    expect(m.deps.retrieveSubscription).not.toHaveBeenCalled();
  });
});

describe('vagas continuam derivadas da mesma releitura', () => {
  it('com Price de vaga: grava a quantidade do item; uma releitura só', async () => {
    const m = mundo({ slotPriceId: PRICE_VAGA });
    m.assinaturas.set(SUB, assinaturaEmTeste({
      items: { data: [{ id: 'si_plano', price: { id: 'price_plano' }, quantity: 1 },
                      { id: 'si_vaga', price: { id: PRICE_VAGA }, quantity: 2 }] },
    }));
    await m.entregar(ev.checkoutConcluido());
    expect(m.conta().store_slots_extra).toBe(2);
    expect(m.deps.retrieveSubscription).toHaveBeenCalledTimes(1);
  });

  it('sem Price de vaga configurado: não mexe na coluna', async () => {
    const m = mundo();
    m.assinaturas.set(SUB, assinaturaEmTeste());
    await m.entregar(ev.checkoutConcluido());
    expect(m.conta()).not.toHaveProperty('store_slots_extra');
  });
});

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------
describe('checkout', () => {
  it.each([
    ['active', /já possui uma assinatura ativa/],
    ['trialing', /período de teste/],
    ['past_due', /pagamento pendente/],
  ])('%s barra um segundo checkout', (status, msg) => {
    expect(checkoutBlockReason(status)).toMatch(msg);
  });

  it.each([null, 'canceled', 'unpaid', 'incomplete', 'incomplete_expired'])('%s pode assinar', (status) => {
    expect(checkoutBlockReason(status)).toBeNull();
  });

  it('todo status que libera o sistema barra o checkout (não existe liberado-e-assinável)', () => {
    for (const s of ['active', 'trialing', 'past_due']) {
      expect(subscriptionUnlocks(s)).toBe(true);
      expect(checkoutBlockReason(s)).not.toBeNull();
    }
  });

  it('primeira assinatura: 7 dias de teste', () => {
    expect(TRIAL_DAYS).toBe(7);
    expect(trialDaysForCheckout({ subscription_id: null })).toBe(7);
  });

  it('Conta que já assinou antes não ganha outro teste', () => {
    expect(trialDaysForCheckout({ subscription_id: 'sub_antiga' })).toBeNull();
  });
});
