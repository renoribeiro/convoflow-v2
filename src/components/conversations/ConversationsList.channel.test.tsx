/**
 * A lista em cada lado da chave WhatsApp / Instagram.
 *
 *  - o canal chega ao hook da lista;
 *  - o seletor mostra só as instâncias do canal aberto, com o "todas" do canal;
 *  - "Sincronizar" e "Nova Conversa" são do WhatsApp e somem no Instagram;
 *  - quem não tem nome aparece como "Cliente do Instagram" no Instagram e como
 *    "Contato sem nome" no WhatsApp (a tela de antes);
 *  - a lista avisa o pai se a Loja tem Instagram.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';

const spies = vi.hoisted(() => ({
  useConversations: vi.fn(),
  selector: vi.fn(),
  rows: [] as unknown[],
}));

vi.mock('@/hooks/useConversations', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useConversations')>('@/hooks/useConversations');
  return {
    ...actual,
    useConversations: (opts: unknown) => {
      spies.useConversations(opts);
      return {
        data: { pages: [{ data: spies.rows, hasMore: false }], pageParams: [null] },
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
  useWhatsAppInstancesWithAdapter: () => ({
    instances: [
      { row: { id: 'wa-1', name: 'Plantão', provider: 'official' }, providerLabel: 'Oficial' },
      { row: { id: 'wa-2', name: 'Comercial', provider: 'evolution' }, providerLabel: 'Evolution' },
      { row: { id: 'ig-1', name: 'Instagram Loja', provider: 'instagram' }, providerLabel: 'Instagram' },
    ],
  }),
}));
vi.mock('./InstanceSelector', () => ({
  ALL_INSTANCES_VALUE: '__all__',
  InstanceSelector: (props: Record<string, unknown>) => {
    spies.selector(props);
    return null;
  },
}));
vi.mock('./NewConversationModal', () => ({ NewConversationModal: () => <div data-testid="nova-conversa" /> }));
vi.mock('react-intersection-observer', () => ({ useInView: () => ({ ref: vi.fn(), inView: false }) }));

import { ConversationsList } from './ConversationsList';

const linha = (id: string, channel: string, name: string | null) => ({
  id,
  contact_id: `c-${id}`,
  channel,
  last_message_at: '2026-09-25T12:00:00Z',
  unread_count: 0,
  is_archived: false,
  tenant_id: 'loja-1',
  assigned_profile_id: null,
  last_message: { content: 'oi', direction: 'inbound', message_type: 'text', status: null },
  contacts: { id: `c-${id}`, name, phone: channel === 'whatsapp' ? '5511999990001' : null, channel, contact_tags: [] },
});

const renderList = (props: Record<string, unknown>) =>
  render(
    <TooltipProvider>
      <ConversationsList searchQuery="" selectedId={null} onSelect={() => {}} {...props} />
    </TooltipProvider>,
  );

const SYNC = 'Sincronizar conversas recentes (Evolution/WAHA)';

beforeEach(() => {
  spies.useConversations.mockClear();
  spies.selector.mockClear();
  spies.rows = [];
});

describe('ConversationsList — lado do Instagram', () => {
  it('o canal chega ao hook; seletor só com a conta do Instagram; sem sincronizar nem nova conversa', () => {
    spies.rows = [linha('1', 'instagram', null)];
    renderList({ channel: 'instagram' });
    expect(spies.useConversations.mock.calls.at(-1)?.[0]).toMatchObject({ channel: 'instagram' });
    const sel = spies.selector.mock.calls.at(-1)?.[0] as { instances: Array<{ row: { id: string } }>; allLabel: string };
    expect(sel.instances.map((i) => i.row.id)).toEqual(['ig-1']);
    expect(sel.allLabel).toBe('Todas as contas do Instagram');
    expect(screen.queryByLabelText(SYNC)).toBeNull();
    expect(screen.queryByTestId('nova-conversa')).toBeNull();
  });

  it('cliente sem nome aparece como "Cliente do Instagram", iniciais CI', () => {
    spies.rows = [linha('1', 'instagram', null)];
    renderList({ channel: 'instagram' });
    expect(screen.getByText('Cliente do Instagram')).toBeInTheDocument();
    expect(screen.getByText('CI')).toBeInTheDocument();
    expect(screen.queryByText('Contato sem nome')).toBeNull();
  });
});

describe('ConversationsList — lado do WhatsApp (a tela de antes)', () => {
  it('seletor só com as instâncias do WhatsApp; sincronizar e nova conversa continuam', () => {
    spies.rows = [linha('1', 'whatsapp', null)];
    renderList({ channel: 'whatsapp' });
    expect(spies.useConversations.mock.calls.at(-1)?.[0]).toMatchObject({ channel: 'whatsapp' });
    const sel = spies.selector.mock.calls.at(-1)?.[0] as { instances: Array<{ row: { id: string } }>; allLabel: string };
    expect(sel.instances.map((i) => i.row.id)).toEqual(['wa-1', 'wa-2']);
    expect(sel.allLabel).toBe('Todas as instâncias');
    expect(screen.getByLabelText(SYNC)).toBeInTheDocument();
    expect(screen.getByTestId('nova-conversa')).toBeInTheDocument();
  });

  it('sem nome continua "Contato sem nome", iniciais CS', () => {
    spies.rows = [linha('1', 'whatsapp', null)];
    renderList({ channel: 'whatsapp' });
    expect(screen.getByText('Contato sem nome')).toBeInTheDocument();
    expect(screen.getByText('CS')).toBeInTheDocument();
  });
});

describe('ConversationsList — avisa se há Instagram', () => {
  it('chama onChannelsChange com hasInstagram', () => {
    const onChannelsChange = vi.fn();
    renderList({ channel: 'whatsapp', onChannelsChange });
    expect(onChannelsChange).toHaveBeenCalledWith({ hasInstagram: true });
  });
});
