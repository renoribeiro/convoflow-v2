/**
 * Seção "Por atendente" do Dashboard.
 *
 * O que importa: só gestor/gerente (e superadmin, o mesmo gate do rodízio)
 * montam a seção; o aviso de "sem responsável" vem antes da tabela e fala em
 * palavras simples; quem saiu do time e o gerente da Conta aparecem marcados;
 * fora do alcance a seção diz isso em vez de zerar.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

let role = 'gestor';
let rows: Record<string, unknown>[] | null = [];
let rpcCalls = 0;

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenant: { id: 'loja-1' }, profile: { role }, loading: false }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: async () => {
      rpcCalls += 1;
      return { data: rows, error: null };
    },
  },
}));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AttendantMetricsSection } from './AttendantMetricsSection';

const VAGA_CERTA = [
  { profile_id: null, first_name: null, last_name: null, role: null, is_parent_account: false, reason: null, n_held: '164', n_assumed: '0', n_transferred: '0', n_automatic: '0', n_waiting: '92', n_no_human_reply: '64', n_rule_transfers_suffered: '0', n_rule_transfers_received: '0' },
  { profile_id: 'bea', first_name: 'Lívia', last_name: 'Campos', role: 'atendente', is_parent_account: false, reason: null, n_held: '3', n_assumed: '2', n_transferred: '1', n_automatic: '0', n_waiting: '0', n_no_human_reply: '0', n_rule_transfers_suffered: '0', n_rule_transfers_received: '0' },
  { profile_id: 'cam', first_name: 'Helena', last_name: 'Duarte', role: 'gerente', is_parent_account: true, reason: null, n_held: '1', n_assumed: '1', n_transferred: '0', n_automatic: '0', n_waiting: '0', n_no_human_reply: '0', n_rule_transfers_suffered: '0', n_rule_transfers_received: '0' },
  { profile_id: 'bru', first_name: 'Bruno', last_name: null, role: 'atendente', is_parent_account: false, reason: 'suspended', n_held: '2', n_assumed: '0', n_transferred: '0', n_automatic: '2', n_waiting: '1', n_no_human_reply: '0', n_rule_transfers_suffered: '1', n_rule_transfers_received: '0' },
];

const renderSection = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AttendantMetricsSection />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  role = 'gestor';
  rows = VAGA_CERTA;
  rpcCalls = 0;
});

describe('AttendantMetricsSection', () => {
  it('atendente: não monta a seção e não chama a RPC', () => {
    role = 'atendente';
    renderSection();
    expect(screen.queryByTestId('attendant-metrics-section')).not.toBeInTheDocument();
    expect(rpcCalls).toBe(0);
  });

  it.each(['gestor', 'gerente', 'superadmin'])('%s: monta a seção', async (r) => {
    role = r;
    renderSection();
    expect(await screen.findByTestId('attendant-metrics-section')).toBeInTheDocument();
  });

  it('o aviso de sem responsável vem antes da tabela, em palavras simples (164 de 170; Bruno também espera 1)', async () => {
    renderSection();
    const notice = await screen.findByTestId('attendant-unowned-notice');
    expect(notice).toHaveTextContent(
      '164 de 170 conversas abertas estão sem responsável, e 92 delas esperam uma pessoa responder.',
    );
    expect(notice).toHaveAttribute('role', 'alert');
  });

  it('...e quando só as sem dono esperam, diz que ninguém é dono de nenhuma (a VagaCerta de 2026-09-21)', async () => {
    rows = VAGA_CERTA.slice(0, 3);
    renderSection();
    expect(await screen.findByTestId('attendant-unowned-notice')).toHaveTextContent(
      '164 de 168 conversas abertas estão sem responsável, e 92 delas esperam uma pessoa responder. Nenhuma conversa que espera resposta tem dono.',
    );
  });

  it('a tabela lista as pessoas com posse; quem saiu do time e o gerente da Conta vêm marcados', async () => {
    renderSection();
    expect(await screen.findByText('Lívia Campos')).toBeInTheDocument();
    expect(screen.getByText('Helena Duarte (da Conta)')).toBeInTheDocument();
    expect(screen.getByText('Bruno (suspenso)')).toBeInTheDocument();
    expect(screen.getByText('2 assumiu · 1 de colega · 0 automático')).toBeInTheDocument();
    // A linha "sem responsável" NÃO vira uma pessoa na tabela: vive no aviso.
    expect(screen.queryByText('Sem nome')).not.toBeInTheDocument();
  });

  it('sem responsável zero: o aviso continua, sem alarme', async () => {
    rows = [VAGA_CERTA[1]!, { ...VAGA_CERTA[0]!, n_held: '0', n_waiting: '0', n_no_human_reply: '0' }];
    renderSection();
    const notice = await screen.findByTestId('attendant-unowned-notice');
    expect(notice).toHaveTextContent('Todas as conversas abertas estão com alguém.');
    expect(notice).not.toHaveAttribute('role', 'alert');
  });

  it('RPC vazia (fora do alcance): diz isso em vez de mostrar zeros', async () => {
    rows = [];
    renderSection();
    expect(await screen.findByTestId('attendant-metrics-unavailable')).toBeInTheDocument();
  });
});
