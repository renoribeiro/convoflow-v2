import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockFrom, mockToast } = vi.hoisted(() => ({ mockFrom: vi.fn(), mockToast: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mockFrom } }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }), toast: mockToast }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { RenameInstanceModal } from './RenameInstanceModal';

/**
 * Renomear só mexe em `name`. A `instance_key` é a identidade da instância no
 * servidor Evolution e nos webhooks — se um dia alguém "melhorar" o modal para
 * editá-la, o primeiro teste cai.
 */

let updatePayload: Record<string, unknown> | null = null;
let updateResult: { data: { id: string } | null; error: { message: string } | null } = {
  data: { id: 'inst-1' },
  error: null,
};

function stubUpdate() {
  updatePayload = null;
  mockFrom.mockImplementation(() => {
    const chain: any = {};
    chain.update = vi.fn((payload: Record<string, unknown>) => {
      updatePayload = payload;
      return chain;
    });
    chain.eq = vi.fn(() => chain);
    chain.select = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(() => Promise.resolve(updateResult));
    return chain;
  });
}

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
  updateResult = { data: { id: 'inst-1' }, error: null };
  stubUpdate();
});

describe('RenameInstanceModal', () => {
  it('grava só o nome — nunca a instance_key', async () => {
    const { onOpenChange, onSuccess } = renderModal();

    fireEvent.change(screen.getByLabelText('Nome da Instância'), { target: { value: 'Vendas' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(updatePayload).toMatchObject({ name: 'Vendas' });
    expect(updatePayload).not.toHaveProperty('instance_key');
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
    fireEvent.change(screen.getByLabelText('Nome da Instância'), { target: { value: 'ab' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText(/pelo menos 3 caracteres/i)).toBeInTheDocument();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('barra nome repetido na mesma Conta, ignorando maiúsculas e espaços', async () => {
    renderModal({ siblingNames: ['Suporte'] });
    fireEvent.change(screen.getByLabelText('Nome da Instância'), { target: { value: '  suporte ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText(/Já existe uma instância com esse nome/i)).toBeInTheDocument();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('quando o RLS descarta a linha, diz "sem permissão" em vez de fingir sucesso', async () => {
    // PostgREST devolve 204 e data nulo quando a policy de UPDATE não casa —
    // sem o .select() a tela diria "renomeado" sem ter renomeado.
    updateResult = { data: null, error: null };
    const { onSuccess } = renderModal();

    fireEvent.change(screen.getByLabelText('Nome da Instância'), { target: { value: 'Vendas' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'destructive',
          description: expect.stringMatching(/permissão/i),
        }),
      ),
    );
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
