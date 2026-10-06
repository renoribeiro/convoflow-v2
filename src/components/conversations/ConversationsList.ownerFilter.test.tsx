/**
 * ConversationsList com o recorte por responsável.
 *
 * O que precisa continuar verdadeiro:
 *  - `assignedProfileIds` / `unassignedOnly` chegam ao hook da lista (é ele
 *    que os vira filtro de servidor — a paridade com a contagem está em
 *    useConversations.scope.test);
 *  - as contagens publicadas para o pai respeitam o universo recortado:
 *    na pílula "Sem responsável" (servidor) só essa chave sai daqui.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
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
      contacts: { id: 'contact-a', name: 'Ana', phone: '5511999990000', contact_tags: [] },
    },
    {
      id: 'conv-b',
      contact_id: 'contact-b',
      last_message_at: '2026-09-20T09:00:00Z',
      unread_count: 2,
      is_archived: false,
      created_at: '2026-09-20T08:00:00Z',
      updated_at: '2026-09-20T09:00:00Z',
      tenant_id: 'loja-1',
      assigned_profile_id: null,
      last_message: { content: 'olá', direction: 'inbound', message_type: 'text', status: null },
      contacts: { id: 'contact-b', name: 'Bia', phone: '5511999990001', contact_tags: [] },
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

const renderList = (props: Partial<React.ComponentProps<typeof ConversationsList>>) =>
  render(
    <TooltipProvider>
      <ConversationsList searchQuery="" selectedId={null} onSelect={() => {}} {...props} />
    </TooltipProvider>,
  );

describe('ConversationsList — recorte por responsável', () => {
  it('assignedProfileIds da tela chega ao hook da lista (filtro por atendente / "Minhas")', () => {
    useConversationsSpy.mockClear();
    renderList({ assignedProfileIds: ['p-maria', 'p-joao'] });
    expect(useConversationsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ assignedProfileIds: ['p-maria', 'p-joao'], unassignedOnly: false }),
    );
  });

  it('unassignedOnly da tela chega ao hook da lista ("Sem responsável")', () => {
    useConversationsSpy.mockClear();
    renderList({ unassignedOnly: true, quickFilter: 'sem-responsavel' });
    expect(useConversationsSpy).toHaveBeenCalledWith(expect.objectContaining({ unassignedOnly: true }));
  });

  it('na pílula "Sem responsável" só a contagem dela sai do conjunto carregado — e exata, porque a última página chegou', async () => {
    const onCountsChange = vi.fn();
    renderList({ unassignedOnly: true, quickFilter: 'sem-responsavel', onCountsChange });
    await waitFor(() => expect(onCountsChange).toHaveBeenCalled());
    expect(onCountsChange).toHaveBeenLastCalledWith({ 'sem-responsavel': { value: 2, exact: true } });
  });

  it('com filtro por atendente, "Minhas" e "Sem responsável" NÃO saem do conjunto carregado (o servidor responde por elas)', async () => {
    const onCountsChange = vi.fn();
    renderList({ assignedProfileIds: ['p-maria'], onCountsChange });
    await waitFor(() => expect(onCountsChange).toHaveBeenCalled());
    const counts = onCountsChange.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect('minhas' in counts).toBe(false);
    expect('sem-responsavel' in counts).toBe(false);
    expect(counts.todas).toEqual({ value: 2, exact: true });
    expect(counts['nao-lidas']).toEqual({ value: 1, exact: true });
  });
});
