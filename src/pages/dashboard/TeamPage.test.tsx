/**
 * Testes da tela de Equipe.
 *
 * O que importa aqui: a tela deixou de mentir. Para o Gerente ela mostra as
 * Lojas de verdade e oferece "Nova Loja" com o limite do plano à vista; para
 * qualquer outro cargo continua exatamente a lista de pessoas que sempre foi.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { UserRole } from '@/types/userHierarchy';

// ── estado que cada teste ajusta ─────────────────────────────────────────────

let currentRole: UserRole | null = 'gerente';
let stores: Array<{ id: string; name: string; parent_tenant_id: string | null }> = [];
let storesLoading = false;
let capacity = 5;
let slotsLoading = false;
const setActiveTenant = vi.fn();

const CONTA = 'conta-1';

vi.mock('@/contexts/TenantContext', () => ({
  useRole: () => currentRole,
  useTenant: () => ({
    profile: { id: 'perfil-1', role: currentRole, tenant_id: CONTA },
    tenant: { id: CONTA, name: 'Grupo Silva' },
    tenantId: CONTA,
    setActiveTenant,
  }),
}));

vi.mock('@/hooks/users/useUsers', () => ({
  useUsers: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/hooks/useMyStores', () => ({
  useMyStores: () => ({ stores, isLoading: storesLoading }),
}));

vi.mock('@/hooks/useAccountStoreSlots', () => ({
  useAccountStoreSlots: () => ({
    included: capacity,
    extra: 0,
    capacity,
    isLoading: slotsLoading,
  }),
}));

// Stubs: o que estas telas fazem por dentro é assunto dos testes delas.
vi.mock('@/components/users/UsersTable', () => ({
  UsersTable: () => <div data-testid="users-table" />,
}));
vi.mock('@/components/users/InviteUserModal', () => ({
  InviteUserModal: () => null,
}));
vi.mock('@/components/stores/NewStoreDialog', () => ({
  NewStoreDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="nova-loja-dialog" /> : null,
}));

import TeamPage from './TeamPage';

const renderPage = () =>
  render(
    <MemoryRouter>
      <TeamPage />
    </MemoryRouter>,
  );

const botaoNovaLoja = () => screen.queryByRole('button', { name: /Nova Loja/i });

beforeEach(() => {
  currentRole = 'gerente';
  stores = [
    { id: 'loja-1', name: 'Matriz', parent_tenant_id: CONTA },
    { id: 'loja-2', name: 'Filial Norte', parent_tenant_id: CONTA },
  ];
  storesLoading = false;
  capacity = 5;
  slotsLoading = false;
  setActiveTenant.mockClear();
});

// ── lista de Lojas ───────────────────────────────────────────────────────────

describe('lista de Lojas', () => {
  it('mostra as Lojas da Conta para o gerente', () => {
    renderPage();
    expect(screen.getByText('Lojas da sua Conta')).toBeInTheDocument();
    expect(screen.getByText('Matriz')).toBeInTheDocument();
    expect(screen.getByText('Filial Norte')).toBeInTheDocument();
  });

  it('separa as duas listas, para nenhuma se passar pela outra', () => {
    renderPage();
    expect(screen.getByText('Lojas da sua Conta')).toBeInTheDocument();
    expect(screen.getByText('Pessoas da sua Conta')).toBeInTheDocument();
    expect(screen.getByTestId('users-table')).toBeInTheDocument();
  });

  it.each(['gestor', 'atendente', 'superadmin'] as UserRole[])(
    'não mostra lista de Lojas nem "Nova Loja" para %s',
    (role) => {
      currentRole = role;
      renderPage();
      expect(screen.queryByText('Lojas da sua Conta')).not.toBeInTheDocument();
      expect(screen.queryByText('Matriz')).not.toBeInTheDocument();
      expect(botaoNovaLoja()).not.toBeInTheDocument();
      // ...e a lista de pessoas continua onde sempre esteve.
      expect(screen.getByTestId('users-table')).toBeInTheDocument();
    },
  );

  it('para o Gestor a tela é "Minha Equipe" — a Loja dele, não as Lojas da Conta', () => {
    // A rota /dashboard/team passou a aceitar minRole="gestor" em 2026-08-18.
    // Este ramo existia no codigo e era inalcancavel: o guard exigia gerente.
    currentRole = 'gestor';
    renderPage();
    // O texto aparece no título e no breadcrumb — miramos no cabeçalho.
    expect(screen.getByRole('heading', { name: 'Minha Equipe' })).toBeInTheDocument();
    expect(screen.queryByText('Minhas Lojas')).not.toBeInTheDocument();
    expect(screen.getByTestId('users-table')).toBeInTheDocument();
  });

  it('cargo não carregado ainda não é tratado como gerente', () => {
    currentRole = null;
    renderPage();
    expect(botaoNovaLoja()).not.toBeInTheDocument();
  });

  it('convida a criar a primeira quando a Conta não tem nenhuma Loja', () => {
    stores = [];
    renderPage();
    expect(screen.getByText(/Nenhuma loja cadastrada ainda/)).toBeInTheDocument();
  });

  it('marca a Loja em foco e não oferece abrir de novo', () => {
    stores = [
      { id: CONTA, name: 'Loja em foco', parent_tenant_id: CONTA },
      { id: 'loja-2', name: 'Filial Norte', parent_tenant_id: CONTA },
    ];
    renderPage();
    expect(screen.getByText('Em foco')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aberta' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Abrir' })).toBeEnabled();
  });
});

// ── botão Nova Loja e o limite de vagas ──────────────────────────────────────

describe('"Nova Loja" e o limite do plano', () => {
  it('fica habilitado enquanto sobra vaga', () => {
    capacity = 5; // 2 de 5
    renderPage();
    expect(botaoNovaLoja()).toBeEnabled();
  });

  it('fica desabilitado quando as vagas acabam', () => {
    capacity = 2; // 2 de 2
    renderPage();
    expect(botaoNovaLoja()).toBeDisabled();
  });

  it('continua desabilitado se houver mais Lojas que vagas', () => {
    capacity = 1; // 2 de 1 — possível se alguém baixar os slots
    renderPage();
    expect(botaoNovaLoja()).toBeDisabled();
  });

  it('mostra o quanto do plano já foi usado', () => {
    capacity = 5;
    renderPage();
    expect(screen.getByText('2 de 5 lojas')).toBeInTheDocument();
  });

  it('concorda em número quando o plano tem uma vaga só', () => {
    stores = [{ id: 'loja-1', name: 'Matriz', parent_tenant_id: CONTA }];
    capacity = 1;
    renderPage();
    expect(screen.getByText('1 de 1 loja')).toBeInTheDocument();
  });

  it('não mostra contador nem bloqueia enquanto os dados carregam', () => {
    slotsLoading = true;
    renderPage();
    expect(screen.queryByText(/de 5 lojas/)).not.toBeInTheDocument();
    expect(botaoNovaLoja()).toBeEnabled();
  });

  it('capacidade zero não trava o botão — quem decide nesse caso é o servidor', () => {
    // Capacidade 0 é quase sempre consulta que falhou. Travar aqui deixaria um
    // gerente com vaga sem conseguir criar Loja nenhuma.
    capacity = 0;
    renderPage();
    expect(botaoNovaLoja()).toBeEnabled();
  });
});
