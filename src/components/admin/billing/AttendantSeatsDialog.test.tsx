/**
 * Faturamento › Contas › Atendentes (superadmin): cada Loja com o uso e o
 * limite, e as vagas extras editáveis. Nada de preço (entrega 1).
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mutateAsync, toastSuccess, toastError } = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

type Vagas = {
  store_id: string; store_name: string; account_id: string; incluidos: number; extra: number;
  limite: number; ativos: number; pendentes: number; usados: number; livres: number;
};
let seats: Vagas[] = [];
const hookArgs: unknown[] = [];

vi.mock('@/hooks/useStoreAttendantSeats', () => ({
  useStoreAttendantSeats: (options: unknown) => {
    hookArgs.push(options);
    return { seats, byStore: {}, isLoading: false, error: null };
  },
  useSetStoreExtraAttendants: () => ({ mutateAsync, isPending: false }),
}));
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError } }));

import { AttendantSeatsDialog } from './AttendantSeatsDialog';

const CONTA = { id: 'aaaaaaaa-0000-4000-8000-000000000001', name: 'Conta Exemplo' };
const loja = (id: string, nome: string, ativos: number, pendentes: number, extra = 0): Vagas => ({
  store_id: id, store_name: nome, account_id: CONTA.id, incluidos: 2, extra, limite: 2 + extra,
  ativos, pendentes, usados: ativos + pendentes, livres: Math.max(2 + extra - ativos - pendentes, 0),
});

const abrir = () => render(<AttendantSeatsDialog conta={CONTA} onOpenChange={() => {}} />);
const linhaDa = (nome: string) =>
  within(screen.getByRole('table', { name: 'Vagas de atendente por Loja' }))
    .getAllByRole('row')
    .find((r) => within(r).queryByText(nome)) as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  hookArgs.length = 0;
  seats = [loja('l1', 'Matriz', 1, 1), loja('l2', 'Filial Norte', 0, 0, 1)];
  mutateAsync.mockResolvedValue({ limite: 3, usados: 2, changed: true });
});

describe('janela de vagas de atendente', () => {
  it('lê as Lojas da Conta aberta', () => {
    abrir();
    expect(hookArgs.at(-1)).toEqual({ tenantId: CONTA.id, enabled: true });
    expect(screen.getByText('Atendentes — Conta Exemplo')).toBeInTheDocument();
  });

  it('mostra o uso, o limite, os pendentes e a Loja cheia', () => {
    abrir();
    const matriz = linhaDa('Matriz');
    expect(within(matriz).getByTestId('uso-l1')).toHaveTextContent('2 de 2');
    expect(within(matriz).getByText('(1 convite pendente)')).toBeInTheDocument();
    expect(within(matriz).getByText('Cheia')).toBeInTheDocument();
    expect(within(linhaDa('Filial Norte')).getByTestId('uso-l2')).toHaveTextContent('0 de 3');
    expect(within(linhaDa('Filial Norte')).queryByText('Cheia')).toBeNull();
  });

  it('não mostra preço nenhum', () => {
    abrir();
    expect(screen.queryByText(/R\$/)).toBeNull();
    expect(screen.queryByText(/preço|valor/i)).toBeNull();
  });

  it('Salvar só acende quando o número muda, e grava o número com a observação', async () => {
    const user = userEvent.setup();
    abrir();
    const matriz = linhaDa('Matriz');
    const salvar = within(matriz).getByRole('button', { name: 'Salvar' });
    expect(salvar).toBeDisabled();

    await user.type(screen.getByLabelText('Observação (opcional, vai para o histórico)'), 'combinado por e-mail');
    const campo = within(matriz).getByLabelText('Vagas extras de Matriz');
    await user.clear(campo);
    await user.type(campo, '1');
    expect(salvar).not.toBeDisabled();
    await user.click(salvar);

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ storeId: 'l1', extra: 1, note: 'combinado por e-mail' }),
    );
    expect(toastSuccess).toHaveBeenCalledWith('Matriz agora tem 3 vagas de atendente.');
  });

  it('número fora de 0 a 100 não vai para o servidor', async () => {
    const user = userEvent.setup();
    abrir();
    const campo = within(linhaDa('Matriz')).getByLabelText('Vagas extras de Matriz');
    await user.clear(campo);
    await user.type(campo, '101');
    await user.click(within(linhaDa('Matriz')).getByRole('button', { name: 'Salvar' }));
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith('Informe de 0 a 100 vagas extras.');
  });

  it('a recusa do servidor (abaixo do uso) aparece como ele escreveu', async () => {
    const user = userEvent.setup();
    const recusa = 'Esta Loja usa 2 vagas de atendente: o limite não pode ficar em 1. Suspenda ou exclua alguém antes.';
    mutateAsync.mockRejectedValue(new Error(recusa));
    seats = [loja('l1', 'Matriz', 1, 1, 1)];
    abrir();
    const campo = within(linhaDa('Matriz')).getByLabelText('Vagas extras de Matriz');
    await user.clear(campo);
    await user.type(campo, '0');
    await user.click(within(linhaDa('Matriz')).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(recusa));
  });

  it('Conta sem Lojas diz isso', () => {
    seats = [];
    abrir();
    expect(screen.getByText('Esta Conta ainda não tem Lojas.')).toBeInTheDocument();
  });
});
