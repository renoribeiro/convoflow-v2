/**
 * O quadro "Teste grátis e cadastro pelo site" da tela Limites de uso
 * (sessão 2, 2026-11-09): mostra os números do banco e salva só o que mudou,
 * por public.definir_limites_da_plataforma.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockRpc, mockToast } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockToast: { success: vi.fn(), error: vi.fn() },
}));

let linha: { data: unknown; error: unknown } = { data: null, error: null };

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: mockRpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => linha }) }) }),
  },
}));
vi.mock('sonner', () => ({ toast: mockToast }));

import { LimitesDoTesteCard } from './LimitesDoTesteCard';
import { LIMITES_PADRAO } from '@/lib/billing/limitesDoTesteTexto';

const renderizar = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <LimitesDoTesteCard />
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  linha = { data: { id: true, ...LIMITES_PADRAO, atualizado_em: null }, error: null };
  mockRpc.mockResolvedValue({ data: null, error: null });
});

describe('LimitesDoTesteCard', () => {
  it('mostra os sete números do banco, e Salvar começa travado', async () => {
    renderizar();
    expect(await screen.findByLabelText('Lojas por Conta')).toHaveValue(LIMITES_PADRAO.teste_lojas);
    expect(screen.getByLabelText('Números de WhatsApp por Conta')).toHaveValue(LIMITES_PADRAO.teste_numeros);
    expect(screen.getByLabelText('Desses, por QR Code')).toHaveValue(LIMITES_PADRAO.teste_numeros_qr);
    expect(screen.getByLabelText('Mensagens enviadas por dia')).toHaveValue(LIMITES_PADRAO.teste_mensagens_dia);
    expect(screen.getByLabelText('Contatos por disparo de campanha')).toHaveValue(LIMITES_PADRAO.teste_contatos_campanha);
    expect(screen.getByLabelText('Cadastros por hora')).toHaveValue(LIMITES_PADRAO.cadastro_por_hora);
    expect(screen.getByLabelText('Cadastros por dia')).toHaveValue(LIMITES_PADRAO.cadastro_por_dia);
    expect(screen.getByRole('button', { name: 'Salvar limites' })).toBeDisabled();
  });

  it('salva só o campo que mudou', async () => {
    renderizar();
    fireEvent.change(await screen.findByLabelText('Números de WhatsApp por Conta'), { target: { value: '3' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Salvar limites' }));
    });
    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('definir_limites_da_plataforma', { p_limites: { teste_numeros: 3 } }),
    );
    expect(mockToast.success).toHaveBeenCalled();
  });

  it('número que não é inteiro não vai ao banco', async () => {
    renderizar();
    fireEvent.change(await screen.findByLabelText('Mensagens enviadas por dia'), { target: { value: '2.5' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Salvar limites' }));
    });
    await waitFor(() => expect(mockToast.error).toHaveBeenCalled());
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('o banco recusou (ex.: QR Code acima do total) → o aviso, e nada muda', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '23514', message: 'check' } });
    renderizar();
    fireEvent.change(await screen.findByLabelText('Desses, por QR Code'), { target: { value: '9' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Salvar limites' }));
    });
    await waitFor(() => expect(mockToast.error).toHaveBeenCalled());
    expect(mockToast.success).not.toHaveBeenCalled();
  });

  it('sem a linha → avisa que não carregou', async () => {
    linha = { data: null, error: { message: 'rls' } };
    renderizar();
    expect(await screen.findByText(/Não foi possível carregar os limites/)).toBeInTheDocument();
  });
});
