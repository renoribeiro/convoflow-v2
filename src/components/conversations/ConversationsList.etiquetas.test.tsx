/**
 * A linha da conversa: etiquetas em linha própria e o selo "Contato novo".
 *
 * "Contato novo" quer dizer "sem etapa no funil". Numa Loja sem etapas isso vale
 * para todo contato e para sempre, então ali ele não aparece (decisão do dono,
 * 2026-11-05). Na Loja com etapas ele segue como antes.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';

const { rows, loja } = vi.hoisted(() => {
  const linha = (id: string, name: string, extra: Record<string, unknown>) => ({
    id: `conv-${id}`,
    contact_id: `contact-${id}`,
    last_message_at: '2026-11-05T10:00:00Z',
    unread_count: 0,
    is_archived: false,
    created_at: '2026-11-05T09:00:00Z',
    updated_at: '2026-11-05T10:00:00Z',
    tenant_id: 'loja-1',
    assigned_profile_id: null,
    last_message: { content: 'oi', direction: 'inbound', message_type: 'text', status: null },
    contacts: { id: `contact-${id}`, name, phone: '5511999990000', contact_tags: [], ...extra },
  });
  return {
    loja: { temEtapas: true },
    rows: [
      linha('a', 'Ana Com Etiqueta', {
        contact_tags: [{ tag_id: 't1', tags: { id: 't1', name: 'Agendado', color: '#22c55e' } }],
      }),
      linha('b', 'Bia Sem Etiqueta', {}),
      linha('c', 'Caio Com Etapa', { stage: { name: 'Proposta' } }),
    ],
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
vi.mock('@/hooks/useLojaTemEtapas', () => ({ useLojaTemEtapas: () => loja.temEtapas }));
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
vi.mock('@/hooks/useWhatsAppApi', () => ({
  useWhatsAppInstancesWithAdapter: () => ({ instances: [] }),
  useWhatsAppInstancesSafe: () => ({ instances: [] }),
}));
vi.mock('./InstanceSelector', () => ({ InstanceSelector: () => null }));
vi.mock('./NewConversationModal', () => ({ NewConversationModal: () => null }));
vi.mock('react-intersection-observer', () => ({ useInView: () => ({ ref: vi.fn(), inView: false }) }));

import { ConversationsList } from './ConversationsList';

function montar() {
  render(
    <TooltipProvider>
      <ConversationsList searchQuery="" selectedId={null} onSelect={() => {}} />
    </TooltipProvider>,
  );
}
const linhaDe = (nome: string) => screen.getByText(nome).closest('[data-conversation-id]') as HTMLElement;

beforeEach(() => {
  loja.temEtapas = true;
});

describe('ConversationsList: etiquetas', () => {
  it('quem tem etiqueta ganha a linha de etiquetas, fora da linha de selos', () => {
    montar();
    const linha = linhaDe('Ana Com Etiqueta');
    const etiquetas = linha.querySelector('[data-linha-de-etiquetas]') as HTMLElement;
    expect(within(etiquetas).getByText('Agendado')).toBeInTheDocument();
    expect(Array.from(linha.querySelectorAll('[data-selo]')).some((s) => s.textContent?.includes('Agendado'))).toBe(false);
  });

  it('quem não tem etiqueta não ganha linha nenhuma', () => {
    montar();
    expect(linhaDe('Bia Sem Etiqueta').querySelector('[data-linha-de-etiquetas]')).toBeNull();
  });
});

describe('ConversationsList: selo "Contato novo"', () => {
  it('Loja com etapas: aparece em quem está sem etapa, como antes', () => {
    montar();
    expect(within(linhaDe('Bia Sem Etiqueta')).getByText('Contato novo')).toBeInTheDocument();
    expect(within(linhaDe('Ana Com Etiqueta')).getByText('Contato novo')).toBeInTheDocument();
  });

  it('Loja com etapas: quem já tem etapa mostra a etapa, sem o selo', () => {
    montar();
    const linha = linhaDe('Caio Com Etapa');
    expect(within(linha).getByText('Proposta')).toBeInTheDocument();
    expect(within(linha).queryByText('Contato novo')).not.toBeInTheDocument();
  });

  it('Loja sem etapas: não aparece em ninguém', () => {
    loja.temEtapas = false;
    montar();
    expect(screen.queryByText('Contato novo')).not.toBeInTheDocument();
    expect(screen.getByText('Agendado')).toBeInTheDocument();
  });
});
