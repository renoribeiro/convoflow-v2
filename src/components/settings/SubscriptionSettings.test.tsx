/**
 * A aba Configurações › Assinatura com os botões da entrega 3.
 *
 * Trava:
 *   - só o Gerente vê "Cancelar assinatura" / "Atualizar cartão";
 *   - "Desfazer cancelamento" só com cancelamento agendado;
 *   - o antigo "Gerenciar Assinatura" (que só mostrava um toast) sumiu;
 *   - a confirmação traz o texto do teste ou do período pago, com a data que o
 *     servidor devolveu, e só então agenda;
 *   - com uma Loja em foco, o Gerente vê a assinatura da CONTA.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockInvoke, mockToast, mockRefresh, linhaDaConta } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockToast: vi.fn(),
  mockRefresh: vi.fn().mockResolvedValue(undefined),
  linhaDaConta: { valor: null as Record<string, unknown> | null },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: mockInvoke },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: linhaDaConta.valor, error: null }) }),
      }),
    }),
  },
}));
vi.mock('@/lib/rewardful', () => ({ getRewardfulReferral: () => null }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));

let gerente = true;
let tenant: Record<string, unknown> = {};
let profile: Record<string, unknown> | null = null;
vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenant, profile, refreshTenant: mockRefresh }),
  useIsGerente: () => gerente,
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

beforeEach(() => {
  vi.clearAllMocks();
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
