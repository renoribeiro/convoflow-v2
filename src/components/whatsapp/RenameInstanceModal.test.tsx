import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockFrom, mockRpc, mockToast } = vi.hoisted(() => ({ mockFrom: vi.fn(), mockRpc: vi.fn(), mockToast: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mockFrom, rpc: mockRpc } }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }), toast: mockToast }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { RenameInstanceModal } from './RenameInstanceModal';

/**
 * Renomear só mexe em `name`, e só pela função `renomear_numero`
 * (20261126000002): ela aceita o Gerente em qualquer Loja da Conta, recusa
 * alto quem não pode e nunca toca a `instance_key`, que é a identidade da
 * instância no servidor Evolution e nos webhooks. Se um dia alguém voltar a
 * gravar direto na tabela, o primeiro teste cai.
 */

let rpcResult: { data: string | null; error: { message: string; code?: string } | null } = {
  data: 'Vendas',
  error: null,
};

function renderModal(props: Partial<React.ComponentProps<typeof RenameInstanceModal>> = {}) {
  const queryClient = new QueryClient();
  const onOpenChange = vi.fn();
  const onSuccess = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <RenameInstanceModal
        open
        onOpenChange={onOpenChange}
        instance={{ id: 'inst-1', name: 'Vendas Teste', instance_key: 'vendas_001' }}
        onSuccess={onSuccess}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { onOpenChange, onSuccess };
}

beforeEach(() => {
  vi.clearAllMocks();
  rpcResult = { data: 'Vendas', error: null };
  mockRpc.mockImplementation(() => Promise.resolve(rpcResult));
});

describe('RenameInstanceModal', () => {
  it('grava só o nome, pela função renomear_numero, nunca direto na tabela', async () => {
    const { onOpenChange, onSuccess } = renderModal();

    fireEvent.change(screen.getByLabelText('Nome do número'), { target: { value: 'Vendas' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(mockRpc).toHaveBeenCalledWith('renomear_numero', { p_instance_id: 'inst-1', p_nome: 'Vendas' });
    expect(mockFrom).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('mostra a chave técnica, mas não deixa editar', () => {
    renderModal();
    expect(screen.getByText('vendas_001')).toBeInTheDocument();
    expect(screen.queryByLabelText(/chave/i)).toBeNull();
  });

  it('Salvar fica desabilitado sem mudança', () => {
    renderModal();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
  });

  it('aplica a mesma regra de nome da criação (mínimo 3 caracteres)', async () => {
    renderModal();
    fireEvent.change(screen.getByLabelText('Nome do número'), { target: { value: 'ab' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText(/pelo menos 3 caracteres/i)).toBeInTheDocument();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('barra nome repetido na mesma Conta, ignorando maiúsculas e espaços', async () => {
    renderModal({ siblingNames: ['Suporte'] });
    fireEvent.change(screen.getByLabelText('Nome do número'), { target: { value: '  suporte ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText(/Já existe um número com esse nome/i)).toBeInTheDocument();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('quando o banco recusa (42501), diz "não pode renomear" em vez de fingir sucesso', async () => {
    rpcResult = { data: null, error: { message: 'Você não pode renomear este número.', code: '42501' } };
    const { onSuccess } = renderModal();

    fireEvent.change(screen.getByLabelText('Nome do número'), { target: { value: 'Vendas' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'destructive',
          description: expect.stringMatching(/não pode renomear/i),
        }),
      ),
    );
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('Conta sem acesso: mostra a frase que o servidor mandou', async () => {
    const frase = 'A Conta está sem acesso, então esta ação não foi feita. Fale com o responsável pela Conta.';
    rpcResult = { data: null, error: { message: frase, code: 'CF403' } };
    const { onSuccess } = renderModal();

    fireEvent.change(screen.getByLabelText('Nome do número'), { target: { value: 'Vendas' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive', description: frase })),
    );
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
