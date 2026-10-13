/**
 * `stripe-webhook` › registro das cobranças (nota fiscal, parte 1).
 *
 * O módulo testado vive em supabase/functions/_shared porque roda no Deno, mas
 * não importa nada do Deno — mesma convenção de stripeWebhookSync.test.ts.
 *
 * O "mundo" é um Stripe falso (faturas e cobranças como estão AGORA) e uma
 * tabela billing_charges falsa com a mesma regra do banco: stripe_invoice_id
 * único. Ids do Stripe com FAKE; UUIDs óbvios.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  chargePointerFromEvent,
  chargeRowFromInvoice,
  invoicePeriod,
  recordChargeFromEvent,
  refundPatchFromCharge,
  type ChargeDeps,
  type ChargeRow,
} from '../../../supabase/functions/_shared/billing-charges.ts';

const CONTA = 'aaaaaaaa-0000-4000-8000-000000000001';
const OUTRA = 'aaaaaaaa-0000-4000-8000-000000000002';
const SUB = 'sub_FAKE0001';
const CUS = 'cus_FAKE0001';
const T = Date.UTC(2026, 9, 13, 12, 0, 0) / 1000;
const DIA = 86_400;
const iso = (u: number) => new Date(u * 1000).toISOString();

type Obj = Record<string, unknown>;

function fatura(extra: Obj = {}): Obj {
  return {
    id: 'in_FAKE0001',
    status: 'paid',
    amount_paid: 49990,
    currency: 'brl',
    customer: CUS,
    subscription: SUB,
    charge: 'ch_FAKE0001',
    payment_intent: 'pi_FAKE0001',
    hosted_invoice_url: 'https://invoice.stripe.com/i/FAKE',
    invoice_pdf: 'https://pay.stripe.com/invoice/FAKE/pdf',
    status_transitions: { paid_at: T },
    created: T - 60,
    period_start: T - 30 * DIA,
    period_end: T,
    subscription_details: { metadata: { tenant_id: CONTA } },
    lines: { data: [{ type: 'subscription', period: { start: T, end: T + 30 * DIA } }] },
    ...extra,
  };
}

function mundo(o: { faturas?: Obj[]; cobrancas?: Obj[]; contaPorAssinatura?: Record<string, string>; contaPorCliente?: Record<string, string>; contas?: string[] } = {}) {
  const faturas = new Map((o.faturas ?? [fatura()]).map((f) => [f.id as string, f]));
  const cobrancas = new Map((o.cobrancas ?? []).map((c) => [c.id as string, c]));
  const linhas: Array<ChargeRow & { amount_refunded_cents: number; refunded_at: string | null }> = [];
  const contas = new Set(o.contas ?? [CONTA, OUTRA]);
  const deps: ChargeDeps = {
    retrieveInvoice: vi.fn(async (id: string) => {
      const f = faturas.get(id);
      if (!f) throw new Error(`No such invoice: ${id}`);
      return structuredClone(f);
    }),
    retrieveCharge: vi.fn(async (id: string) => {
      const c = cobrancas.get(id);
      if (!c) throw new Error(`No such charge: ${id}`);
      return structuredClone(c);
    }),
    loadAccountBySubscriptionId: vi.fn(async (s: string) => o.contaPorAssinatura?.[s] ?? null),
    loadAccountById: vi.fn(async (id: string) => (contas.has(id) ? id : null)),
    loadAccountByCustomerId: vi.fn(async (c: string) => o.contaPorCliente?.[c] ?? null),
    insertChargeIfNew: vi.fn(async (row: ChargeRow) => {
      if (linhas.some((l) => l.stripe_invoice_id === row.stripe_invoice_id)) return 'exists' as const;
      linhas.push({ ...row, amount_refunded_cents: 0, refunded_at: null });
      return 'inserted' as const;
    }),
    findInvoiceIdByCharge: vi.fn(async (chargeId: string, pi: string | null) => {
      const l = linhas.find((x) => x.stripe_charge_id === chargeId || (pi && x.stripe_payment_intent_id === pi));
      return l?.stripe_invoice_id ?? null;
    }),
    updateRefund: vi.fn(async (invoiceId: string, patch) => {
      const l = linhas.find((x) => x.stripe_invoice_id === invoiceId);
      if (!l) return 0;
      Object.assign(l, patch);
      return 1;
    }),
  };
  const entrega = (type: string, object: Obj) => recordChargeFromEvent({ type, data: { object } }, deps);
  return { deps, linhas, faturas, cobrancas, entrega };
}

describe('o ponteiro do evento', () => {
  it('invoice.paid / invoice.payment_succeeded → fatura; charge.refunded → cobrança; o resto nada', () => {
    expect(chargePointerFromEvent({ type: 'invoice.paid', data: { object: { id: 'in_FAKE1' } } })).toEqual({ kind: 'invoice', invoiceId: 'in_FAKE1' });
    expect(chargePointerFromEvent({ type: 'invoice.payment_succeeded', data: { object: { id: 'in_FAKE1' } } })).toEqual({ kind: 'invoice', invoiceId: 'in_FAKE1' });
    expect(chargePointerFromEvent({ type: 'charge.refunded', data: { object: { id: 'ch_FAKE1' } } })).toEqual({ kind: 'refund', chargeId: 'ch_FAKE1' });
    for (const type of ['invoice.payment_failed', 'customer.subscription.updated', 'checkout.session.completed', 'charge.succeeded']) {
      expect(chargePointerFromEvent({ type, data: { object: { id: 'x' } } })).toEqual({ kind: 'none' });
    }
  });
});

describe('fatura paga vira UMA linha', () => {
  it('grava o que foi pago de verdade, o período das linhas e os links', async () => {
    const w = mundo({ contaPorAssinatura: { [SUB]: CONTA } });
    const r = await w.entrega('invoice.paid', { id: 'in_FAKE0001', status: 'open', amount_paid: 0 });
    expect(r.result).toBe('recorded');
    expect(w.linhas).toHaveLength(1);
    expect(w.linhas[0]!).toMatchObject({
      stripe_invoice_id: 'in_FAKE0001',
      tenant_id: CONTA,
      stripe_customer_id: CUS,
      stripe_subscription_id: SUB,
      stripe_charge_id: 'ch_FAKE0001',
      stripe_payment_intent_id: 'pi_FAKE0001',
      amount_paid_cents: 49990,
      currency: 'brl',
      paid_at: iso(T),
      period_start: iso(T),
      period_end: iso(T + 30 * DIA),
      hosted_invoice_url: 'https://invoice.stripe.com/i/FAKE',
      nota_status: 'aguardando_emissao',
    });
  });

  it('IDEMPOTENTE: os dois eventos da mesma fatura e o reenvio não duplicam', async () => {
    const w = mundo({ contaPorAssinatura: { [SUB]: CONTA } });
    const a = await w.entrega('invoice.paid', { id: 'in_FAKE0001' });
    const b = await w.entrega('invoice.payment_succeeded', { id: 'in_FAKE0001' });
    const c = await w.entrega('invoice.paid', { id: 'in_FAKE0001' });
    expect([a.result, b.result, c.result]).toEqual(['recorded', 'already_recorded', 'already_recorded']);
    expect(w.linhas).toHaveLength(1);
  });

  it('com cupom: grava o valor pago, não o preço cheio', async () => {
    const w = mundo({ faturas: [fatura({ amount_paid: 24995, total: 24995, subtotal: 49990 })], contaPorAssinatura: { [SUB]: CONTA } });
    await w.entrega('invoice.paid', { id: 'in_FAKE0001' });
    expect(w.linhas[0]!.amount_paid_cents).toBe(24995);
  });

  it('fatura de R$ 0 (início do teste grátis): linha "sem_nota"', async () => {
    const w = mundo({ faturas: [fatura({ amount_paid: 0, charge: null, payment_intent: null })], contaPorAssinatura: { [SUB]: CONTA } });
    const r = await w.entrega('invoice.paid', { id: 'in_FAKE0001' });
    expect(r.result).toBe('recorded');
    expect(w.linhas[0]!).toMatchObject({ amount_paid_cents: 0, nota_status: 'sem_nota', stripe_charge_id: null });
  });

  it('evento velho de uma fatura que HOJE não está paga: nada gravado', async () => {
    const w = mundo({ faturas: [fatura({ status: 'void' })] });
    expect(await w.entrega('invoice.paid', { id: 'in_FAKE0001', status: 'paid' })).toEqual({ result: 'not_paid', invoiceId: 'in_FAKE0001', status: 'void' });
    expect(w.linhas).toHaveLength(0);
  });

  it('Stripe fora do ar ou banco recusando: LANÇA (o webhook responde 500 e o Stripe reenvia)', async () => {
    const w = mundo();
    vi.mocked(w.deps.retrieveInvoice).mockRejectedValueOnce(new Error('Stripe down'));
    await expect(w.entrega('invoice.paid', { id: 'in_FAKE0001' })).rejects.toThrow('Stripe down');
    vi.mocked(w.deps.insertChargeIfNew).mockRejectedValueOnce(new Error('db down'));
    await expect(w.entrega('invoice.paid', { id: 'in_FAKE0001' })).rejects.toThrow('db down');
    expect(w.linhas).toHaveLength(0);
    // o reenvio grava
    expect((await w.entrega('invoice.paid', { id: 'in_FAKE0001' })).result).toBe('recorded');
  });
});

describe('de qual Conta é a cobrança', () => {
  it('1º a Conta que tem a assinatura, mesmo com outro tenant no metadata', async () => {
    const w = mundo({ faturas: [fatura({ subscription_details: { metadata: { tenant_id: OUTRA } } })], contaPorAssinatura: { [SUB]: CONTA } });
    await w.entrega('invoice.paid', { id: 'in_FAKE0001' });
    expect(w.linhas[0]!.tenant_id).toBe(CONTA);
  });

  it('2º o metadata da assinatura (a primeira fatura chega antes de a Conta adotar a assinatura)', async () => {
    const w = mundo();
    await w.entrega('invoice.paid', { id: 'in_FAKE0001' });
    expect(w.linhas[0]!.tenant_id).toBe(CONTA);
  });

  it('API nova (parent.subscription_details) também vale', async () => {
    const w = mundo({
      faturas: [fatura({ subscription: undefined, subscription_details: undefined, parent: { subscription_details: { subscription: SUB, metadata: { tenant_id: CONTA } } } })],
    });
    await w.entrega('invoice.paid', { id: 'in_FAKE0001' });
    expect(w.linhas[0]!).toMatchObject({ tenant_id: CONTA, stripe_subscription_id: SUB });
  });

  it('3º o cliente do Stripe; sem nada, a linha entra SEM Conta (nunca se perde)', async () => {
    const porCliente = mundo({ faturas: [fatura({ subscription_details: { metadata: {} } })], contaPorCliente: { [CUS]: OUTRA } });
    await porCliente.entrega('invoice.paid', { id: 'in_FAKE0001' });
    expect(porCliente.linhas[0]!.tenant_id).toBe(OUTRA);

    const nenhuma = mundo({ faturas: [fatura({ subscription_details: { metadata: { tenant_id: 'referral-do-rewardful' } } })] });
    const r = await nenhuma.entrega('invoice.paid', { id: 'in_FAKE0001' });
    expect(r.result).toBe('recorded');
    expect(nenhuma.linhas[0]!.tenant_id).toBeNull();
  });
});

describe('reembolso', () => {
  const cobranca = (extra: Obj = {}): Obj => ({
    id: 'ch_FAKE0001',
    invoice: 'in_FAKE0001',
    payment_intent: 'pi_FAKE0001',
    amount: 49990,
    amount_refunded: 49990,
    created: T,
    refunds: { data: [{ id: 're_FAKE1', status: 'succeeded', amount: 49990, created: T + 2 * DIA }] },
    ...extra,
  });

  it('reembolso integral (arrependimento em 7 dias): valor e data na linha da fatura', async () => {
    const w = mundo({ cobrancas: [cobranca()], contaPorAssinatura: { [SUB]: CONTA } });
    await w.entrega('invoice.paid', { id: 'in_FAKE0001' });
    const r = await w.entrega('charge.refunded', { id: 'ch_FAKE0001' });
    expect(r).toMatchObject({ result: 'refund_recorded', invoiceId: 'in_FAKE0001' });
    expect(w.linhas[0]!).toMatchObject({ amount_refunded_cents: 49990, refunded_at: iso(T + 2 * DIA), nota_status: 'aguardando_emissao' });
  });

  it('dois reembolsos parciais: o total soma, a data é a do último que deu certo', async () => {
    const w = mundo({
      cobrancas: [cobranca({
        amount_refunded: 30000,
        refunds: { data: [
          { id: 're_FAKE1', status: 'succeeded', amount: 10000, created: T + DIA },
          { id: 're_FAKE2', status: 'succeeded', amount: 20000, created: T + 3 * DIA },
          { id: 're_FAKE3', status: 'failed', amount: 5000, created: T + 4 * DIA },
        ] },
      })],
    });
    await w.entrega('invoice.paid', { id: 'in_FAKE0001' });
    await w.entrega('charge.refunded', { id: 'ch_FAKE0001' });
    expect(w.linhas[0]!).toMatchObject({ amount_refunded_cents: 30000, refunded_at: iso(T + 3 * DIA) });
    // reenvio do mesmo evento grava a mesma coisa
    await w.entrega('charge.refunded', { id: 'ch_FAKE0001' });
    expect(w.linhas[0]!.amount_refunded_cents).toBe(30000);
  });

  it('o reembolso chega antes da linha da fatura: grava a fatura e depois o reembolso', async () => {
    const w = mundo({ cobrancas: [cobranca()] });
    const r = await w.entrega('charge.refunded', { id: 'ch_FAKE0001' });
    expect(r.result).toBe('refund_recorded');
    expect(w.linhas).toHaveLength(1);
    expect(w.linhas[0]!.amount_refunded_cents).toBe(49990);
  });

  it('cobrança sem fatura no Stripe: acha a linha pela cobrança ou pelo pagamento', async () => {
    const w = mundo({ cobrancas: [cobranca({ invoice: null })] });
    await w.entrega('invoice.paid', { id: 'in_FAKE0001' });
    expect((await w.entrega('charge.refunded', { id: 'ch_FAKE0001' })).result).toBe('refund_recorded');
  });

  it('cobrança avulsa, sem fatura nenhuma: ignorada', async () => {
    const w = mundo({ cobrancas: [cobranca({ id: 'ch_FAKE9', invoice: null, payment_intent: 'pi_FAKE9' })] });
    expect(await w.entrega('charge.refunded', { id: 'ch_FAKE9' })).toEqual({ result: 'refund_without_invoice', chargeId: 'ch_FAKE9' });
    expect(w.linhas).toHaveLength(0);
  });

  it('refundPatchFromCharge: nada devolvido = zero e sem data', () => {
    expect(refundPatchFromCharge({ amount_refunded: 0, refunds: { data: [] } })).toEqual({ amount_refunded_cents: 0, refunded_at: null });
  });
});

describe('partes puras', () => {
  it('sem linhas na fatura, o período cai no da própria fatura', () => {
    expect(invoicePeriod({ period_start: T, period_end: T + DIA, lines: { data: [] } })).toEqual({ start: iso(T), end: iso(T + DIA) });
  });

  it('chargeRowFromInvoice: fatura não paga ou sem id não vira linha', () => {
    expect(chargeRowFromInvoice(fatura({ status: 'open' }), CONTA)).toBeNull();
    expect(chargeRowFromInvoice(fatura({ id: undefined }), CONTA)).toBeNull();
    expect(chargeRowFromInvoice(fatura({ currency: 'BRL' }), CONTA)?.currency).toBe('brl');
  });
});
