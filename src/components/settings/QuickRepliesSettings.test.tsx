/**
 * Aba Configurações › Respostas rápidas.
 *
 * A biblioteca é compartilhada e TODO cargo edita — foi decisão de produto.
 * As duas proteções que sobram são de tela, e é isso que este arquivo protege:
 *  - apagar pede confirmação NOMEANDO a resposta (senão o clique errado leva
 *    embora o trecho que o time inteiro usa);
 *  - a lista diz quem criou e quem editou por último.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const criar = { mutateAsync: vi.fn(), isPending: false };
const atualizar = { mutateAsync: vi.fn(), isPending: false };
const remover = { mutateAsync: vi.fn(), isPending: false };

let estado: { quickReplies: unknown[]; isLoading: boolean };

vi.mock('@/hooks/useQuickReplies', () => ({
  useQuickReplies: () => ({ ...estado, criar, atualizar, remover }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { QuickRepliesSettings } from './QuickRepliesSettings';

const resposta = (
  id: string,
  name: string,
  content: string,
  extra: Record<string, unknown> = {},
) => ({
  id,
  name,
  content,
  created_by_name: 'Paulo Andrade',
  updated_by_name: 'Paulo Andrade',
  created_at: '2026-08-24T10:00:00Z',
  updated_at: '2026-08-24T10:00:00Z',
  ...extra,
});

beforeEach(() => {
  criar.mutateAsync.mockReset().mockResolvedValue({});
  atualizar.mutateAsync.mockReset().mockResolvedValue({});
  remover.mutateAsync.mockReset().mockResolvedValue(undefined);
  estado = {
    quickReplies: [resposta('r1', 'Saudação', 'Olá {first_name}!')],
    isLoading: false,
  };
});

describe('exclusão', () => {
  it('pede confirmação nomeando a resposta, e não apaga antes disso', async () => {
    const user = userEvent.setup();
    render(<QuickRepliesSettings />);

    await user.click(screen.getByRole('button', { name: 'Excluir Saudação' }));

    expect(await screen.findByText('Excluir "Saudação"?')).toBeInTheDocument();
    // O ponto do teste: abrir o diálogo NÃO pode ter apagado nada.
    expect(remover.mutateAsync).not.toHaveBeenCalled();
  });

  it('diz quem criou dentro da confirmação — quem apaga pode não ser quem criou', async () => {
    const user = userEvent.setup();
    render(<QuickRepliesSettings />);

    await user.click(screen.getByRole('button', { name: 'Excluir Saudação' }));

    expect(await screen.findByText(/criada por Paulo Andrade/i)).toBeInTheDocument();
  });

  it('só remove depois de confirmar', async () => {
    const user = userEvent.setup();
    render(<QuickRepliesSettings />);

    await user.click(screen.getByRole('button', { name: 'Excluir Saudação' }));
    await user.click(await screen.findByRole('button', { name: 'Excluir' }));

    expect(remover.mutateAsync).toHaveBeenCalledWith('r1');
  });

  it('cancelar fecha sem remover', async () => {
    const user = userEvent.setup();
    render(<QuickRepliesSettings />);

    await user.click(screen.getByRole('button', { name: 'Excluir Saudação' }));
    await user.click(await screen.findByRole('button', { name: 'Cancelar' }));

    expect(remover.mutateAsync).not.toHaveBeenCalled();
  });
});

describe('autoria na lista', () => {
  it('mostra quem criou', () => {
    render(<QuickRepliesSettings />);
    expect(screen.getByText('Criado por Paulo Andrade')).toBeInTheDocument();
  });

  it('acrescenta quem editou quando foi outra pessoa', () => {
    estado = {
      quickReplies: [
        resposta('r1', 'Saudação', 'Olá!', {
          updated_by_name: 'Helena Duarte',
          updated_at: '2026-08-25T10:00:00Z',
        }),
      ],
      isLoading: false,
    };
    render(<QuickRepliesSettings />);

    expect(
      screen.getByText('Criado por Paulo Andrade · Editado por Helena Duarte'),
    ).toBeInTheDocument();
  });

  it('não repete o nome quando quem editou foi quem criou', () => {
    estado = {
      quickReplies: [
        resposta('r1', 'Saudação', 'Olá!', { updated_at: '2026-08-25T10:00:00Z' }),
      ],
      isLoading: false,
    };
    render(<QuickRepliesSettings />);

    expect(screen.getByText('Criado por Paulo Andrade')).toBeInTheDocument();
  });

  it('degrada para um texto neutro quando o perfil não resolveu', () => {
    estado = {
      quickReplies: [
        resposta('r1', 'Saudação', 'Olá!', { created_by_name: null, updated_by_name: null }),
      ],
      isLoading: false,
    };
    render(<QuickRepliesSettings />);

    expect(screen.getByText('Criado pela Loja')).toBeInTheDocument();
  });
});

describe('criar e editar', () => {
  it('cria com nome e conteúdo', async () => {
    const user = userEvent.setup();
    render(<QuickRepliesSettings />);

    await user.click(screen.getByRole('button', { name: /Nova resposta/i }));
    await user.type(screen.getByLabelText('Nome'), 'Horário');
    await user.type(screen.getByLabelText('Mensagem'), 'Das 9h às 18h.');
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    expect(criar.mutateAsync).toHaveBeenCalledWith({
      name: 'Horário',
      content: 'Das 9h às 18h.',
    });
  });

  it('não deixa salvar com o nome em branco', async () => {
    const user = userEvent.setup();
    render(<QuickRepliesSettings />);

    await user.click(screen.getByRole('button', { name: /Nova resposta/i }));
    await user.type(screen.getByLabelText('Mensagem'), 'Só o corpo.');

    expect(screen.getByRole('button', { name: 'Criar' })).toBeDisabled();
  });

  it('abre a edição já preenchida com o que está salvo', async () => {
    const user = userEvent.setup();
    render(<QuickRepliesSettings />);

    await user.click(screen.getByRole('button', { name: 'Editar Saudação' }));

    expect(screen.getByLabelText('Nome')).toHaveValue('Saudação');
    expect(screen.getByLabelText('Mensagem')).toHaveValue('Olá {first_name}!');
  });
});

describe('busca', () => {
  it('filtra ignorando acento', async () => {
    const user = userEvent.setup();
    estado = {
      quickReplies: [
        resposta('r1', 'Saudação', 'Olá!'),
        resposta('r2', 'Horário', 'Das 9h às 18h.'),
      ],
      isLoading: false,
    };
    render(<QuickRepliesSettings />);

    await user.type(screen.getByLabelText('Buscar respostas rápidas'), 'saudacao');

    expect(screen.getByText('Saudação')).toBeInTheDocument();
    expect(screen.queryByText('Horário')).not.toBeInTheDocument();
  });
});

describe('estado vazio', () => {
  it('explica o que é e oferece criar a primeira', () => {
    estado = { quickReplies: [], isLoading: false };
    render(<QuickRepliesSettings />);

    expect(screen.getByText('Nenhuma resposta rápida ainda')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Criar a primeira/i })).toBeInTheDocument();
  });
});
