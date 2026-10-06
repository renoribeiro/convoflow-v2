/**
 * Tests for useEndChatbotSession.
 *
 * Chain shapes:
 *   find:   from('chatbot_sessions').select('id')
 *             .eq('tenant_id', id).eq('contact_id', cid).eq('status','active')
 *             [.eq('whatsapp_instance_id', wid)].maybeSingle() → { data, error }
 *   update: from('chatbot_sessions').update(patch)
 *             .eq('id', sid).eq('tenant_id', id).eq('status','active')
 *             .select('id') → { data: rows, error }
 *   recheck (só quando o update devolve zero linhas):
 *           from('chatbot_sessions').select('id').eq('id', sid).eq('status','active')
 *             .maybeSingle() → { data, error }
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: mockFrom },
}));

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenant: { id: 'tenant-abc' } }),
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

/**
 * Builds a `from()` object exposing both .select() (find) and .update() paths.
 * `sessionRow` is what maybeSingle() resolves with (null = no active session).
 */
function makeChain(
  sessionRow: { id: string } | null,
  updateErr: Error | null = null,
  opts: {
    /** Linhas que o UPDATE ... select('id') devolve. Padrão: a sessão encontrada. */
    updatedRows?: { id: string }[];
    /** O que a releitura (após zero linhas) devolve. */
    stillActive?: { id: string } | null;
  } = {},
) {
  const selectChain: any = {};
  selectChain.eq = vi.fn(() => selectChain);
  // A releitura usa a mesma forma select('id')...maybeSingle(); distingue-se
  // pelo filtro `id` — a busca inicial filtra por tenant/contact/status.
  selectChain.maybeSingle = vi.fn(() => {
    const isRecheck = selectChain.eq.mock.calls.some((c: unknown[]) => c[0] === 'id');
    return Promise.resolve({
      data: isRecheck ? (opts.stillActive ?? null) : sessionRow,
      error: null,
    });
  });

  const updateChain: any = {};
  updateChain.eq = vi.fn(() => updateChain);
  updateChain.select = vi.fn(() =>
    Promise.resolve({
      data: updateErr ? null : (opts.updatedRows ?? (sessionRow ? [sessionRow] : [])),
      error: updateErr,
    }),
  );

  const selectSpy = vi.fn(() => selectChain);
  const updateSpy = vi.fn(() => updateChain);
  const fromObj = { select: selectSpy, update: updateSpy };

  return { fromObj, selectChain, updateChain, selectSpy, updateSpy };
}

function makeWrapper(queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
})) {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'TestQueryProvider';
  return Wrapper;
}

import { useEndChatbotSession, SESSION_END_FORBIDDEN_MESSAGE } from './useEndChatbotSession';
import { QUERY_KEYS } from '@/lib/queryClient';
import type { ActiveBotSessionsMap } from './useChatbotSessions';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useEndChatbotSession', () => {
  it('marks the active session completed and returns ended: true', async () => {
    const { fromObj, updateSpy, updateChain } = makeChain({ id: 'sess-1' });
    mockFrom.mockReturnValue(fromObj);

    const { result } = renderHook(() => useEndChatbotSession(), { wrapper: makeWrapper() });

    const res = await result.current.mutateAsync({
      contactId: 'contact-1',
      whatsappInstanceId: 'inst-1',
    });

    expect(res).toEqual({ ended: true });
    // Update patch closes the session so the bot stops re-sending the menu.
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed', awaiting_input: false }),
    );
    expect(updateChain.eq).toHaveBeenCalledWith('id', 'sess-1');
  });

  it('returns ended: false and does not update when there is no active session', async () => {
    const { fromObj, updateSpy } = makeChain(null);
    mockFrom.mockReturnValue(fromObj);

    const { result } = renderHook(() => useEndChatbotSession(), { wrapper: makeWrapper() });

    const res = await result.current.mutateAsync({ contactId: 'contact-1' });

    expect(res).toEqual({ ended: false });
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('filters by whatsapp_instance_id only when provided', async () => {
    const { fromObj, selectChain } = makeChain({ id: 'sess-1' });
    mockFrom.mockReturnValue(fromObj);

    const { result } = renderHook(() => useEndChatbotSession(), { wrapper: makeWrapper() });

    await result.current.mutateAsync({ contactId: 'contact-1', whatsappInstanceId: 'inst-9' });

    expect(selectChain.eq).toHaveBeenCalledWith('whatsapp_instance_id', 'inst-9');
    expect(selectChain.eq).toHaveBeenCalledWith('contact_id', 'contact-1');
    expect(selectChain.eq).toHaveBeenCalledWith('status', 'active');
  });

  it('does not filter by instance when instance id is absent', async () => {
    const { fromObj, selectChain } = makeChain({ id: 'sess-1' });
    mockFrom.mockReturnValue(fromObj);

    const { result } = renderHook(() => useEndChatbotSession(), { wrapper: makeWrapper() });

    await result.current.mutateAsync({ contactId: 'contact-1' });

    const instanceCall = selectChain.eq.mock.calls.find(
      (c: unknown[]) => c[0] === 'whatsapp_instance_id',
    );
    expect(instanceCall).toBeUndefined();
  });

  it('surfaces an update error', async () => {
    const { fromObj } = makeChain({ id: 'sess-1' }, new Error('rls denied'));
    mockFrom.mockReturnValue(fromObj);

    const { result } = renderHook(() => useEndChatbotSession(), { wrapper: makeWrapper() });

    await expect(
      result.current.mutateAsync({ contactId: 'contact-1' }),
    ).rejects.toThrow('rls denied');
  });

  // --- Botão informado: a tela já sabe qual sessão está ativa -------------

  it('with sessionId, skips the lookup and updates that session directly', async () => {
    const { fromObj, selectSpy, updateChain } = makeChain({ id: 'sess-7' });
    mockFrom.mockReturnValue(fromObj);

    const { result } = renderHook(() => useEndChatbotSession(), { wrapper: makeWrapper() });

    const res = await result.current.mutateAsync({ contactId: 'contact-1', sessionId: 'sess-7' });

    expect(res).toEqual({ ended: true });
    expect(selectSpy).not.toHaveBeenCalled();
    expect(updateChain.eq).toHaveBeenCalledWith('id', 'sess-7');
    // Só encerra o que ainda está ativo: o motor pode ter terminado antes.
    expect(updateChain.eq).toHaveBeenCalledWith('status', 'active');
    expect(updateChain.select).toHaveBeenCalledWith('id');
  });

  it('zero rows updated and the session is gone → ended: false (engine finished first)', async () => {
    const { fromObj } = makeChain({ id: 'sess-1' }, null, { updatedRows: [], stillActive: null });
    mockFrom.mockReturnValue(fromObj);

    const { result } = renderHook(() => useEndChatbotSession(), { wrapper: makeWrapper() });

    const res = await result.current.mutateAsync({ contactId: 'contact-1', sessionId: 'sess-1' });
    expect(res).toEqual({ ended: false });
  });

  it('zero rows updated but the session is still active → permission error, never "ended"', async () => {
    // Gerente lendo uma Loja filha: chatbot_sessions só lhe dá SELECT, o
    // UPDATE volta vazio sem erro. Antes, a tela dizia "encerrada".
    const { fromObj } = makeChain({ id: 'sess-1' }, null, {
      updatedRows: [],
      stillActive: { id: 'sess-1' },
    });
    mockFrom.mockReturnValue(fromObj);

    const { result } = renderHook(() => useEndChatbotSession(), { wrapper: makeWrapper() });

    await expect(
      result.current.mutateAsync({ contactId: 'contact-1', sessionId: 'sess-1' }),
    ).rejects.toThrow(SESSION_END_FORBIDDEN_MESSAGE);
  });

  it('on success, drops the contact from the active-sessions map at once (no poll needed)', async () => {
    const { fromObj } = makeChain({ id: 'sess-1' });
    mockFrom.mockReturnValue(fromObj);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const mapKey = [QUERY_KEYS.CONVERSATIONS_BOT_SESSIONS, 'tenant-abc'];
    const session = {
      id: 'sess-1',
      contact_id: 'contact-1',
      whatsapp_instance_id: 'inst-1',
      chatbot_id: 'bot-1',
      awaiting_input: true,
      last_activity_at: '2026-09-14T10:00:00Z',
    };
    const other = { ...session, id: 'sess-2', contact_id: 'contact-2' };
    queryClient.setQueryData<ActiveBotSessionsMap>(mapKey, {
      'contact-1': [session],
      'contact-2': [other],
    });

    const { result } = renderHook(() => useEndChatbotSession(), {
      wrapper: makeWrapper(queryClient),
    });

    await result.current.mutateAsync({ contactId: 'contact-1', sessionId: 'sess-1' });

    const map = queryClient.getQueryData<ActiveBotSessionsMap>(mapKey);
    expect(map?.['contact-1']).toBeUndefined();
    // O vizinho não é tocado.
    expect(map?.['contact-2']).toEqual([other]);
  });
});
