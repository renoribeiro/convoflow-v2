import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockInvoke, mockRpc, mockToast } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockRpc: vi.fn(),
  mockToast: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: mockInvoke }, rpc: mockRpc },
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));

import { ApiAddonCard } from './ApiAddonCard';

let estado: Record<string, unknown> = { ativo: false, motivo: 'desligado', ate: null };

const renderizar = (props: Partial<React.ComponentProps<typeof ApiAddonCard>> = {}) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ApiAddonCard contaId="conta-1" status="active" temAssinatura acessoManual={false} liberado {...props} />
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  estado = { ativo: false, motivo: 'desligado', ate: null };
  mockRpc.mockImplementation(async () => ({ data: [estado], error: null }));
});

describe('ApiAddonCard', () => {
  it('não desenha nem consulta nada com a API não liberada', () => {
    const { container } = renderizar({ liberado: false });
    expect(container).toBeEmptyDOMElement();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('no teste grátis: texto e botão travado', async () => {
    renderizar({ status: 'trialing' });
    expect(await screen.findByText('Disponível depois do teste grátis')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ligar a API/ })).toBeDisabled();
  });

  it('acesso manual: texto do ConvoFlow e nenhum botão', async () => {
    estado = { ativo: true, motivo: 'manual', ate: null };
    renderizar({ status: null, temAssinatura: false, acessoManual: true });
    expect(await screen.findByText('A API desta Conta é liberada pelo ConvoFlow.')).toBeInTheDocument();
    expect(await screen.findByText('Ligada')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('sem assinatura', async () => {
    renderizar({ status: null, temAssinatura: false });
    expect(await screen.findByText('Assine o plano para contratar a API.')).toBeInTheDocument();
  });

  it('cartão atrasado', async () => {
    renderizar({ status: 'past_due' });
    expect(await screen.findByText('Atualize o cartão antes de contratar a API.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ligar a API/ })).toBeDisabled();
  });

  it('desligada: confirma com o valor e chama a função com ligar:true', async () => {
    mockInvoke.mockResolvedValue({
      data: { success: true, cobrado: true, ate: null, estado: { ativo: true, motivo: 'pago', ate: null } },
      error: null,
    });
    renderizar();
    const botao = await screen.findByRole('button', { name: 'Ligar a API por R$ 99,90/mês' });
    await waitFor(() => expect(botao).toBeEnabled());
    fireEvent.click(botao);
    expect(await screen.findByTestId('api-confirmacao')).toHaveTextContent(
      'Você contrata a API e integrações por R$ 99,90 por mês.',
    );
    expect(mockInvoke).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Contratar por R$ 99,90/mês' }));
    });
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('update-api-addon', { body: { ligar: true } }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'API ligada' })));
  });

  it('ligada: Desligar mostra o texto sem crédito e chama com ligar:false', async () => {
    estado = { ativo: true, motivo: 'pago', ate: null };
    mockInvoke.mockResolvedValue({
      data: {
        success: true,
        cobrado: false,
        ate: '2026-11-13T15:00:00Z',
        estado: { ativo: true, motivo: 'ate_fim_do_ciclo', ate: null },
      },
      error: null,
    });
    renderizar();
    expect(await screen.findByText('Ligada')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Desligar a API' }));
    expect(await screen.findByTestId('api-confirmacao')).toHaveTextContent(
      'O valor sai da próxima fatura, sem crédito. As chaves seguem funcionando até o fim do mês já pago e depois ficam suspensas (não são apagadas).',
    );
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Desligar a API' }).at(-1)!);
    });
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('update-api-addon', { body: { ligar: false } }));
  });

  it('até o fim do ciclo: mostra a data e o religar sem cobrança extra', async () => {
    estado = { ativo: true, motivo: 'ate_fim_do_ciclo', ate: '2026-11-13T15:00:00Z' };
    renderizar();
    expect(await screen.findByText('Desligada. As chaves funcionam até 13/11/2026.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ligar de novo' }));
    expect(await screen.findByTestId('api-confirmacao')).toHaveTextContent(
      'Como este mês já está pago, religar agora não gera cobrança extra.',
    );
  });

  it('erro do servidor aparece como veio', async () => {
    mockInvoke.mockResolvedValue({ data: { error: 'A API ainda não está disponível.' }, error: null });
    renderizar();
    const botao = await screen.findByRole('button', { name: 'Ligar a API por R$ 99,90/mês' });
    await waitFor(() => expect(botao).toBeEnabled());
    fireEvent.click(botao);
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Contratar por R$ 99,90/mês' }));
    });
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'A API ainda não está disponível.', variant: 'destructive' }),
      ),
    );
  });
});
