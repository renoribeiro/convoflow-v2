/**
 * Seletor de Loja do Gerente — o caminho de volta para a Conta.
 *
 * O que precisa continuar verdadeiro:
 *  - "Voltar para a Conta" só aparece com uma Loja aberta;
 *  - escolher o item limpa a escolha salva (convoflow-active-tenant) e a
 *    tela volta para a Conta do próprio gerente, sem sair e entrar de novo;
 *  - trocar de Loja continua funcionando como antes.
 *
 * Usa o TenantProvider DE VERDADE: só o banco e a sessão são simulados. É
 * ele que decide qual Conta está em foco, então é ele que prova que a Conta
 * voltou.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const USER_ID = 'user-gerente';
const CONTA_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const LOJA_ID = 'bbbbbbbb-0000-4000-8000-000000000002';
const LOJA_2_ID = 'bbbbbbbb-0000-4000-8000-000000000099';
const KEY = 'convoflow-active-tenant';

const TENANTS: Record<string, { id: string; name: string; parent_tenant_id: string | null }> = {
  [CONTA_ID]: { id: CONTA_ID, name: 'Conta Teste Gerente', parent_tenant_id: null },
  [LOJA_ID]: { id: LOJA_ID, name: 'Loja Teste', parent_tenant_id: CONTA_ID },
  [LOJA_2_ID]: { id: LOJA_2_ID, name: 'Loja Dois', parent_tenant_id: CONTA_ID },
};

// O MESMO objeto a cada render: o TenantProvider recarrega quando `user` muda,
// e um objeto novo por render viraria recarga sem fim.
const AUTH = { user: { id: USER_ID } };
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => AUTH,
}));

vi.mock('@/hooks/useMyStores', () => ({
  useMyStores: () => ({
    stores: [TENANTS[LOJA_ID], TENANTS[LOJA_2_ID]],
    isLoading: false,
  }),
}));

// O banco: perfil do gerente e a tabela de tenants, com os filtros que o
// TenantProvider usa (.eq por coluna, .maybeSingle no fim).
vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    const filters: Record<string, unknown> = {};
    const chain = {
      select: () => chain,
      eq: (col: string, val: unknown) => {
        filters[col] = val;
        return chain;
      },
      maybeSingle: async () => {
        if (table === 'profiles') {
          return {
            data: { id: 'p-1', user_id: USER_ID, tenant_id: CONTA_ID, role: 'gerente', status: 'active' },
            error: null,
          };
        }
        if (table === 'tenants') {
          const row = TENANTS[filters.id as string];
          if (!row) return { data: null, error: null };
          if ('parent_tenant_id' in filters && row.parent_tenant_id !== filters.parent_tenant_id) {
            return { data: null, error: null };
          }
          return { data: row, error: null };
        }
        return { data: null, error: null };
      },
    };
    return chain;
  };
  return { supabase: { from } };
});

// jsdom não tem as APIs de ponteiro que o Radix Select consulta.
beforeEach(() => {
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => {};
  proto.setPointerCapture ??= () => {};
  localStorage.clear();
});
afterAll(() => localStorage.clear());

import { TenantProvider, useTenant } from '@/contexts/TenantContext';
import { StoreSwitcher } from './StoreSwitcher';

/** Mostra qual Conta/Loja o TenantProvider tem em foco agora. */
function EmFoco() {
  const { tenant } = useTenant();
  return <p data-testid="em-foco">{tenant?.name ?? '-'}</p>;
}

function renderSwitcher() {
  return render(
    <TenantProvider>
      <StoreSwitcher />
      <EmFoco />
    </TenantProvider>,
  );
}

async function abrirSeletor(user: ReturnType<typeof userEvent.setup>) {
  const trigger = await screen.findByRole('combobox', { name: 'Selecionar loja' });
  trigger.focus();
  await user.keyboard('{Enter}');
  return screen.findByRole('listbox');
}

describe('StoreSwitcher — voltar para a Conta', () => {
  it('com a Conta em foco: o item NÃO aparece, só as Lojas', async () => {
    const user = userEvent.setup();
    renderSwitcher();
    await waitFor(() => expect(screen.getByTestId('em-foco')).toHaveTextContent('Conta Teste Gerente'));
    expect(screen.getByRole('combobox', { name: 'Selecionar loja' })).toHaveTextContent('Selecionar loja');

    await abrirSeletor(user);
    expect(screen.getByRole('option', { name: 'Loja Teste' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Loja Dois' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Voltar para a Conta/ })).not.toBeInTheDocument();
  });

  it('com uma Loja aberta: o item aparece em primeiro', async () => {
    localStorage.setItem(KEY, LOJA_ID);
    const user = userEvent.setup();
    renderSwitcher();
    await waitFor(() => expect(screen.getByTestId('em-foco')).toHaveTextContent('Loja Teste'));

    await abrirSeletor(user);
    const opcoes = screen.getAllByRole('option');
    expect(opcoes[0]).toHaveTextContent('Voltar para a Conta');
    expect(opcoes.map((o) => o.textContent)).toEqual(['Voltar para a Conta', 'Loja Teste', 'Loja Dois']);
  });

  it('escolher o item limpa a escolha salva e a Conta volta ao foco', async () => {
    localStorage.setItem(KEY, LOJA_ID);
    const user = userEvent.setup();
    renderSwitcher();
    await waitFor(() => expect(screen.getByTestId('em-foco')).toHaveTextContent('Loja Teste'));

    await abrirSeletor(user);
    await user.click(screen.getByRole('option', { name: /Voltar para a Conta/ }));

    await waitFor(() => expect(screen.getByTestId('em-foco')).toHaveTextContent('Conta Teste Gerente'));
    expect(localStorage.getItem(KEY)).toBeNull();
    // O seletor volta ao estado "nenhuma Loja" — e o item some de novo.
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Selecionar loja' })).toHaveTextContent('Selecionar loja'),
    );
    await abrirSeletor(user);
    expect(screen.queryByRole('option', { name: /Voltar para a Conta/ })).not.toBeInTheDocument();
  });

  it('trocar de Loja continua como antes (e não passa pela Conta)', async () => {
    localStorage.setItem(KEY, LOJA_ID);
    const user = userEvent.setup();
    renderSwitcher();
    await waitFor(() => expect(screen.getByTestId('em-foco')).toHaveTextContent('Loja Teste'));

    await abrirSeletor(user);
    await user.click(screen.getByRole('option', { name: 'Loja Dois' }));

    await waitFor(() => expect(screen.getByTestId('em-foco')).toHaveTextContent('Loja Dois'));
    expect(localStorage.getItem(KEY)).toBe(LOJA_2_ID);
  });
});
