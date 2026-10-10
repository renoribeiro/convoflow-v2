/**
 * useRenameStore: chama a RPC certa, limpa a lista de Lojas, relê a Loja
 * aberta só quando é ela que mudou e mostra a recusa do banco em pt-BR.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockRpc, refreshTenant, tenantRef } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  refreshTenant: vi.fn(() => Promise.resolve()),
  tenantRef: { current: { id: 'bbbbbbbb-0000-4000-8000-000000000001' } as { id: string } | null },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: mockRpc },
}));

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenant: tenantRef.current, refreshTenant }),
}));

import { useRenameStore } from './useRenameStore';

const LOJA_ABERTA = 'bbbbbbbb-0000-4000-8000-000000000001';
const OUTRA_LOJA = 'bbbbbbbb-0000-4000-8000-000000000002';

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useRenameStore(), { wrapper });
  return { result, invalidate };
}

beforeEach(() => {
  mockRpc.mockReset();
  refreshTenant.mockClear();
  tenantRef.current = { id: LOJA_ABERTA };
});

describe('useRenameStore', () => {
  it('chama rename_store com a Loja e o nome', async () => {
    mockRpc.mockResolvedValue({ data: { id: OUTRA_LOJA, name: 'Filial Sul', changed: true }, error: null });
    const { result } = setup();

    let loja: unknown;
    await act(async () => {
      loja = await result.current.mutateAsync({ storeId: OUTRA_LOJA, name: 'Filial Sul' });
    });

    expect(mockRpc).toHaveBeenCalledWith('rename_store', { p_store_id: OUTRA_LOJA, p_name: 'Filial Sul' });
    expect(loja).toEqual({ id: OUTRA_LOJA, name: 'Filial Sul', changed: true });
  });

  it('limpa a lista de Lojas de qualquer Conta (prefixo tenant/my-stores)', async () => {
    mockRpc.mockResolvedValue({ data: { id: OUTRA_LOJA, name: 'Filial Sul', changed: true }, error: null });
    const { result, invalidate } = setup();

    await act(async () => {
      await result.current.mutateAsync({ storeId: OUTRA_LOJA, name: 'Filial Sul' });
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tenant', 'my-stores'] });
  });

  it('relê a Loja aberta, sem carregando, quando é ela que foi renomeada', async () => {
    mockRpc.mockResolvedValue({ data: { id: LOJA_ABERTA, name: 'Matriz Nova', changed: true }, error: null });
    const { result } = setup();

    await act(async () => {
      await result.current.mutateAsync({ storeId: LOJA_ABERTA, name: 'Matriz Nova' });
    });

    expect(refreshTenant).toHaveBeenCalledTimes(1);
    expect(refreshTenant).toHaveBeenCalledWith({ silent: true });
  });

  it('não relê a Loja aberta quando outra Loja foi renomeada', async () => {
    mockRpc.mockResolvedValue({ data: { id: OUTRA_LOJA, name: 'Filial Sul', changed: true }, error: null });
    const { result } = setup();

    await act(async () => {
      await result.current.mutateAsync({ storeId: OUTRA_LOJA, name: 'Filial Sul' });
    });

    expect(refreshTenant).not.toHaveBeenCalled();
  });

  it('não relê nada quando o nome já era o mesmo', async () => {
    mockRpc.mockResolvedValue({ data: { id: LOJA_ABERTA, name: 'Matriz', changed: false }, error: null });
    const { result } = setup();

    await act(async () => {
      await result.current.mutateAsync({ storeId: LOJA_ABERTA, name: 'Matriz' });
    });

    expect(refreshTenant).not.toHaveBeenCalled();
  });

  it('a recusa do banco chega como a mensagem em pt-BR', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'Você só pode renomear as Lojas da sua Conta.' },
    });
    const { result, invalidate } = setup();

    await expect(
      act(() => result.current.mutateAsync({ storeId: OUTRA_LOJA, name: 'Invasão' })),
    ).rejects.toThrow('Você só pode renomear as Lojas da sua Conta.');
    expect(invalidate).not.toHaveBeenCalled();
    expect(refreshTenant).not.toHaveBeenCalled();
  });

  it('erro do PostgREST (em inglês) vira a mensagem genérica', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function public.rename_store' },
    });
    const { result } = setup();

    await expect(
      act(() => result.current.mutateAsync({ storeId: OUTRA_LOJA, name: 'Filial Sul' })),
    ).rejects.toThrow('Não foi possível renomear a loja. Tente novamente.');
  });

  it('resposta sem a Loja é tratada como falha', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const { result } = setup();

    await expect(
      act(() => result.current.mutateAsync({ storeId: OUTRA_LOJA, name: 'Filial Sul' })),
    ).rejects.toThrow('Não foi possível renomear a loja. Tente novamente.');
  });
});
