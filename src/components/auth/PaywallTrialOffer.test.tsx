/**
 * A tela de bloqueio com a oferta do teste grátis LIGADA (entrega 2).
 *
 * PaywallScreen.test.tsx cobre a tela de hoje (oferta desligada). Aqui a chave
 * TRIAL_OFFER_ENABLED é ligada por mock e travamos:
 *   - Conta que nunca assinou → "Começar teste grátis", com "hoje você não paga
 *     nada", a data e o valor da primeira cobrança, como cancelar, um teste por
 *     CNPJ ou CPF e os limites do teste (sessão 2);
 *   - Conta que já assinou → "Assinar agora", sem promessa de teste;
 *   - CNPJ ou CPF que já teve teste → "Assinar agora" com o aviso (sessão 2);
 *   - não deu para saber (erro) → "Assinar agora";
 *   - quem responde é public.teste_gratis_disponivel (RPC), não a linha da Conta;
 *   - a pergunta vai para a CONTA do gerente, nunca para a Loja em foco;
 *   - de volta do Stripe → "Confirmando seu pagamento", sem botão de pagar,
 *     perguntando de novo por cima do cache, e avisando se demorar;
 *   - gestor continua sem preço.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockInvoke, mockFrom, mockRpc, mockRefreshTenant } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockRefreshTenant: vi.fn().mockResolvedValue(undefined),
}));

/** A resposta de teste_gratis_disponivel. */
let respostaDoTeste: { data: unknown; error: unknown } = { data: 'disponivel', error: null };
/** A linha de limites_da_plataforma. */
let linhaDosLimites: { data: unknown; error: unknown } = { data: null, error: null };

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: mockInvoke },
    rpc: mockRpc.mockImplementation(async () => respostaDoTeste),
    from: mockFrom.mockImplementation((tabela: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            tabela === 'limites_da_plataforma' ? linhaDosLimites : { data: { subscription_status: null }, error: null },
        }),
      }),
    })),
  },
}));

vi.mock('@/lib/rewardful', () => ({ getRewardfulReferral: () => null }));

vi.mock('@/lib/billing/trialOffer', async (original) => {
  const real = await original<typeof import('@/lib/billing/trialOffer')>();
  return { ...real, TRIAL_OFFER_ENABLED: true };
});

let role: string | null = 'gerente';
let tenant: Record<string, unknown> | null = null;
let profile: Record<string, unknown> | null = null;

vi.mock('@/contexts/TenantContext', () => ({
  useRole: () => role,
  useTenant: () => ({ tenant, profile, refreshTenant: mockRefreshTenant }),
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ logout: vi.fn() }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
// Dados para a nota fiscal (parte 1): preenchidos — estes testes são da oferta
// do teste grátis. O caso "sem os dados" está em PaywallScreen.test.tsx.
vi.mock('@/hooks/useDadosFiscais', () => ({
  useDadosFiscais: () => ({
    dados: {
      tenant_id: 'conta-1', person_type: 'cpf', tax_id: '11144477735', legal_name: 'Fulano de Teste',
      cep: '60000000', street: 'Rua Exemplo', number: '1', complement: null, district: 'Centro',
      city: 'Fortaleza', city_ibge_code: '2304400', state: 'CE', invoice_email: 'nota@exemplo.com.br',
    },
    completos: true,
    carregando: false,
    erro: null,
  }),
  useSalvarDadosFiscais: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { PaywallScreen } from './PaywallScreen';
import { PLAN_PRICE_LABEL } from '@/lib/billing/checkout';
import { COMO_CANCELAR_NO_TESTE, trialChargeDateLabel } from '@/lib/billing/trialOffer';
import { CONFIRMACAO_INTERVALO_MS, CONFIRMACAO_LIMITE_MS } from '@/lib/billing/paywallState';
import { QUERY_KEYS } from '@/lib/queryClient';
import { LIMITES_PADRAO } from '@/lib/billing/limitesDoTesteTexto';

const CONTA = { id: 'conta-1', kind: 'account', name: 'Imobiliária Horizonte' };
const LOJA = { id: 'loja-1', kind: 'store', name: 'Loja Centro', parent_tenant_id: 'conta-1' };

const locationOriginal = window.location;
const comBusca = (search: string) =>
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { ...locationOriginal, search, href: '' },
  });

let queryClient: QueryClient;
const renderPaywall = () => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PaywallScreen />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  role = 'gerente';
  tenant = CONTA;
  profile = { tenant_id: 'conta-1' };
  respostaDoTeste = { data: 'disponivel', error: null };
  linhaDosLimites = { data: { id: true, ...LIMITES_PADRAO }, error: null };
  comBusca('');
});

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(window, 'location', { configurable: true, writable: true, value: locationOriginal });
});

describe('Conta que nunca assinou → oferta do teste grátis', () => {
  it('mostra o título, o botão e os termos do teste', async () => {
    renderPaywall();
    expect(await screen.findByText(/Comece seu teste grátis de 7 dias/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Começar teste grátis/ })).toBeInTheDocument();

    const termos = screen.getByTestId('termos-do-teste');
    expect(termos).toHaveTextContent('Hoje você não paga nada.');
    expect(termos).toHaveTextContent(trialChargeDateLabel());
    expect(termos).toHaveTextContent(PLAN_PRICE_LABEL);
    expect(termos).toHaveTextContent(COMO_CANCELAR_NO_TESTE);
    expect(termos).toHaveTextContent('O teste grátis vale uma vez por CNPJ ou CPF.');
  });

  it('lista os limites do teste, lidos do banco, e diz que acabam no primeiro pagamento', async () => {
    linhaDosLimites = { data: { id: true, ...LIMITES_PADRAO, teste_numeros: 3 }, error: null };
    renderPaywall();
    const limites = await screen.findByTestId('limites-do-teste');
    expect(limites).toHaveTextContent(`Até ${LIMITES_PADRAO.teste_lojas} Lojas.`);
    expect(limites).toHaveTextContent('Até 3 números de WhatsApp (1 por QR Code).');
    expect(limites).toHaveTextContent(`Até ${LIMITES_PADRAO.teste_mensagens_dia} mensagens enviadas por dia.`);
    expect(limites).toHaveTextContent(`Campanhas de até ${LIMITES_PADRAO.teste_contatos_campanha} contatos por disparo.`);
    expect(limites).toHaveTextContent('acabam depois do primeiro pagamento');
  });

  it('sem os limites (leitura falhou), a oferta segue sem a lista', async () => {
    linhaDosLimites = { data: null, error: { message: 'rls' } };
    renderPaywall();
    await screen.findByText(/Comece seu teste grátis/);
    expect(screen.queryByTestId('limites-do-teste')).not.toBeInTheDocument();
  });

  it('não chama de "Acesso bloqueado" quem acabou de chegar', async () => {
    renderPaywall();
    await screen.findByText(/Comece seu teste grátis/);
    expect(screen.queryByText('Acesso bloqueado')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Assinar agora/ })).not.toBeInTheDocument();
  });

  it('o botão abre o checkout de sempre (o servidor é quem dá o teste)', async () => {
    mockInvoke.mockResolvedValueOnce({ data: { url: 'https://checkout.stripe.com/x' }, error: null });
    renderPaywall();
    const botao = await screen.findByRole('button', { name: /Começar teste grátis/ });
    await act(async () => botao.click());
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('create-checkout-session', expect.anything()));
  });

  it('pergunta à CONTA do gerente, mesmo com uma Loja em foco', async () => {
    tenant = LOJA;
    renderPaywall();
    await screen.findByText(/Comece seu teste grátis/);
    expect(mockRpc).toHaveBeenCalledWith('teste_gratis_disponivel', { p_tenant_id: 'conta-1' });
    expect(mockRpc).not.toHaveBeenCalledWith('teste_gratis_disponivel', { p_tenant_id: 'loja-1' });
  });

  it('voltou do Stripe sem concluir: avisa que nada foi cobrado', async () => {
    comBusca('?checkout=cancel');
    renderPaywall();
    expect(await screen.findByText(/Nada foi cobrado/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Começar teste grátis/ })).toBeInTheDocument();
  });
});

describe('Conta que já assinou, ou não dá para saber → assinar, sem prometer teste', () => {
  it('já assinou antes', async () => {
    respostaDoTeste = { data: 'conta_ja_assinou', error: null };
    renderPaywall();
    expect(await screen.findByText('Acesso bloqueado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Assinar agora/ })).toBeInTheDocument();
    expect(screen.queryByText(/teste grátis/i)).not.toBeInTheDocument();
  });

  it('o CNPJ ou CPF já teve teste em outra Conta: assinar, com o aviso', async () => {
    respostaDoTeste = { data: 'documento_ja_usou', error: null };
    renderPaywall();
    expect(await screen.findByTestId('documento-ja-teve-teste')).toHaveTextContent(
      'O teste grátis vale uma vez por CNPJ ou CPF',
    );
    expect(screen.getByRole('button', { name: /Assinar agora/ })).toBeInTheDocument();
    expect(screen.queryByText(/não paga nada/)).not.toBeInTheDocument();
  });

  it('a pergunta ao servidor falhou', async () => {
    respostaDoTeste = { data: null, error: { message: 'rls' } };
    renderPaywall();
    expect(await screen.findByText('Acesso bloqueado')).toBeInTheDocument();
    expect(screen.queryByText(/não paga nada/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('documento-ja-teve-teste')).not.toBeInTheDocument();
  });

  it('sem perfil carregado (não sabe a Conta)', async () => {
    profile = null;
    renderPaywall();
    expect(await screen.findByText('Acesso bloqueado')).toBeInTheDocument();
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('gestor e atendente', () => {
  it.each(['gestor', 'atendente'])('%s não vê preço nem oferta, e ninguém pergunta pela Conta', async (r) => {
    role = r;
    tenant = LOJA;
    renderPaywall();
    expect(await screen.findByText(/Fale com a pessoa responsável pela Conta/)).toBeInTheDocument();
    expect(screen.queryByText(/teste grátis/i)).not.toBeInTheDocument();
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('de volta do Stripe → confirmando seu pagamento', () => {
  it('mostra a confirmação e nenhum botão de pagar', async () => {
    comBusca('?checkout=success');
    renderPaywall();
    expect(screen.getByText('Confirmando seu pagamento')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Começar teste grátis|Assinar agora/ })).not.toBeInTheDocument();
  });

  it('pergunta de novo por cima do cache, e avisa quando demora', async () => {
    vi.useFakeTimers();
    comBusca('?checkout=success');
    renderPaywall();
    const invalidar = vi.spyOn(queryClient, 'invalidateQueries');

    await act(async () => {
      vi.advanceTimersByTime(CONFIRMACAO_INTERVALO_MS * 2 + 10);
    });
    expect(mockRefreshTenant).toHaveBeenCalledTimes(2);
    expect(invalidar).toHaveBeenCalledWith({ queryKey: [QUERY_KEYS.TENANT, 'access-state'] });
    expect(screen.queryByText(/Está demorando/)).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(CONFIRMACAO_LIMITE_MS);
    });
    expect(screen.getByText(/Está demorando mais que o normal/)).toBeInTheDocument();
    expect(screen.getByText(/Não assine de novo/)).toBeInTheDocument();

    // Depois do aviso, para de perguntar.
    const chamadas = mockRefreshTenant.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(CONFIRMACAO_INTERVALO_MS * 5);
    });
    expect(mockRefreshTenant.mock.calls.length).toBe(chamadas);
  });
});
