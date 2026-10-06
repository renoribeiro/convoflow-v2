/**
 * Só as funções puras de nome/iniciais do diretório do time — o que o chip de
 * responsável desenha. A RPC em si vive no banco (tenant_team_directory) e é
 * coberta pelo teste de isolamento em docs/.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/contexts/TenantContext', () => ({ useTenant: () => ({ tenant: null }) }));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { memberDisplayName, memberFirstName, memberInitials } from './useTeamDirectory';

describe('memberDisplayName', () => {
  it('junta nome e sobrenome, ignorando o que está vazio', () => {
    expect(memberDisplayName({ first_name: 'Maria', last_name: 'Souza' })).toBe('Maria Souza');
    expect(memberDisplayName({ first_name: ' Maria ', last_name: null })).toBe('Maria');
    expect(memberDisplayName({ first_name: null, last_name: 'Souza' })).toBe('Souza');
  });

  it('sem nada, "Sem nome" — nunca string vazia no chip', () => {
    expect(memberDisplayName({ first_name: null, last_name: null })).toBe('Sem nome');
    expect(memberDisplayName({ first_name: '  ', last_name: '' })).toBe('Sem nome');
  });
});

describe('memberFirstName', () => {
  it('devolve só a primeira palavra do primeiro nome', () => {
    expect(memberFirstName({ first_name: 'Ana Paula', last_name: 'Lima' })).toBe('Ana');
    expect(memberFirstName({ first_name: 'João', last_name: null })).toBe('João');
  });

  it('cai no nome completo quando não há primeiro nome', () => {
    expect(memberFirstName({ first_name: null, last_name: 'Souza' })).toBe('Souza');
    expect(memberFirstName({ first_name: null, last_name: null })).toBe('Sem nome');
  });
});

describe('memberInitials', () => {
  it('uma letra de cada parte, em maiúscula', () => {
    expect(memberInitials({ first_name: 'maria', last_name: 'souza' })).toBe('MS');
    expect(memberInitials({ first_name: 'Maria', last_name: null })).toBe('M');
    expect(memberInitials({ first_name: null, last_name: 'Souza' })).toBe('S');
  });

  it('sem nome, "?"', () => {
    expect(memberInitials({ first_name: null, last_name: null })).toBe('?');
    expect(memberInitials({ first_name: ' ', last_name: '' })).toBe('?');
  });
});
