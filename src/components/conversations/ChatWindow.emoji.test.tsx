/**
 * Emoji no compositor da tela de Conversas.
 *
 * O que precisa continuar verdadeiro:
 *  - o seletor (biblioteca + lista) só é baixado no PRIMEIRO clique no botão;
 *  - o emoji entra onde está o cursor (ou no lugar do trecho selecionado), não
 *    no fim da mensagem;
 *  - o seletor continua aberto para escolher vários seguidos, e eles ficam na
 *    ordem em que foram clicados;
 *  - clicar no campo para digitar entre um emoji e outro não fecha o seletor;
 *    o próprio botão e o Esc fecham.
 *
 * O painel de verdade (emoji-picker-element) é testado em EmojiPickerPanel.test.tsx.
 * Aqui ele é um falso com dois botões, para o teste olhar só o compositor.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';

const TENANT_ID = 'tenant-1';
const CONTACT_ID = 'contact-1';
const CONVERSATION_ID = 'conversa-1';

const panel = vi.hoisted(() => ({ moduleLoaded: false }));

vi.mock('./EmojiPickerPanel', () => {
  panel.moduleLoaded = true;
  return {
    default: ({ onEmojiSelect }: { onEmojiSelect: (emoji: string) => void }) => (
      <div data-testid="seletor-emoji">
        {['😊', '🤝🏽'].map((e) => (
          <button key={e} type="button" onClick={() => onEmojiSelect(e)}>
            {e}
          </button>
        ))}
      </div>
    ),
  };
});

const adapter = {
  isReadyToSend: () => true,
  sendText: vi.fn(async () => ({ status: 'sent', providerMessageId: 'wamid.1' })),
  setTyping: vi.fn(() => Promise.resolve()),
  getCapabilities: () => ({ fetchHistory: false }),
  getProfilePicture: vi.fn(() => Promise.resolve(null)),
};

const conversation = {
  id: CONVERSATION_ID,
  contact_id: CONTACT_ID,
  whatsapp_instance_id: 'inst-1',
  unread_count: 0,
  contacts: { id: CONTACT_ID, name: '🌸 Helena Duarte', phone: '5511999998888', contact_tags: [] },
};

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
  useSendMessage: () => ({ mutateAsync: vi.fn(async () => ({ id: 'msg-otimista' })), isPending: false }),
  useMarkMessagesAsRead: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useEndChatbotSession', () => ({
  useEndChatbotSession: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useRealtimeMessages', () => ({ useRealtimeMessages: () => {} }));
vi.mock('@/hooks/useChatHistorySync', () => ({
  useChatHistorySync: () => ({ syncConversation: vi.fn(async () => {}) }),
}));
vi.mock('@/hooks/useWhatsAppApi', () => ({
  useWhatsAppInstancesWithAdapter: () => ({ instances: [] }),
  pickActiveInstance: () => ({ row: { id: 'inst-1', name: 'Principal', provider: 'evolution' }, adapter }),
}));
vi.mock('@/hooks/useSupabaseQuery', () => ({ useSupabaseQuery: () => ({ data: [] }) }));
vi.mock('@/hooks/useSupabaseMutation', () => ({
  useSupabaseMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('react-intersection-observer', () => ({ useInView: () => ({ ref: vi.fn(), inView: false }) }));
vi.mock('@/integrations/supabase/client', () => {
  const chain = { update: () => chain, eq: () => Promise.resolve({ error: null }), from: () => chain };
  return { supabase: { from: () => chain } };
});

vi.mock('./ContactPanel', () => ({ ContactPanel: () => null }));
vi.mock('./ChatSearchBar', () => ({ ChatSearchBar: () => null }));
vi.mock('./SendTemplateDialog', () => ({ SendTemplateDialog: () => null }));
vi.mock('./SaveQuickReplyDialog', () => ({ SaveQuickReplyDialog: () => null }));
vi.mock('@/components/etiquetas/LeadTagsDialog', () => ({ LeadTagsDialog: () => null }));
vi.mock('./QuickRepliesPopover', () => ({ QuickRepliesPopover: () => null }));
vi.mock('./AudioRecorder', () => ({
  AudioRecorder: () => <button type="button" aria-label="Gravar áudio" />,
}));

import { ChatWindow } from './ChatWindow';

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

const campo = () => screen.getByPlaceholderText('Digite sua mensagem...') as HTMLTextAreaElement;
const botaoEmoji = () => screen.getByRole('button', { name: 'Adicionar emoji' });

async function abrirSeletor(user: ReturnType<typeof userEvent.setup>) {
  await user.click(botaoEmoji());
  await screen.findByTestId('seletor-emoji');
}

beforeEach(() => {
  adapter.sendText.mockClear();
});

describe('ChatWindow — emoji no compositor', () => {
  it('só baixa o seletor no primeiro clique no botão de emoji', async () => {
    const user = userEvent.setup();
    renderChat();
    expect(campo()).toBeInTheDocument();
    expect(panel.moduleLoaded).toBe(false);
    expect(screen.queryByTestId('seletor-emoji')).not.toBeInTheDocument();

    await abrirSeletor(user);
    expect(panel.moduleLoaded).toBe(true);
  });

  it('põe o emoji onde está o cursor, não no fim', async () => {
    const user = userEvent.setup();
    renderChat();
    const textarea = campo();
    await user.click(textarea);
    await user.keyboard('Obrigado pela visita');
    textarea.setSelectionRange(8, 8); // logo depois de "Obrigado"

    await abrirSeletor(user);
    await user.click(screen.getByRole('button', { name: '😊' }));

    expect(textarea.value).toBe('Obrigado😊 pela visita');
    expect(textarea.selectionStart).toBe(10);
  });

  it('vários emojis seguidos: o seletor fica aberto e eles entram na ordem, no mesmo lugar', async () => {
    const user = userEvent.setup();
    renderChat();
    const textarea = campo();
    await user.click(textarea);
    await user.keyboard('Fechado pessoal');
    textarea.setSelectionRange(7, 7); // depois de "Fechado"

    await abrirSeletor(user);
    await user.click(screen.getByRole('button', { name: '🤝🏽' }));
    await user.click(screen.getByRole('button', { name: '😊' }));
    await user.click(screen.getByRole('button', { name: '😊' }));

    expect(screen.getByTestId('seletor-emoji')).toBeInTheDocument();
    expect(textarea.value).toBe('Fechado🤝🏽😊😊 pessoal');
    expect(textarea.selectionStart).toBe('Fechado🤝🏽😊😊'.length);
  });

  it('com um trecho selecionado, o emoji entra no lugar dele', async () => {
    const user = userEvent.setup();
    renderChat();
    const textarea = campo();
    await user.click(textarea);
    await user.keyboard('Combinado então');
    textarea.setSelectionRange(10, 15); // "então"

    await abrirSeletor(user);
    await user.click(screen.getByRole('button', { name: '🤝🏽' }));
    expect(textarea.value).toBe('Combinado 🤝🏽');
  });

  it('campo vazio e nunca clicado: o emoji entra e dá para enviar', async () => {
    const user = userEvent.setup();
    renderChat();
    await abrirSeletor(user);
    await user.click(screen.getByRole('button', { name: '😊' }));
    expect(campo().value).toBe('😊');

    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(adapter.sendText).toHaveBeenCalledTimes(1));
    expect(JSON.stringify(adapter.sendText.mock.calls[0])).toContain('😊');
  });

  it('clicar no campo para digitar entre um emoji e outro não fecha o seletor', async () => {
    const user = userEvent.setup();
    renderChat();
    await abrirSeletor(user);
    await user.click(screen.getByRole('button', { name: '😊' }));

    await user.click(campo());
    await user.keyboard(' tudo certo');
    expect(screen.getByTestId('seletor-emoji')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '🤝🏽' }));
    expect(campo().value).toBe('😊 tudo certo🤝🏽');
  });

  it('o mesmo botão fecha o seletor e devolve o cursor ao campo', async () => {
    const user = userEvent.setup();
    renderChat();
    await abrirSeletor(user);
    expect(botaoEmoji()).toHaveAttribute('aria-expanded', 'true');

    await user.click(botaoEmoji());
    expect(screen.queryByTestId('seletor-emoji')).not.toBeInTheDocument();
    expect(botaoEmoji()).toHaveAttribute('aria-expanded', 'false');
    expect(campo()).toHaveFocus();
  });

  it('Esc fecha o seletor', async () => {
    const user = userEvent.setup();
    renderChat();
    await abrirSeletor(user);
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('seletor-emoji')).not.toBeInTheDocument();
  });

  it('clicar fora do compositor fecha o seletor', async () => {
    const user = userEvent.setup();
    renderChat();
    await abrirSeletor(user);
    await user.click(document.body);
    expect(screen.queryByTestId('seletor-emoji')).not.toBeInTheDocument();
  });

  // O ChatWindow tem retornos antecipados ("nenhuma conversa selecionada",
  // erro). Hook do emoji declarado depois deles quebraria a tela ao abrir uma
  // conversa ("Rendered more hooks than during the previous render").
  it('nenhuma conversa → abrir uma não quebra a tela, e o emoji funciona', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    // A tela vazia tem link para o tutorial: precisa de um Router em volta.
    const arvore = (conversationId?: string) => (
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <ChatWindow conversationId={conversationId} />
          </TooltipProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );
    const { rerender } = render(arvore(undefined));
    expect(screen.getByText('Nenhuma conversa selecionada')).toBeInTheDocument();

    rerender(arvore(CONVERSATION_ID));
    await abrirSeletor(user);
    await user.click(screen.getByRole('button', { name: '😊' }));
    expect(campo().value).toBe('😊');
  });

  it('avatar do contato cujo nome começa com emoji mostra as letras, não meio emoji', () => {
    renderChat();
    expect(screen.getByText('HD')).toBeInTheDocument();
  });
});
