/**
 * Cartão da conversa com o filtro de etiqueta ligado.
 *
 * O filtro entra na query como um SEGUNDO embed de `contact_tags` (alias
 * `etiquetas_filtro`, com `!inner`), que o PostgREST devolve recortado — só as
 * etiquetas que casaram. O cartão precisa continuar lendo o embed de exibição
 * (`contact_tags`, inteiro) e mostrar TODAS as etiquetas do contato, e não só
 * a filtrada. E o `tagIds` da tela tem de chegar ao hook da lista.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';

const { rows, useConversationsSpy } = vi.hoisted(() => ({
  useConversationsSpy: vi.fn(),
  rows: [
    {
      id: 'conv-a',
      contact_id: 'contact-a',
      last_message_at: '2026-09-20T10:00:00Z',
      unread_count: 0,
      is_archived: false,
      created_at: '2026-09-20T09:00:00Z',
      updated_at: '2026-09-20T10:00:00Z',
      tenant_id: 'loja-1',
      assigned_profile_id: null,
      last_message: { content: 'oi', direction: 'inbound', message_type: 'text', status: null },
      contacts: {
        id: 'contact-a',
        name: 'Ana Duas Etiquetas',
        phone: '5511999990000',
        // O que o PostgREST devolve com o filtro por "Quente" ligado: o alias
        // vem só com a que casou; o embed de exibição vem inteiro.
        etiquetas_filtro: [{ tag_id: 'tag-quente' }],
        contact_tags: [
          { tag_id: 'tag-quente', tags: { id: 'tag-quente', name: 'Quente', color: '#ef4444' } },
          { tag_id: 'tag-vip', tags: { id: 'tag-vip', name: 'VIP', color: '#a855f7' } },
        ],
      },
    },
  ],
}));

vi.mock('@/hooks/useConversations', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useConversations')>('@/hooks/useConversations');
  return {
    ...actual,
    useConversations: (opts: unknown) => {
      useConversationsSpy(opts);
      return {
        data: { pages: [{ data: rows, hasMore: false }], pageParams: [null] },
        isLoading: false,
        error: null,
        hasNextPage: false,
        isFetchingNextPage: false,
        fetchNextPage: vi.fn(),
        refetch: vi.fn(),
      };
    },
  };
});
vi.mock('@/hooks/useChatbotSessions', () => ({ useActiveBotSessions: () => ({ data: {} }) }));
vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenant: { id: 'loja-1' }, profile: { id: 'eu' } }),
}));
vi.mock('@/hooks/useConversationRotation', () => ({
  useIneligibleOwners: () => ({ canManage: false, ownerIds: [] }),
}));
vi.mock('@/hooks/useTeamDirectory', () => ({ useTeamMemberLookup: () => () => undefined }));
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

describe('ConversationsList — filtro por etiqueta', () => {
  it('o cartão mostra TODAS as etiquetas do contato, não só a filtrada', () => {
    render(
      <TooltipProvider>
        <ConversationsList searchQuery="" selectedId={null} onSelect={() => {}} tagIds={['tag-quente']} />
      </TooltipProvider>,
    );

    const linha = screen.getByText('Ana Duas Etiquetas').closest('[data-conversation-id]') as HTMLElement;
    expect(within(linha).getByText('Quente')).toBeInTheDocument();
    expect(within(linha).getByText('VIP')).toBeInTheDocument();
  });

  it('o tagIds da tela chega ao hook da lista (é ele que vira filtro de servidor)', () => {
    useConversationsSpy.mockClear();
    render(
      <TooltipProvider>
        <ConversationsList searchQuery="" selectedId={null} onSelect={() => {}} tagIds={['tag-quente']} />
      </TooltipProvider>,
    );
    expect(useConversationsSpy).toHaveBeenCalledWith(expect.objectContaining({ tagIds: ['tag-quente'] }));
  });
});
