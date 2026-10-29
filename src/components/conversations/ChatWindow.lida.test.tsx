/**
 * Lote 6d, decisão D4 do dono: abrir a conversa marca como lida também para o
 * cliente (os dois riscos azuis), e a bolha ganha a reação.
 *
 * O que precisa continuar verdadeiro:
 *  - a conversa aberta, com a aba à vista, manda UM recibo com os ids do
 *    WhatsApp das mensagens do cliente ainda não lidas;
 *  - com a aba escondida, nada sai até a pessoa voltar;
 *  - reagir manda a reação para a mensagem pelo id do WhatsApp e grava a linha.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';

const CONTACT_ID = 'aaaaaaaa-0000-4000-8000-0000000000e1';
const FONE = '5585999990201';

const conversation = {
  id: 'aaaaaaaa-0000-4000-8000-0000000000e2',
  contact_id: CONTACT_ID,
  whatsapp_instance_id: 'aaaaaaaa-0000-4000-8000-0000000000e3',
  unread_count: 2,
  contacts: { id: CONTACT_ID, name: 'Cliente Teste', phone: FONE, contact_tags: [] },
};

const estado = vi.hoisted(() => ({
  mensagens: [] as Array<Record<string, unknown>>,
  enviadas: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/integrations/supabase/client', () => {
  const chain: any = {};
  for (const k of ['select', 'update', 'eq', 'in', 'order', 'limit', 'ilike']) chain[k] = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(resolve({ data: [], error: null, count: 0 }));
  return { supabase: { from: () => chain, functions: { invoke: vi.fn() } } };
});
vi.mock('@/contexts/TenantContext', () => ({ useTenant: () => ({ tenant: { id: 'aaaaaaaa-0000-4000-8000-000000000001', name: 'Loja Teste' } }) }));
vi.mock('@/hooks/useConversations', () => ({
  useConversation: () => ({ data: conversation, isLoading: false, error: null }),
  useMarkConversationAsRead: () => ({ mutate: vi.fn(), isPending: false }),
  useArchiveConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));
const marcarLocal = vi.fn();
vi.mock('@/hooks/useMessages', () => ({
  useMessages: () => ({ isLoading: false, error: null, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn() }),
  getAllMessages: () => estado.mensagens,
  useSendMessage: () => ({
    mutateAsync: vi.fn(async (dados: Record<string, unknown>) => {
      estado.enviadas.push(dados);
      return { id: 'nova' };
    }),
    isPending: false,
  }),
  useMarkMessagesAsRead: () => ({ mutate: marcarLocal, isPending: false }),
}));
vi.mock('@/hooks/useRealtimeMessages', () => ({ useRealtimeMessages: () => {} }));
vi.mock('@/hooks/useMediaLinks', () => ({ useMediaLinks: () => () => ({ url: null, state: 'ready' }) }));
vi.mock('@/hooks/useChatbotSessions', () => ({ useConversationBotSession: () => ({ session: null, botName: null }) }));

const adapter = {
  isReadyToSend: () => true,
  sendText: vi.fn(),
  sendReaction: vi.fn(async () => ({ status: 'sent', providerMessageId: 'EVO_FAKE_REACAO' })),
  markRead: vi.fn(async () => {}),
  setTyping: vi.fn(() => Promise.resolve()),
  getCapabilities: () => ({ fetchHistory: false }),
  getProfilePicture: vi.fn(() => Promise.resolve(null)),
  type: 'evolution',
};
vi.mock('@/hooks/useWhatsAppApi', () => ({
  useWhatsAppInstancesWithAdapter: () => ({ instances: [] }),
  useWhatsAppInstancesSafe: () => ({ instances: [] }),
  pickActiveInstance: () => ({ row: { id: conversation.whatsapp_instance_id, name: 'Principal', provider: 'evolution', status: 'open' }, adapter }),
}));
vi.mock('@/hooks/useSupabaseQuery', () => ({ useSupabaseQuery: () => ({ data: [] }) }));
vi.mock('@/hooks/useSupabaseMutation', () => ({ useSupabaseMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }) }));
vi.mock('react-intersection-observer', () => ({ useInView: () => ({ ref: vi.fn(), inView: false }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('./ContactPanel', () => ({ ContactPanel: () => null }));
vi.mock('./ChatSearchBar', () => ({ ChatSearchBar: () => null }));
vi.mock('./SendTemplateDialog', () => ({ SendTemplateDialog: () => null }));
vi.mock('./SaveQuickReplyDialog', () => ({ SaveQuickReplyDialog: () => null }));
vi.mock('@/components/etiquetas/LeadTagsDialog', () => ({ LeadTagsDialog: () => null }));
vi.mock('./QuickRepliesPopover', () => ({ QuickRepliesPopover: () => null }));
vi.mock('./ConversationOwnerControl', () => ({ ConversationOwnerControl: () => null }));
vi.mock('./AudioRecorder', () => ({ AudioRecorder: () => <button type="button" aria-label="Gravar áudio" /> }));

import { ChatWindow } from './ChatWindow';

const recebida = (id: string, extra: Record<string, unknown> = {}) => ({
  id: `linha-${id}`,
  content: 'Oi, ainda está disponível?',
  created_at: new Date().toISOString(),
  direction: 'inbound',
  status: 'delivered',
  message_type: 'text',
  evolution_message_id: id,
  ...extra,
});

let visibilidade: DocumentVisibilityState = 'visible';
beforeEach(() => {
  vi.clearAllMocks();
  estado.enviadas = [];
  estado.mensagens = [recebida('EVO_FAKE_1'), recebida('EVO_FAKE_2')];
  visibilidade = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibilidade });
});
afterEach(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
});

function abrir() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <ChatWindow conversationId={conversation.id} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe('ChatWindow: lida ao abrir (D4)', () => {
  it('a conversa aberta manda um recibo com as mensagens do cliente não lidas', async () => {
    abrir();
    await waitFor(() => expect(adapter.markRead).toHaveBeenCalledTimes(1));
    expect(adapter.markRead).toHaveBeenCalledWith(FONE, ['EVO_FAKE_1', 'EVO_FAKE_2']);
    expect(marcarLocal).toHaveBeenCalled();
  });

  it('com a aba escondida, nada sai; ao voltar, sai', async () => {
    visibilidade = 'hidden';
    abrir();
    await screen.findByText('Cliente Teste');
    expect(adapter.markRead).not.toHaveBeenCalled();
    expect(marcarLocal).not.toHaveBeenCalled();
    visibilidade = 'visible';
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(adapter.markRead).toHaveBeenCalledWith(FONE, ['EVO_FAKE_1', 'EVO_FAKE_2']));
  });

  it('mensagem que chegou por outro número da Loja não leva recibo por este', async () => {
    estado.mensagens = [
      recebida('EVO_FAKE_1', { whatsapp_instance_id: conversation.whatsapp_instance_id }),
      recebida('EVO_FAKE_OUTRO', { whatsapp_instance_id: 'aaaaaaaa-0000-4000-8000-0000000000e9' }),
    ];
    abrir();
    await waitFor(() => expect(adapter.markRead).toHaveBeenCalledWith(FONE, ['EVO_FAKE_1']));
  });

  it('tudo já lido: nenhum recibo', async () => {
    estado.mensagens = [recebida('EVO_FAKE_1', { status: 'read' })];
    abrir();
    await screen.findByText('Cliente Teste');
    expect(adapter.markRead).not.toHaveBeenCalled();
  });
});

describe('ChatWindow: reação na bolha (D4)', () => {
  it('reage pela mensagem do WhatsApp e grava a linha da reação', async () => {
    estado.mensagens = [recebida('EVO_FAKE_1', { status: 'read' })];
    const user = userEvent.setup();
    abrir();
    await user.click(await screen.findByRole('button', { name: 'Reagir a esta mensagem' }));
    await user.click(await screen.findByRole('button', { name: 'Reagir com 👍' }));
    await waitFor(() => expect(adapter.sendReaction).toHaveBeenCalledWith(FONE, { messageId: 'EVO_FAKE_1', emoji: '👍', fromMe: false }));
    await waitFor(() =>
      expect(estado.enviadas).toEqual([
        expect.objectContaining({ message_type: 'reaction', content: '👍', status: 'sent', evolution_message_id: 'EVO_FAKE_REACAO' }),
      ]),
    );
  });

  it('mensagem sem id do WhatsApp: sem botão de reagir', async () => {
    estado.mensagens = [recebida('', { status: 'read', evolution_message_id: null })];
    abrir();
    await screen.findByText('Cliente Teste');
    expect(screen.queryByRole('button', { name: 'Reagir a esta mensagem' })).toBeNull();
  });
});
