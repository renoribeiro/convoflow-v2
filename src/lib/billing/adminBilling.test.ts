/**
 * Administração › Faturamento — as listas das Contas e o espelho do servidor.
 *
 * Trava:
 *   1. "Em teste" é o status trialing, nunca `trial_ends_at` sozinho.
 *   2. A Conta com assinatura na conta antiga do Stripe sai de TODAS as listas.
 *   3. Loja não entra: só Conta assina.
 *   4. O espelho (eventos do webhook, endereço) é igual ao do servidor.
 */
import { describe, expect, it } from 'vitest';

import {
  WEBHOOK_EVENTS,
  currentMonthRevenue,
  formatCents,
  formatDate,
  formatMonth,
  statusLabel,
  stripeWebhookUrl,
  summarizeContas,
  unrecoveredFailures,
  upcomingTotal,
  type BillingOverview,
  type ContaBillingRow,
} from './adminBilling';
import {
  WEBHOOK_EVENTS as WEBHOOK_EVENTS_SERVIDOR,
  webhookUrl,
} from '../../../supabase/functions/_shared/stripe-admin-core.ts';

function conta(id: string, o: Partial<ContaBillingRow> = {}): ContaBillingRow {
  return {
    id,
    name: id,
    kind: 'account',
    subscription_id: null,
    subscription_status: null,
    trial_ends_at: null,
    subscription_will_cancel: false,
    subscription_cancel_at: null,
    store_slots_extra: 0,
    ...o,
  };
}

const LINHAS: ContaBillingRow[] = [
  conta('Beta', { subscription_status: 'active', subscription_id: 'sub_b' }),
  conta('Alfa', { subscription_status: 'active', subscription_id: 'sub_a', store_slots_extra: 2 }),
  conta('OTAVIO PRADO', { subscription_status: 'active', subscription_id: 'sub_antiga' }),
  conta('Teste Tarde', { subscription_status: 'trialing', trial_ends_at: '2026-10-05T12:00:00Z' }),
  conta('Teste Cedo', { subscription_status: 'trialing', trial_ends_at: '2026-10-01T12:00:00Z' }),
  // Data de teste antiga, sem assinatura: NÃO está em teste.
  conta('Conta Teste Gerente', { trial_ends_at: '2026-08-26T20:47:32Z', subscription_status: null }),
  conta('Devendo', { subscription_status: 'past_due' }),
  conta('Parou', { subscription_status: 'unpaid' }),
  conta('Sai em Novembro', { subscription_status: 'active', subscription_will_cancel: true, subscription_cancel_at: '2026-11-02T12:00:00Z' }),
  conta('Sai no Teste', { subscription_status: 'trialing', trial_ends_at: '2026-10-02T12:00:00Z', subscription_will_cancel: true, subscription_cancel_at: '2026-10-02T12:00:00Z' }),
  conta('Já Saiu', { subscription_status: 'canceled', subscription_will_cancel: true, subscription_cancel_at: '2026-09-01T12:00:00Z' }),
  conta('Uma Loja', { kind: 'store', subscription_status: 'active' }),
];

describe('summarizeContas', () => {
  const r = summarizeContas(LINHAS, new Set(['OTAVIO PRADO']));
  const nomes = (l: ContaBillingRow[]) => l.map((c) => c.name);

  it('pagantes: status active, em ordem de nome, sem a Conta da conta antiga nem Loja', () => {
    expect(nomes(r.pagantes)).toEqual(['Alfa', 'Beta', 'Sai em Novembro']);
  });

  it('em teste: status trialing, pela data de fim; trial_ends_at sozinho não conta', () => {
    expect(nomes(r.emTeste)).toEqual(['Teste Cedo', 'Sai no Teste', 'Teste Tarde']);
    expect(nomes(r.emTeste)).not.toContain('Conta Teste Gerente');
  });

  it('pagamento pendente: past_due e unpaid', () => {
    expect(nomes(r.pendentes)).toEqual(['Devendo', 'Parou']);
  });

  it('cancelamento agendado: pela data, sem quem já saiu', () => {
    expect(nomes(r.cancelamentos)).toEqual(['Sai no Teste', 'Sai em Novembro']);
  });

  it('a Conta da conta antiga não aparece em lista nenhuma', () => {
    const todas = [...r.pagantes, ...r.emTeste, ...r.pendentes, ...r.cancelamentos];
    expect(nomes(todas)).not.toContain('OTAVIO PRADO');
  });

  it('sem a lista da conta antiga (Stripe fora), ela volta a contar como pagante', () => {
    expect(nomes(summarizeContas(LINHAS).pagantes)).toContain('OTAVIO PRADO');
  });
});

describe('espelho do servidor', () => {
  it('os mesmos 6 eventos do webhook', () => {
    expect([...WEBHOOK_EVENTS]).toEqual([...WEBHOOK_EVENTS_SERVIDOR]);
    expect(WEBHOOK_EVENTS).toHaveLength(6);
  });

  it('o mesmo endereço do webhook', () => {
    const base = 'https://pqjkuwyshybxldzpfbbs.supabase.co/';
    expect(stripeWebhookUrl(base)).toBe(webhookUrl(() => base));
    expect(stripeWebhookUrl(base)).toBe('https://pqjkuwyshybxldzpfbbs.supabase.co/functions/v1/stripe-webhook');
  });
});

describe('formatação', () => {
  it('centavos em reais', () => {
    expect(formatCents(49990)).toMatch(/R\$\s?499,90/);
    expect(formatCents(null)).toBe('—');
  });
  it('data no fuso de Brasília', () => {
    expect(formatDate('2026-11-09T01:00:00Z')).toBe('08/11/2026');
    expect(formatDate(null)).toBe('—');
  });
  it('mês curto', () => {
    expect(formatMonth('2026-09')).toBe('set/2026');
  });
  it('rótulos de situação', () => {
    expect(statusLabel('past_due')).toBe('Pagamento pendente');
    expect(statusLabel(null)).toBe('Sem assinatura');
  });
});

describe('agregados do Stripe', () => {
  const o: BillingOverview = {
    generatedAt: '2026-09-29T15:00:00Z',
    mode: 'live',
    currency: 'brl',
    mrr: { net: 0, gross: 0, plan: 0, extraStores: 0, other: 0, discounts: 0, subscriptions: 0 },
    upcoming: [
      { tenantId: 'a', contaName: 'A', subscriptionId: 's1', status: 'active', date: null, amount: 49990, currency: 'brl' },
      { tenantId: 'b', contaName: 'B', subscriptionId: 's2', status: 'active', date: null, amount: null, currency: 'brl' },
    ],
    revenueByMonth: [
      { month: '2026-08', amount: 100, invoices: 1 },
      { month: '2026-09', amount: 200, invoices: 2 },
    ],
    failedPayments: [
      { tenantId: 'a', contaName: 'A', chargeId: 'c1', date: '2026-09-01T00:00:00Z', amount: 1, currency: 'brl', reason: null, recovered: true },
      { tenantId: 'a', contaName: 'A', chargeId: 'c2', date: '2026-09-02T00:00:00Z', amount: 1, currency: 'brl', reason: null, recovered: false },
    ],
    legacy: [],
    warnings: [],
  };
  it('total das próximas cobranças ignora valor desconhecido', () => expect(upcomingTotal(o)).toBe(49990));
  it('mês atual é o último', () => expect(currentMonthRevenue(o)).toEqual({ month: '2026-09', amount: 200, invoices: 2 }));
  it('falhas sem recuperação', () => expect(unrecoveredFailures(o)).toBe(1));
});
