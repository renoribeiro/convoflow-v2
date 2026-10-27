/**
 * A aba Configurações › Assinatura com os botões da entrega 3.
 *
 * Trava:
 *   - só o Gerente vê "Cancelar assinatura" / "Atualizar cartão";
 *   - "Desfazer cancelamento" só com cancelamento agendado;
 *   - o antigo "Gerenciar Assinatura" (que só mostrava um toast) sumiu;
 *   - a confirmação traz o texto do teste ou do período pago, com a data que o
 *     servidor devolveu, e só então agenda;
 *   - com uma Loja em foco, o Gerente vê a assinatura da CONTA;
 *   - nota fiscal, parte 1: sem os "Dados para a nota fiscal" o botão de
 *     assinar fica travado e não chama o checkout; a lista "Cobranças" mostra
 *     os pagamentos, sem a coluna da nota enquanto a produção não está no ar (notaFiscalVisivel).
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockInvoke, mockToast, mockRefresh, linhaDaConta, dadosFiscais, cobrancas, nfseConfig } = vi.hoisted(() => ({
  nfseConfig: { valor: { ambiente_ativo: 'restrita' } as Record<string, unknown> | null },
  mockInvoke: vi.fn(),
  mockToast: vi.fn(),
  mockRefresh: vi.fn().mockResolvedValue(undefined),
  linhaDaConta: { valor: null as Record<string, unknown> | null },
  dadosFiscais: { valor: null as Record<string, unknown> | null },
  cobrancas: { valor: [] as Record<string, unknown>[] },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: mockInvoke },
    from: (tabela: string) => ({
      select: () => ({
        limit: () => ({ maybeSingle: async () => ({ data: nfseConfig.valor, error: null }) }),
        eq: () => ({
          maybeSingle: async () => ({
            data: tabela === 'tenant_billing_details' ? dadosFiscais.valor : linhaDaConta.valor,
            error: null,
          }),
          order: () => ({ limit: async () => ({ data: cobrancas.valor, error: null }) }),
        }),
      }),
    }),
  },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { email: 'eu@exemplo.com.br' } }) }));
vi.mock('@/lib/rewardful', () => ({ getRewardfulReferral: () => null }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));

let gerente = true;
let tenant: Record<string, unknown> = {};
let profile: Record<string, unknown> | null = null;
let superadmin = false;
vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenant, profile, refreshTenant: mockRefresh }),
  useIsGerente: () => gerente,
  useIsSuperAdmin: () => superadmin,
}));

import { SubscriptionSettings } from './SubscriptionSettings';

const CONTA_ATIVA = {
  id: 'conta-1',
  kind: 'account',
  plan_type: 'gerente',
  subscription_status: 'active',
  subscription_will_cancel: false,
  subscription_cancel_at: null,
  trial_ends_at: null,
  store_slots_included: 5,
  store_slots_extra: 0,
};

const renderizar = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SubscriptionSettings />
    </QueryClientProvider>,
  );

const botao = (nome: RegExp) => screen.queryByRole('button', { name: nome });

/** Uma linha de tenant_billing_details completa (documento inventado). */
const DADOS_OK = {
  tenant_id: 'conta-1',
  person_type: 'cnpj',
  tax_id: '11222333000181',
  legal_name: 'Fulano Comércio Ltda',
  cep: '60000000',
  street: 'Rua Exemplo',
  number: '100',
  complement: null,
  district: 'Centro',
  city: 'Fortaleza',
  city_ibge_code: '2304400',
  state: 'CE',
  invoice_email: 'nota@exemplo.com.br',
};

beforeEach(() => {
  vi.clearAllMocks();
  superadmin = false;
  dadosFiscais.valor = { ...DADOS_OK };
  cobrancas.valor = [];
  gerente = true;
  tenant = { ...CONTA_ATIVA };
  profile = { tenant_id: 'conta-1' };
  linhaDaConta.valor = null;
});

describe('botões por cargo e situação', () => {
  it('gerente com assinatura ativa: Cancelar e Atualizar cartão; sem Desfazer; sem o antigo Gerenciar', () => {
    renderizar();
    expect(botao(/Cancelar assinatura/)).toBeInTheDocument();
    expect(botao(/Atualizar cartão/)).toBeInTheDocument();
    expect(botao(/Desfazer cancelamento/)).toBeNull();
    expect(botao(/Gerenciar Assinatura/)).toBeNull();
  });

  it('quem não é gerente não vê nenhum dos três, e lê por quê', () => {
    gerente = false;
    renderizar();
    expect(botao(/Cancelar assinatura/)).toBeNull();
    expect(botao(/Atualizar cartão/)).toBeNull();
    expect(botao(/Desfazer cancelamento/)).toBeNull();
    expect(screen.getByText(/Só o Gerente da Conta cancela ou troca o cartão/)).toBeInTheDocument();
  });

  it('cancelamento agendado: Desfazer aparece, Cancelar some', () => {
    tenant = { ...CONTA_ATIVA, subscription_will_cancel: true, subscription_cancel_at: '2026-10-20T12:00:00Z' };
    renderizar();
    expect(botao(/Desfazer cancelamento/)).toBeInTheDocument();
    expect(botao(/Cancelar assinatura/)).toBeNull();
    expect(screen.getByText('Cancelamento agendado')).toBeInTheDocument();
    expect(screen.getByText(/20\/10\/2026/)).toBeInTheDocument();
  });

  it('no teste com cancelamento agendado, Atualizar cartão some', () => {
    tenant = {
      ...CONTA_ATIVA,
      subscription_status: 'trialing',
      trial_ends_at: '2026-10-05T12:00:00Z',
      subscription_will_cancel: true,
      subscription_cancel_at: '2026-10-05T12:00:00Z',
    };
    renderizar();
    expect(botao(/Desfazer cancelamento/)).toBeInTheDocument();
    expect(botao(/Atualizar cartão/)).toBeNull();
  });

  it('pagamento pendente: o aviso manda clicar em Atualizar cartão, e não há Cancelar', () => {
    tenant = { ...CONTA_ATIVA, subscription_status: 'past_due' };
    renderizar();
    expect(botao(/Atualizar cartão/)).toBeInTheDocument();
    expect(botao(/Cancelar assinatura/)).toBeNull();
    expect(screen.getByText(/Clique em "Atualizar cartão"/)).toBeInTheDocument();
  });
});

describe('confirmação', () => {
  it('no teste: pergunta a data ao servidor, mostra o texto do teste, e só então agenda', async () => {
    tenant = { ...CONTA_ATIVA, subscription_status: 'trialing', trial_ends_at: '2026-10-05T12:00:00Z' };
    mockInvoke.mockImplementation(async (_fn: string, { body }: { body: { action: string } }) => {
      if (body.action === 'preview') {
        return { data: { ok: true, phase: 'trial', endsAt: '2026-10-05T12:00:00Z', canCancel: true }, error: null };
      }
      return { data: { ok: true, phase: 'trial', endsAt: '2026-10-05T12:00:00Z', scheduled: true }, error: null };
    });
    linhaDaConta.valor = { subscription_will_cancel: true };
    renderizar();

    await act(async () => {
      fireEvent.click(botao(/Cancelar assinatura/)!);
    });
    const aviso = await screen.findByTestId('confirmacao-cancelamento');
    await waitFor(() => expect(aviso).toHaveTextContent('nada é cobrado no seu cartão'));
    expect(aviso).toHaveTextContent('05/10/2026');
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke.mock.calls[0]![1].body.action).toBe('preview');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar o teste' }));
    });
    await waitFor(() =>
      expect(mockInvoke.mock.calls.map((c) => c[1].body.action)).toEqual(['preview', 'schedule_cancel']),
    );
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Cancelamento agendado' })),
    );
  });

  it('pago: o texto fala em período pago e em não reembolso', async () => {
    mockInvoke.mockResolvedValue({
      data: { ok: true, phase: 'paid', endsAt: '2026-10-20T12:00:00Z', canCancel: true },
      error: null,
    });
    renderizar();
    await act(async () => {
      fireEvent.click(botao(/Cancelar assinatura/)!);
    });
    const aviso = await screen.findByTestId('confirmacao-cancelamento');
    await waitFor(() => expect(aviso).toHaveTextContent('Não há reembolso proporcional'));
    expect(aviso).toHaveTextContent('Você já pagou até 20/10/2026');
    expect(screen.getByRole('button', { name: 'Cancelar a assinatura' })).toBeInTheDocument();
  });
});

describe('Conta de cobrança', () => {
  it('gerente com uma Loja em foco vê a assinatura da Conta, não a da Loja', async () => {
    tenant = { id: 'loja-1', kind: 'store', plan_type: 'basic', subscription_status: null };
    profile = { tenant_id: 'conta-1' };
    linhaDaConta.valor = { ...CONTA_ATIVA };
    renderizar();
    expect(await screen.findByRole('button', { name: /Cancelar assinatura/ })).toBeInTheDocument();
    expect(screen.queryByText('Sem assinatura ativa')).toBeNull();
  });
});

describe('dados para a nota fiscal (parte 1)', () => {
  const SEM_ASSINATURA = { ...CONTA_ATIVA, subscription_status: null, subscription_id: null, manual_access_granted: false };

  it('sem os dados: o formulário aparece, "Assinar" fica travado e o checkout não é chamado', async () => {
    tenant = { ...SEM_ASSINATURA };
    dadosFiscais.valor = null;
    renderizar();
    expect(await screen.findByRole('form', { name: 'Dados para a nota fiscal' })).toBeInTheDocument();
    expect(screen.getByText('Obrigatório para assinar')).toBeInTheDocument();
    const assinar = botao(/Assinar por/)!;
    expect(assinar).toBeDisabled();
    expect(screen.getByTestId('assinar-precisa-dados')).toHaveTextContent('Preencha e salve os dados');
    fireEvent.click(assinar);
    expect(mockInvoke).not.toHaveBeenCalled();
    // Loja extra antes de assinar também passa pelo checkout: travada igual.
    expect(botao(/Contratar 1 Loja/)).toBeDisabled();
    // o email do login já vem sugerido
    expect(screen.getByLabelText('Email para receber a nota')).toHaveValue('eu@exemplo.com.br');
  });

  it('com os dados: resumo com o documento mascarado e "Assinar" abre o checkout', async () => {
    tenant = { ...SEM_ASSINATURA };
    mockInvoke.mockResolvedValue({ data: { url: 'https://checkout.stripe.com/c/FAKE' }, error: null });
    const original = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...original, href: '' } });
    try {
      renderizar();
      const resumo = await screen.findByTestId('dados-fiscais-resumo');
      expect(resumo).toHaveTextContent('Fulano Comércio Ltda');
      expect(resumo).toHaveTextContent('CNPJ ••.•••.•••/••••-81');
      expect(resumo).not.toHaveTextContent('11222333');
      const assinar = botao(/Assinar por/)!;
      await waitFor(() => expect(assinar).toBeEnabled());
      await act(async () => {
        fireEvent.click(assinar);
      });
      await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('create-checkout-session', expect.anything()));
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original });
    }
  });

  it('Conta com acesso manual não paga: sem o selo de obrigatório', async () => {
    tenant = { ...SEM_ASSINATURA, manual_access_granted: true };
    dadosFiscais.valor = null;
    renderizar();
    expect(await screen.findByRole('form', { name: 'Dados para a nota fiscal' })).toBeInTheDocument();
    expect(screen.queryByText('Obrigatório para assinar')).toBeNull();
  });

  it('superadmin vê o resumo, sem botão de alterar', async () => {
    gerente = false;
    superadmin = true;
    renderizar();
    expect(await screen.findByTestId('dados-fiscais-resumo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Alterar/ })).toBeNull();
    expect(screen.queryByRole('form', { name: 'Dados para a nota fiscal' })).toBeNull();
  });
});

describe('Cobranças', () => {
  it('lista os pagamentos com o recibo do Stripe e o reembolso, sem a coluna da nota', async () => {
    cobrancas.valor = [
      {
        id: 'c1', stripe_invoice_id: 'in_FAKE1', tenant_id: 'conta-1', amount_paid_cents: 49990, currency: 'brl',
        paid_at: '2026-10-13T15:00:00Z', period_start: '2026-10-13T15:00:00Z', period_end: '2026-11-13T15:00:00Z',
        hosted_invoice_url: 'https://invoice.stripe.com/i/FAKE1', amount_refunded_cents: 0, refunded_at: null, nota_status: 'aguardando_emissao',
      },
      {
        id: 'c2', stripe_invoice_id: 'in_FAKE2', tenant_id: 'conta-1', amount_paid_cents: 49990, currency: 'brl',
        paid_at: '2026-09-13T15:00:00Z', period_start: null, period_end: null,
        hosted_invoice_url: 'https://exemplo.com.br/nao-e-do-stripe', amount_refunded_cents: 49990, refunded_at: '2026-09-15T15:00:00Z', nota_status: 'aguardando_emissao',
      },
    ];
    renderizar();
    const lista = await screen.findByLabelText('Cobranças da Conta');
    await waitFor(() => expect(lista).toHaveTextContent('13/10/2026'));
    expect(lista).toHaveTextContent(/R\$\s?499,90/);
    expect(lista).toHaveTextContent('Paga');
    expect(lista).toHaveTextContent('Reembolsada');
    expect(lista).toHaveTextContent('15/09/2026');
    const links = screen.getAllByRole('link', { name: /Ver no Stripe/ });
    // link que não é do Stripe não vira link
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', 'https://invoice.stripe.com/i/FAKE1');
    expect(lista).not.toHaveTextContent(/Nota fiscal|Aguardando emissão/);
  });

  it('com a produção no ar, o Gerente vê a nota emitida com PDF e XML, sem ação de superadmin', async () => {
    nfseConfig.valor = { ambiente_ativo: 'producao' };
    cobrancas.valor = [
      {
        id: 'c1', stripe_invoice_id: 'in_FAKE1', tenant_id: 'conta-1', amount_paid_cents: 49990, currency: 'brl',
        paid_at: '2026-10-13T15:00:00Z', period_start: null, period_end: null, hosted_invoice_url: null,
        amount_refunded_cents: 0, refunded_at: null, nota_status: 'emitida',
        notas: [{
          id: 'n1', ambiente: 'producao', status: 'emitida', numero_nfse: '123', chave_acesso: null, emitida_em: '2026-10-13T15:05:00Z',
          cancelada_em: null, ultimo_erro_codigo: null, ultimo_erro_mensagem: null, tentativas: 1, pdf_path: 'a.pdf', xml_path: 'a.xml',
        }],
      },
    ];
    renderizar();
    const lista = await screen.findByLabelText('Cobranças da Conta');
    await waitFor(() => expect(lista).toHaveTextContent('NFS-e 123'));
    expect(lista).toHaveTextContent('Emitida');
    expect(screen.getByRole('button', { name: /PDF/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /XML/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cancelar nota|Emitir de novo/ })).toBeNull();
  });

  it('sem cobrança: a frase do vazio', async () => {
    renderizar();
    expect(await screen.findByText(/Nenhuma cobrança ainda/)).toBeInTheDocument();
  });
});
