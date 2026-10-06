/**
 * Estado vazio da janela de chat (nenhuma conversa selecionada): o único ponto
 * de entrada, fora da página de Ajuda, do tutorial "Atender conversas no dia
 * a dia". O cartão do Dashboard só aparece enquanto a Loja não tem instância,
 * então uma Loja em operação nunca o vê — este link é o que sobra.
 *
 * Mocks copiados de ChatWindow.focus.test.tsx: o ChatWindow decide o estado
 * vazio antes de qualquer hook de dados, mas os hooks são chamados mesmo assim
 * (regra dos hooks), então precisam existir.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';

const adapter = {
  isReadyToSend: () => true,
  sendText: vi.fn(),
  setTyping: vi.fn(() => Promise.resolve()),
  getCapabilities: () => ({ fetchHistory: false }),
  getProfilePicture: vi.fn(() => Promise.resolve(null)),
};

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenant: { id: 'tenant-1', name: 'Loja Teste' } }),
}));
vi.mock('@/hooks/useConversations', () => ({
  useConversation: () => ({ data: null, isLoading: false, error: null }),
  useMarkConversationAsRead: () => ({ mutate: vi.fn(), isPending: false }),
  useArchiveConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useMessages', () => ({
  useMessages: () => ({ isLoading: false, error: null, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn() }),
  getAllMessages: () => [],
  useSendMessage: () => ({ mutateAsync: vi.fn(), isPending: false }),
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
vi.mock('./AudioRecorder', () => ({ AudioRecorder: () => null }));

import { ChatWindow } from './ChatWindow';
import { getTutorialByKey } from '@/lib/help/tutorials';

function renderEmpty() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ChatWindow conversationId={null} />
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('ChatWindow — estado vazio', () => {
  it('mostra o estado vazio de sempre', () => {
    renderEmpty();
    expect(screen.getByText('Nenhuma conversa selecionada')).toBeTruthy();
  });

  it('tem UM link para o tutorial do dia a dia, e a chave dele resolve para o tutorial', () => {
    renderEmpty();
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    const href = links[0]!.getAttribute('href') ?? '';
    expect(href).toBe('/dashboard/help#tutorial:atender-conversas');
    // A mesma resolução que a página de Ajuda faz com o hash.
    expect(getTutorialByKey(href.split('#')[1])?.id).toBe('atender-conversas');
    expect(links[0]!.textContent).toContain('dia a dia');
  });
});
