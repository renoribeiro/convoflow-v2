/**
 * Menu de ações da tabela de pessoas, por status (limite de atendentes por
 * Loja, 2026-10-09):
 *   ativo    → Suspender e Excluir
 *   suspenso → Reativar e Excluir
 *   pendente → Cancelar convite (o convite ocupa vaga até sair)
 *   excluído → sem Reativar: quem foi excluído volta só com convite novo
 * E "Editar" (lote 6e, D2 parcial): muda só o nome, para todo status menos
 * excluído, e nunca no próprio perfil.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UserRow } from '@/hooks/users/useUsers';

const { suspend, reactivate, softDelete, cancelInvite, resetPwd, updateUser, meuPerfil } = vi.hoisted(() => ({
  updateUser: vi.fn(),
  meuPerfil: { id: 'p-eu' },
  suspend: vi.fn(),
  reactivate: vi.fn(),
  softDelete: vi.fn(),
  cancelInvite: vi.fn(),
  resetPwd: vi.fn(),
}));

vi.mock('@/hooks/users/useManageUser', () => ({
  useUpdateUser: () => ({ mutateAsync: updateUser, isPending: false }),
  useSuspendUser: () => ({ mutate: suspend, mutateAsync: suspend }),
  useReactivateUser: () => ({ mutate: reactivate, mutateAsync: reactivate }),
  useSoftDeleteUser: () => ({ mutate: softDelete, mutateAsync: softDelete }),
  useCancelInvite: () => ({ mutate: cancelInvite, mutateAsync: cancelInvite }),
  useResetUserPassword: () => ({ mutate: resetPwd, mutateAsync: resetPwd }),
}));
vi.mock('./UserDetailsDialog', () => ({ UserDetailsDialog: () => null }));
vi.mock('@/contexts/TenantContext', () => ({ useTenant: () => ({ profile: { id: meuPerfil.id } }) }));

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
  updateUser.mockResolvedValue({ success: true });
  meuPerfil.id = 'p-eu';
});

describe('confirmações (achado 109 do checkup)', () => {
  it('Suspender pergunta antes, e cancelar não suspende', async () => {
    const user = await abrirMenu('active');
    await user.click(screen.getByRole('menuitem', { name: 'Suspender' }));
    expect(screen.getByText('Suspender Ana active?')).toBeInTheDocument();
    expect(screen.getByText(/perde o acesso agora/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(suspend).not.toHaveBeenCalled();
  });

  it('Suspender confirmado suspende', async () => {
    const user = await abrirMenu('active');
    await user.click(screen.getByRole('menuitem', { name: 'Suspender' }));
    await user.click(screen.getByRole('button', { name: 'Suspender' }));
    expect(suspend).toHaveBeenCalledWith('p-active');
  });

  it('Excluir diz que não dá para desfazer', async () => {
    const user = await abrirMenu('active');
    await user.click(screen.getByRole('menuitem', { name: 'Excluir' }));
    expect(screen.getByText('Isto não pode ser desfeito.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(softDelete).not.toHaveBeenCalled();
  });

  it('Redefinir senha pergunta antes de mandar o email', async () => {
    const user = await abrirMenu('active');
    await user.click(screen.getByRole('menuitem', { name: 'Redefinir senha' }));
    expect(resetPwd).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Enviar email' }));
    expect(resetPwd).toHaveBeenCalledWith('p-active');
  });
});

describe('menu por status', () => {
  it('ativo: Suspender e Excluir', async () => {
    await abrirMenu('active');
    expect(itens()).toEqual(['Ver detalhes', 'Editar', 'Redefinir senha', 'Suspender', 'Excluir']);
  });

  it('suspenso: Reativar e Excluir', async () => {
    const user = await abrirMenu('suspended');
    expect(itens()).toEqual(['Ver detalhes', 'Editar', 'Redefinir senha', 'Reativar', 'Excluir']);
    await user.click(screen.getByRole('menuitem', { name: 'Reativar' }));
    expect(reactivate).toHaveBeenCalledWith('p-suspended');
  });

  it('pendente: Cancelar convite, que libera a vaga', async () => {
    const user = await abrirMenu('pending');
    expect(itens()).toEqual(['Ver detalhes', 'Editar', 'Redefinir senha', 'Cancelar convite']);
    await user.click(screen.getByRole('menuitem', { name: 'Cancelar convite' }));
    // A confirmação do sistema, não a caixa do navegador (achado 109).
    expect(screen.getByText('Cancelar o convite de Ana pending?')).toBeInTheDocument();
    expect(cancelInvite).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancelar convite' }));
    expect(cancelInvite).toHaveBeenCalledWith('p-pending');
    expect(softDelete).not.toHaveBeenCalled();
  });

  it('excluído: nem Reativar nem Excluir', async () => {
    await abrirMenu('deleted');
    expect(itens()).toEqual(['Ver detalhes', 'Redefinir senha']);
  });
});

describe('Editar: só o nome (lote 6e, D2 parcial)', () => {
  it('abre com o nome atual e grava só nome e sobrenome', async () => {
    const user = await abrirMenu('active');
    await user.click(screen.getByRole('menuitem', { name: 'Editar' }));
    expect(screen.getByText(/Cargo, Loja e Conta não mudam por aqui/)).toBeInTheDocument();
    const nome = screen.getByLabelText(/^Nome/);
    expect(nome).toHaveValue('Ana');
    expect(screen.getByRole('button', { name: 'Salvar nome' })).toBeDisabled();
    await user.clear(nome);
    await user.type(nome, '  Fulana Exemplo ');
    await user.click(screen.getByRole('button', { name: 'Salvar nome' }));
    expect(updateUser).toHaveBeenCalledWith({
      targetProfileId: 'p-active',
      patch: { first_name: 'Fulana Exemplo', last_name: 'active' },
    });
  });

  it('nome vazio não salva', async () => {
    const user = await abrirMenu('active');
    await user.click(screen.getByRole('menuitem', { name: 'Editar' }));
    await user.clear(screen.getByLabelText(/^Nome/));
    expect(screen.getByText('Informe o nome da pessoa.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar nome' })).toBeDisabled();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('o próprio perfil não tem Editar', async () => {
    meuPerfil.id = 'p-active';
    await abrirMenu('active');
    expect(itens()).not.toContain('Editar');
  });
});
