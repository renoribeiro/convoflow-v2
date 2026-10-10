/**
 * Janela da Loja: criar (como sempre) e renomear (com `store`).
 *
 * O que precisa continuar verdadeiro no modo renomear:
 *  - abre com o nome atual e diz que muda só o nome;
 *  - manda o nome já normalizado para rename_store;
 *  - erro de validação ou do banco aparece DENTRO da janela, que não fecha;
 *  - nome igual ao atual não chama o banco.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { renomear, criar, toastSuccess } = vi.hoisted(() => ({
  renomear: vi.fn(),
  criar: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/hooks/useRenameStore', () => ({
  useRenameStore: () => ({ mutateAsync: renomear, isPending: false }),
}));
vi.mock('@/hooks/useCreateStore', () => ({
  useCreateStore: () => ({ mutateAsync: criar, isPending: false }),
}));
vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ setActiveTenant: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: toastSuccess } }));

import { NewStoreDialog } from './NewStoreDialog';

const LOJA = { id: 'bbbbbbbb-0000-4000-8000-000000000001', name: 'Matriz' };

const renderDialog = (props: Partial<React.ComponentProps<typeof NewStoreDialog>> = {}) => {
  const onOpenChange = vi.fn();
  render(<NewStoreDialog open onOpenChange={onOpenChange} {...props} />);
  return { onOpenChange };
};

const campo = () => screen.getByLabelText('Nome da loja') as HTMLInputElement;

beforeEach(() => {
  renomear.mockReset();
  criar.mockReset();
  toastSuccess.mockReset();
});

describe('NewStoreDialog — renomear', () => {
  it('abre com o nome atual, título e botão de renomear', () => {
    renderDialog({ store: LOJA });
    expect(screen.getByRole('heading', { name: 'Renomear Loja' })).toBeInTheDocument();
    expect(screen.getByText(/Muda só o nome/)).toBeInTheDocument();
    expect(campo().value).toBe('Matriz');
    expect(screen.getByRole('button', { name: 'Salvar nome' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Criar Loja' })).not.toBeInTheDocument();
  });

  it('salva o nome normalizado, fecha e avisa', async () => {
    renomear.mockResolvedValue({ id: LOJA.id, name: 'Matriz Centro', changed: true });
    const { onOpenChange } = renderDialog({ store: LOJA });

    await userEvent.clear(campo());
    await userEvent.type(campo(), '  Matriz   Centro ');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar nome' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(renomear).toHaveBeenCalledWith({ storeId: LOJA.id, name: 'Matriz Centro' });
    expect(criar).not.toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledWith('Loja renomeada.', {
      description: 'Agora ela se chama Matriz Centro.',
    });
  });

  it('nome inválido aparece na janela e não chama o banco', async () => {
    const { onOpenChange } = renderDialog({ store: LOJA });

    await userEvent.clear(campo());
    await userEvent.type(campo(), '---');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar nome' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'O nome da loja precisa ter ao menos uma letra ou um número.',
    );
    expect(renomear).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('recusa do banco aparece na janela, que continua aberta', async () => {
    renomear.mockRejectedValue(new Error('Você só pode renomear as Lojas da sua Conta.'));
    const { onOpenChange } = renderDialog({ store: LOJA });

    await userEvent.clear(campo());
    await userEvent.type(campo(), 'Outro Nome');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar nome' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Você só pode renomear as Lojas da sua Conta.',
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('nome igual ao atual (só espaços a mais) fecha sem chamar o banco', async () => {
    const { onOpenChange } = renderDialog({ store: LOJA });

    await userEvent.type(campo(), '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar nome' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(renomear).not.toHaveBeenCalled();
  });
});

describe('NewStoreDialog — criar continua como era', () => {
  it('sem `store`, é a criação: campo vazio e "Criar Loja"', async () => {
    criar.mockResolvedValue({ id: 'bbbbbbbb-0000-4000-8000-000000000009', name: 'Filial', slug: 'filial-x' });
    const { onOpenChange } = renderDialog();

    expect(screen.getByRole('heading', { name: 'Nova Loja' })).toBeInTheDocument();
    expect(campo().value).toBe('');

    await userEvent.type(campo(), 'Filial');
    await userEvent.click(screen.getByRole('button', { name: 'Criar Loja' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(criar).toHaveBeenCalledWith('Filial');
    expect(renomear).not.toHaveBeenCalled();
  });
});
