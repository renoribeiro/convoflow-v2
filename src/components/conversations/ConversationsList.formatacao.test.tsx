/**
 * A lista de conversas mostra o texto limpo: *Consulta* vira Consulta. No
 * Instagram não existe formatação, então os sinais ficam como vieram.
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
vi.mock('@/hooks/useLojaTemEtapas', () => ({ useLojaTemEtapas: () => true }));
vi.mock('@/hooks/useTeamDirectory', () => ({ useTeamMemberLookup: () => () => undefined }));
vi.mock('@/hooks/useSlaConfig', () => ({
  useSlaConfig: () => ({ enabled: false, thresholds: { atencao: 30, critica: 120 } }),
}));
vi.mock('@/hooks/useSlaMute', () => ({ useSlaMutedConversations: () => ({ data: {} }) }));
vi.mock('@/hooks/useRealtimeMessages', () => ({ useRealtimeConversations: () => {} }));
vi.mock('@/hooks/useWhatsAppApi', () => {
  const lista = () => ({
    instances: [
      { row: { id: 'wa-1', name: 'Plantão', provider: 'official' }, providerLabel: 'Oficial' },
      { row: { id: 'wa-2', name: 'Comercial', provider: 'evolution' }, providerLabel: 'Evolution' },
      { row: { id: 'ig-1', name: 'Instagram Loja', provider: 'instagram' }, providerLabel: 'Instagram' },
    ],
  });
  return { useWhatsAppInstancesWithAdapter: lista, useWhatsAppInstancesSafe: lista };
});
vi.mock('./InstanceSelector', () => ({
  ALL_INSTANCES_VALUE: '__all__',
  InstanceSelector: (props: Record<string, unknown>) => {
    spies.selector(props);
    return null;
  },
}));
vi.mock('./NewConversationModal', () => ({ NewConversationModal: () => <div data-testid="nova-conversa" /> }));
// O vazio (decisão D8) tem teste próprio: VazioDeConversas.test.tsx.
vi.mock('./VazioDeConversas', () => ({ VazioDeConversas: () => <div data-testid="vazio" /> }));
vi.mock('react-intersection-observer', () => ({ useInView: () => ({ ref: vi.fn(), inView: false }) }));

import { ConversationsList } from './ConversationsList';

const linha = (id: string, channel: string, name: string | null, content = 'oi') => ({
  id,
  contact_id: `c-${id}`,
  channel,
  last_message_at: '2026-09-25T12:00:00Z',
  unread_count: 0,
  is_archived: false,
  tenant_id: 'loja-1',
  assigned_profile_id: null,
  last_message: { content, direction: 'inbound', message_type: 'text', status: null },
  contacts: { id: `c-${id}`, name, phone: channel === 'whatsapp' ? '5511999990001' : null, channel, contact_tags: [] },
});

const renderList = (props: Record<string, unknown>) =>
  render(
    <TooltipProvider>
      <ConversationsList searchQuery="" selectedId={null} onSelect={() => {}} {...props} />
    </TooltipProvider>,
  );

beforeEach(() => {
  spies.rows = [];
});

describe('ConversationsList: prévia sem os sinais de formatação', () => {
  it('WhatsApp: negrito e itálico saem limpos', () => {
    spies.rows = [linha('1', 'whatsapp', 'Ana Exemplo', 'Sua *Consulta* está marcada para _amanhã_')];
    renderList({ channel: 'whatsapp' });
    expect(screen.getByText('Sua Consulta está marcada para amanhã')).toBeInTheDocument();
    expect(screen.queryByText(/\*Consulta\*/)).toBeNull();
  });

  it('WhatsApp: asterisco que não é formatação continua', () => {
    spies.rows = [linha('1', 'whatsapp', 'Ana Exemplo', 'nota 5* do atendimento')];
    renderList({ channel: 'whatsapp' });
    expect(screen.getByText('nota 5* do atendimento')).toBeInTheDocument();
  });

  it('Instagram: os sinais ficam', () => {
    spies.rows = [linha('1', 'instagram', 'Ana Exemplo', '*oi*')];
    renderList({ channel: 'instagram' });
    expect(screen.getByText('*oi*')).toBeInTheDocument();
  });
});
