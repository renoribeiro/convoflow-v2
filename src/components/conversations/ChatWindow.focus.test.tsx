/**
 * Foco do compositor da tela de Conversas.
 *
 * O que precisa continuar verdadeiro:
 *  - depois de enviar, o cursor volta (ou continua) no campo de mensagem, para
 *    o usuário emendar a próxima sem pegar o mouse;
 *  - vale pelos DOIS caminhos: tecla Enter e clique no botão Enviar;
 *  - o campo esvazia o texto, mas não perde o foco;
 *  - Shift+Enter continua quebrando linha em vez de enviar;
 *  - o envio segue barrado enquanto há outro em voo.
 *
 * A causa do bug era `disabled={isSending}` no <Textarea>: elemento desabilitado
 * é desfocado pelo navegador e não recupera o foco ao ser reabilitado.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';

const TENANT_ID = 'tenant-1';
const CONTACT_ID = 'contact-1';
const CONVERSATION_ID = 'conversa-1';

/** Resolve só quando o teste mandar — é a janela em que `isSending` está true. */
let liberarEnvio: (() => void) | null = null;
const sendText = vi.fn(
  () =>
    new Promise((resolve) => {
      liberarEnvio = () => resolve({ status: 'sent', providerMessageId: 'wamid.1' });
    }),
);

const adapter = {
  isReadyToSend: () => true,
  sendText,
  setTyping: vi.fn(() => Promise.resolve()),
  getCapabilities: () => ({ fetchHistory: false }),
  getProfilePicture: vi.fn(() => Promise.resolve(null)),
};

const conversation = {
  id: CONVERSATION_ID,
  contact_id: CONTACT_ID,
  whatsapp_instance_id: 'inst-1',
  unread_count: 0,
  contacts: { id: CONTACT_ID, name: 'Helena Duarte', phone: '5511999998888', contact_tags: [] },
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

// Filhos pesados que não têm nada a ver com o foco do compositor.
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
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ChatWindow conversationId={CONVERSATION_ID} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

const campo = () => screen.getByPlaceholderText('Digite sua mensagem...') as HTMLTextAreaElement;

/**
 * O jsdom NÃO implementa uma coisa que todo navegador faz: desabilitar o
 * elemento focado tira o foco dele. Sem simular isso aqui, um teste de foco
 * passaria verde com o bug de pé na tela do usuário. Este observer reproduz o
 * comportamento do navegador — é o que faz o caminho do Enter falhar de verdade
 * contra o código antigo (`disabled={isSending}` no <Textarea>).
 */
function simularBlurAoDesabilitar(): MutationObserver {
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      const el = r.target as HTMLElement;
      if (!el.hasAttribute('disabled') || document.activeElement !== el) continue;
      // O jsdom recusa `blur()` num elemento desabilitado (não é focável), então
      // reabilitamos por um instante só para conseguir soltar o foco — e devolvemos
      // o atributo em seguida, deixando o DOM como o React o escreveu.
      el.removeAttribute('disabled');
      el.blur();
      el.setAttribute('disabled', '');
    }
  });
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['disabled'],
    subtree: true,
  });
  return observer;
}

let observer: MutationObserver;

beforeEach(() => {
  liberarEnvio = null;
  sendText.mockClear();
  observer = simularBlurAoDesabilitar();
});

afterEach(() => observer.disconnect());

describe('ChatWindow — foco do compositor após o envio', () => {
  it('mantém o foco no campo ao enviar com Enter', async () => {
    const user = userEvent.setup();
    renderChat();

    const textarea = campo();
    await user.click(textarea);
    await user.keyboard('primeira mensagem');
    expect(textarea).toHaveFocus();

    await user.keyboard('{Enter}');

    // Envio em voo: o campo não pode ter perdido o foco para o body.
    await waitFor(() => expect(sendText).toHaveBeenCalledTimes(1));
    expect(textarea).toHaveFocus();

    liberarEnvio?.();

    await waitFor(() => expect(textarea).toHaveValue(''));
    expect(textarea).toHaveFocus();
  });

  it('devolve o foco ao campo ao enviar pelo botão Enviar', async () => {
    const user = userEvent.setup();
    renderChat();

    const textarea = campo();
    await user.click(textarea);
    await user.keyboard('mensagem pelo botão');

    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    await waitFor(() => expect(sendText).toHaveBeenCalledTimes(1));
    liberarEnvio?.();

    await waitFor(() => expect(textarea).toHaveValue(''));
    await waitFor(() => expect(textarea).toHaveFocus());
  });

  it('bloqueia um segundo envio enquanto o primeiro está em voo, sem desfocar o campo', async () => {
    const user = userEvent.setup();
    renderChat();

    const textarea = campo();
    await user.click(textarea);
    await user.keyboard('mensagem única');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(sendText).toHaveBeenCalledTimes(1));

    await user.keyboard('{Enter}');
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(textarea).toHaveFocus();

    liberarEnvio?.();
    await waitFor(() => expect(textarea).toHaveValue(''));
  });

  it('no celular, o botão Enviar não puxa o foco de volta (não abre o teclado sozinho)', async () => {
    // Ponteiro grosso = dedo. `matchMedia` é stub global no setup dos testes.
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      ...original(query),
      matches: query.includes('pointer: coarse'),
    })) as typeof window.matchMedia;

    try {
      const user = userEvent.setup();
      renderChat();

      const textarea = campo();
      await user.click(textarea);
      await user.keyboard('mensagem no celular');

      await user.click(screen.getByRole('button', { name: 'Enviar' }));
      await waitFor(() => expect(sendText).toHaveBeenCalledTimes(1));
      liberarEnvio?.();

      await waitFor(() => expect(textarea).toHaveValue(''));
      // O toque no botão levou o foco embora; não devolvemos à força.
      expect(textarea).not.toHaveFocus();
    } finally {
      window.matchMedia = original;
    }
  });

  it('pelo Enter no celular o campo nunca chega a perder o foco', async () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      ...original(query),
      matches: query.includes('pointer: coarse'),
    })) as typeof window.matchMedia;

    try {
      const user = userEvent.setup();
      renderChat();

      const textarea = campo();
      await user.click(textarea);
      await user.keyboard('mensagem{Enter}');

      await waitFor(() => expect(sendText).toHaveBeenCalledTimes(1));
      liberarEnvio?.();

      await waitFor(() => expect(textarea).toHaveValue(''));
      // Não é foco forçado: o campo simplesmente nunca foi desabilitado.
      expect(textarea).toHaveFocus();
    } finally {
      window.matchMedia = original;
    }
  });

  it('Shift+Enter quebra a linha em vez de enviar', async () => {
    const user = userEvent.setup();
    renderChat();

    const textarea = campo();
    await user.click(textarea);
    await user.keyboard('linha um{Shift>}{Enter}{/Shift}linha dois');

    expect(sendText).not.toHaveBeenCalled();
    expect(textarea.value).toBe('linha um\nlinha dois');
    expect(textarea).toHaveFocus();
  });
});
