/**
 * "Salvar como resposta rápida" a partir de uma mensagem já enviada.
 *
 * É por aqui que a biblioteca de uma Loja realmente nasce: o atendente percebe
 * que digitou a mesma coisa pela terceira vez. O que este arquivo garante é que
 * o caminho produz uma resposta USÁVEL — corpo preenchido a partir da mensagem,
 * nome dado pela pessoa, e nada é salvo enquanto faltar um dos dois.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const criar = { mutateAsync: vi.fn(), isPending: false };

vi.mock('@/hooks/useQuickReplies', () => ({
  useQuickReplies: () => ({ criar }),
}));

const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: (...a: unknown[]) => toastSuccess(...a), error: vi.fn() },
}));

import { SaveQuickReplyDialog } from './SaveQuickReplyDialog';

const MENSAGEM = 'Atendemos de segunda a sexta, das 9h às 18h.';
const onOpenChange = vi.fn();

const renderDialog = (initialContent = MENSAGEM) =>
  render(
    <SaveQuickReplyDialog open onOpenChange={onOpenChange} initialContent={initialContent} />,
  );

beforeEach(() => {
  criar.mutateAsync.mockReset().mockResolvedValue({});
  toastSuccess.mockReset();
  onOpenChange.mockReset();
});

describe('prefill', () => {
  it('vem com o corpo da mensagem enviada', () => {
    renderDialog();
    expect(screen.getByLabelText('Mensagem')).toHaveValue(MENSAGEM);
  });

  it('começa sem nome — é o único campo que a pessoa precisa preencher', () => {
    renderDialog();
    expect(screen.getByLabelText('Nome')).toHaveValue('');
  });

  it('deixa o corpo editável, para trocar o nome do cliente por uma variável', async () => {
    const user = userEvent.setup();
    renderDialog('Oi Helena, tudo certo?');

    const corpo = screen.getByLabelText('Mensagem');
    await user.clear(corpo);
    // "{{" é como o userEvent digita uma chave literal: "{" sozinho é sintaxe
    // de tecla especial dele, não texto.
    await user.type(corpo, 'Oi {{first_name}, tudo certo?');

    expect(corpo).toHaveValue('Oi {first_name}, tudo certo?');
  });
});

describe('salvar', () => {
  it('produz uma resposta usável: nome dado + corpo da mensagem', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText('Nome'), 'Horário');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(criar.mutateAsync).toHaveBeenCalledWith({
      name: 'Horário',
      content: MENSAGEM,
    });
  });

  it('avisa que já dá para usar no compositor', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText('Nome'), 'Horário');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(toastSuccess).toHaveBeenCalledWith(
      expect.stringContaining('disponível no botão de raio'),
    );
  });

  it('fecha sozinho depois de salvar', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText('Nome'), 'Horário');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('não salva sem nome', async () => {
    renderDialog();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
  });

  it('não salva com o corpo vazio', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText('Nome'), 'Horário');
    await user.clear(screen.getByLabelText('Mensagem'));

    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
  });
});
