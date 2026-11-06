import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Excluir etiqueta só diz "excluída" quando excluiu.
 *
 * DELETE barrado pela RLS não dá erro: apaga zero linhas. Até 2026-11-05 o
 * Gerente, na Loja filha, via "Etiqueta excluída." e a etiqueta continuava lá.
 */

const { respostas, pedidos } = vi.hoisted(() => ({
  respostas: {
    excluir: { data: [] as { id: string }[] | null, error: null as { code?: string; message: string } | null },
    conferir: { data: null as { id: string } | null, error: null as { message: string } | null },
  },
  pedidos: [] as string[],
}));

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenant: { id: 'aaaaaaaa-0000-4000-8000-000000000001' } }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => {
      const listar = {
        eq: () => listar,
        order: () => Promise.resolve({ data: [], error: null }),
        maybeSingle: () => {
          pedidos.push('conferir');
          return Promise.resolve(respostas.conferir);
        },
      };
      return {
        select: () => listar,
        delete: () => ({
          eq: () => ({
            select: () => {
              pedidos.push('excluir');
              return Promise.resolve(respostas.excluir);
            },
          }),
        }),
      };
    },
  },
}));

import { toast } from 'sonner';
import { ETIQUETA_JA_EXCLUIDA, ETIQUETA_SEM_PERMISSAO, useTags } from './useTags';

const ID = 'aaaaaaaa-0000-4000-8000-000000000011';

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return renderHook(() => useTags(), { wrapper }).result;
}

async function excluir() {
  const hook = montar();
  await act(async () => {
    await hook.current.deleteTag.mutateAsync(ID).catch(() => undefined);
  });
}

beforeEach(() => {
  pedidos.length = 0;
  respostas.excluir = { data: [], error: null };
  respostas.conferir = { data: null, error: null };
  vi.mocked(toast.error).mockClear();
  vi.mocked(toast.success).mockClear();
});

describe('useTags: excluir etiqueta', () => {
  it('apagou de verdade: diz que excluiu e não confere de novo', async () => {
    respostas.excluir = { data: [{ id: ID }], error: null };
    await excluir();
    expect(toast.success).toHaveBeenCalledWith('Etiqueta excluída.');
    expect(toast.error).not.toHaveBeenCalled();
    expect(pedidos).toEqual(['excluir']);
  });

  it('zero linhas e a etiqueta continua lá: é permissão, e nunca diz "excluída"', async () => {
    respostas.conferir = { data: { id: ID }, error: null };
    await excluir();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(ETIQUETA_SEM_PERMISSAO);
  });

  it('zero linhas e a etiqueta sumiu: outra pessoa excluiu antes', async () => {
    await excluir();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(ETIQUETA_JA_EXCLUIDA);
  });

  it('erro do banco: o motivo sai em português, sem texto técnico', async () => {
    respostas.excluir = { data: null, error: { code: '42501', message: 'permission denied for table tags' } };
    await excluir();
    expect(toast.success).not.toHaveBeenCalled();
    const aviso = String(vi.mocked(toast.error).mock.calls[0]?.[0]);
    expect(aviso).toContain('Você não tem permissão');
    expect(aviso).not.toContain('permission denied');
  });

  it('sem internet: diz para conferir a internet', async () => {
    respostas.excluir = { data: null, error: { message: 'Failed to fetch' } };
    await excluir();
    expect(String(vi.mocked(toast.error).mock.calls[0]?.[0])).toContain('Confira a internet');
  });
});
