/**
 * Marcador "Bot em atendimento" na linha da lista de Conversas.
 *
 * O que precisa continuar verdadeiro:
 *  - a linha cujo contato tem sessão ativa mostra o selo; as outras, nada;
 *  - o selo vem do mapa de sessões (query própria), não do select da lista —
 *    a lista continua sendo a mesma query de sempre.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';

const { rows, botSessions } = vi.hoisted(() => {
  const row = (id: string, contactId: string, name: string) => ({
    id,
    contact_id: contactId,
    last_message_at: '2026-09-14T10:00:00Z',
    unread_count: 0,
    is_archived: false,
    created_at: '2026-09-14T09:00:00Z',
    updated_at: '2026-09-14T10:00:00Z',
    tenant_id: 'loja-1',
    assigned_profile_id: null,
    last_message: { content: 'oi', direction: 'inbound', message_type: 'text', status: null },
    contacts: { id: contactId, name, phone: '5511999990000', contact_tags: [] },
  });
  return {
    rows: [row('conv-a', 'contact-a', 'Ana Com Bot'), row('conv-b', 'contact-b', 'Bruno Sem Bot')],
    botSessions: {
      'contact-a': [
        {
          id: 'sess-1',
          contact_id: 'contact-a',
          whatsapp_instance_id: 'inst-1',
          chatbot_id: 'bot-1',
          awaiting_input: true,
          last_activity_at: '2026-09-14T10:00:00Z',
        },
      ],
    },
  };
});

vi.mock('@/hooks/useConversations', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useConversations')>('@/hooks/useConversations');
  return {
    ...actual,
    useConversations: () => ({
      data: { pages: [{ data: rows, hasMore: false }], pageParams: [null] },
      isLoading: false,
      error: null,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    }),
  };
});
vi.mock('@/hooks/useChatbotSessions', () => ({
  useActiveBotSessions: () => ({ data: botSessions }),
}));
vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenant: { id: 'loja-1' }, profile: { id: 'eu' } }),
}));
vi.mock('@/hooks/useConversationRotation', () => ({
  useIneligibleOwners: () => ({ canManage: false, ownerIds: [] }),
}));
vi.mock('@/hooks/useTeamDirectory', () => ({
  useTeamMemberLookup: () => () => undefined,
}));
vi.mock('@/hooks/useSlaConfig', () => ({
  useSlaConfig: () => ({ enabled: false, thresholds: { atencao: 30, critica: 120 } }),
}));
vi.mock('@/hooks/useSlaMute', () => ({ useSlaMutedConversations: () => ({ data: {} }) }));
vi.mock('@/hooks/useRealtimeMessages', () => ({ useRealtimeConversations: () => {} }));
vi.mock('@/hooks/useChatHistorySync', () => ({
  useChatHistorySync: () => ({ isSyncing: false, syncAllChats: vi.fn() }),
}));
vi.mock('@/hooks/useWhatsAppApi', () => ({
  useWhatsAppInstancesWithAdapter: () => ({ instances: [] }),
}));
vi.mock('./InstanceSelector', () => ({ InstanceSelector: () => null }));
vi.mock('./NewConversationModal', () => ({ NewConversationModal: () => null }));
vi.mock('react-intersection-observer', () => ({ useInView: () => ({ ref: vi.fn(), inView: false }) }));

import { ConversationsList } from './ConversationsList';

describe('ConversationsList — marcador de bot', () => {
  it('marca só a conversa cujo contato tem sessão ativa', () => {
    render(
      <TooltipProvider>
        <ConversationsList searchQuery="" selectedId={null} onSelect={() => {}} />
      </TooltipProvider>,
    );

    const linhaA = screen.getByText('Ana Com Bot').closest('[data-conversation-id]') as HTMLElement;
    const linhaB = screen.getByText('Bruno Sem Bot').closest('[data-conversation-id]') as HTMLElement;

    expect(within(linhaA).getByTestId('bot-session-badge')).toHaveTextContent('Bot em atendimento');
    expect(within(linhaB).queryByTestId('bot-session-badge')).not.toBeInTheDocument();
  });
});
