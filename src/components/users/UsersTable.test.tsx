/**
 * Menu de ações da tabela de pessoas, por status (limite de atendentes por
 * Loja, 2026-10-09):
 *   ativo    → Suspender e Excluir
 *   suspenso → Reativar e Excluir
 *   pendente → Cancelar convite (o convite ocupa vaga até sair)
 *   excluído → sem Reativar: quem foi excluído volta só com convite novo
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UserRow } from '@/hooks/users/useUsers';

const { suspend, reactivate, softDelete, cancelInvite, resetPwd } = vi.hoisted(() => ({
  suspend: vi.fn(),
  reactivate: vi.fn(),
  softDelete: vi.fn(),
  cancelInvite: vi.fn(),
  resetPwd: vi.fn(),
}));

vi.mock('@/hooks/users/useManageUser', () => ({
  useSuspendUser: () => ({ mutate: suspend }),
  useReactivateUser: () => ({ mutate: reactivate }),
  useSoftDeleteUser: () => ({ mutate: softDelete }),
  useCancelInvite: () => ({ mutate: cancelInvite }),
  useResetUserPassword: () => ({ mutate: resetPwd }),
}));
vi.mock('./UserDetailsDialog', () => ({ UserDetailsDialog: () => null }));

import { UsersTable } from './UsersTable';

const pessoa = (status: UserRow['status']): UserRow => ({
  id: `p-${status}`,
  user_id: `u-${status}`,
  tenant_id: 'loja-1',
  parent_id: null,
  affiliate_id: null,
  role: 'atendente',
  status,
  first_name: 'Ana',
  last_name: status,
  phone: null,
  avatar_url: null,
  last_login_at: null,
  login_count: 0,
  last_ip: null,
  created_at: '2026-10-01T12:00:00Z',
});

async function abrirMenu(status: UserRow['status']) {
  const user = userEvent.setup();
  render(<UsersTable rows={[pessoa(status)]} />);
  await user.click(screen.getAllByRole('button', { name: `Ações de Ana ${status}` })[0] as HTMLElement);
  return user;
}

const itens = () => screen.getAllByRole('menuitem').map((m) => m.textContent?.trim());

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('menu por status', () => {
  it('ativo: Suspender e Excluir', async () => {
    await abrirMenu('active');
    expect(itens()).toEqual(['Ver detalhes', 'Redefinir senha', 'Suspender', 'Excluir']);
  });

  it('suspenso: Reativar e Excluir', async () => {
    const user = await abrirMenu('suspended');
    expect(itens()).toEqual(['Ver detalhes', 'Redefinir senha', 'Reativar', 'Excluir']);
    await user.click(screen.getByRole('menuitem', { name: 'Reativar' }));
    expect(reactivate).toHaveBeenCalledWith('p-suspended');
  });

  it('pendente: Cancelar convite, que libera a vaga', async () => {
    const user = await abrirMenu('pending');
    expect(itens()).toEqual(['Ver detalhes', 'Redefinir senha', 'Cancelar convite']);
    await user.click(screen.getByRole('menuitem', { name: 'Cancelar convite' }));
    expect(window.confirm).toHaveBeenCalledWith('Cancelar este convite? A vaga dele fica livre.');
    expect(cancelInvite).toHaveBeenCalledWith('p-pending');
    expect(softDelete).not.toHaveBeenCalled();
  });

  it('excluído: nem Reativar nem Excluir', async () => {
    await abrirMenu('deleted');
    expect(itens()).toEqual(['Ver detalhes', 'Redefinir senha']);
  });
});
