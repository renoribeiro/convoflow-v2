/**
 * Testes de `useEvolutionApi.createInstance`.
 *
 * Dois bugs originaram este arquivo:
 *
 * 1. Falha em silêncio. Sem credenciais o hook fazia `throw` ANTES do try/catch
 *    que emite o toast, e o CreateInstanceModal só logava, confiando no
 *    comentário "toast já é exibido pelo hook subjacente". Clicar em "Criar e
 *    abrir QR Code" não produzia nada na tela.
 *
 * 2. Chave-mestra no navegador. A correção inicial pedia a URL e a API Key da
 *    Evolution no formulário — mas o servidor é da plataforma e a chave global
 *    dele enxerga as instâncias de TODOS os clientes. A criação foi para uma
 *    edge function, que guarda a chave como secret.
 *
 * O que estes testes travam: o hook NUNCA fala direto com a Evolution, o corpo
 * enviado não carrega credencial nenhuma, e toda falha vira aviso na tela.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockFrom, mockGetUser, mockInvoke, mockToast, mockCreateService } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockGetUser: vi.fn(),
  mockInvoke: vi.fn(),
  mockToast: vi.fn(),
  mockCreateService: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: mockFrom,
    auth: { getUser: mockGetUser },
    functions: { invoke: mockInvoke },
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
  toast: mockToast,
}));

vi.mock('@/services/evolutionApi', () => ({
  createEvolutionApiService: mockCreateService,
  EvolutionApiService: class {},
}));

vi.mock('@/lib/env', () => ({
  env: { get: () => undefined, isDevelopment: () => false },
}));

import { useEvolutionApi } from './useEvolutionApi';

function stubSupabase() {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

  mockFrom.mockImplementation((table: string) => {
    const chain: any = {};
    chain.select = vi.fn(() => chain);
    if (table === 'profiles' || table === 'tenants') {
      chain.eq = vi.fn(() => chain);
      chain.single = vi.fn(() =>
        Promise.resolve({
          data: table === 'profiles' ? { tenant_id: 'tenant-1' } : { settings: {} },
          error: null,
        }),
      );
      return chain;
    }
    chain.eq = vi.fn(() => Promise.resolve({ data: [], error: null }));
    return chain;
  });
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'TestQueryProvider';
  return Wrapper;
}

async function mountHook() {
  const view = renderHook(() => useEvolutionApi(), { wrapper: makeWrapper() });
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  stubSupabase();
  mockInvoke.mockResolvedValue({
    data: { ok: true, instance_key: 'vendas_001', webhook_configured: true },
    error: null,
  });
});

describe('useEvolutionApi.createInstance', () => {
  it('cria pela edge function e nunca monta um cliente Evolution no navegador', async () => {
    const { result } = await mountHook();

    await act(async () => {
      await result.current.createInstance('vendas_001', undefined, {
        displayName: 'WhatsApp Vendas',
        enableWebhookAutomation: true,
      });
    });

    expect(mockInvoke).toHaveBeenCalledWith('evolution-provision', expect.anything());
    // A garantia central: nenhum EvolutionApiService é construído aqui, então
    // nenhuma chave de servidor precisa existir no navegador para criar.
    expect(mockCreateService).not.toHaveBeenCalled();
  });

  it('não manda credencial nenhuma no corpo da chamada', async () => {
    const { result } = await mountHook();

    await act(async () => {
      await result.current.createInstance('vendas_001', undefined, {
        displayName: 'WhatsApp Vendas',
      });
    });

    const options = mockInvoke.mock.calls[0][1];
    const enviado = JSON.stringify(options.body).toLowerCase();
    expect(enviado).not.toContain('apikey');
    expect(enviado).not.toContain('serverurl');
    expect(options.body).toMatchObject({
      instance_key: 'vendas_001',
      name: 'WhatsApp Vendas',
    });
  });

  it('erro da função vira aviso na tela, não silêncio', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error('Edge Function returned a non-2xx status code'), {
        context: {
          json: async () => ({
            error: 'O servidor WhatsApp da plataforma ainda não foi configurado.',
          }),
        },
      }),
    });

    const { result } = await mountHook();

    await act(async () => {
      await expect(
        result.current.createInstance('vendas_001', undefined, {}),
      ).rejects.toThrow(/ainda não foi configurado/i);
    });

    // Era exatamente isto que faltava: o usuário VÊ o erro.
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
  });

  it('resposta 200 com ok:false também é falha', async () => {
    mockInvoke.mockResolvedValue({
      data: { ok: false, error: 'Já existe uma instância com essa chave.' },
      error: null,
    });

    const { result } = await mountHook();

    await act(async () => {
      await expect(
        result.current.createInstance('vendas_001', undefined, {}),
      ).rejects.toThrow(/Já existe uma instância/i);
    });

    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
  });
});
