/**
 * A tela de Conversas com o filtro por responsável — a regra de exclusão
 * COMO LIGADA, não só a função pura:
 *
 *  - escolher um atendente no modal com "Minhas" ativa devolve a pílula a
 *    "Todas" e a lista recebe o atendente, não "eu";
 *  - clicar em "Minhas" ou "Sem responsável" com atendentes marcados limpa os
 *    atendentes, e a lista recebe `[eu]` / `unassignedOnly`;
 *  - as cinco contagens de servidor recebem o mesmo recorte que a lista
 *    (etiquetas, período...), com o responsável de cada pílula;
 *  - trocar de Loja limpa os atendentes junto com as etiquetas.
 *
 * Tudo abaixo da tela é dublê: só o estado da página e os dois reconciliadores
 * são reais.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';

const spies = vi.hoisted(() => ({
  list: vi.fn(),
  count: vi.fn(),
  modalOnChange: null as null | ((next: unknown) => void),
  tenantId: 'loja-1',
}));

vi.mock('@/components/conversations/ConversationsList', () => ({
  ConversationsList: (props: Record<string, unknown>) => {
    spies.list(props);
    return <div data-testid="lista" />;
  },
}));
vi.mock('@/components/conversations/ChatWindow', () => ({ ChatWindow: () => null }));
vi.mock('@/components/conversations/ConversationFiltersModal', async () => {
  const actual = await vi.importActual<typeof import('@/components/conversations/ConversationFiltersModal')>(
    '@/components/conversations/ConversationFiltersModal',
  );
  return {
    ...actual,
    ConversationFiltersModal: ({ onChange }: { onChange: (next: unknown) => void }) => {
      spies.modalOnChange = onChange;
      return null;
    },
  };
});
vi.mock('@/components/conversations/TagFilterChips', () => ({ TagFilterChips: () => null }));
vi.mock('@/components/conversations/OwnerFilterChips', () => ({
  OwnerFilterChips: ({ assignedProfileIds }: { assignedProfileIds: string[] }) => (
    <div data-testid="selos-responsavel">{assignedProfileIds.join(',')}</div>
  ),
}));
vi.mock('@/components/etiquetas/EtiquetasManagerSheet', () => ({ EtiquetasManagerSheet: () => null }));
vi.mock('@/components/shared/PageHeader', () => ({ PageHeader: () => null }));
vi.mock('@/hooks/useConversations', () => ({
  useConversationsCount: (opts: Record<string, unknown>) => {
    spies.count(opts);
    return { data: undefined };
  },
  useConversationByContact: () => ({ data: null, isLoading: false }),
  useCreateConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useContactHasConversation', () => ({
  useContactHasConversation: () => ({ data: undefined, isLoading: false }),
}));
vi.mock('@/hooks/useSlaConfig', () => ({ useSlaConfig: () => ({ enabled: false }) }));
vi.mock('@/hooks/useConversationRotation', () => ({
  useIneligibleOwners: () => ({ canManage: true, ownerIds: new Set(), owners: [], total: 0 }),
}));
vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenant: { id: spies.tenantId }, profile: { id: 'eu' } }),
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
import { DEFAULT_FILTER_STATE } from '@/components/conversations/ConversationFiltersModal';

const arvore = () => (
  <TooltipProvider>
    <MemoryRouter>
      <Conversations />
    </MemoryRouter>
  </TooltipProvider>
);
const renderPage = () => render(arvore());

/** Última prop que a lista recebeu. */
const listaRecebeu = () => spies.list.mock.calls.at(-1)?.[0] as Record<string, unknown>;

/** A contagem que teria este `unassignedOnly`/`assignedProfileIds` na última rodada. */
const contagens = () => {
  // 5 contagens por render; pega as 5 últimas.
  return spies.count.mock.calls.slice(-5).map((c) => c[0] as Record<string, unknown>);
};

const pilula = (label: string) => screen.getByRole('button', { name: new RegExp(`^${label}`) });

beforeEach(() => {
  spies.list.mockClear();
  spies.count.mockClear();
  spies.modalOnChange = null;
  spies.tenantId = 'loja-1';
  window.history.replaceState({}, '', '/dashboard/conversations');
});

describe('Conversas — filtro por responsável ligado à tela', () => {
  it('no padrão a lista não tem recorte por responsável', () => {
    renderPage();
    expect(listaRecebeu()).toMatchObject({ assignedProfileIds: [], unassignedOnly: false, quickFilter: 'todas' });
  });

  it('clicar em "Minhas" manda `[eu]` para a lista; "Sem responsável" manda unassignedOnly', () => {
    renderPage();
    fireEvent.click(pilula('Minhas'));
    expect(listaRecebeu()).toMatchObject({ assignedProfileIds: ['eu'], unassignedOnly: false, quickFilter: 'minhas' });
    fireEvent.click(pilula('Sem responsável'));
    expect(listaRecebeu()).toMatchObject({ assignedProfileIds: [], unassignedOnly: true, quickFilter: 'sem-responsavel' });
  });

  it('escolher um atendente com "Minhas" ativa devolve a pílula a "Todas" e a lista recebe o atendente', async () => {
    renderPage();
    fireEvent.click(pilula('Minhas'));
    expect(listaRecebeu().quickFilter).toBe('minhas');

    spies.modalOnChange!({ ...DEFAULT_FILTER_STATE, assignedProfileIds: ['p-maria'] });
    await waitFor(() => expect(listaRecebeu().quickFilter).toBe('todas'));
    expect(listaRecebeu()).toMatchObject({ assignedProfileIds: ['p-maria'], unassignedOnly: false });
    expect(screen.getByTestId('selos-responsavel')).toHaveTextContent('p-maria');
  });

  it('escolher um atendente com "Sem responsável" ativa devolve a pílula a "Todas"', async () => {
    renderPage();
    fireEvent.click(pilula('Sem responsável'));
    spies.modalOnChange!({ ...DEFAULT_FILTER_STATE, assignedProfileIds: ['p-maria'] });
    await waitFor(() => expect(listaRecebeu().quickFilter).toBe('todas'));
    expect(listaRecebeu()).toMatchObject({ assignedProfileIds: ['p-maria'], unassignedOnly: false });
  });

  it('clicar em "Minhas" com atendentes marcados limpa os atendentes — a lista recebe `[eu]`, não Maria', async () => {
    renderPage();
    spies.modalOnChange!({ ...DEFAULT_FILTER_STATE, assignedProfileIds: ['p-maria', 'p-joao'] });
    await waitFor(() => expect(listaRecebeu().assignedProfileIds).toEqual(['p-maria', 'p-joao']));

    fireEvent.click(pilula('Minhas'));
    await waitFor(() => expect(listaRecebeu().quickFilter).toBe('minhas'));
    expect(listaRecebeu()).toMatchObject({ assignedProfileIds: ['eu'], unassignedOnly: false });
    expect(screen.queryByTestId('selos-responsavel')).toHaveTextContent('');
  });

  it('clicar em "Sem responsável" com atendentes marcados limpa os atendentes', async () => {
    renderPage();
    spies.modalOnChange!({ ...DEFAULT_FILTER_STATE, assignedProfileIds: ['p-maria'] });
    await waitFor(() => expect(listaRecebeu().assignedProfileIds).toEqual(['p-maria']));

    fireEvent.click(pilula('Sem responsável'));
    await waitFor(() => expect(listaRecebeu().quickFilter).toBe('sem-responsavel'));
    expect(listaRecebeu()).toMatchObject({ assignedProfileIds: [], unassignedOnly: true });
  });

  it('"Responsável indisponível" e as pílulas de mensagem convivem com o atendente marcado', async () => {
    renderPage();
    spies.modalOnChange!({ ...DEFAULT_FILTER_STATE, assignedProfileIds: ['p-maria'] });
    await waitFor(() => expect(listaRecebeu().assignedProfileIds).toEqual(['p-maria']));

    fireEvent.click(pilula('Responsável indisponível'));
    await waitFor(() => expect(listaRecebeu().quickFilter).toBe('responsavel-indisponivel'));
    expect(listaRecebeu().assignedProfileIds).toEqual(['p-maria']);

    fireEvent.click(pilula('Aguardando'));
    await waitFor(() => expect(listaRecebeu().quickFilter).toBe('aguardando'));
    expect(listaRecebeu().assignedProfileIds).toEqual(['p-maria']);

    fireEvent.click(pilula('Não lidas'));
    await waitFor(() => expect(listaRecebeu().quickFilter).toBe('nao-lidas'));
    expect(listaRecebeu()).toMatchObject({ assignedProfileIds: ['p-maria'], hasUnread: true });
  });

  it('as contagens de "Minhas" e "Sem responsável" levam o recorte do modal (etiquetas), cada uma com o seu responsável', async () => {
    renderPage();
    spies.modalOnChange!({ ...DEFAULT_FILTER_STATE, tagIds: ['t1'], assignedProfileIds: ['p-maria'] });
    await waitFor(() => expect(listaRecebeu().assignedProfileIds).toEqual(['p-maria']));

    const ultimas = contagens();
    const minhas = ultimas.find((c) => Array.isArray(c.assignedProfileIds) && (c.assignedProfileIds as string[])[0] === 'eu');
    const semDono = ultimas.find((c) => c.unassignedOnly === true);
    const todas = ultimas.find((c) => !c.unassignedOnly && !c.hasUnread && !c.isArchived && (c.assignedProfileIds as string[])[0] !== 'eu');
    expect(minhas).toMatchObject({ tagIds: ['t1'], assignedProfileIds: ['eu'], unassignedOnly: false, enabled: true });
    expect(semDono).toMatchObject({ tagIds: ['t1'], assignedProfileIds: [], unassignedOnly: true });
    // "Todas" (e as outras) contam DENTRO do filtro por atendente, como a lista.
    expect(todas).toMatchObject({ tagIds: ['t1'], assignedProfileIds: ['p-maria'] });
  });

  it('trocar de Loja limpa os atendentes marcados (são por Loja, como as etiquetas)', async () => {
    const { rerender } = renderPage();
    spies.modalOnChange!({ ...DEFAULT_FILTER_STATE, assignedProfileIds: ['p-maria'] });
    await waitFor(() => expect(listaRecebeu().assignedProfileIds).toEqual(['p-maria']));

    spies.tenantId = 'loja-2';
    rerender(arvore());
    await waitFor(() => expect(listaRecebeu().assignedProfileIds).toEqual([]));
  });
});
