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
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { UserRole } from '@/types/userHierarchy';

// ── estado que cada teste ajusta ─────────────────────────────────────────────

type TenantFake = { id: string; name: string; kind: string; parent_tenant_id: string | null };

const CONTA = 'conta-1';
const CONTA_TENANT: TenantFake = { id: CONTA, name: 'Grupo Silva', kind: 'account', parent_tenant_id: null };

let currentRole: UserRole | null = 'gerente';
let currentTenant: TenantFake | null = CONTA_TENANT;
let profileTenantId: string | null = CONTA;
let profileCapabilities: Record<string, boolean> | null = null;
let stores: Array<{ id: string; name: string; parent_tenant_id: string | null }> = [];
let storesLoading = false;
let capacity = 5;
let slotsLoading = false;
const setActiveTenant = vi.fn();
const useMyStoresArgs: unknown[] = [];

vi.mock('@/contexts/TenantContext', () => ({
  useRole: () => currentRole,
  useTenant: () => ({
    profile: {
      id: 'perfil-1',
      role: currentRole,
      tenant_id: profileTenantId,
      capabilities: profileCapabilities,
    },
    tenant: currentTenant,
    tenantId: currentTenant?.id ?? null,
    setActiveTenant,
  }),
}));

vi.mock('@/hooks/users/useUsers', () => ({
  useUsers: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/hooks/useMyStores', () => ({
  useMyStores: (options?: unknown) => {
    useMyStoresArgs.push(options);
    return { stores, isLoading: storesLoading };
  },
}));

vi.mock('@/hooks/useAccountStoreSlots', () => ({
  useAccountStoreSlots: () => ({
    included: capacity,
    extra: 0,
    capacity,
    isLoading: slotsLoading,
  }),
}));

type VagasFake = {
  store_id: string; store_name: string; account_id: string | null; incluidos: number; extra: number;
  limite: number; ativos: number; pendentes: number; usados: number; livres: number;
};
let vagas: Record<string, VagasFake> = {};
const useSeatsArgs: unknown[] = [];
vi.mock('@/hooks/useStoreAttendantSeats', () => ({
  useStoreAttendantSeats: (options?: unknown) => {
    useSeatsArgs.push(options);
    return { seats: Object.values(vagas), byStore: vagas, isLoading: false, error: null };
  },
}));
const vagasDe = (id: string, nome: string, ativos: number, pendentes: number, limite = 2): VagasFake => ({
  store_id: id, store_name: nome, account_id: CONTA, incluidos: 2, extra: limite - 2, limite,
  ativos, pendentes, usados: ativos + pendentes, livres: Math.max(limite - ativos - pendentes, 0),
});

// Stubs: o que estas telas fazem por dentro é assunto dos testes delas.
vi.mock('@/components/users/UsersTable', () => ({
  UsersTable: () => <div data-testid="users-table" />,
}));
vi.mock('@/components/users/InviteUserModal', () => ({
  InviteUserModal: () => null,
}));
vi.mock('@/components/stores/NewStoreDialog', () => ({
  NewStoreDialog: ({ open, store }: { open: boolean; store?: { id: string; name: string } | null }) =>
    open ? (
      store ? (
        <div data-testid="renomear-loja-dialog">{store.id}</div>
      ) : (
        <div data-testid="nova-loja-dialog" />
      )
    ) : null,
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
  currentTenant = CONTA_TENANT;
  profileTenantId = CONTA;
  profileCapabilities = null;
  useMyStoresArgs.length = 0;
  stores = [
    { id: 'loja-1', name: 'Matriz', parent_tenant_id: CONTA },
    { id: 'loja-2', name: 'Filial Norte', parent_tenant_id: CONTA },
  ];
  storesLoading = false;
  capacity = 5;
  slotsLoading = false;
  setActiveTenant.mockClear();
  vagas = {};
  useSeatsArgs.length = 0;
});

// ── vagas de atendente (limite por Loja, 2026-10-09) ────────────────────────

describe('vagas de atendente por Loja', () => {
  it('mostra "Atendentes: X de Y" embaixo de cada Loja do gerente', () => {
    vagas = {
      'loja-1': vagasDe('loja-1', 'Matriz', 1, 0),
      'loja-2': vagasDe('loja-2', 'Filial Norte', 0, 0),
    };
    renderPage();
    expect(screen.getByTestId('vagas-loja-1')).toHaveTextContent('Atendentes: 1 de 2');
    expect(screen.getByTestId('vagas-loja-2')).toHaveTextContent('Atendentes: 0 de 2');
    expect(screen.getByTestId('vagas-loja-1')).not.toHaveTextContent('Loja cheia');
  });

  it('Loja cheia diz que está cheia e conta o convite pendente', () => {
    vagas = { 'loja-1': vagasDe('loja-1', 'Matriz', 1, 1) };
    renderPage();
    const linha = screen.getByTestId('vagas-loja-1');
    expect(linha).toHaveTextContent('Atendentes: 2 de 2');
    expect(linha).toHaveTextContent('1 convite pendente');
    expect(linha).toHaveTextContent('Loja cheia');
  });

  it('vaga extra aparece no limite', () => {
    vagas = { 'loja-1': vagasDe('loja-1', 'Matriz', 2, 0, 3) };
    renderPage();
    expect(screen.getByTestId('vagas-loja-1')).toHaveTextContent('Atendentes: 2 de 3');
    expect(screen.getByTestId('vagas-loja-1')).not.toHaveTextContent('Loja cheia');
  });

  it('gerente não manda alcance: a RPC já sabe quais Lojas são dele', () => {
    renderPage();
    expect(useSeatsArgs.at(-1)).toEqual({ tenantId: null, enabled: true });
  });

  it('gestor vê o contador da própria Loja', () => {
    currentRole = 'gestor';
    currentTenant = { id: 'loja-1', name: 'Matriz', kind: 'store', parent_tenant_id: CONTA };
    profileTenantId = 'loja-1';
    vagas = { 'loja-1': vagasDe('loja-1', 'Matriz', 2, 0) };
    renderPage();
    expect(screen.getByText('Sua Loja')).toBeInTheDocument();
    expect(screen.getByTestId('vagas-loja-1')).toHaveTextContent('Atendentes: 2 de 2');
  });

  it('superadmin manda a Conta em foco', () => {
    currentRole = 'superadmin';
    profileTenantId = null;
    renderPage();
    expect(useSeatsArgs.at(-1)).toEqual({ tenantId: CONTA, enabled: true });
  });

  it('superadmin com uma Loja em foco manda a Loja', () => {
    currentRole = 'superadmin';
    profileTenantId = null;
    currentTenant = { id: 'loja-1', name: 'Matriz', kind: 'store', parent_tenant_id: CONTA };
    renderPage();
    expect(useSeatsArgs.at(-1)).toEqual({ tenantId: 'loja-1', enabled: true });
  });

  it('atendente não tem cartão de Lojas, então não consulta vagas', () => {
    currentRole = 'atendente';
    currentTenant = { id: 'loja-1', name: 'Matriz', kind: 'store', parent_tenant_id: CONTA };
    renderPage();
    expect(useSeatsArgs.at(-1)).toEqual({ tenantId: null, enabled: false });
  });
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
      // Superadmin sem Conta em foco: nada para listar.
      if (role === 'superadmin') currentTenant = null;
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

// ── renomear Loja ────────────────────────────────────────────────────────────

describe('lápis de renomear Loja', () => {
  const LOJA_TENANT: TenantFake = { id: 'loja-1', name: 'Matriz', kind: 'store', parent_tenant_id: CONTA };
  const lapis = () => screen.queryAllByRole('button', { name: /^Renomear / });

  it('gerente: um lápis em cada Loja da Conta, e ele abre a janela daquela Loja', async () => {
    renderPage();
    expect(lapis()).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Renomear Filial Norte' }));
    expect(screen.getByTestId('renomear-loja-dialog')).toHaveTextContent('loja-2');
  });

  it('gerente: Loja que não é da Conta dele fica sem lápis', () => {
    stores = [
      { id: 'loja-1', name: 'Matriz', parent_tenant_id: CONTA },
      { id: 'loja-x', name: 'De Outra Conta', parent_tenant_id: 'conta-9' },
    ];
    renderPage();
    expect(screen.getByRole('button', { name: 'Renomear Matriz' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Renomear De Outra Conta' })).not.toBeInTheDocument();
  });

  it('gerente sem store.admin não vê lápis', () => {
    profileCapabilities = { 'store.admin': false };
    renderPage();
    expect(screen.getByText('Matriz')).toBeInTheDocument();
    expect(lapis()).toHaveLength(0);
  });

  it('gestor: cartão "Sua Loja" com a Loja dele e o lápis, sem "Abrir"', async () => {
    currentRole = 'gestor';
    currentTenant = LOJA_TENANT;
    profileTenantId = 'loja-1';
    renderPage();
    expect(screen.getByText('Sua Loja')).toBeInTheDocument();
    expect(screen.queryByText('Lojas da sua Conta')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Abr/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Renomear Matriz' }));
    expect(screen.getByTestId('renomear-loja-dialog')).toHaveTextContent('loja-1');
  });

  it('atendente: nem cartão nem lápis — nem com store.admin concedido à mão', () => {
    currentRole = 'atendente';
    currentTenant = LOJA_TENANT;
    profileTenantId = 'loja-1';
    profileCapabilities = { 'store.admin': true };
    renderPage();
    expect(screen.queryByText('Sua Loja')).not.toBeInTheDocument();
    expect(lapis()).toHaveLength(0);
  });

  it('superadmin com uma Conta em foco: as Lojas dela, com lápis', () => {
    currentRole = 'superadmin';
    profileTenantId = null;
    renderPage();
    expect(useMyStoresArgs.at(-1)).toEqual({ superadminAccountId: CONTA });
    expect(screen.getByText('Lojas desta Conta')).toBeInTheDocument();
    expect(lapis()).toHaveLength(2);
    expect(botaoNovaLoja()).not.toBeInTheDocument();
  });

  it('superadmin com uma Loja em foco: só ela, com lápis', () => {
    currentRole = 'superadmin';
    profileTenantId = null;
    currentTenant = LOJA_TENANT;
    renderPage();
    expect(useMyStoresArgs.at(-1)).toEqual({ superadminAccountId: null });
    expect(screen.getByText('Loja em foco')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Renomear Matriz' })).toBeInTheDocument();
  });
});
