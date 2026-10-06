/**
 * A leitura das duas preferências de escala (tenants.settings) e a regra de
 * "quem é restrito": só ATENDENTE com nível diferente de 'all'. O banco aplica
 * a mesma regra em conversation_visibility_level(); aqui é o espelho que a
 * tela usa para explicar (etiqueta "Toda a Loja", botão de transferir).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const { estado } = vi.hoisted(() => ({
  estado: {
    settings: null as Record<string, unknown> | null,
    role: null as string | null,
    loading: false,
  },
}));

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({
    tenant: estado.settings === null ? null : { id: 'loja-1', settings: estado.settings },
    profile: estado.role ? { id: 'p1', role: estado.role } : null,
    loading: estado.loading,
  }),
}));

import {
  parseVisibilitySettings,
  useConversationVisibilityConfig,
} from './useConversationVisibilityConfig';

beforeEach(() => {
  estado.settings = {};
  estado.role = 'atendente';
  estado.loading = false;
});

describe('parseVisibilitySettings', () => {
  it('sem nada gravado devolve os padrões: all + pode transferir', () => {
    expect(parseVisibilitySettings({})).toEqual({ atendente_visibility: 'all', atendente_can_transfer: true });
    expect(parseVisibilitySettings(null)).toEqual({ atendente_visibility: 'all', atendente_can_transfer: true });
    expect(parseVisibilitySettings(undefined)).toEqual({ atendente_visibility: 'all', atendente_can_transfer: true });
  });

  it('lê os três níveis e a chave de transferência', () => {
    expect(parseVisibilitySettings({ atendente_visibility: 'own', atendente_can_transfer: false })).toEqual({
      atendente_visibility: 'own',
      atendente_can_transfer: false,
    });
    expect(parseVisibilitySettings({ atendente_visibility: 'unassigned' }).atendente_visibility).toBe('unassigned');
  });

  it('valor inválido vira o padrão (o banco nem deixa gravar; aqui é só defesa)', () => {
    expect(parseVisibilitySettings({ atendente_visibility: 'bogus', atendente_can_transfer: 'sim' })).toEqual({
      atendente_visibility: 'all',
      atendente_can_transfer: true,
    });
  });

  it('não confunde com as chaves vizinhas (sla, followups)', () => {
    expect(parseVisibilitySettings({ sla: { enabled: true }, followups: {} }).atendente_visibility).toBe('all');
  });
});

describe('useConversationVisibilityConfig', () => {
  it('atendente com nível own é restrito', () => {
    estado.settings = { atendente_visibility: 'own' };
    const { result } = renderHook(() => useConversationVisibilityConfig());
    expect(result.current.isRestricted).toBe(true);
    expect(result.current.transferBlocked).toBe(false);
  });

  it('atendente sem nada gravado NÃO é restrito — nada muda no dia em que isto sobe', () => {
    const { result } = renderHook(() => useConversationVisibilityConfig());
    expect(result.current.isRestricted).toBe(false);
    expect(result.current.transferBlocked).toBe(false);
  });

  it.each(['gestor', 'gerente', 'superadmin'])('%s nunca é restrito nem bloqueado, mesmo com own + sem transferir', (role) => {
    estado.role = role;
    estado.settings = { atendente_visibility: 'own', atendente_can_transfer: false };
    const { result } = renderHook(() => useConversationVisibilityConfig());
    expect(result.current.isRestricted).toBe(false);
    expect(result.current.transferBlocked).toBe(false);
  });

  it('atendente com a chave desligada tem a transferência bloqueada', () => {
    estado.settings = { atendente_can_transfer: false };
    const { result } = renderHook(() => useConversationVisibilityConfig());
    expect(result.current.transferBlocked).toBe(true);
    expect(result.current.isRestricted).toBe(false);
  });

  it('aceita cargo legado (user → gestor) sem restringir', () => {
    estado.role = 'user';
    estado.settings = { atendente_visibility: 'own' };
    const { result } = renderHook(() => useConversationVisibilityConfig());
    expect(result.current.isRestricted).toBe(false);
  });
});
