import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockRpc, mockToast, estado } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockToast: vi.fn(),
  estado: { config: null as Record<string, unknown> | null, historico: [] as Record<string, unknown>[] },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: mockRpc,
    from: (tabela: string) => {
      const b: any = {
        select: () => b,
        order: () => b,
        limit: () => b,
        maybeSingle: async () => ({ data: estado.config, error: null }),
        then: (res: (v: unknown) => unknown) =>
          Promise.resolve({ data: tabela === 'nfse_config_historico' ? estado.historico : null, error: null }).then(res),
      };
      return b;
    },
  },
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));

import { NotaFiscalConfig, lerPercentual } from '@/components/admin/billing/NotaFiscalConfig';

const renderizar = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <NotaFiscalConfig />
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  estado.config = {
    id: true, p_tot_trib_sn: 6, ambiente_ativo: 'restrita',
    certificado_valido_ate: new Date(Date.now() + 10 * 86_400_000).toISOString(),
    prefeitura_emissor_nacional: false, prefeitura_lida_em: '2026-10-15T12:00:00Z', diario_rodado_em: null,
    atualizado_em: '2026-10-15T12:00:00Z',
  };
  estado.historico = [
    { id: 2, campo: 'p_tot_trib_sn', valor_anterior: '6.00', valor_novo: '15.50', alterado_por: null, alterado_por_nome: 'Pessoa Inventada', alterado_em: '2026-10-14T12:00:00Z' },
  ];
});

describe('lerPercentual', () => {
  it('aceita vírgula e até duas casas, recusa o resto', () => {
    expect(lerPercentual('6,00')).toBe(6);
    expect(lerPercentual('15.5')).toBe(15.5);
    expect(lerPercentual('100')).toBeNull();
    expect(lerPercentual('6,005')).toBeNull();
    expect(lerPercentual('abc')).toBeNull();
    expect(lerPercentual('')).toBeNull();
  });
});

describe('NotaFiscalConfig', () => {
  it('mostra ambiente de teste, aviso do certificado, Fortaleza e o histórico', async () => {
    renderizar();
    expect(await screen.findByText(/Ambiente de teste do governo: notas sem validade, os clientes ainda não veem/)).toBeInTheDocument();
    expect(screen.getByTestId('nfse-certificado')).toHaveTextContent(/Vence em \d+ dia/);
    expect(screen.getByTestId('nfse-fortaleza')).toHaveTextContent('Desligada');
    await waitFor(() => expect(screen.getByTestId('nfse-historico')).toHaveTextContent('6,00% → 15,50% · Pessoa Inventada'));
  });

  it('salva pelo RPC com o número lido e avisa', async () => {
    mockRpc.mockResolvedValue({ data: 15.5, error: null });
    const user = userEvent.setup();
    renderizar();
    const campo = await screen.findByLabelText(/Percentual de tributos do Simples/);
    await waitFor(() => expect(campo).toHaveValue('6,00'));
    await user.clear(campo);
    await user.type(campo, '15,50');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('nfse_definir_p_tot_trib_sn', { p_valor: 15.5 }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Percentual salvo' })));
  });

  it('valor inválido trava o botão; erro do servidor vira toast', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Só o superadmin altera o percentual.' } });
    const user = userEvent.setup();
    renderizar();
    const campo = await screen.findByLabelText(/Percentual de tributos do Simples/);
    await waitFor(() => expect(campo).toHaveValue('6,00'));
    await user.clear(campo);
    await user.type(campo, '100');
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    await user.clear(campo);
    await user.type(campo, '7');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'Só o superadmin altera o percentual.', variant: 'destructive' }),
      ),
    );
  });
});
