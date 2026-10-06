/**
 * Controle de responsável no cabeçalho do chat: o que aparece em cada estado
 * e o que cada ação dispara. A escrita em si (guarda de concorrência etc.) é
 * coberta em src/lib/conversations/assignment.test.ts.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TooltipProvider } from '@/components/ui/tooltip';

// vi.mock é içado para o topo do arquivo: tudo que a fábrica usa vem de vi.hoisted.
const { EU, MARIA, CONVERSA, assumeMutate, transferMutate, members } = vi.hoisted(() => {
  const EU = 'p0000000-0000-4000-8000-00000000000a';
  const MARIA = 'p0000000-0000-4000-8000-00000000000b';
  return {
    EU,
    MARIA,
    CONVERSA: 'c0000000-0000-4000-8000-000000000001',
    assumeMutate: vi.fn(),
    transferMutate: vi.fn(),
    members: [
      { id: EU, first_name: 'Eu', last_name: 'Mesmo', avatar_url: null },
      { id: MARIA, first_name: 'Maria', last_name: 'Souza', avatar_url: null },
    ],
  };
});

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenant: { id: 'loja-1' }, profile: { id: EU } }),
}));

vi.mock('@/hooks/useTeamDirectory', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useTeamDirectory')>('@/hooks/useTeamDirectory');
  return {
    ...actual,
    useTeamDirectory: () => ({ data: members, isLoading: false }),
    useTeamMemberLookup: () => (id: string | null | undefined) => members.find((m) => m.id === id),
  };
});

vi.mock('@/hooks/useConversationAssignment', () => ({
  useAssumeConversation: () => ({ mutate: assumeMutate, isPending: false }),
  useTransferConversation: () => ({ mutate: transferMutate, isPending: false }),
}));

import { ConversationOwnerControl } from './ConversationOwnerControl';

const renderControl = (assignedProfileId: string | null | undefined) =>
  render(
    <TooltipProvider>
      <ConversationOwnerControl conversationId={CONVERSA} assignedProfileId={assignedProfileId} />
    </TooltipProvider>,
  );

beforeEach(() => {
  assumeMutate.mockReset();
  transferMutate.mockReset();
});

describe('ConversationOwnerControl', () => {
  it('some enquanto a migração não rodou (coluna ausente)', () => {
    const { container } = renderControl(undefined);
    expect(container).toBeEmptyDOMElement();
  });

  it('sem responsável: mostra o marcador neutro e oferece "Assumir" e "Transferir…"', async () => {
    const user = userEvent.setup();
    renderControl(null);

    expect(screen.getByText('Sem responsável')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /sem responsável/i }));

    const assumir = await screen.findByRole('menuitem', { name: /assumir/i });
    expect(screen.getByRole('menuitem', { name: /transferir/i })).toBeInTheDocument();

    await user.click(assumir);
    expect(assumeMutate).toHaveBeenCalledWith({ conversationId: CONVERSA });
  });

  it('com responsável: mostra o nome e NÃO oferece "Assumir" — só "Transferir…"', async () => {
    const user = userEvent.setup();
    renderControl(MARIA);

    expect(screen.getByText('Maria')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /responsável: maria souza/i }));

    await screen.findByRole('menuitem', { name: /transferir/i });
    expect(screen.queryByRole('menuitem', { name: /assumir/i })).not.toBeInTheDocument();
    expect(assumeMutate).not.toHaveBeenCalled();
  });

  it('"Transferir…" abre o seletor; escolher alguém dispara a transferência para essa pessoa', async () => {
    const user = userEvent.setup();
    renderControl(null);

    await user.click(screen.getByRole('button', { name: /sem responsável/i }));
    await user.click(await screen.findByRole('menuitem', { name: /transferir/i }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Transferir conversa');
    // Eu apareço primeiro, marcado como "(você)"; a Maria é a outra opção.
    const opcoes = screen.getAllByRole('option');
    expect(opcoes[0]).toHaveTextContent('Eu Mesmo');
    expect(opcoes[0]).toHaveTextContent('(você)');

    await user.click(screen.getByRole('option', { name: /maria souza/i }));

    await waitFor(() =>
      expect(transferMutate).toHaveBeenCalledWith({ conversationId: CONVERSA, toProfileId: MARIA }),
    );
  });

  it('no seletor, quem já é o responsável aparece marcado e não é clicável', async () => {
    const user = userEvent.setup();
    renderControl(MARIA);

    await user.click(screen.getByRole('button', { name: /responsável: maria souza/i }));
    await user.click(await screen.findByRole('menuitem', { name: /transferir/i }));
    await screen.findByRole('dialog');

    const maria = screen.getByRole('option', { name: /maria souza/i });
    expect(maria).toBeDisabled();
    expect(maria).toHaveTextContent('Já é o responsável');

    await user.click(maria);
    expect(transferMutate).not.toHaveBeenCalled();
  });

  it('busca no seletor filtra pelo nome', async () => {
    const user = userEvent.setup();
    renderControl(null);

    await user.click(screen.getByRole('button', { name: /sem responsável/i }));
    await user.click(await screen.findByRole('menuitem', { name: /transferir/i }));
    await screen.findByRole('dialog');

    await user.type(screen.getByRole('textbox', { name: /buscar membro/i }), 'mar');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option')).toHaveTextContent('Maria Souza');
  });
});
