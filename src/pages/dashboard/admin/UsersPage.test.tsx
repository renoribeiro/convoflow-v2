/**
 * Tela de Usuários do superadmin: lê a atividade de admin_users_activity(),
 * preenche a coluna Loja (antes sempre "—") e, se a função falhar, avisa e
 * cai nas colunas do perfil — nunca mostra "Nunca" para todo mundo.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { UserRow } from '@/hooks/users/useUsers';
import type { UserActivity } from '@/hooks/users/useAdminUsersActivity';

const { estado } = vi.hoisted(() => ({
  estado: {
    users: [] as UserRow[],
    atividade: { data: undefined as Record<string, UserActivity> | undefined, isLoading: false, isError: false },
  },
}));

vi.mock('@/hooks/users/useUsers', () => ({
  useUsers: () => ({ data: estado.users, isLoading: false }),
}));
vi.mock('@/hooks/users/useAdminUsersActivity', async (orig) => ({
  ...(await orig<typeof import('@/hooks/users/useAdminUsersActivity')>()),
  useAdminUsersActivity: () => estado.atividade,
}));
vi.mock('@/hooks/users/useManageUser', () => ({
  useSuspendUser: () => ({ mutate: vi.fn() }),
  useReactivateUser: () => ({ mutate: vi.fn() }),
  useSoftDeleteUser: () => ({ mutate: vi.fn() }),
  useCancelInvite: () => ({ mutate: vi.fn() }),
  useResetUserPassword: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/components/users/InviteUserModal', () => ({ InviteUserModal: () => null }));
vi.mock('@/components/shared/PageHeader', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

import UsersPage from './UsersPage';

const ana: UserRow = {
  id: 'p1',
  user_id: 'u1',
  tenant_id: 'loja-1',
  parent_id: null,
  affiliate_id: null,
  role: 'gerente',
  status: 'active',
  first_name: 'Ana',
  last_name: 'Teste',
  phone: null,
  avatar_url: null,
  last_login_at: '2026-10-02T20:54:00Z',
  login_count: 20,
  created_at: '2026-06-01T12:00:00Z',
};

const cabecalhos = () => screen.getAllByRole('columnheader').map((h) => h.textContent?.trim());
const celula = (coluna: string) =>
  within(screen.getByText('Ana Teste').closest('tr') as HTMLElement).getAllByRole('cell')[
    cabecalhos().indexOf(coluna)
  ] as HTMLElement;

beforeEach(() => {
  estado.users = [ana];
  estado.atividade = {
    data: {
      p1: {
        profile_id: 'p1',
        tenant_name: 'Loja Centro',
        account_name: 'Conta Exemplo',
        last_sign_in_at: '2026-10-02T20:54:00Z',
        last_seen_at: '2026-10-09T19:46:00Z',
        last_message_at: '2026-10-09T11:56:00Z',
        messages_7d: 120,
        messages_30d: 217,
        conversations_7d: 21,
        conversations_30d: 40,
        last_login_ip: '198.51.100.7',
        last_login_user_agent: null,
      },
    },
    isLoading: false,
    isError: false,
  };
});

describe('UsersPage (superadmin)', () => {
  it('mostra as colunas de atividade e a Loja de cada pessoa', () => {
    render(<UsersPage />);
    expect(cabecalhos()).toContain('Visto por último');
    expect(cabecalhos()).toContain('Mensagens 7d / 30d');
    expect(celula('Loja').textContent).toBe('Loja Centro');
    expect(celula('Mensagens 7d / 30d').textContent).toBe('120 / 217');
  });

  it('se a função falhar: avisa e volta às colunas do perfil, sem "Nunca" falso', () => {
    estado.atividade = { data: undefined, isLoading: false, isError: true };
    render(<UsersPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar a atividade');
    expect(cabecalhos()).toEqual(['Nome', 'Função', 'Status', 'Loja', 'Último acesso', 'Acessos', 'Ações']);
    expect(celula('Último acesso').textContent).not.toBe('Nunca');
    expect(celula('Acessos').textContent).toBe('20');
  });
});
