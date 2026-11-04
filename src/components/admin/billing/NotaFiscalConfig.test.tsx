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
      let campo: unknown = null;
      const b: any = {
        select: () => b,
        eq: (c: string, v: unknown) => {
          if (c === 'campo') campo = v;
          return b;
        },
        order: () => b,
        limit: () => b,
        maybeSingle: async () => ({ data: estado.config, error: null }),
        then: (res: (v: unknown) => unknown) =>
          Promise.resolve({
            data: tabela === 'nfse_config_historico' ? estado.historico.filter((h) => campo === null || h.campo === campo) : null,
            error: null,
          }).then(res),
      };
      return b;
    },
  },
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));

import { NotaFiscalConfig, lerPercentual, situacaoDaLiberacao } from '@/components/admin/billing/NotaFiscalConfig';

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
    prefeitura_emissor_nacional: true, prefeitura_lida_em: '2026-10-15T12:00:00Z', diario_rodado_em: null,
    prefeitura_producao_emissor_nacional: false, prefeitura_producao_lida_em: '2026-10-15T12:00:00Z',
    prefeitura_producao_situacao_rfb: 1, emissao_producao_liberada: false,
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
    expect(screen.getByTestId('nfse-fortaleza')).toHaveTextContent('Dados de Fortaleza (produção)');
    expect(screen.getByTestId('nfse-fortaleza')).toHaveTextContent('Emissor Nacional: desligado (0)');
    expect(screen.getByTestId('nfse-fortaleza-rfb')).toHaveTextContent('Emissão padrão da Receita: 1');
    expect(screen.getByTestId('nfse-fortaleza')).toHaveTextContent('Só informação: não decide a emissão.');
    expect(screen.getByTestId('nfse-fortaleza-teste')).toHaveTextContent('No ambiente de teste: ligada');
    await waitFor(() => expect(screen.getByTestId('nfse-historico')).toHaveTextContent('6,00% → 15,50% · Pessoa Inventada'));
  });

  it('mostra a validade do certificado como o banco devolve (timestamptz do PostgREST) e sem aviso quando falta muito', async () => {
    // Só o relógio é falso (o dia da leitura real, 340 dias antes do vencimento): o teste não envelhece.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-16T22:00:00-03:00'));
    try {
      estado.config = { ...estado.config, certificado_valido_ate: '2027-09-21T12:16:42+00:00' };
      renderizar();
      const linha = await screen.findByTestId('nfse-certificado');
      expect(linha).toHaveTextContent('Certificado vale até');
      expect(linha).toHaveTextContent('21/09/2027');
      expect(linha).not.toHaveTextContent('Vence em');
      expect(linha).not.toHaveTextContent('—');
    } finally {
      vi.useRealTimers();
    }
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

describe('chave "Emissão em produção liberada"', () => {
  const chave = () => screen.findByRole('switch', { name: 'Emissão em produção liberada' });

  it('nasce desligada e diz o que isso quer dizer', async () => {
    renderizar();
    expect(await chave()).not.toBeChecked();
    expect(screen.getByTestId('nfse-liberacao')).toHaveTextContent('Desligada: nenhuma nota de cliente sai em produção.');
  });

  it('cada situação tem a sua frase', () => {
    expect(situacaoDaLiberacao(false, true)).toBe('Desligada: nenhuma nota de cliente sai em produção.');
    expect(situacaoDaLiberacao(true, false)).toBe('Ligada, mas o ambiente ainda é de teste: nenhuma nota de cliente sai até trocar o ambiente.');
    expect(situacaoDaLiberacao(true, true)).toBe('Ligada: as notas dos clientes saem em produção.');
  });

  it('ligar pede a confirmação com a palavra digitada; só então chama o servidor', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    const user = userEvent.setup();
    renderizar();
    await user.click(await chave());

    const janela = await screen.findByTestId('confirmacao');
    expect(janela).toHaveTextContent('Liberar a emissão em produção?');
    // Ambiente de teste: a janela não promete que a nota vai sair.
    expect(janela).toHaveTextContent('O ambiente ainda é de teste. Ligar agora não emite nada para os clientes');
    expect(janela).toHaveTextContent('Dá para desfazer: desligue a chave e as próximas notas param.');
    expect(mockRpc).not.toHaveBeenCalled();

    const botao = screen.getByRole('button', { name: 'Liberar emissão em produção' });
    expect(botao).toBeDisabled();
    await user.type(screen.getByLabelText(/Para confirmar, digite/), 'LIBERAR');
    expect(botao).toBeEnabled();
    await user.click(botao);

    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('nfse_definir_emissao_producao', { p_liberada: true }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Emissão em produção liberada' })));
    await waitFor(() => expect(screen.queryByTestId('confirmacao')).not.toBeInTheDocument());
  });

  it('com o ambiente em produção, a janela diz que as notas vão sair de verdade', async () => {
    estado.config = { ...estado.config, ambiente_ativo: 'producao' };
    const user = userEvent.setup();
    renderizar();
    await user.click(await chave());
    expect(await screen.findByTestId('confirmacao')).toHaveTextContent('O ConvoFlow passa a emitir notas com validade para os pagamentos dos clientes');
  });

  it('cancelar a janela não muda nada', async () => {
    const user = userEvent.setup();
    renderizar();
    await user.click(await chave());
    await user.click(await screen.findByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByTestId('confirmacao')).not.toBeInTheDocument());
    expect(mockRpc).not.toHaveBeenCalled();
    expect(await chave()).not.toBeChecked();
  });

  it('desligar confirma sem digitar e chama o servidor com false', async () => {
    estado.config = { ...estado.config, ambiente_ativo: 'producao', emissao_producao_liberada: true };
    mockRpc.mockResolvedValue({ data: false, error: null });
    const user = userEvent.setup();
    renderizar();
    expect(await chave()).toBeChecked();
    expect(screen.getByTestId('nfse-liberacao')).toHaveTextContent('Ligada: as notas dos clientes saem em produção.');
    await user.click(await chave());
    expect(await screen.findByTestId('confirmacao')).toHaveTextContent('Nenhuma nota nova sai em produção.');
    await user.click(screen.getByRole('button', { name: 'Desligar emissão em produção' }));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('nfse_definir_emissao_producao', { p_liberada: false }));
  });

  it('erro do servidor: aviso sem texto cru, e a janela continua aberta', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'permission denied for function x' } });
    const user = userEvent.setup();
    renderizar();
    await user.click(await chave());
    await user.type(await screen.findByLabelText(/Para confirmar, digite/), 'LIBERAR');
    await user.click(screen.getByRole('button', { name: 'Liberar emissão em produção' }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Não deu certo', description: 'A chave não mudou. Confira se você entrou como Superadmin e tente de novo.', variant: 'destructive' }),
      ),
    );
    expect(screen.getByTestId('confirmacao')).toBeInTheDocument();
  });

  it('mostra quem mudou por último e o histórico com o formato da chave', async () => {
    estado.historico = [
      { id: 3, campo: 'emissao_producao_liberada', valor_anterior: 'desligada', valor_novo: 'ligada', alterado_por: null, alterado_por_nome: 'Pessoa Inventada', alterado_em: '2026-11-05T12:00:00Z' },
      ...estado.historico,
    ];
    renderizar();
    await waitFor(() => expect(screen.getByTestId('nfse-liberacao-quem')).toHaveTextContent('Ligada por Pessoa Inventada em'));
    await waitFor(() => expect(screen.getByTestId('nfse-historico')).toHaveTextContent('Emissão em produção: desligada → ligada · Pessoa Inventada'));
    expect(screen.getByTestId('nfse-historico')).toHaveTextContent('6,00% → 15,50% · Pessoa Inventada');
  });

  it('sem mudança registrada, não inventa autor', async () => {
    renderizar();
    await chave();
    expect(screen.queryByTestId('nfse-liberacao-quem')).not.toBeInTheDocument();
  });
});
