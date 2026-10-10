/**
 * Faturamento › Contas › Atendentes (superadmin): cada Loja com o uso e o
 * limite, as vagas extras editáveis, e (entrega 2) a cobrança da Conta — o
 * preço por atendente extra, o que a assinatura cobra, o aviso de 30 dias e a
 * sincronização depois de salvar as vagas.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mutateAsync, toastSuccess, toastError, toastWarning, getAttendantStatus, setAttendantPrice, syncAttendantItem } =
  vi.hoisted(() => ({
    mutateAsync: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
    toastWarning: vi.fn(),
    getAttendantStatus: vi.fn(),
    setAttendantPrice: vi.fn(),
    syncAttendantItem: vi.fn(),
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
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError, warning: toastWarning } }));
vi.mock('@/services/stripeService', () => ({
  stripeService: { getAttendantStatus, setAttendantPrice, syncAttendantItem },
}));

import { AttendantSeatsDialog, AVISO_30_DIAS, CONFIRMA_30_DIAS } from './AttendantSeatsDialog';

const CONTA = { id: 'aaaaaaaa-0000-4000-8000-000000000001', name: 'Conta Exemplo' };
const loja = (id: string, nome: string, ativos: number, pendentes: number, extra = 0): Vagas => ({
  store_id: id, store_name: nome, account_id: CONTA.id, incluidos: 2, extra, limite: 2 + extra,
  ativos, pendentes, usados: ativos + pendentes, livres: Math.max(2 + extra - ativos - pendentes, 0),
});

const status = (o: Record<string, unknown> = {}) => ({
  configured: true,
  productId: 'prod_FAKEatendente',
  priceCents: 4990,
  priceId: 'price_FAKEconta',
  concedidos: 1,
  cobrados: 1,
  subscription: { state: 'live', status: 'active' },
  item: { quantity: 1, priceId: 'price_FAKEconta', unitAmount: 4990 },
  priceChangeNeedsNotice: true,
  ...o,
});

function abrir() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AttendantSeatsDialog conta={CONTA} onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}
const linhaDa = (nome: string) =>
  within(screen.getByRole('table', { name: 'Vagas de atendente por Loja' }))
    .getAllByRole('row')
    .find((r) => within(r).queryByText(nome)) as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  hookArgs.length = 0;
  seats = [loja('l1', 'Matriz', 1, 1), loja('l2', 'Filial Norte', 0, 0, 1)];
  mutateAsync.mockResolvedValue({ limite: 3, usados: 2, changed: true });
  getAttendantStatus.mockResolvedValue(status());
  syncAttendantItem.mockResolvedValue({ state: 'synced', concedidos: 2, cobrados: 2, subscriptionStatus: 'active', ops: ['set_quantity'], message: 'Cobrança em dia: 2 atendentes extras.' });
  setAttendantPrice.mockResolvedValue({ changed: true, priceId: 'price_FAKEnovo', priceCents: 5990, archivedPrevious: true, sync: { state: 'synced', concedidos: 1, cobrados: 1, subscriptionStatus: 'active', ops: ['swap_price'], message: 'Cobrança em dia: 1 atendente extra.' } });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('vagas por Loja', () => {
  it('lê as Lojas da Conta aberta', async () => {
    abrir();
    expect(hookArgs.at(-1)).toEqual({ tenantId: CONTA.id, enabled: true });
    expect(screen.getByText('Atendentes — Conta Exemplo')).toBeInTheDocument();
    await waitFor(() => expect(getAttendantStatus).toHaveBeenCalledWith(CONTA.id));
  });

  it('mostra o uso, o limite, os pendentes e a Loja cheia', () => {
    abrir();
    const matriz = linhaDa('Matriz');
    expect(within(matriz).getByTestId('uso-l1')).toHaveTextContent('2 de 2');
    expect(within(matriz).getByText('(1 convite pendente)')).toBeInTheDocument();
    expect(within(matriz).getByText('Cheia')).toBeInTheDocument();
    expect(within(linhaDa('Filial Norte')).getByTestId('uso-l2')).toHaveTextContent('0 de 3');
  });

  it('salvar as vagas grava, e em seguida sincroniza a cobrança', async () => {
    const user = userEvent.setup();
    abrir();
    await user.type(screen.getByLabelText('Observação (opcional, vai para o histórico)'), 'combinado por e-mail');
    const campo = within(linhaDa('Matriz')).getByLabelText('Vagas extras de Matriz');
    await user.clear(campo);
    await user.type(campo, '1');
    await user.click(within(linhaDa('Matriz')).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ storeId: 'l1', extra: 1, note: 'combinado por e-mail' }));
    expect(toastSuccess).toHaveBeenCalledWith('Matriz agora tem 3 vagas de atendente.');
    await waitFor(() => expect(syncAttendantItem).toHaveBeenCalledWith(CONTA.id));
    expect(await screen.findByTestId('ultimo-resultado')).toHaveTextContent('Cobrança em dia: 2 atendentes extras.');
  });

  it('sem mudança nas vagas, não sincroniza', async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ limite: 2, usados: 2, changed: false });
    abrir();
    const campo = within(linhaDa('Matriz')).getByLabelText('Vagas extras de Matriz');
    await user.clear(campo);
    await user.type(campo, '1');
    await user.click(within(linhaDa('Matriz')).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(syncAttendantItem).not.toHaveBeenCalled();
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
    expect(syncAttendantItem).not.toHaveBeenCalled();
  });

  it('Conta sem Lojas diz isso', () => {
    seats = [];
    abrir();
    expect(screen.getByText('Esta Conta ainda não tem Lojas.')).toBeInTheDocument();
  });
});

describe('cobrança da Conta', () => {
  it('mostra o preço atual e o que a assinatura cobra', async () => {
    abrir();
    expect(await screen.findByLabelText('Preço por atendente extra (R$ por mês)')).toHaveValue('49,90');
    expect(screen.getByTestId('resumo-cobranca')).toHaveTextContent(/1 atendente\(s\) extra\(s\) a R\$\s?49,90\/mês/);
    expect(screen.getByTestId('resumo-cobranca')).toHaveTextContent(/proporcional na próxima fatura/);
  });

  it('Conta que já paga extras: aviso de 30 dias e confirmação antes de trocar o preço', async () => {
    const user = userEvent.setup();
    abrir();
    expect(await screen.findByTestId('aviso-30-dias')).toHaveTextContent(AVISO_30_DIAS);
    const campo = screen.getByLabelText('Preço por atendente extra (R$ por mês)');
    await user.clear(campo);
    await user.type(campo, '59,90');
    await user.click(screen.getByRole('button', { name: 'Salvar preço' }));
    expect(window.confirm).toHaveBeenCalledWith(CONFIRMA_30_DIAS);
    await waitFor(() => expect(setAttendantPrice).toHaveBeenCalledWith(CONTA.id, 5990, undefined));
  });

  it('sem confirmar o aviso, o preço não é trocado', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    abrir();
    const campo = await screen.findByLabelText('Preço por atendente extra (R$ por mês)');
    await user.clear(campo);
    await user.type(campo, '59,90');
    await user.click(screen.getByRole('button', { name: 'Salvar preço' }));
    expect(setAttendantPrice).not.toHaveBeenCalled();
  });

  it('primeiro preço (ninguém paga ainda): sem aviso nem confirmação', async () => {
    const user = userEvent.setup();
    getAttendantStatus.mockResolvedValue(status({ priceCents: null, priceId: null, item: null, priceChangeNeedsNotice: false, concedidos: 0 }));
    abrir();
    const campo = await screen.findByLabelText('Preço por atendente extra (R$ por mês)');
    expect(screen.queryByTestId('aviso-30-dias')).toBeNull();
    await user.type(campo, '39,90');
    await user.click(screen.getByRole('button', { name: 'Salvar preço' }));
    expect(window.confirm).not.toHaveBeenCalled();
    await waitFor(() => expect(setAttendantPrice).toHaveBeenCalledWith(CONTA.id, 3990, undefined));
  });

  it('acesso manual, sem assinatura: diz que as vagas valem sem cobrança', async () => {
    getAttendantStatus.mockResolvedValue(status({ subscription: { state: 'none', status: null }, item: null, priceChangeNeedsNotice: false }));
    abrir();
    expect(await screen.findByTestId('resumo-cobranca')).toHaveTextContent(/acesso manual\): as vagas extras valem sem cobrança/);
  });

  it('teste grátis: diz que nada é cobrado até o fim do teste', async () => {
    getAttendantStatus.mockResolvedValue(status({ subscription: { state: 'live', status: 'trialing' } }));
    abrir();
    expect(await screen.findByTestId('resumo-cobranca')).toHaveTextContent(/nada é cobrado até o fim do teste/);
  });

  it('conta antiga do Stripe: nada é mudado por aqui', async () => {
    getAttendantStatus.mockResolvedValue(status({ subscription: { state: 'legacy', status: 'active' }, item: null, priceChangeNeedsNotice: false }));
    abrir();
    expect(await screen.findByTestId('resumo-cobranca')).toHaveTextContent(/conta antiga do Stripe/);
  });

  it('cobrado diferente do concedido: aviso e sincronização manual', async () => {
    const user = userEvent.setup();
    getAttendantStatus.mockResolvedValue(status({ concedidos: 3, item: { quantity: 1, priceId: 'price_FAKEconta', unitAmount: 4990 } }));
    abrir();
    expect(await screen.findByText(/Concedido nas Lojas: 3\. Cobrado na assinatura: 1\./)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sincronizar cobrança' }));
    await waitFor(() => expect(syncAttendantItem).toHaveBeenCalledWith(CONTA.id));
  });

  it('produto não configurado: preço travado e o motivo à vista', async () => {
    getAttendantStatus.mockResolvedValue(status({ configured: false, priceChangeNeedsNotice: false }));
    abrir();
    expect(await screen.findByTestId('resumo-cobranca')).toHaveTextContent(/ainda não está ligada/);
    expect(screen.getByLabelText('Preço por atendente extra (R$ por mês)')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sincronizar cobrança' })).toBeDisabled();
  });
});
