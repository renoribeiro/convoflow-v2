/**
 * A janela de confirmação do sistema (lote 2 do checkup): foco em Cancelar,
 * cancelar não faz nada, digitar o nome libera o botão, e a janela espera a
 * ação terminar antes de fechar.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmationDialog } from './ConfirmationDialog';

const montar = (props: Partial<React.ComponentProps<typeof ConfirmationDialog>> = {}) => {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  render(
    <ConfirmationDialog
      isOpen
      onClose={onClose}
      onConfirm={onConfirm}
      title="Desconectar o número?"
      description="O número Atendimento 1 para de receber mensagens."
      confirmText="Desconectar número"
      {...props}
    />,
  );
  return { onConfirm: (props.onConfirm as ReturnType<typeof vi.fn>) ?? onConfirm, onClose };
};

describe('ConfirmationDialog', () => {
  it('abre com o foco em Cancelar', async () => {
    montar();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus());
  });

  it('Cancelar não executa a ação', async () => {
    const { onConfirm, onClose } = montar();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('o botão diz a ação e executa', async () => {
    const { onConfirm, onClose } = montar();
    await userEvent.click(screen.getByRole('button', { name: 'Desconectar número' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('diz se dá para desfazer', () => {
    montar({ reversivel: false });
    expect(screen.getByText('Isto não pode ser desfeito.')).toBeInTheDocument();
  });

  it('com texto para digitar, o botão só libera com o nome certo', async () => {
    const { onConfirm } = montar({ textoParaDigitar: 'Conta Exemplo' });
    const botao = screen.getByRole('button', { name: 'Desconectar número' });
    expect(botao).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Para confirmar, digite/), 'Conta Errada');
    expect(botao).toBeDisabled();
    await userEvent.clear(screen.getByLabelText(/Para confirmar, digite/));
    await userEvent.type(screen.getByLabelText(/Para confirmar, digite/), 'Conta Exemplo');
    expect(botao).toBeEnabled();
    await userEvent.click(botao);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('espera a ação terminar e não fecha se ela falhar', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('falhou'));
    const { onClose } = montar({ onConfirm });
    await userEvent.click(screen.getByRole('button', { name: 'Desconectar número' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('confirmacao')).toBeInTheDocument();
  });
});
