import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Lixeiras do lote 6c (fonte de tráfego e agendamento de relatório): DELETE
 * que não acha a linha não dá erro, só não apaga. Sem linha apagada, a tela não
 * pode dizer "excluído". Desde o lote 6d (20261029000005) o Gerente grava nas
 * Lojas filhas, então o motivo não fala mais de cargo: a linha já saiu.
 */

const { estado } = vi.hoisted(() => ({ estado: { apagadas: [] as Array<{ id: string }>, toast: vi.fn() } }));

function consulta() {
  const c: Record<string, unknown> = {};
  c.delete = () => c;
  c.eq = () => c;
  c.select = () => Promise.resolve({ data: estado.apagadas, error: null });
  return c;
}

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => consulta() } }));
vi.mock('@/contexts/TenantContext', () => ({ useTenant: () => ({ tenant: { id: 'loja-1' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: estado.toast }) }));

import { useDeleteTrafficSource } from './useTracking';
import { useDeleteReportSchedule } from './useReports';

const embrulho = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>{children}</QueryClientProvider>
);

beforeEach(() => {
  estado.toast.mockReset();
  estado.apagadas = [];
});

describe.each([
  ['fonte de tráfego', useDeleteTrafficSource, 'Fonte excluída', /esta fonte já não está nesta Loja/],
  ['agendamento de relatório', useDeleteReportSchedule, 'Agendamento excluído', /este agendamento já não está nesta Loja/],
])('excluir %s', (_nome, gancho, tituloDeSucesso, motivo) => {
  it('sem linha apagada: avisa que nada foi excluído', async () => {
    const { result } = renderHook(() => gancho(), { wrapper: embrulho });
    await act(async () => {
      await result.current.mutateAsync('x').catch(() => {});
    });
    const chamada = estado.toast.mock.calls[0]![0];
    expect(chamada.variant).toBe('destructive');
    expect(chamada.description).toMatch(/Nada foi excluído/);
    expect(chamada.description).toMatch(motivo);
  });

  it('com linha apagada: confirma a exclusão', async () => {
    estado.apagadas = [{ id: 'x' }];
    const { result } = renderHook(() => gancho(), { wrapper: embrulho });
    await act(async () => {
      await result.current.mutateAsync('x');
    });
    expect(estado.toast.mock.calls[0]![0].title).toBe(tituloDeSucesso);
  });
});
