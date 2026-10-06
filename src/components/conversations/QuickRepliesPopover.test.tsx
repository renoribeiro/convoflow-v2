/**
 * Paleta de respostas rápidas do compositor.
 *
 * O que precisa continuar verdadeiro:
 *  - a variável é trocada NA INSERÇÃO (é o motivo de a paleta morar dentro da
 *    conversa e não só numa tela de configuração);
 *  - escolher PREENCHE o campo, nunca envia;
 *  - Loja sem nenhuma resposta vê um caminho, não uma caixa vazia.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';

let estado: { quickReplies: unknown[]; isLoading: boolean };

vi.mock('@/hooks/useQuickReplies', () => ({
  useQuickReplies: () => estado,
}));

import { QuickRepliesPopover } from './QuickRepliesPopover';

const CONTATO = {
  name: 'Helena Duarte',
  phone: '5511999998888',
  email: 'helena@exemplo.com',
};

const resposta = (id: string, name: string, content: string) => ({
  id,
  name,
  content,
  created_by_name: 'Paulo Andrade',
  updated_by_name: 'Paulo Andrade',
  created_at: '2026-08-24T10:00:00Z',
  updated_at: '2026-08-24T10:00:00Z',
});

const onSelect = vi.fn();

function renderPopover(contact: typeof CONTATO | null = CONTATO) {
  return render(
    <MemoryRouter>
      <TooltipProvider>
        <QuickRepliesPopover
          open
          onOpenChange={vi.fn()}
          onSelect={onSelect}
          contact={contact}
        />
      </TooltipProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  onSelect.mockClear();
  estado = { quickReplies: [], isLoading: false };
});

describe('interpolação na inserção', () => {
  it('mostra o texto já resolvido na lista, não o token cru', async () => {
    estado = {
      quickReplies: [resposta('r1', 'Saudação', 'Olá {first_name}, tudo bem?')],
      isLoading: false,
    };
    renderPopover();

    expect(await screen.findByText('Olá Helena, tudo bem?')).toBeInTheDocument();
    expect(screen.queryByText(/\{first_name\}/)).not.toBeInTheDocument();
  });

  it('entrega ao compositor o conteúdo com as variáveis trocadas', async () => {
    const user = userEvent.setup();
    estado = {
      quickReplies: [resposta('r1', 'Saudação', 'Olá {first_name}, tudo bem?')],
      isLoading: false,
    };
    renderPopover();

    await user.click(await screen.findByText('Saudação'));

    expect(onSelect).toHaveBeenCalledWith('Olá Helena, tudo bem?');
  });

  it('deixa literal o token que não sabe resolver', async () => {
    const user = userEvent.setup();
    estado = {
      quickReplies: [resposta('r1', 'Pedido', 'Seu pedido {numero_pedido} saiu.')],
      isLoading: false,
    };
    renderPopover();

    await user.click(await screen.findByText('Pedido'));

    expect(onSelect).toHaveBeenCalledWith('Seu pedido {numero_pedido} saiu.');
  });

  it('sem contato na conversa, não quebra nem apaga o token', async () => {
    const user = userEvent.setup();
    estado = {
      quickReplies: [resposta('r1', 'Saudação', 'Olá {first_name}!')],
      isLoading: false,
    };
    renderPopover(null);

    await user.click(await screen.findByText('Saudação'));

    // first_name vira string vazia quando não há nome — nunca "undefined".
    expect(onSelect).toHaveBeenCalledWith('Olá !');
  });
});

describe('estado vazio', () => {
  it('aponta onde criar, em vez de mostrar uma lista vazia', async () => {
    renderPopover();

    expect(await screen.findByText('Nenhuma resposta rápida ainda')).toBeInTheDocument();
    const link = screen.getByRole('link', {
      name: /Criar em Configurações › Respostas rápidas/i,
    });
    expect(link).toHaveAttribute('href', '/dashboard/settings?tab=quick-replies');
  });

  it('não mostra o campo de busca quando não há nada para buscar', () => {
    renderPopover();
    expect(screen.queryByPlaceholderText('Buscar resposta rápida...')).not.toBeInTheDocument();
  });
});

describe('busca', () => {
  it('filtra por nome', async () => {
    const user = userEvent.setup();
    estado = {
      quickReplies: [
        resposta('r1', 'Saudação', 'Olá!'),
        resposta('r2', 'Horário', 'Das 9h às 18h.'),
      ],
      isLoading: false,
    };
    renderPopover();

    await user.type(await screen.findByPlaceholderText('Buscar resposta rápida...'), 'Horár');

    expect(screen.getByText('Horário')).toBeInTheDocument();
    expect(screen.queryByText('Saudação')).not.toBeInTheDocument();
  });
});
