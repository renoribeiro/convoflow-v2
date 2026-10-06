/**
 * A tela de bloqueio, por cargo.
 *
 * O que estes testes travam:
 *   - o GERENTE vê preço e um botão que chama o checkout de verdade (antes o
 *     botão só abria um toast de "em breve": bloqueio sem saída);
 *   - GESTOR e ATENDENTE não veem preço nem botão de assinar — o servidor
 *     recusaria o checkout deles de qualquer jeito, e oferecer o que não
 *     funciona é pior que não oferecer;
 *   - o botão nunca falha calado: a recusa do servidor aparece NA TELA;
 *   - "Sair" existe nas duas variantes.
 *
 * O `@/lib/billing/checkout` roda de verdade aqui — só o cliente do Supabase é
 * dublado. Assim o teste cobre também a montagem da chamada e a extração da
 * mensagem de erro em pt-BR.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockInvoke, mockLogout, mockRefreshTenant, mockToast } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockLogout: vi.fn(),
  mockRefreshTenant: vi.fn().mockResolvedValue(undefined),
  mockToast: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: mockInvoke } },
}));

vi.mock('@/lib/rewardful', () => ({
  getRewardfulReferral: () => null,
}));

let role: string | null = 'gerente';
let tenant: Record<string, unknown> | null = null;

vi.mock('@/contexts/TenantContext', () => ({
  useRole: () => role,
  useTenant: () => ({ tenant, refreshTenant: mockRefreshTenant }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ logout: mockLogout }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

import { PaywallScreen } from './PaywallScreen';
import { PLAN_PRICE_LABEL, SUPORTE_EMAIL } from '@/lib/billing/checkout';

const CONTA = { id: 'conta-teste', kind: 'account', name: 'Conta Teste Gerente' };
const LOJA = { id: 'loja-teste', kind: 'store', name: 'Loja Teste' };

/** jsdom não navega: trocamos `location` por um objeto observável. */
let hrefAtribuido = '';
const locationOriginal = window.location;

const renderPaywall = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PaywallScreen />
    </QueryClientProvider>,
  );
};

const botaoAssinar = () => screen.queryByRole('button', { name: /assinar agora/i });

beforeEach(() => {
  vi.clearAllMocks();
  role = 'gerente';
  tenant = CONTA;
  hrefAtribuido = '';
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: {
      ...locationOriginal,
      get href() {
        return hrefAtribuido;
      },
      set href(valor: string) {
        hrefAtribuido = valor;
      },
    },
  });
});

afterEach(() => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: locationOriginal,
  });
});

// ---------------------------------------------------------------------------
describe('GERENTE — bloqueado, mas com caminho de pagamento', () => {
  it('mostra o preço do plano e o botão de assinar', () => {
    renderPaywall();

    expect(screen.getByText('Acesso bloqueado')).toBeInTheDocument();
    expect(screen.getAllByText(new RegExp(PLAN_PRICE_LABEL.replace(/\$/g, '\\$'))).length)
      .toBeGreaterThan(0);
    expect(botaoAssinar()).toBeInTheDocument();
  });

  it('nomeia a Conta bloqueada', () => {
    renderPaywall();
    expect(screen.getByText('Conta Teste Gerente')).toBeInTheDocument();
  });

  it('o botão chama create-checkout-session e leva para a URL do Stripe', async () => {
    mockInvoke.mockResolvedValue({ data: { url: 'https://checkout.stripe.com/c/pay/abc' }, error: null });

    renderPaywall();
    await userEvent.click(botaoAssinar()!);

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith('create-checkout-session', { body: {} }),
    );
    await waitFor(() => expect(hrefAtribuido).toBe('https://checkout.stripe.com/c/pay/abc'));
  });

  it('recusa do servidor aparece NA TELA, não só num toast que some', async () => {
    // 403 de `create-checkout-session`: o corpo em pt-BR vem pendurado no
    // `context` do FunctionsHttpError.
    mockInvoke.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          json: async () => ({ error: 'Cobrança ainda não configurada.' }),
        },
      },
    });

    renderPaywall();
    await userEvent.click(botaoAssinar()!);

    expect(await screen.findByText('Cobrança ainda não configurada.')).toBeInTheDocument();
    expect(mockToast).toHaveBeenCalled();
    // Não navegou para lugar nenhum.
    expect(hrefAtribuido).toBe('');
  });

  it('resposta sem URL não navega e explica o motivo', async () => {
    mockInvoke.mockResolvedValue({ data: {}, error: null });

    renderPaywall();
    await userEvent.click(botaoAssinar()!);

    expect(await screen.findByText(/não devolveu o endereço de pagamento/i)).toBeInTheDocument();
    expect(hrefAtribuido).toBe('');
  });

  it('"Já paguei" recarrega a Conta em vez de deixar o cache velho travando', async () => {
    renderPaywall();
    await userEvent.click(screen.getByRole('button', { name: /já paguei/i }));

    await waitFor(() => expect(mockRefreshTenant).toHaveBeenCalled());
  });

  it('oferece contato de suporte mesmo podendo pagar', () => {
    renderPaywall();
    expect(screen.getByText(SUPORTE_EMAIL)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
describe.each(['gestor', 'atendente'])('%s — bloqueio total, sem preço', (cargo) => {
  beforeEach(() => {
    role = cargo;
    tenant = LOJA;
  });

  it('não mostra preço', () => {
    renderPaywall();
    expect(screen.queryByText(new RegExp(PLAN_PRICE_LABEL.replace(/\$/g, '\\$')))).toBeNull();
  });

  it('não mostra botão de assinar', () => {
    renderPaywall();
    expect(botaoAssinar()).toBeNull();
    expect(screen.queryByRole('button', { name: /já paguei/i })).toBeNull();
  });

  it('manda falar com o Gerente responsável pela Conta', () => {
    renderPaywall();
    expect(screen.getByText(/responsável pela Conta/i)).toBeInTheDocument();
    expect(screen.getByText('Gerente')).toBeInTheDocument();
  });

  it('chama a Loja de Loja, não de Conta', () => {
    renderPaywall();
    expect(screen.getByText(/A Conta responsável pela Loja/i)).toBeInTheDocument();
    expect(screen.getByText('Loja Teste')).toBeInTheDocument();
  });

  it('não dispara checkout nenhum', () => {
    renderPaywall();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('ainda oferece o suporte como saída', () => {
    renderPaywall();
    expect(screen.getByText(SUPORTE_EMAIL)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
describe('comum às duas variantes', () => {
  it.each([
    ['gerente', CONTA],
    ['gestor', LOJA],
    ['atendente', LOJA],
  ])('%s mantém o botão Sair', async (cargo, linha) => {
    role = cargo;
    tenant = linha;

    renderPaywall();
    await userEvent.click(screen.getByRole('button', { name: /sair/i }));

    expect(mockLogout).toHaveBeenCalled();
  });

  it('cargo ainda não resolvido não oferece pagamento', () => {
    // Defesa: `role` nulo cai na variante sem botão, nunca na que cobra.
    role = null;
    tenant = LOJA;

    renderPaywall();
    expect(botaoAssinar()).toBeNull();
  });
});
