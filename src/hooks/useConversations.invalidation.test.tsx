/**
 * A armadilha de cache achada no reconhecimento da fatia 4: as contagens
 * (pílulas e o selo do outro canal) moram em ['conversations', 'total', …], e
 * invalidar ['conversations', tenantId] NÃO as alcança. Marcar como lida só
 * mexia no número 30 s depois. Agora quem muda a conversa invalida as
 * contagens na hora.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/integrations/supabase/client', () => {
  const builder: Record<string, unknown> = {};
  for (const m of ['update', 'eq']) builder[m] = () => builder;
  builder.then = (resolve: (v: unknown) => void) => resolve({ error: null });
  return { supabase: { from: () => builder } };
});
vi.mock('@/contexts/TenantContext', () => ({ useTenant: () => ({ tenant: { id: 'loja-1' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import { useArchiveConversation, useMarkConversationAsRead } from './useConversations';

/** Chaves como useConversationsCount monta: pílula "Não lidas" e o selo do Instagram. */
const PILULA = ['conversations', 'total', 'loja-1', undefined, '', false, true, null, null, [], [], false, 'whatsapp', false];
const SELO = ['conversations', 'total', 'loja-1', undefined, '', false, false, null, null, [], [], false, 'instagram', true];

const montar = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(PILULA, 3);
  qc.setQueryData(SELO, 2);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
};

describe('contagens se refazem na hora', () => {
  it('a armadilha: invalidar só ["conversations", loja] não toca nas contagens', async () => {
    const { qc } = montar();
    await qc.invalidateQueries({ queryKey: ['conversations', 'loja-1'] });
    expect(qc.getQueryState(PILULA)?.isInvalidated).toBe(false);
    expect(qc.getQueryState(SELO)?.isInvalidated).toBe(false);
  });

  it('marcar como lida invalida a pílula E o selo do outro canal', async () => {
    const { qc, wrapper } = montar();
    const { result } = renderHook(() => useMarkConversationAsRead(), { wrapper });
    act(() => result.current.mutate('conv-1'));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(qc.getQueryState(PILULA)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(SELO)?.isInvalidated).toBe(true);
  });

  it('arquivar também', async () => {
    const { qc, wrapper } = montar();
    const { result } = renderHook(() => useArchiveConversation(), { wrapper });
    act(() => result.current.mutate({ conversationId: 'conv-1', isArchived: true }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(qc.getQueryState(PILULA)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(SELO)?.isInvalidated).toBe(true);
  });
});
