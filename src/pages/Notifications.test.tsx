/**
 * Tela de Notificações (/dashboard/notifications).
 *
 * Até 2026-10-25 ela mostrava avisos inventados no código. O que importa
 * garantir: ela lê a tabela `notifications` (a mesma do sino), não traz mais o
 * quadro de preferências que não gravava nada, e "Marcar todas como lidas"
 * grava de verdade.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

let linhas: Array<Record<string, unknown>> = [];
const updates: Array<{ valores: unknown; coluna: string; valor: unknown }> = [];

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'aaaaaaaa-0000-4000-8000-000000000001' } }),
}));

vi.mock('@/components/shared/PageHeader', () => ({
  PageHeader: ({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      <p>{description}</p>
      {actions}
    </div>
  ),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (tabela: string) => {
      expect(tabela).toBe('notifications');
      return {
        select: () => ({
          order: () => ({
            limit: async () => ({ data: linhas, error: null }),
          }),
        }),
        update: (valores: unknown) => ({
          eq: async (coluna: string, valor: unknown) => {
            updates.push({ valores, coluna, valor });
            return { error: null };
          },
        }),
      };
    },
  },
}));

import Notifications from './Notifications';

const aviso = (id: string, titulo: string, lido: boolean) => ({
  id,
  title: titulo,
  message: 'Texto do aviso.',
  type: 'info',
  is_read: lido,
  created_at: new Date().toISOString(),
  action_url: null,
});

const renderTela = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <Notifications />
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  linhas = [];
  updates.length = 0;
});

describe('Notificações', () => {
  it('mostra os avisos do banco e quantos estão sem ler', async () => {
    linhas = [aviso('aaaaaaaa-0000-4000-8000-000000000011', 'Conversa transferida para você', false), aviso('aaaaaaaa-0000-4000-8000-000000000012', 'Aviso antigo', true)];
    renderTela();
    expect(await screen.findByText('Conversa transferida para você')).toBeInTheDocument();
    expect(screen.getByText('Aviso antigo')).toBeInTheDocument();
    expect(screen.getByText('1 sem ler')).toBeInTheDocument();
  });

  it('sem avisos, diz isso e não inventa nenhum', async () => {
    renderTela();
    expect(await screen.findByText('Nenhum aviso por enquanto')).toBeInTheDocument();
    expect(screen.queryAllByTestId('aviso')).toHaveLength(0);
  });

  it('não tem mais o quadro de preferências', async () => {
    renderTela();
    await screen.findByText('Nenhum aviso por enquanto');
    expect(screen.queryByText('Preferências')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('"Marcar todas como lidas" grava no banco', async () => {
    linhas = [aviso('aaaaaaaa-0000-4000-8000-000000000013', 'Novo aviso', false)];
    renderTela();
    await screen.findByText('Novo aviso');
    await userEvent.click(screen.getByRole('button', { name: /Marcar todas como lidas/ }));
    await waitFor(() => expect(updates).toEqual([{ valores: { is_read: true }, coluna: 'is_read', valor: false }]));
  });
});
