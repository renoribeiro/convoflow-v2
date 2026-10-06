/**
 * Conversa do Instagram no inbox (fatia 3/5).
 *
 * O que precisa continuar verdadeiro:
 *  - NUNCA responde por outra instância: sem a instância de Instagram da
 *    conversa, o compositor trava e o WhatsApp da Conta não é tocado;
 *  - só texto: sem anexo, sem áudio, sem template, sem "responder" citando;
 *  - janela de 24 h fechada: compositor travado, com o motivo e sem botão;
 *  - conexão vencida: travado, com o motivo;
 *  - limite de 1000 BYTES: contador e botão Enviar desligado antes de enviar;
 *  - o envio vai por sendInstagramReply com o IGSID do contato.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';

const TENANT_ID = 'tenant-1';
const CONTACT_ID = 'contact-ig';
const CONVERSATION_ID = 'conversa-ig';
const IG_INSTANCE_ID = 'inst-ig';
const IGSID = '978239761327698';

const IG_CAPS = {
  groups: false, polls: false, buttons: false, lists: false, stickers: false, fetchHistory: false,
  templates: false, markUnread: false, pin: false, archive: false, block: false, typingIndicator: false,
  requiresTemplateOutsideWindow: false, serverSideOnlySend: true,
};
const WA_CAPS = { ...IG_CAPS, templates: true, requiresTemplateOutsideWindow: true };

const igAdapter = {
  type: 'instagram',
  isReadyToSend: () => true,
  getCapabilities: () => IG_CAPS,
  sendText: vi.fn(),
  sendMedia: vi.fn(),
  setTyping: vi.fn(() => Promise.resolve()),
  getProfilePicture: vi.fn(() => Promise.resolve(null)),
  archiveChat: vi.fn(() => Promise.resolve()),
};
const waAdapter = {
  type: 'official',
  isReadyToSend: () => true,
  getCapabilities: () => WA_CAPS,
  sendText: vi.fn(async () => ({ status: 'sent', providerMessageId: 'wamid.1' })),
  sendMedia: vi.fn(),
  setTyping: vi.fn(() => Promise.resolve()),
  getProfilePicture: vi.fn(() => Promise.resolve(null)),
  archiveChat: vi.fn(() => Promise.resolve()),
};

const igInstance = (connection_config: Record<string, unknown> = { igAccountId: '17841419262135883', tokenExpiresAt: '2099-01-01T00:00:00Z' }) => ({
  row: { id: IG_INSTANCE_ID, name: 'Instagram Teste', provider: 'instagram', status: 'connected', connection_config },
  adapter: igAdapter,
  providerLabel: 'Instagram',
});
const waInstance = {
  row: { id: 'inst-wa', name: 'WhatsApp da Conta', provider: 'official', status: 'open', connection_config: { phoneNumberId: '1' } },
  adapter: waAdapter,
  providerLabel: 'WhatsApp Cloud (Meta)',
};

// Estado mutável que os mocks leem — cada teste monta o seu.
const state: {
  instances: unknown[];
  window: { open: boolean; closesAt: Date | null; isLoading: boolean; isError: boolean };
} = {
  instances: [],
  window: { open: true, closesAt: null, isLoading: false, isError: false },
};

const conversation = {
  id: CONVERSATION_ID,
  contact_id: CONTACT_ID,
  whatsapp_instance_id: IG_INSTANCE_ID,
  channel: 'instagram',
  tenant_id: TENANT_ID,
  unread_count: 0,
  contacts: { id: CONTACT_ID, name: null, phone: null, channel: 'instagram', external_id: IGSID, contact_tags: [] },
};

const mensagens = [
  {
    id: 'm-in-1', direction: 'inbound', content: 'quero saber o preço', message_type: 'text',
    status: 'received', created_at: new Date().toISOString(), contact_id: CONTACT_ID,
  },
];

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenant: { id: TENANT_ID, name: 'Conta Teste' } }),
}));
vi.mock('@/hooks/useConversations', () => ({
  useConversation: () => ({ data: conversation, isLoading: false, error: null }),
  useMarkConversationAsRead: () => ({ mutate: vi.fn(), isPending: false }),
  useArchiveConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useMessages', () => ({
  useMessages: () => ({ isLoading: false, error: null, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn() }),
  getAllMessages: () => mensagens,
  useSendMessage: () => ({ mutateAsync: vi.fn(async () => ({ id: 'nao-deveria' })), isPending: false }),
  useMarkMessagesAsRead: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useEndChatbotSession', () => ({
  useEndChatbotSession: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useRealtimeMessages', () => ({ useRealtimeMessages: () => {} }));
vi.mock('@/hooks/useChatHistorySync', () => ({
  useChatHistorySync: () => ({ syncConversation: vi.fn(async () => {}) }),
}));
// A lista vem do teste; o escolhedor do WhatsApp é o DE VERDADE — é ele que
// caía no WhatsApp da Conta antes da fatia 3.
vi.mock('@/hooks/useWhatsAppApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useWhatsAppApi')>()),
  useWhatsAppInstancesWithAdapter: () => ({ instances: state.instances }),
}));
vi.mock('@/hooks/useInstagramReplyWindow', () => ({
  useInstagramReplyWindow: () => state.window,
}));
const sendInstagramReply = vi.fn(async () => ({ ok: true, messageRowId: 'row-1' }));
vi.mock('@/services/instagram/sendInstagramReply', () => ({
  sendInstagramReply: (...a: unknown[]) => sendInstagramReply(...(a as [])),
}));
vi.mock('@/hooks/useSupabaseQuery', () => ({ useSupabaseQuery: () => ({ data: [] }) }));
vi.mock('@/hooks/useSupabaseMutation', () => ({
  useSupabaseMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('react-intersection-observer', () => ({ useInView: () => ({ ref: vi.fn(), inView: false }) }));
vi.mock('@/integrations/supabase/client', () => {
  const chain: any = { update: () => chain, eq: () => Promise.resolve({ error: null }), from: () => chain, select: () => chain, in: () => chain };
  return { supabase: { from: () => chain, rpc: vi.fn(async () => ({ data: null, error: null })) } };
});
vi.mock('./ContactPanel', () => ({ ContactPanel: () => null }));
vi.mock('./ChatSearchBar', () => ({ ChatSearchBar: () => null }));
vi.mock('./SendTemplateDialog', () => ({ SendTemplateDialog: () => <div data-testid="send-template-dialog" /> }));
vi.mock('./SaveQuickReplyDialog', () => ({ SaveQuickReplyDialog: () => null }));
vi.mock('@/components/etiquetas/LeadTagsDialog', () => ({ LeadTagsDialog: () => null }));
vi.mock('./QuickRepliesPopover', () => ({ QuickRepliesPopover: () => null }));
vi.mock('./AudioRecorder', () => ({
  AudioRecorder: () => <button type="button" aria-label="Gravar áudio" />,
}));

import { ChatWindow } from './ChatWindow';
import { INSTAGRAM_COMPOSER_TEXT } from '@/lib/instagram/reply';

function renderChat() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ChatWindow conversationId={CONVERSATION_ID} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

const campo = () => screen.getByPlaceholderText(INSTAGRAM_COMPOSER_TEXT.placeholder) as HTMLTextAreaElement;

beforeEach(() => {
  state.instances = [waInstance, igInstance()];
  state.window = { open: true, closesAt: new Date(Date.now() + 3_600_000), isLoading: false, isError: false };
  sendInstagramReply.mockClear();
  waAdapter.sendText.mockClear();
  igAdapter.sendText.mockClear();
});

describe('ChatWindow — conversa do Instagram', () => {
  it('só texto: sem anexo, sem áudio, sem template; o botão Enviar fica no lugar', () => {
    renderChat();
    expect(campo()).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Anexar arquivo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gravar áudio' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeInTheDocument();
    expect(screen.queryByText('Enviar template')).not.toBeInTheDocument();
    expect(screen.queryByTestId('send-template-dialog')).not.toBeInTheDocument();
  });

  it('não cita mensagem: duplo clique não abre "Respondendo"', () => {
    renderChat();
    fireEvent.doubleClick(screen.getByText('quero saber o preço'));
    expect(screen.queryByText('Respondendo:')).not.toBeInTheDocument();
  });

  it('envia por sendInstagramReply, com o IGSID e a instância do Instagram — nunca pelo WhatsApp', async () => {
    const user = userEvent.setup();
    renderChat();
    await user.click(campo());
    await user.keyboard('Custa R$ 100{Enter}');

    await waitFor(() => expect(sendInstagramReply).toHaveBeenCalledTimes(1));
    const arg = (sendInstagramReply.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(arg).toMatchObject({
      instanceId: IG_INSTANCE_ID,
      contactId: CONTACT_ID,
      recipientId: IGSID,
      text: 'Custa R$ 100',
      tenantId: TENANT_ID,
    });
    expect(arg.adapter).toBe(igAdapter);
    expect(waAdapter.sendText).not.toHaveBeenCalled();
    await waitFor(() => expect(campo()).toHaveValue(''));
  });

  it('janela fechada: aviso sem botão, campo e Enviar travados', async () => {
    state.window = { open: false, closesAt: new Date(Date.now() - 1000), isLoading: false, isError: false };
    renderChat();
    const aviso = screen.getByTestId('instagram-composer-blocked');
    expect(aviso).toHaveTextContent(INSTAGRAM_COMPOSER_TEXT.windowClosed);
    expect(aviso.querySelector('button')).toBeNull();
    expect(campo()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();
  });

  it('conexão vencida: aviso de reconectar e compositor travado', () => {
    state.instances = [waInstance, igInstance({ igAccountId: '1', tokenExpiresAt: '2020-01-01T00:00:00Z' })];
    renderChat();
    expect(screen.getByTestId('instagram-composer-blocked')).toHaveTextContent(INSTAGRAM_COMPOSER_TEXT.connectionExpired);
    expect(campo()).toBeDisabled();
  });

  it('limite de 1000 BYTES: 501 letras acentuadas já passam do limite; Enviar desliga', () => {
    renderChat();
    fireEvent.change(campo(), { target: { value: 'á'.repeat(501) } });
    const contador = screen.getByTestId('instagram-byte-counter');
    expect(contador).toHaveTextContent('1002 de 1000 bytes');
    expect(contador).toHaveAttribute('role', 'alert');
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();
  });

  it('perto do limite mostra o contador sem alarme', () => {
    renderChat();
    fireEvent.change(campo(), { target: { value: 'a'.repeat(900) } });
    const contador = screen.getByTestId('instagram-byte-counter');
    expect(contador).toHaveTextContent('900 de 1000 bytes');
    expect(contador).not.toHaveAttribute('role');
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeEnabled();
  });
});

describe('ChatWindow — Instagram NUNCA cai no WhatsApp da Conta', () => {
  it('instância de Instagram fora da lista (adapter não montou): trava, e o WhatsApp pronto não é usado', async () => {
    state.instances = [waInstance]; // só o WhatsApp, pronto para enviar
    const user = userEvent.setup();
    renderChat();

    expect(screen.getByTestId('instagram-composer-blocked')).toHaveTextContent(INSTAGRAM_COMPOSER_TEXT.noConnection);
    expect(campo()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();

    // Mesmo forçando o Enter, nada sai — nem pelo WhatsApp, nem pelo Instagram.
    await user.type(campo(), 'oi{Enter}');
    expect(waAdapter.sendText).not.toHaveBeenCalled();
    expect(sendInstagramReply).not.toHaveBeenCalled();
    // E nenhum aviso de template do WhatsApp aparece na conversa do Instagram.
    expect(screen.queryByText('Enviar template')).not.toBeInTheDocument();
  });

  it('sem nenhuma instância: trava do mesmo jeito', () => {
    state.instances = [];
    renderChat();
    expect(screen.getByTestId('instagram-composer-blocked')).toHaveTextContent(INSTAGRAM_COMPOSER_TEXT.noConnection);
  });
});
