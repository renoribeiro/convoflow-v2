/**
 * Modal "Filtrar Conversas".
 *
 * O que precisa continuar verdadeiro:
 *  - as etiquetas oferecidas são as do `useTags` (a Loja do seletor), e marcar
 *    uma manda `tagIds` para fora na hora — não existe passo de aplicar;
 *  - "Fechar" só fecha: não mexe no estado;
 *  - "Limpar" volta tudo ao padrão, etiquetas incluídas;
 *  - o número do selo conta período como UM filtro, etiquetas como UM e
 *    responsáveis como UM;
 *  - nenhum texto do modal fala em coluna, tabela ou em filtro que não existe;
 *  - a seção "Responsável" só existe para quem `useOwnerFilterOptions` diz
 *    que pode (gestor/gerente); para o atendente ela não é montada.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const tagsMock = vi.hoisted(() => ({
  tags: [
    { id: 'tag-quente', name: 'Quente', color: '#ef4444' },
    { id: 'tag-frio', name: 'Frio', color: '#3b82f6' },
  ] as Array<{ id: string; name: string; color: string }>,
  isLoading: false,
}));

vi.mock('@/hooks/useTags', () => ({
  useTags: () => ({ tags: tagsMock.tags, isLoading: tagsMock.isLoading }),
}));

const ownersMock = vi.hoisted(() => ({
  canFilter: false,
  isLoading: false,
  options: [] as Array<{
    id: string;
    label: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    reason?: string;
  }>,
}));

vi.mock('@/hooks/useOwnerFilterOptions', () => ({
  useOwnerFilterOptions: () => ({
    canFilter: ownersMock.canFilter,
    isLoading: ownersMock.isLoading,
    options: ownersMock.options,
    optionFor: (id: string) => ownersMock.options.find((o) => o.id === id),
  }),
}));

const MARIA = { id: 'p-maria', label: 'Maria Souza', first_name: 'Maria', last_name: 'Souza', avatar_url: null };
const JOAO = { id: 'p-joao', label: 'João Lima', first_name: 'João', last_name: 'Lima', avatar_url: null };
const CARLA_SUSPENSA = {
  id: 'p-carla',
  label: 'Carla Reis (suspenso)',
  first_name: 'Carla',
  last_name: 'Reis',
  avatar_url: null,
  reason: 'suspended',
};

import {
  ConversationFiltersModal,
  DEFAULT_FILTER_STATE,
  countActiveFilters,
  type ConversationsFilterState,
} from './ConversationFiltersModal';

const onClose = vi.fn();
const onChange = vi.fn();

const renderModal = (value: Partial<ConversationsFilterState> = {}) =>
  render(
    <ConversationFiltersModal
      isOpen
      onClose={onClose}
      onChange={onChange}
      value={{ ...DEFAULT_FILTER_STATE, ...value }}
    />,
  );

beforeEach(() => {
  onClose.mockReset();
  onChange.mockReset();
  tagsMock.tags = [
    { id: 'tag-quente', name: 'Quente', color: '#ef4444' },
    { id: 'tag-frio', name: 'Frio', color: '#3b82f6' },
  ];
  tagsMock.isLoading = false;
  ownersMock.canFilter = false;
  ownersMock.isLoading = false;
  ownersMock.options = [];
});

describe('seletor de etiquetas', () => {
  it('oferece as etiquetas da Loja aberta (as do useTags)', () => {
    renderModal();
    const grupo = screen.getByRole('group', { name: 'Etiquetas do contato' });
    expect(within(grupo).getByText('Quente')).toBeInTheDocument();
    expect(within(grupo).getByText('Frio')).toBeInTheDocument();
  });

  it('marcar uma etiqueta sai na hora em tagIds, sem passo de aplicar', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('checkbox', { name: 'Quente' }));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTER_STATE, tagIds: ['tag-quente'] });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('marcar uma segunda etiqueta acrescenta à lista (qualquer uma delas)', async () => {
    const user = userEvent.setup();
    renderModal({ tagIds: ['tag-quente'] });
    await user.click(screen.getByRole('checkbox', { name: 'Frio' }));
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_FILTER_STATE,
      tagIds: ['tag-quente', 'tag-frio'],
    });
  });

  it('clicar numa etiqueta marcada desmarca só ela', async () => {
    const user = userEvent.setup();
    renderModal({ tagIds: ['tag-quente', 'tag-frio'] });
    expect(screen.getByRole('checkbox', { name: 'Quente' })).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('checkbox', { name: 'Quente' }));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTER_STATE, tagIds: ['tag-frio'] });
  });

  it('sem etiqueta na Loja, diz onde criar em vez de mostrar lista vazia', () => {
    tagsMock.tags = [];
    renderModal();
    expect(screen.getByText(/Nenhuma etiqueta nesta Loja ainda/)).toBeInTheDocument();
  });
});

describe('botões', () => {
  it('"Fechar" só fecha — não altera nenhum filtro', async () => {
    const user = userEvent.setup();
    renderModal({ tagIds: ['tag-quente'], hasUnread: true });
    await user.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('não existe mais "Aplicar": nada a aplicar, tudo já valeu', () => {
    renderModal();
    expect(screen.queryByRole('button', { name: 'Aplicar' })).not.toBeInTheDocument();
  });

  it('"Limpar" volta ao padrão, etiquetas incluídas, e não fecha', async () => {
    const user = userEvent.setup();
    renderModal({
      tagIds: ['tag-quente', 'tag-frio'],
      hasUnread: true,
      isArchived: true,
      dateFrom: new Date(2026, 8, 1),
      dateTo: new Date(2026, 8, 20),
    });
    await user.click(screen.getByRole('button', { name: 'Limpar' }));
    expect(onChange).toHaveBeenCalledWith(DEFAULT_FILTER_STATE);
    expect(onChange.mock.calls[0][0].tagIds).toEqual([]);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('texto do modal', () => {
  it('fala com quem atende: nada de coluna, tabela ou aviso de filtro que não existe', () => {
    renderModal();
    // Dialog do Radix renderiza em portal; o texto está no document, não no container.
    const tudo = document.body.textContent ?? '';
    expect(tudo).toContain('Filtrar Conversas');
    expect(tudo).not.toMatch(/last_message_at/);
    expect(tudo).not.toMatch(/conversations/);
    expect(tudo).not.toMatch(/coluna/i);
    expect(tudo).not.toMatch(/status\/agentes/i);
    expect(document.body.querySelector('code')).toBeNull();
  });

  it('a descrição diz só o que é verdade: vale na hora e soma às pílulas', () => {
    renderModal();
    expect(screen.getByText(/vale na hora, assim que você marca/)).toBeInTheDocument();
  });

  it('"arquivadas" diz que as ativas somem, não que as arquivadas se somam', () => {
    renderModal();
    expect(screen.getByLabelText(/Só conversas arquivadas \(as ativas somem da lista\)/)).toBeInTheDocument();
  });

  it('o período não tem nome de coluna e avisa que o dia "Até" entra inteiro', () => {
    renderModal();
    expect(screen.getByText('Período da última mensagem')).toBeInTheDocument();
    expect(screen.getByText('Até (o dia inteiro)')).toBeInTheDocument();
  });
});

describe('seção "Responsável pela conversa" (só gestor/gerente)', () => {
  it('o atendente NÃO vê a seção: ela não é montada, nem escondida', () => {
    ownersMock.canFilter = false;
    ownersMock.options = [MARIA, JOAO];
    renderModal();
    expect(screen.queryByRole('group', { name: 'Responsável pela conversa' })).not.toBeInTheDocument();
    expect(screen.queryByText('Responsável pela conversa')).not.toBeInTheDocument();
    expect(screen.queryByText('Maria Souza')).not.toBeInTheDocument();
  });

  it('o atendente não vê a seção nem com responsáveis já marcados no estado', () => {
    ownersMock.canFilter = false;
    ownersMock.options = [MARIA];
    renderModal({ assignedProfileIds: ['p-maria'] });
    expect(screen.queryByRole('group', { name: 'Responsável pela conversa' })).not.toBeInTheDocument();
  });

  it('gestor/gerente veem o time da Loja, um por linha', () => {
    ownersMock.canFilter = true;
    ownersMock.options = [MARIA, JOAO];
    renderModal();
    const grupo = screen.getByRole('group', { name: 'Responsável pela conversa' });
    expect(within(grupo).getByRole('checkbox', { name: /Maria Souza/ })).toBeInTheDocument();
    expect(within(grupo).getByRole('checkbox', { name: /João Lima/ })).toBeInTheDocument();
  });

  it('marcar uma pessoa sai na hora em assignedProfileIds, sem passo de aplicar', async () => {
    ownersMock.canFilter = true;
    ownersMock.options = [MARIA, JOAO];
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('checkbox', { name: /Maria Souza/ }));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTER_STATE, assignedProfileIds: ['p-maria'] });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('marcar uma segunda pessoa acrescenta (qualquer uma delas), e desmarcar tira só ela', async () => {
    ownersMock.canFilter = true;
    ownersMock.options = [MARIA, JOAO];
    const user = userEvent.setup();
    renderModal({ assignedProfileIds: ['p-maria'] });
    expect(screen.getByRole('checkbox', { name: /Maria Souza/ })).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('checkbox', { name: /João Lima/ }));
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_FILTER_STATE,
      assignedProfileIds: ['p-maria', 'p-joao'],
    });
    await user.click(screen.getByRole('checkbox', { name: /Maria Souza/ }));
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_FILTER_STATE, assignedProfileIds: [] });
  });

  it('quem saiu do time mas ainda tem conversa aparece com o motivo no nome', () => {
    ownersMock.canFilter = true;
    ownersMock.options = [MARIA, CARLA_SUSPENSA];
    renderModal();
    expect(screen.getByRole('checkbox', { name: /Carla Reis \(suspenso\)/ })).toBeInTheDocument();
  });

  it('o texto diz "qualquer uma delas" — várias marcadas é OU, como as etiquetas', () => {
    ownersMock.canFilter = true;
    ownersMock.options = [MARIA];
    renderModal();
    expect(screen.getByText(/entra o que está com qualquer uma delas/)).toBeInTheDocument();
  });

  it('não oferece "Sem responsável" dentro do modal: isso é pílula', () => {
    ownersMock.canFilter = true;
    ownersMock.options = [MARIA, JOAO];
    renderModal();
    const grupo = screen.getByRole('group', { name: 'Responsável pela conversa' });
    expect(within(grupo).queryByText(/Sem responsável/)).not.toBeInTheDocument();
  });

  it('sem ninguém no time, aponta para Equipe (a tela que existe), não para uma tela inventada', () => {
    ownersMock.canFilter = true;
    ownersMock.options = [];
    renderModal();
    expect(screen.getByText(/Convide pessoas em Equipe/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Configurações › Usuários/);
  });

  it('"Limpar" zera os responsáveis junto com o resto', async () => {
    ownersMock.canFilter = true;
    ownersMock.options = [MARIA];
    const user = userEvent.setup();
    renderModal({ assignedProfileIds: ['p-maria'], tagIds: ['tag-quente'] });
    await user.click(screen.getByRole('button', { name: 'Limpar' }));
    expect(onChange).toHaveBeenCalledWith(DEFAULT_FILTER_STATE);
    expect(onChange.mock.calls[0]?.[0].assignedProfileIds).toEqual([]);
  });
});

describe('countActiveFilters (o número do selo em "Filtros")', () => {
  it('zero no padrão', () => {
    expect(countActiveFilters(DEFAULT_FILTER_STATE)).toBe(0);
  });

  it('período conta UMA vez, com "De", com "Até" ou com os dois', () => {
    const de = new Date(2026, 8, 1);
    const ate = new Date(2026, 8, 20);
    expect(countActiveFilters({ ...DEFAULT_FILTER_STATE, dateFrom: de })).toBe(1);
    expect(countActiveFilters({ ...DEFAULT_FILTER_STATE, dateTo: ate })).toBe(1);
    expect(countActiveFilters({ ...DEFAULT_FILTER_STATE, dateFrom: de, dateTo: ate })).toBe(1);
  });

  it('etiquetas contam UMA vez, marcadas uma ou várias', () => {
    expect(countActiveFilters({ ...DEFAULT_FILTER_STATE, tagIds: ['a'] })).toBe(1);
    expect(countActiveFilters({ ...DEFAULT_FILTER_STATE, tagIds: ['a', 'b', 'c'] })).toBe(1);
  });

  it('tudo ligado = 4 (não lidas, arquivadas, período, etiquetas)', () => {
    expect(
      countActiveFilters({
        hasUnread: true,
        isArchived: true,
        dateFrom: new Date(2026, 8, 1),
        dateTo: new Date(2026, 8, 20),
        tagIds: ['a', 'b'],
        assignedProfileIds: [],
      }),
    ).toBe(4);
  });

  it('responsáveis contam UMA vez, marcados um ou vários', () => {
    expect(countActiveFilters({ ...DEFAULT_FILTER_STATE, assignedProfileIds: ['p1'] })).toBe(1);
    expect(countActiveFilters({ ...DEFAULT_FILTER_STATE, assignedProfileIds: ['p1', 'p2', 'p3'] })).toBe(1);
  });

  it('tudo ligado, responsáveis incluídos = 5', () => {
    expect(
      countActiveFilters({
        hasUnread: true,
        isArchived: true,
        dateFrom: new Date(2026, 8, 1),
        dateTo: new Date(2026, 8, 20),
        tagIds: ['a', 'b'],
        assignedProfileIds: ['p1', 'p2'],
      }),
    ).toBe(5);
  });
});
