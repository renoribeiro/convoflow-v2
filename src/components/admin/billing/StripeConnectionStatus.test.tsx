/**
 * Aba Conexão do Faturamento (item 10).
 *
 * Trava:
 *   1. Não existe campo para salvar chave — a chave é a secret do Supabase.
 *   2. "Testar Conexão" só consulta de novo (get_status); não grava nada.
 *   3. O endereço do webhook é o real (…/functions/v1/stripe-webhook) e a
 *      lista tem os 6 eventos que o stripe-webhook precisa.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { StripeStatus } from '@/lib/billing/adminBilling';

let status: StripeStatus;
const getStripeStatus = vi.fn(async () => status);
const chamadas: string[] = [];

vi.mock('@/services/stripeService', () => ({
  // Qualquer outro método chamado aqui estoura: a tela só pode ler o estado.
  stripeService: new Proxy(
    {},
    {
      get: (_alvo, nome: string | symbol) => {
        if (typeof nome !== 'string') return undefined;
        chamadas.push(nome);
        if (nome === 'getStripeStatus') return () => getStripeStatus();
        return () => {
          throw new Error(`método proibido na aba Conexão: ${nome}`);
        };
      },
    },
  ),
}));

vi.mock('@/lib/env', () => ({
  env: { get: (k: string) => (k === 'SUPABASE_URL' ? 'https://pqjkuwyshybxldzpfbbs.supabase.co' : undefined) },
}));

import { StripeConnectionStatus } from './StripeConnectionStatus';

const URL_WEBHOOK = 'https://pqjkuwyshybxldzpfbbs.supabase.co/functions/v1/stripe-webhook';
const SEIS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
];

function base(): StripeStatus {
  return {
    secretConfigured: true,
    connected: true,
    mode: 'live',
    error: null,
    account: { id: 'acct_FAKE000001', name: 'ConvoFlow', email: 'financeiro@example.com', country: 'BR' },
    prices: {
      gerente: { env: 'STRIPE_PRICE_GERENTE', configured: true, found: true, id: 'price_gerente', active: true, unitAmount: 49990, currency: 'brl', interval: 'month', intervalCount: 1, productName: 'ConvoFlow Conta', error: null },
      storeSlot: { env: 'STRIPE_PRICE_STORE_SLOT', configured: true, found: true, id: 'price_loja', active: true, unitAmount: 9990, currency: 'brl', interval: 'month', intervalCount: 1, productName: 'Loja extra', error: null },
    },
    webhook: { url: URL_WEBHOOK, expectedEvents: SEIS, found: true, enabled: true, missingEvents: [], error: null },
  };
}

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StripeConnectionStatus />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  status = base();
  getStripeStatus.mockClear();
  chamadas.length = 0;
});

describe('StripeConnectionStatus', () => {
  it('conectado: conta, modo, os dois preços', async () => {
    renderTab();
    expect(await screen.findByText('Conectado')).toBeInTheDocument();
    expect(screen.getByText('Produção')).toBeInTheDocument();
    expect(screen.getByText('acct_FAKE000001')).toBeInTheDocument();
    const plano = screen.getByTestId('preco-STRIPE_PRICE_GERENTE');
    expect(plano.textContent).toMatch(/R\$\s?499,90 \/ mês — ConvoFlow Conta/);
    expect(within(plano).getByText('OK')).toBeInTheDocument();
    expect(screen.getByTestId('preco-STRIPE_PRICE_STORE_SLOT').textContent).toMatch(/R\$\s?99,90 \/ mês/);
  });

  it('não tem campo de chave nem botão de salvar', async () => {
    renderTab();
    await screen.findByText('Conectado');
    expect(screen.queryAllByRole('textbox')).toEqual([]);
    expect(document.querySelectorAll('input').length).toBe(0);
    expect(screen.queryByRole('button', { name: /salvar/i })).toBeNull();
  });

  it('"Testar Conexão" só consulta de novo', async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByText('Conectado');
    expect(getStripeStatus).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: /Testar Conexão/ }));
    await waitFor(() => expect(getStripeStatus).toHaveBeenCalledTimes(2));
    expect(new Set(chamadas)).toEqual(new Set(['getStripeStatus']));
  });

  it('webhook: o endereço real e os 6 eventos', async () => {
    renderTab();
    await screen.findByText('Endpoint encontrado e ativo.');
    expect(screen.getByTestId('webhook-url').textContent).toBe(URL_WEBHOOK);
    const eventos = within(screen.getByRole('list', { name: 'Eventos do webhook' })).getAllByRole('listitem');
    expect(eventos.map((e) => e.textContent)).toEqual(SEIS);
    expect(screen.queryByText(/api\/webhooks\/stripe/)).toBeNull();
    expect(screen.queryByText(/payment_intent/)).toBeNull();
  });

  it('webhook sem 2 eventos: marca os que faltam', async () => {
    status = base();
    status.webhook.missingEvents = ['customer.subscription.created', 'customer.subscription.updated'];
    renderTab();
    await screen.findByText('Conectado');
    expect(screen.getAllByLabelText('falta')).toHaveLength(2);
    expect(screen.getAllByLabelText('ok')).toHaveLength(4);
  });

  it('preço que não existe na conta conectada aparece como problema', async () => {
    status = base();
    status.prices.storeSlot = { ...status.prices.storeSlot, found: false, unitAmount: null, error: 'O preço de STRIPE_PRICE_STORE_SLOT não existe na conta do Stripe conectada.' };
    renderTab();
    const loja = await screen.findByTestId('preco-STRIPE_PRICE_STORE_SLOT');
    expect(within(loja).getByText('Problema')).toBeInTheDocument();
    expect(within(loja).getByText(/não existe na conta do Stripe conectada/)).toBeInTheDocument();
  });

  it('sem conexão: mostra o motivo e ainda o endereço do webhook', async () => {
    status = { ...base(), connected: false, secretConfigured: false, account: null, error: 'Stripe não configurado: defina a secret STRIPE_SECRET_KEY no projeto do Supabase.' };
    renderTab();
    expect(await screen.findByText('Sem conexão')).toBeInTheDocument();
    expect(screen.getByText(/defina a secret STRIPE_SECRET_KEY/)).toBeInTheDocument();
    expect(screen.getByTestId('webhook-url').textContent).toBe(URL_WEBHOOK);
  });
});
