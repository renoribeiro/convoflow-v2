/**
 * Administração › Faturamento (item 10).
 *
 * Cada cartão e cada lista, com as duas fontes:
 *   - as linhas das Contas (supabase.from('tenants'));
 *   - o Stripe ao vivo (stripeService.getBillingOverview → stripe-admin).
 * E a Conta com assinatura na conta ANTIGA do Stripe: à parte, com o rótulo,
 * fora de todo número e de toda lista.
 *
 * Também trava o que saiu: nada lê `subscriptions` nem `stripe_transactions`,
 * não há cartão "Produto Stripe" nem o id do produto da conta antiga.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { BillingOverview, ContaBillingRow } from '@/lib/billing/adminBilling';

// ---- Supabase: só a tabela tenants responde; as outras quebram o teste ----
const tabelasLidas: string[] = [];
let contas: ContaBillingRow[] = [];

vi.mock('@/integrations/supabase/client', () => {
  const builder = (table: string) => {
    tabelasLidas.push(table);
    const b: any = {
      select: () => b,
      eq: () => b,
      order: () => b,
      then: (res: (v: unknown) => unknown) =>
        Promise.resolve(
          table === 'tenants' ? { data: contas, error: null } : { data: null, error: { message: `tabela proibida: ${table}` } },
        ).then(res),
    };
    return b;
  };
  return { supabase: { from: (t: string) => builder(t) } };
});

// ---- Stripe (stripe-admin) ----
let overview: BillingOverview | Error;
const getBillingOverview = vi.fn(async () => {
  if (overview instanceof Error) throw overview;
  return overview;
});
const getStripeStatus = vi.fn(async () => ({
  secretConfigured: true,
  connected: true,
  mode: 'live',
  error: null,
  account: { id: 'acct_nova', name: 'ConvoFlow', email: 'fin@convoflow.test', country: 'BR' },
  prices: {
    gerente: { env: 'STRIPE_PRICE_GERENTE', configured: true, found: true, id: 'price_g', active: true, unitAmount: 49990, currency: 'brl', interval: 'month', intervalCount: 1, productName: 'Conta Gerente', error: null },
    storeSlot: { env: 'STRIPE_PRICE_STORE_SLOT', configured: true, found: true, id: 'price_s', active: true, unitAmount: 9990, currency: 'brl', interval: 'month', intervalCount: 1, productName: 'Loja extra', error: null },
  },
  webhook: { url: 'https://proj.supabase.co/functions/v1/stripe-webhook', expectedEvents: [], found: true, enabled: true, missingEvents: [], error: null },
}));

vi.mock('@/services/stripeService', () => ({
  stripeService: {
    getBillingOverview: () => getBillingOverview(),
    getStripeStatus: () => getStripeStatus(),
  },
}));

vi.mock('@/components/admin/billing/CouponManager', () => ({
  CouponManager: () => <div>gerenciador de cupons</div>,
}));

import { BillingDashboard } from './BillingDashboard';

// ---------------------------------------------------------------------------

function conta(name: string, o: Partial<ContaBillingRow> = {}): ContaBillingRow {
  return {
    id: `t-${name}`,
    name,
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

const OTAVIO = conta('OTAVIO PRADO', { subscription_status: 'active', subscription_id: 'sub_FAKEcontaantiga000001' });

const CONTAS: ContaBillingRow[] = [
  conta('Alfa Imóveis', { subscription_status: 'active', subscription_id: 'sub_a', store_slots_extra: 2 }),
  OTAVIO,
  conta('Beta em Teste', { subscription_status: 'trialing', trial_ends_at: '2026-10-03T15:00:00Z' }),
  conta('Conta Teste Gerente', { trial_ends_at: '2026-08-26T20:47:32Z' }),
  conta('Gama Devendo', { subscription_status: 'past_due' }),
  conta('Delta Saindo', { subscription_status: 'active', subscription_will_cancel: true, subscription_cancel_at: '2026-11-02T15:00:00Z' }),
];

const OVERVIEW: BillingOverview = {
  generatedAt: '2026-09-29T15:00:00Z',
  mode: 'live',
  currency: 'brl',
  mrr: { net: 84975, gross: 119960, plan: 99980, extraStores: 19980, other: 0, discounts: 34985, subscriptions: 2 },
  upcoming: [
    { tenantId: 't-Beta em Teste', contaName: 'Beta em Teste', subscriptionId: 'sub_b', status: 'trialing', date: '2026-10-03T15:00:00Z', amount: 49990, currency: 'brl' },
    { tenantId: 't-Alfa Imóveis', contaName: 'Alfa Imóveis', subscriptionId: 'sub_a', status: 'active', date: '2026-10-15T15:00:00Z', amount: 34985, currency: 'brl' },
  ],
  revenueByMonth: [
    { month: '2026-08', amount: 9990, invoices: 1 },
    { month: '2026-09', amount: 49990, invoices: 1 },
  ],
  failedPayments: [
    { tenantId: 't-Gama Devendo', contaName: 'Gama Devendo', chargeId: 'ch_1', date: '2026-09-20T15:00:00Z', amount: 49990, currency: 'brl', reason: 'Cartão recusado', recovered: false },
    { tenantId: 't-Alfa Imóveis', contaName: 'Alfa Imóveis', chargeId: 'ch_2', date: '2026-09-09T15:00:00Z', amount: 49990, currency: 'brl', reason: 'Saldo insuficiente', recovered: true },
  ],
  legacy: [
    { tenantId: OTAVIO.id, contaName: 'OTAVIO PRADO', subscriptionId: 'sub_FAKEcontaantiga000001', subscriptionStatus: 'active' },
  ],
  warnings: [],
};

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <BillingDashboard />
    </QueryClientProvider>,
  );
}

const cartao = (titulo: string) => screen.getByTestId(`cartao-${titulo}`);
const valorDo = (titulo: string) => within(cartao(titulo)).getByTestId('valor').textContent ?? '';
const tabela = (nome: string) => screen.getByRole('table', { name: nome });
const nomesNa = (nome: string) =>
  within(tabela(nome))
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).getAllByRole('cell')[0]?.textContent ?? '');

beforeEach(() => {
  tabelasLidas.length = 0;
  contas = CONTAS.map((c) => ({ ...c }));
  overview = structuredClone(OVERVIEW);
  getBillingOverview.mockClear();
  getStripeStatus.mockClear();
});

// ---------------------------------------------------------------------------

describe('Faturamento — cartões das Contas', () => {
  it('pagantes, teste, pendente e cancelamento agendado vêm das linhas, sem a Conta da conta antiga', async () => {
    renderTab();
    await waitFor(() => expect(valorDo('Contas pagantes')).toBe('2'));
    // Alfa + Delta (ativa com cancelamento agendado). OTAVIO fica de fora.
    expect(valorDo('Em teste')).toBe('1');
    expect(within(cartao('Em teste')).getByText('O próximo termina em 03/10/2026')).toBeInTheDocument();
    expect(valorDo('Pagamento pendente')).toBe('1');
    expect(valorDo('Cancelamento agendado')).toBe('1');
  });
});

describe('Faturamento — listas das Contas', () => {
  it('em teste (com a data), pendente, cancelamento agendado e pagantes', async () => {
    renderTab();
    await waitFor(() => expect(nomesNa('Contas pagantes')).toEqual(['Alfa Imóveis', 'Delta Saindo']));

    expect(nomesNa('Em teste')).toEqual(['Beta em Teste']);
    expect(within(tabela('Em teste')).getByText('03/10/2026')).toBeInTheDocument();
    // trial_ends_at sozinho não põe ninguém em teste.
    expect(within(tabela('Em teste')).queryByText('Conta Teste Gerente')).toBeNull();

    expect(nomesNa('Pagamento pendente')).toEqual(['Gama Devendo']);
    expect(nomesNa('Cancelamento agendado')).toEqual(['Delta Saindo']);
    expect(within(tabela('Cancelamento agendado')).getByText('02/11/2026')).toBeInTheDocument();
    // Lojas extras na lista de pagantes.
    expect(within(tabela('Contas pagantes')).getByText('2')).toBeInTheDocument();
  });
});

describe('Faturamento — Conta da conta antiga do Stripe', () => {
  it('aparece à parte, com o rótulo, e em nenhuma outra lista', async () => {
    renderTab();
    const bloco = await screen.findByTestId('contas-conta-antiga');
    expect(within(bloco).getByText('Fora da conta atual do Stripe')).toBeInTheDocument();
    expect(within(bloco).getByText('OTAVIO PRADO')).toBeInTheDocument();
    expect(within(bloco).getByText('Conta antiga do Stripe')).toBeInTheDocument();
    expect(within(bloco).getByText('sub_FAKEcontaantiga000001')).toBeInTheDocument();

    await waitFor(() => expect(nomesNa('Contas pagantes')).toEqual(['Alfa Imóveis', 'Delta Saindo']));
    for (const lista of ['Em teste', 'Pagamento pendente', 'Cancelamento agendado', 'Contas pagantes']) {
      expect(within(tabela(lista)).queryByText('OTAVIO PRADO')).toBeNull();
    }
  });

  it('sem Conta fora da conta atual, o bloco não aparece', async () => {
    overview = { ...structuredClone(OVERVIEW), legacy: [] };
    renderTab();
    await waitFor(() => expect(getBillingOverview).toHaveBeenCalled());
    await waitFor(() => expect(valorDo('Receita mensal recorrente')).toMatch(/849,75/));
    expect(screen.queryByTestId('contas-conta-antiga')).toBeNull();
  });

  it('Stripe fora do ar: avisa que a conta antiga não pôde ser separada', async () => {
    overview = new Error('O Stripe não respondeu agora.');
    renderTab();
    expect(await screen.findByText('O Stripe não respondeu')).toBeInTheDocument();
    expect(screen.getByText(/as Contas com assinatura na conta antiga não puderam ser separadas/)).toBeInTheDocument();
    // Sem a separação, a linha dela conta como pagante — e o aviso diz isso.
    await waitFor(() => expect(valorDo('Contas pagantes')).toBe('3'));
    expect(valorDo('Receita mensal recorrente')).toBe('—');
  });
});

describe('Faturamento — cartões do Stripe', () => {
  it('receita mensal com lojas extras e cupons, próximas cobranças, recebido no mês e falhas', async () => {
    renderTab();
    await waitFor(() => expect(valorDo('Receita mensal recorrente')).toMatch(/R\$\s?849,75/));
    const notaMrr = within(cartao('Receita mensal recorrente')).getByText(/Plano/).textContent ?? '';
    expect(notaMrr).toMatch(/Plano R\$\s?999,80/);
    expect(notaMrr).toMatch(/Lojas extras R\$\s?199,80/);
    expect(notaMrr).toMatch(/Cupons −R\$\s?349,85/);

    expect(valorDo('Próximas cobranças')).toBe('2');
    expect(within(cartao('Próximas cobranças')).getByText(/Somam R\$\s?849,75/)).toBeInTheDocument();

    expect(valorDo('Recebido no mês')).toMatch(/R\$\s?499,90/);
    expect(within(cartao('Recebido no mês')).getByText('set/2026 · 1 fatura(s) paga(s)')).toBeInTheDocument();

    expect(valorDo('Pagamentos que falharam')).toBe('2');
    expect(within(cartao('Pagamentos que falharam')).getByText('Últimos 90 dias · 1 sem recuperação')).toBeInTheDocument();
  });
});

describe('Faturamento — listas do Stripe', () => {
  it('próximas cobranças, receita por mês e pagamentos que falharam', async () => {
    const user = userEvent.setup();
    renderTab();
    await waitFor(() => expect(getBillingOverview).toHaveBeenCalled());
    await user.click(screen.getByRole('tab', { name: 'Stripe' }));

    await waitFor(() => expect(nomesNa('Próximas cobranças')).toEqual(['Beta em Teste', 'Alfa Imóveis']));
    expect(within(tabela('Próximas cobranças')).getByText('03/10/2026')).toBeInTheDocument();
    expect(within(tabela('Próximas cobranças')).getByText(/349,85/)).toBeInTheDocument();

    // Mais recente primeiro.
    expect(nomesNa('Receita recebida por mês')).toEqual(['set/2026', 'ago/2026']);
    expect(within(tabela('Receita recebida por mês')).getByText(/^R\$\s?99,90$/)).toBeInTheDocument();

    expect(nomesNa('Pagamentos que falharam')).toEqual(['Gama Devendo', 'Alfa Imóveis']);
    expect(within(tabela('Pagamentos que falharam')).getByText('Cartão recusado')).toBeInTheDocument();
    expect(within(tabela('Pagamentos que falharam')).getByText('Não recuperado')).toBeInTheDocument();
    expect(within(tabela('Pagamentos que falharam')).getByText('Recuperado')).toBeInTheDocument();

    // A Conta da conta antiga não entra em lista do Stripe.
    for (const lista of ['Próximas cobranças', 'Pagamentos que falharam']) {
      expect(within(tabela(lista)).queryByText('OTAVIO PRADO')).toBeNull();
    }
  });
});

describe('Faturamento — o que saiu da tela', () => {
  it('não lê subscriptions nem stripe_transactions; sem "Produto Stripe" nem id da conta antiga', async () => {
    renderTab();
    await waitFor(() => expect(valorDo('Contas pagantes')).toBe('2'));
    expect(tabelasLidas).toEqual(['tenants']);
    expect(screen.queryByText('Produto Stripe')).toBeNull();
    expect(screen.queryByText(/prod_Tmg5IInlTr4hi3/)).toBeNull();
    expect(screen.queryByText(/Nenhuma assinatura ou transação encontrada/)).toBeNull();
    expect(screen.queryByText('Total Faturado')).toBeNull();
  });

  it('as abas: Contas, Stripe, Cupons e Conexão', async () => {
    renderTab();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Contas', 'Stripe', 'Cupons', 'Conexão']);
  });
});
