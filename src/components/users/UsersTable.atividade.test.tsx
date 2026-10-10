/**
 * Colunas da tabela de pessoas por tela (backlog item 7):
 *   - Equipe (gerente/gestor): as de sempre — Loja, Último acesso, Acessos.
 *   - Superadmin: Loja, Visto por último, Mensagens 7d / 30d, Último acesso
 *     (entrada real) e Última mensagem, com datas relativas e a completa no
 *     passar o mouse. IP e navegador só em "Ver detalhes".
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { UserRow } from '@/hooks/users/useUsers';
import { SEM_MENSAGEM_DICA, type UserActivity } from '@/hooks/users/useAdminUsersActivity';

vi.mock('@/hooks/users/useManageUser', () => ({
  useSuspendUser: () => ({ mutate: vi.fn() }),
  useReactivateUser: () => ({ mutate: vi.fn() }),
  useSoftDeleteUser: () => ({ mutate: vi.fn() }),
  useCancelInvite: () => ({ mutate: vi.fn() }),
  useResetUserPassword: () => ({ mutate: vi.fn() }),
}));
vi.mock('./UserDetailsDialog', () => ({ UserDetailsDialog: () => null }));

import { UsersTable } from './UsersTable';

const AGORA = new Date(2026, 9, 10, 14, 0, 0);
const antes = (horas: number) => new Date(AGORA.getTime() - horas * 3600_000).toISOString();

const pessoa = (id: string, nome: string, extra: Partial<UserRow> = {}): UserRow => ({
  id,
  user_id: `u-${id}`,
  tenant_id: 'loja-1',
  parent_id: null,
  affiliate_id: null,
  role: 'gerente',
  status: 'active',
  first_name: nome,
  last_name: 'Teste',
  phone: null,
  avatar_url: null,
  last_login_at: null,
  login_count: 3,
  created_at: '2026-06-01T12:00:00Z',
  ...extra,
});

const atividade = (profile_id: string, extra: Partial<UserActivity> = {}): UserActivity => ({
  profile_id,
  tenant_name: 'Loja Centro',
  account_name: 'Conta Exemplo',
  last_sign_in_at: antes(8 * 24),
  last_seen_at: antes(2),
  last_message_at: antes(26),
  messages_7d: 120,
  messages_30d: 217,
  conversations_7d: 21,
  conversations_30d: 40,
  last_login_ip: '198.51.100.7',
  last_login_user_agent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/128.0.6613.84',
  ...extra,
});

const cabecalhos = () => screen.getAllByRole('columnheader').map((h) => h.textContent?.trim());
const celula = (linha: string, coluna: string) => {
  const idx = cabecalhos().indexOf(coluna);
  const tr = screen.getByText(linha).closest('tr') as HTMLElement;
  return within(tr).getAllByRole('cell')[idx] as HTMLElement;
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AGORA);
});
afterEach(() => vi.useRealTimers());

describe('Equipe (sem atividade): nada muda', () => {
  it('colunas de sempre e "Nunca" para quem não entrou', () => {
    render(<UsersTable rows={[pessoa('p1', 'Ana')]} tenantNames={{ 'loja-1': 'Loja Centro' }} />);
    expect(cabecalhos()).toEqual(['Nome', 'Função', 'Status', 'Loja', 'Último acesso', 'Acessos', 'Ações']);
    expect(celula('Ana Teste', 'Loja').textContent).toBe('Loja Centro');
    expect(celula('Ana Teste', 'Último acesso').textContent).toBe('Nunca');
    expect(celula('Ana Teste', 'Acessos').textContent).toBe('3');
  });
});

describe('Superadmin (com atividade)', () => {
  const renderSuper = (rows: UserRow[], activity: Record<string, UserActivity>) =>
    render(<UsersTable rows={rows} tenantNames={{ 'loja-1': 'Loja Centro' }} activity={activity} />);

  it('troca Último acesso/Acessos pelas colunas de atividade', () => {
    renderSuper([pessoa('p1', 'Ana')], { p1: atividade('p1') });
    expect(cabecalhos()).toEqual([
      'Nome',
      'Função',
      'Status',
      'Loja',
      'Visto por último',
      'Mensagens 7d / 30d',
      'Último acesso',
      'Última mensagem',
      'Ações',
    ]);
  });

  it('datas relativas em pt-BR, com a data completa ao passar o mouse', () => {
    renderSuper([pessoa('p1', 'Ana')], { p1: atividade('p1') });
    const visto = within(celula('Ana Teste', 'Visto por último')).getByText('há 2 horas');
    expect(visto).toHaveAttribute('title', '10/10/2026 às 12:00');
    expect(celula('Ana Teste', 'Último acesso').textContent).toBe('há 8 dias');
    expect(celula('Ana Teste', 'Última mensagem').textContent).toBe('ontem');
    expect(celula('Ana Teste', 'Mensagens 7d / 30d').textContent).toBe('120 / 217');
  });

  it('a Loja aparece (era sempre "—" nesta tela)', () => {
    renderSuper([pessoa('p1', 'Ana')], { p1: atividade('p1') });
    expect(celula('Ana Teste', 'Loja').textContent).toBe('Loja Centro');
  });

  it('"Nunca" só para quem nunca entrou; sem mensagem é "—", explicado, não "Nunca"', () => {
    renderSuper([pessoa('p2', 'Bia')], {
      p2: atividade('p2', {
        last_sign_in_at: null,
        last_seen_at: null,
        last_message_at: null,
        messages_7d: 0,
        messages_30d: 0,
      }),
    });
    expect(celula('Bia Teste', 'Visto por último').textContent).toBe('Nunca');
    expect(celula('Bia Teste', 'Último acesso').textContent).toBe('Nunca');
    const semMensagem = within(celula('Bia Teste', 'Última mensagem')).getByText('—');
    expect(semMensagem).toHaveAttribute('title', SEM_MENSAGEM_DICA);
    expect(celula('Bia Teste', 'Mensagens 7d / 30d').textContent).toBe('0 / 0');
  });

  it('IP e navegador não aparecem na tabela', () => {
    renderSuper([pessoa('p1', 'Ana')], { p1: atividade('p1') });
    expect(screen.queryByText('198.51.100.7')).not.toBeInTheDocument();
    expect(screen.queryByText(/Chrome/)).not.toBeInTheDocument();
  });

  it('layout: Visto por último sempre; Loja e Mensagens a partir de 1280; o resto a partir de 1536', () => {
    renderSuper([pessoa('p1', 'Ana')], { p1: atividade('p1') });
    const classe = (coluna: string) =>
      (screen.getAllByRole('columnheader')[cabecalhos().indexOf(coluna)] as HTMLElement).className;
    expect(classe('Visto por último')).not.toMatch(/hidden/);
    expect(classe('Loja')).toMatch(/hidden xl:table-cell/);
    expect(classe('Mensagens 7d / 30d')).toMatch(/hidden xl:table-cell/);
    expect(classe('Último acesso')).toMatch(/hidden 2xl:table-cell/);
    expect(classe('Última mensagem')).toMatch(/hidden 2xl:table-cell/);
  });
});
