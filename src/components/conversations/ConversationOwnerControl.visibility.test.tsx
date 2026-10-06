/**
 * O controle de responsável quando a Loja DESLIGA a transferência para
 * atendentes (Configurações › Escala/Transferência). Esconder o botão é só
 * metade: o servidor recusa a escrita (trigger 42501, coberto em
 * docs/teste_visibilidade_conversas.sql). Aqui: o que some, o que fica, e que
 * gestor/gerente não são afetados.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TooltipProvider } from '@/components/ui/tooltip';

const { EU, MARIA, CONVERSA, assumeMutate, transferMutate, members, estado } = vi.hoisted(() => {
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
    estado: { role: 'atendente', settings: {} as Record<string, unknown> },
  };
});

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({
    tenant: { id: 'loja-1', settings: estado.settings },
    profile: { id: EU, role: estado.role },
    loading: false,
  }),
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

const renderControl = (assignedProfileId: string | null) =>
  render(
    <TooltipProvider>
      <ConversationOwnerControl conversationId={CONVERSA} assignedProfileId={assignedProfileId} />
    </TooltipProvider>,
  );

beforeEach(() => {
  assumeMutate.mockReset();
  transferMutate.mockReset();
  estado.role = 'atendente';
  estado.settings = {};
});

describe('ConversationOwnerControl com transferência desligada para atendentes', () => {
  it('atendente: "Assumir" continua na conversa sem responsável, "Transferir…" some', async () => {
    estado.settings = { atendente_can_transfer: false };
    const user = userEvent.setup();
    renderControl(null);

    await user.click(screen.getByRole('button', { name: /sem responsável/i }));

    expect(await screen.findByRole('menuitem', { name: /assumir/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /transferir/i })).not.toBeInTheDocument();
  });

  it('atendente numa conversa que já tem dono: sem ação nenhuma, só o chip do responsável', () => {
    estado.settings = { atendente_can_transfer: false };
    renderControl(MARIA);

    expect(screen.getByTestId('owner-readonly')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('com a chave ligada (padrão) o atendente transfere como sempre', async () => {
    const user = userEvent.setup();
    renderControl(MARIA);

    await user.click(screen.getByRole('button', { name: /responsável/i }));
    expect(await screen.findByRole('menuitem', { name: /transferir/i })).toBeInTheDocument();
  });

  it.each(['gestor', 'gerente'])('%s não é afetado pela chave: "Transferir…" continua', async (role) => {
    estado.role = role;
    estado.settings = { atendente_can_transfer: false };
    const user = userEvent.setup();
    renderControl(MARIA);

    await user.click(screen.getByRole('button', { name: /responsável/i }));
    expect(await screen.findByRole('menuitem', { name: /transferir/i })).toBeInTheDocument();
  });
});
