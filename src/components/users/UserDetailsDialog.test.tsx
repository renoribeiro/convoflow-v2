/**
 * "Ver detalhes": na tela do superadmin (com atividade) mostra entrada real,
 * visto por último, mensagens, conversas, IP e navegador; na Equipe (sem
 * atividade), o de sempre — e nada de IP.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { UserRow } from '@/hooks/users/useUsers';
import type { UserActivity } from '@/hooks/users/useAdminUsersActivity';
import { UserDetailsDialog } from './UserDetailsDialog';

const AGORA = new Date(2026, 9, 10, 14, 0, 0);
const antes = (horas: number) => new Date(AGORA.getTime() - horas * 3600_000).toISOString();

const row: UserRow = {
  id: 'p1',
  user_id: 'u1',
  tenant_id: 'loja-1',
  parent_id: null,
  affiliate_id: null,
  role: 'atendente',
  status: 'active',
  first_name: 'Ana',
  last_name: 'Teste',
  phone: '(11) 99999-9999',
  avatar_url: null,
  last_login_at: null,
  login_count: 4,
  created_at: '2026-06-01T12:00:00Z',
};

const atividade: UserActivity = {
  profile_id: 'p1',
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
  last_login_user_agent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.6613.84 Safari/537.36',
};

const valor = (rotulo: string) => screen.getByText(rotulo).nextElementSibling?.textContent;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AGORA);
});
afterEach(() => vi.useRealTimers());

describe('UserDetailsDialog', () => {
  it('superadmin: atividade completa, com IP e navegador legível', () => {
    render(<UserDetailsDialog row={row} tenantName="Loja Centro" activity={atividade} onClose={() => undefined} />);
    expect(valor('Conta')).toBe('Conta Exemplo');
    expect(valor('Último acesso')).toBe('há 8 dias · 02/10/2026 às 14:00');
    expect(valor('Visto por último')).toBe('há 2 horas · 10/10/2026 às 12:00');
    expect(valor('Última mensagem')).toBe('ontem · 09/10/2026 às 12:00');
    expect(valor('Mensagens (7 / 30 dias)')).toBe('120 / 217');
    expect(valor('Conversas (7 / 30 dias)')).toBe('21 / 40');
    expect(valor('IP do último login')).toBe('198.51.100.7');
    expect(valor('Navegador do último login')).toBe('Chrome 128 no Windows');
    expect(screen.getByText('Chrome 128 no Windows')).toHaveAttribute('title', atividade.last_login_user_agent);
    expect(valor('Total de acessos')).toBe('4');
  });

  it('superadmin sem linha de atividade: "Nunca entrou" e nenhuma mensagem desde 21/09', () => {
    render(<UserDetailsDialog row={row} activity={null} onClose={() => undefined} />);
    expect(valor('Último acesso')).toBe('Nunca entrou');
    expect(valor('Visto por último')).toBe('Nunca');
    expect(valor('Última mensagem')).toBe('Nenhuma desde 21/09/2026');
    expect(valor('IP do último login')).toBe('—');
  });

  it('Equipe (sem atividade): o de sempre, sem IP, sem navegador, sem conversas', () => {
    render(<UserDetailsDialog row={{ ...row, last_login_at: antes(2) }} tenantName="Loja Centro" onClose={() => undefined} />);
    expect(valor('Último acesso')).toBe('10/10/2026 às 12:00');
    expect(screen.queryByText('IP do último login')).not.toBeInTheDocument();
    expect(screen.queryByText('Navegador do último login')).not.toBeInTheDocument();
    expect(screen.queryByText('Visto por último')).not.toBeInTheDocument();
    expect(screen.queryByText('Conversas (7 / 30 dias)')).not.toBeInTheDocument();
    expect(screen.queryByText('Conta')).not.toBeInTheDocument();
  });
});
