/**
 * A chave WhatsApp / Instagram COMO LIGADA na tela de Conversas:
 *
 *  - sem conta de Instagram na Loja a chave não aparece e tudo é WhatsApp (a
 *    lista, as cinco contagens, o subtítulo de sempre);
 *  - com Instagram, o canal chega na lista E em cada contagem das pílulas;
 *  - o selo do outro canal é uma contagem própria: canal oposto, não
 *    arquivadas, "aguardando resposta" — e o número dele aparece na chave;
 *  - trocar de canal limpa a instância escolhida;
 *  - abrir uma conversa do outro canal (link direto) vira a chave.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';

const spies = vi.hoisted(() => ({
  list: vi.fn(),
  count: vi.fn(),
  hasInstagram: false,
  awaitingCount: undefined as number | undefined,
  chatDetect: null as null | ((c: 'whatsapp' | 'instagram') => void),
}));

vi.mock('@/components/conversations/ConversationsList', async () => {
  const { useEffect } = await vi.importActual<typeof import('react')>('react');
  return {
    ConversationsList: (props: Record<string, unknown>) => {
      spies.list(props);
      const onChannelsChange = props.onChannelsChange as ((i: { hasInstagram: boolean }) => void) | undefined;
      useEffect(() => {
        onChannelsChange?.({ hasInstagram: spies.hasInstagram });
      }, [onChannelsChange]);
      return <div data-testid="lista" />;
    },
  };
});
vi.mock('@/components/conversations/ChatWindow', () => ({
  ChatWindow: (props: { onChannelDetected?: (c: 'whatsapp' | 'instagram') => void }) => {
    spies.chatDetect = props.onChannelDetected ?? null;
    return null;
  },
}));
vi.mock('@/components/conversations/ConversationFiltersModal', async () => {
  const actual = await vi.importActual<typeof import('@/components/conversations/ConversationFiltersModal')>(
    '@/components/conversations/ConversationFiltersModal',
  );
  return { ...actual, ConversationFiltersModal: () => null };
});
vi.mock('@/components/conversations/TagFilterChips', () => ({ TagFilterChips: () => null }));
vi.mock('@/components/conversations/OwnerFilterChips', () => ({ OwnerFilterChips: () => null }));
vi.mock('@/components/etiquetas/EtiquetasManagerSheet', () => ({ EtiquetasManagerSheet: () => null }));
vi.mock('@/components/shared/PageHeader', () => ({
  PageHeader: ({ description }: { description: string }) => <p data-testid="subtitulo">{description}</p>,
}));
vi.mock('@/hooks/useConversations', () => ({
  useConversationsCount: (opts: Record<string, unknown>) => {
    spies.count(opts);
    return { data: opts.awaitingReply ? spies.awaitingCount : undefined };
  },
  useConversationByContact: () => ({ data: null, isLoading: false }),
  useCreateConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useContactHasConversation', () => ({
  useContactHasConversation: () => ({ data: undefined, isLoading: false }),
}));
vi.mock('@/hooks/useSlaConfig', () => ({ useSlaConfig: () => ({ enabled: false }) }));
vi.mock('@/hooks/useConversationRotation', () => ({
  useIneligibleOwners: () => ({ canManage: false, ownerIds: new Set(), owners: [], total: 0 }),
}));
vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenant: { id: 'loja-1' }, profile: { id: 'eu' } }),
}));
vi.mock('@/hooks/useNotifications', () => ({ useNotifications: () => ({ notifyNewMessage: vi.fn() }) }));
vi.mock('@/hooks/useRealtimeMessages', () => ({ useGlobalMessageListener: () => {} }));
vi.mock('@/hooks/useConversationShortcuts', () => ({ useConversationShortcuts: () => {} }));
vi.mock('@/hooks/use-mobile', () => ({
  XL_BREAKPOINT: 1280,
  useIsBelowXl: () => false,
  useIsMobile: () => false,
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { warning: vi.fn() } }));

import Conversations from './Conversations';

const renderPage = () =>
  render(
    <TooltipProvider>
      <MemoryRouter>
        <Conversations />
      </MemoryRouter>
    </TooltipProvider>,
  );

const listaRecebeu = () => spies.list.mock.calls.at(-1)?.[0] as Record<string, unknown>;
/** Por render: 1 selo (primeiro) + 5 pílulas. */
const rodada = () => spies.count.mock.calls.slice(-6).map((c) => c[0] as Record<string, unknown>);
const pilulas = () => rodada().filter((c) => !c.awaitingReply);
const selo = () => rodada().find((c) => c.awaitingReply === true)!;

beforeEach(() => {
  spies.list.mockClear();
  spies.count.mockClear();
  spies.hasInstagram = false;
  spies.awaitingCount = undefined;
  spies.chatDetect = null;
  try {
    localStorage.clear();
  } catch {
    /* sem armazenamento */
  }
  window.history.replaceState({}, '', '/dashboard/conversations');
});

describe('Conversas — Loja sem Instagram: a tela de antes', () => {
  it('sem chave; lista e as cinco pílulas no WhatsApp; subtítulo de sempre', async () => {
    renderPage();
    await waitFor(() => expect(listaRecebeu()).toBeDefined());
    expect(screen.queryByRole('group', { name: 'Canal das conversas' })).toBeNull();
    expect(listaRecebeu().channel).toBe('whatsapp');
    expect(pilulas()).toHaveLength(5);
    for (const c of pilulas()) expect(c.channel).toBe('whatsapp');
    expect(screen.getByTestId('subtitulo')).toHaveTextContent('Gerencie todas as suas conversas do WhatsApp em um só lugar');
  });

  it('o selo nem é pedido sem Instagram', async () => {
    renderPage();
    await waitFor(() => expect(listaRecebeu()).toBeDefined());
    expect(selo()).toMatchObject({ enabled: false });
  });

  it('canal lembrado como Instagram numa Loja sem Instagram continua WhatsApp', async () => {
    localStorage.setItem('convoflow:conversations-channel', 'instagram');
    renderPage();
    await waitFor(() => expect(listaRecebeu()).toBeDefined());
    expect(listaRecebeu().channel).toBe('whatsapp');
  });
});

describe('Conversas — Loja com Instagram', () => {
  it('a chave aparece; o selo conta o OUTRO canal, não arquivadas, aguardando resposta', async () => {
    spies.hasInstagram = true;
    spies.awaitingCount = 4;
    renderPage();
    await screen.findByRole('group', { name: 'Canal das conversas' });
    expect(selo()).toMatchObject({ channel: 'instagram', isArchived: false, awaitingReply: true, enabled: true });
    // O selo não leva os filtros da lista: é "quanto espera do outro lado".
    expect(selo()).not.toHaveProperty('searchQuery');
    expect(selo()).not.toHaveProperty('tagIds');
    expect(screen.getByTestId('awaiting-badge-instagram')).toHaveTextContent('4');
    for (const c of pilulas()) expect(c.channel).toBe('whatsapp');
  });

  it('trocar para Instagram: lista, pílulas e selo trocam juntos; a instância escolhida é limpa', async () => {
    spies.hasInstagram = true;
    spies.awaitingCount = 2;
    renderPage();
    await screen.findByRole('group', { name: 'Canal das conversas' });

    // Escolhe uma instância do WhatsApp pela lista…
    act(() => (listaRecebeu().onInstanceChange as (id: string | null) => void)('wa-1'));
    await waitFor(() => expect(listaRecebeu().whatsappInstanceId).toBe('wa-1'));

    // …e troca de canal.
    fireEvent.click(screen.getByRole('button', { name: /Instagram/ }));
    await waitFor(() => expect(listaRecebeu().channel).toBe('instagram'));
    expect(listaRecebeu().whatsappInstanceId).toBeNull();
    for (const c of pilulas()) {
      expect(c.channel).toBe('instagram');
      expect(c.whatsappInstanceId).toBeUndefined();
    }
    expect(selo()).toMatchObject({ channel: 'whatsapp', awaitingReply: true });
    expect(screen.getByTestId('awaiting-badge-whatsapp')).toHaveTextContent('2');
    expect(screen.getByTestId('subtitulo')).toHaveTextContent('Instagram');
  });

  it('abrir uma conversa do Instagram (link direto) vira a chave para o Instagram', async () => {
    spies.hasInstagram = true;
    renderPage();
    await screen.findByRole('group', { name: 'Canal das conversas' });
    expect(listaRecebeu().channel).toBe('whatsapp');
    act(() => spies.chatDetect!('instagram'));
    await waitFor(() => expect(listaRecebeu().channel).toBe('instagram'));
  });
});
