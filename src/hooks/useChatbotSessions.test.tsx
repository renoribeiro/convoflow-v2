/**
 * Sessões ativas de chatbot lidas pela tela de Conversas.
 *
 * O que precisa continuar verdadeiro:
 *  - UMA query da Loja (`tenant_id` + `status = 'active'`), sem filtro por
 *    contato ou instância — é o mapa que a lista e o cabeçalho compartilham;
 *  - a sessão da conversa aberta é escolhida pelo contato, preferindo a
 *    instância da conversa quando há mais de uma;
 *  - sem sessão o resultado é `null`, e não um objeto vazio.
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

import {
  buildBotSessionsMap,
  pickBotSession,
  useActiveBotSessions,
  useConversationBotSession,
  type ActiveBotSession,
} from './useChatbotSessions';

const session = (over: Partial<ActiveBotSession> = {}): ActiveBotSession => ({
  id: 'sess-1',
  contact_id: 'contact-1',
  whatsapp_instance_id: 'inst-1',
  chatbot_id: 'bot-1',
  awaiting_input: true,
  last_activity_at: '2026-09-14T10:00:00Z',
  ...over,
});

/** `from(table)` → chain; cada tabela resolve com as linhas dadas. */
function mockTables(rows: Record<string, unknown[]>) {
  const calls: Record<string, { select: any; eq: any }> = {};
  mockFrom.mockImplementation((table: string) => {
    const chain: any = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
      resolve({ data: rows[table] ?? [], error: null });
    calls[table] = chain;
    return chain;
  });
  return calls;
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'TestQueryProvider';
  return Wrapper;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('pickBotSession', () => {
  it('returns null without sessions', () => {
    expect(pickBotSession(undefined, 'inst-1')).toBeNull();
    expect(pickBotSession([], 'inst-1')).toBeNull();
  });

  it('prefers the session on the conversation instance', () => {
    const a = session({ id: 'a', whatsapp_instance_id: 'inst-1', last_activity_at: '2026-01-01T00:00:00Z' });
    const b = session({ id: 'b', whatsapp_instance_id: 'inst-2', last_activity_at: '2026-09-01T00:00:00Z' });
    expect(pickBotSession([a, b], 'inst-1')?.id).toBe('a');
  });

  it('shows the only session even when its instance differs (the bot IS talking to this contact)', () => {
    const b = session({ id: 'b', whatsapp_instance_id: 'inst-2' });
    expect(pickBotSession([b], 'inst-1')?.id).toBe('b');
    // Sessão antiga sem instância também conta.
    expect(pickBotSession([session({ id: 'c', whatsapp_instance_id: null })], 'inst-1')?.id).toBe('c');
  });

  it('falls back to the most recent activity when none matches', () => {
    const a = session({ id: 'a', whatsapp_instance_id: 'inst-2', last_activity_at: '2026-01-01T00:00:00Z' });
    const b = session({ id: 'b', whatsapp_instance_id: 'inst-3', last_activity_at: '2026-09-01T00:00:00Z' });
    expect(pickBotSession([a, b], 'inst-1')?.id).toBe('b');
    expect(pickBotSession([a, b], null)?.id).toBe('b');
  });
});

describe('buildBotSessionsMap', () => {
  it('groups by contact_id', () => {
    const map = buildBotSessionsMap([
      session({ id: 'a', contact_id: 'c1' }),
      session({ id: 'b', contact_id: 'c2' }),
      session({ id: 'c', contact_id: 'c1', whatsapp_instance_id: 'inst-2' }),
    ]);
    expect(Object.keys(map).sort()).toEqual(['c1', 'c2']);
    expect(map.c1?.map((s) => s.id)).toEqual(['a', 'c']);
  });
});

describe('useActiveBotSessions', () => {
  it('reads the whole tenant once: tenant_id + status=active, no contact filter', async () => {
    const tables = mockTables({ chatbot_sessions: [session()] });

    const { result } = renderHook(() => useActiveBotSessions(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockFrom).toHaveBeenCalledWith('chatbot_sessions');
    const chain = tables.chatbot_sessions!;
    expect(chain.select).toHaveBeenCalledWith(
      'id, contact_id, whatsapp_instance_id, chatbot_id, awaiting_input, last_activity_at',
    );
    expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-abc');
    expect(chain.eq).toHaveBeenCalledWith('status', 'active');
    const filters = chain.eq.mock.calls.map((c: unknown[]) => c[0]);
    expect(filters).not.toContain('contact_id');
    expect(filters).not.toContain('whatsapp_instance_id');

    expect(result.current.data).toEqual({ 'contact-1': [session()] });
  });
});

describe('useConversationBotSession', () => {
  it('resolves the session and the bot name for the open conversation', async () => {
    mockTables({
      chatbot_sessions: [session()],
      chatbots: [{ id: 'bot-1', name: 'Filtragem de Leads' }],
    });

    const { result } = renderHook(() => useConversationBotSession('contact-1', 'inst-1'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.session?.id).toBe('sess-1'));
    await waitFor(() => expect(result.current.botName).toBe('Filtragem de Leads'));
    expect(mockFrom).toHaveBeenCalledWith('chatbots');
  });

  it('is null for a contact without active session', async () => {
    mockTables({ chatbot_sessions: [session()], chatbots: [] });

    const { result } = renderHook(() => useConversationBotSession('contact-2', 'inst-1'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(mockFrom).toHaveBeenCalledWith('chatbot_sessions'));
    expect(result.current).toEqual({ session: null, botName: null });
  });
});
