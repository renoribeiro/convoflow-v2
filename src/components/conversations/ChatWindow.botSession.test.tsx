/**
 * Selo "Bot em atendimento" e o botão "Encerrar sessão do bot" no chat.
 *
 * O que precisa continuar verdadeiro:
 *  - com sessão ativa no contato, o cabeçalho mostra o selo (com o nome do
 *    bot) e o item do menu fica habilitado, nomeando o bot;
 *  - sem sessão, NADA é montado (nem selo cinza) e o item fica desabilitado;
 *  - depois de encerrar, o selo some NA HORA — o teste deixa a releitura
 *    pendurada para provar que não foi o poll que o tirou;
 *  - o encerramento mira a sessão mostrada (id) e só a que ainda está ativa.
 *
 * `useChatbotSessions` e `useEndChatbotSession` rodam de verdade sobre um
 * cliente Supabase falso; o resto do chat é dublado como no teste de foco.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';

const TENANT_ID = 'tenant-1';
const CONTACT_ID = 'contact-1';
const CONVERSATION_ID = 'conversa-1';
const SESSION_ID = 'sess-1';

const conversation = {
  id: CONVERSATION_ID,
  contact_id: CONTACT_ID,
  whatsapp_instance_id: 'inst-1',
  unread_count: 0,
  contacts: { id: CONTACT_ID, name: 'Helena Duarte', phone: '5511999998888', contact_tags: [] },
};

/**
 * Estado do banco falso. `sessions` é o que chatbot_sessions devolve;
 * `frozen` deixa toda leitura de chatbot_sessions pendurada (nunca resolve).
 */
const db = vi.hoisted(() => ({
  sessions: [] as Array<Record<string, unknown>>,
  frozen: false,
  updates: [] as Array<{ patch: Record<string, unknown>; filters: unknown[][] }>,
}));

vi.mock('@/integrations/supabase/client', () => {
  const chainFor = (table: string) => {
    const chain: any = {};
    let op: 'select' | 'update' = 'select';
    const filters: unknown[][] = [];
    let patch: Record<string, unknown> = {};

    const resolveRows = () => {
      if (table === 'chatbot_sessions') return db.sessions;
      if (table === 'chatbots') return [{ id: 'bot-1', name: 'Filtragem de Leads' }];
      return [];
    };

    chain.select = vi.fn(() => {
      if (op === 'update') {
        // UPDATE ... select('id'): a sessão sai do banco falso.
        const id = filters.find((f) => f[0] === 'id')?.[1];
        const hit = db.sessions.find((s) => s.id === id);
        db.sessions = db.sessions.filter((s) => s.id !== id);
        db.updates.push({ patch, filters: [...filters] });
        db.frozen = true;
        return Promise.resolve({ data: hit ? [{ id }] : [], error: null });
      }
      return chain;
    });
    chain.update = vi.fn((p: Record<string, unknown>) => {
      op = 'update';
      patch = p;
      return chain;
    });
    chain.eq = vi.fn((...args: unknown[]) => {
      filters.push(args);
      return chain;
    });
    chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
    chain.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) => {
      if (table === 'chatbot_sessions' && db.frozen) return new Promise(() => {});
      return Promise.resolve(resolve({ data: resolveRows(), error: null }));
    };
    return chain;
  };
  return { supabase: { from: (table: string) => chainFor(table) } };
});

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenant: { id: TENANT_ID, name: 'Loja Teste' } }),
}));

vi.mock('@/hooks/useConversations', () => ({
  useConversation: () => ({ data: conversation, isLoading: false, error: null }),
  useMarkConversationAsRead: () => ({ mutate: vi.fn(), isPending: false }),
  useArchiveConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/useMessages', () => ({
  useMessages: () => ({ isLoading: false, error: null, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn() }),
  getAllMessages: () => [],
  useSendMessage: () => ({ mutateAsync: vi.fn(async () => ({ id: 'msg' })), isPending: false }),
  useMarkMessagesAsRead: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/useRealtimeMessages', () => ({ useRealtimeMessages: () => {} }));
vi.mock('@/hooks/useChatHistorySync', () => ({
  useChatHistorySync: () => ({ syncConversation: vi.fn(async () => {}) }),
}));

const adapter = {
  isReadyToSend: () => true,
  sendText: vi.fn(),
  setTyping: vi.fn(() => Promise.resolve()),
  getCapabilities: () => ({ fetchHistory: false }),
  getProfilePicture: vi.fn(() => Promise.resolve(null)),
  type: 'evolution',
};
vi.mock('@/hooks/useWhatsAppApi', () => ({
  useWhatsAppInstancesWithAdapter: () => ({ instances: [] }),
  pickActiveInstance: () => ({ row: { id: 'inst-1', name: 'Principal', provider: 'evolution' }, adapter }),
}));
vi.mock('@/hooks/useSupabaseQuery', () => ({ useSupabaseQuery: () => ({ data: [] }) }));
vi.mock('@/hooks/useSupabaseMutation', () => ({
  useSupabaseMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('react-intersection-observer', () => ({ useInView: () => ({ ref: vi.fn(), inView: false }) }));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), info: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('./ContactPanel', () => ({ ContactPanel: () => null }));
vi.mock('./ChatSearchBar', () => ({ ChatSearchBar: () => null }));
vi.mock('./SendTemplateDialog', () => ({ SendTemplateDialog: () => null }));
vi.mock('./SaveQuickReplyDialog', () => ({ SaveQuickReplyDialog: () => null }));
vi.mock('@/components/etiquetas/LeadTagsDialog', () => ({ LeadTagsDialog: () => null }));
vi.mock('./QuickRepliesPopover', () => ({ QuickRepliesPopover: () => null }));
vi.mock('./ConversationOwnerControl', () => ({ ConversationOwnerControl: () => null }));
vi.mock('./AudioRecorder', () => ({
  AudioRecorder: () => <button type="button" aria-label="Gravar áudio" />,
}));

import { ChatWindow } from './ChatWindow';
import { toast } from 'sonner';

const activeSession = () => ({
  id: SESSION_ID,
  contact_id: CONTACT_ID,
  whatsapp_instance_id: 'inst-1',
  chatbot_id: 'bot-1',
  awaiting_input: true,
  last_activity_at: '2026-09-14T10:00:00Z',
});

function renderChat() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ChatWindow conversationId={CONVERSATION_ID} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

const badge = () => screen.queryByTestId('bot-session-badge');

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Mais opções' }));
  return screen.findByRole('menuitem', { name: /encerrar sessão do bot/i });
}

beforeEach(() => {
  vi.clearAllMocks();
  db.sessions = [];
  db.frozen = false;
  db.updates = [];
});

describe('ChatWindow — bot em atendimento', () => {
  it('com sessão ativa: mostra o selo com o nome do bot e habilita o item do menu', async () => {
    db.sessions = [activeSession()];
    const user = userEvent.setup();
    renderChat();

    await waitFor(() => expect(badge()).toBeInTheDocument());
    expect(badge()).toHaveTextContent('Bot em atendimento');
    await waitFor(() => expect(badge()).toHaveTextContent('Filtragem de Leads'));

    const item = await openMenu(user);
    expect(item).not.toHaveAttribute('aria-disabled', 'true');
    expect(item).toHaveTextContent('Encerrar sessão do bot "Filtragem de Leads"');
  });

  it('sem sessão: não monta selo nenhum e o item do menu fica desabilitado', async () => {
    const user = userEvent.setup();
    renderChat();

    // Dá tempo da query resolver (vazia) antes de afirmar a ausência.
    await screen.findByText('Helena Duarte');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mais opções' })).toBeInTheDocument());
    expect(badge()).not.toBeInTheDocument();

    const item = await openMenu(user);
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item).toHaveTextContent('Encerrar sessão do bot');
  });

  it('encerrar: mira a sessão mostrada, e o selo some na hora (sem esperar o poll)', async () => {
    db.sessions = [activeSession()];
    const user = userEvent.setup();
    renderChat();

    await waitFor(() => expect(badge()).toBeInTheDocument());

    await user.click(await openMenu(user));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('"Filtragem de Leads" está conduzindo esta conversa');
    await user.click(within(dialog).getByRole('button', { name: 'Encerrar sessão' }));

    // O banco falso congelou as leituras de chatbot_sessions no UPDATE: se o
    // selo sumir, foi o cache — nenhuma releitura consegue ter respondido.
    await waitFor(() => expect(badge()).not.toBeInTheDocument());
    expect(db.frozen).toBe(true);

    expect(db.updates).toHaveLength(1);
    const { patch, filters } = db.updates[0]!;
    expect(patch).toMatchObject({ status: 'completed', awaiting_input: false });
    expect(filters).toContainEqual(['id', SESSION_ID]);
    expect(filters).toContainEqual(['tenant_id', TENANT_ID]);
    expect(filters).toContainEqual(['status', 'active']);
    expect(toast.success).toHaveBeenCalled();
  });
});
