import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockRpc, mockToast } = vi.hoisted(() => ({ mockRpc: vi.fn(), mockToast: vi.fn() }));

const LOJAS = [
  { id: 'conta-1', name: 'Grupo Exemplo', parent_tenant_id: null },
  { id: 'loja-1', name: 'Loja Centro', parent_tenant_id: 'conta-1' },
];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: mockRpc,
    from: () => ({
      select: () => ({ or: () => ({ order: async () => ({ data: LOJAS, error: null }) }) }),
    }),
  },
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ profile: { tenant_id: 'conta-1' } }),
}));

import { ApiKeysSettings } from './ApiKeysSettings';

const CHAVE_SECRETA = 'cf_live_FAKEFAKEFAKEFAKEFAKEFAKEFAKE0001';

let estado = { ativo: true, motivo: 'pago', ate: null as string | null };
let chaves: Record<string, unknown>[] = [];

const chave = (extra: Record<string, unknown> = {}) => ({
  id: 'k1',
  nome: 'Painel de vendas',
  prefixo: 'cf_live_AbCd',
  escopos: ['contatos', 'funil'],
  lojas: null,
  expira_em: '2026-12-31T12:00:00Z',
  criada_em: '2026-10-01T12:00:00Z',
  revogada_em: null,
  ultimo_uso_em: '2026-10-20T15:30:00Z',
  ultimo_uso_ip: '203.0.113.7',
  dono_nome: 'Fulana Exemplo',
  estado: 'ativa',
  ...extra,
});

const renderizar = (liberado = true) =>
  render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ApiKeysSettings liberado={liberado} />
      </QueryClientProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  estado = { ativo: true, motivo: 'pago', ate: null };
  chaves = [];
  mockRpc.mockImplementation(async (fn: string) => {
    if (fn === 'api_addon_estado') return { data: [estado], error: null };
    if (fn === 'api_chaves_listar') return { data: chaves, error: null };
    if (fn === 'api_chave_criar')
      return { data: [{ id: 'k2', chave: CHAVE_SECRETA, prefixo: 'cf_live_FAKE', expira_em: '2027-01-20T12:00:00Z' }], error: null };
    if (fn === 'api_chave_revogar') return { data: null, error: null };
    return { data: null, error: { message: `rpc inesperada ${fn}` } };
  });
});

const abrirCriacao = async () => {
  fireEvent.click(await screen.findByRole('button', { name: /Nova chave/ }));
  return screen.findByRole('dialog');
};

describe('criar chave', () => {
  it('mídia fica travada até ligar o histórico; desligar o histórico desliga a mídia', async () => {
    renderizar();
    const dlg = await abrirCriacao();
    const midia = within(dlg).getByRole('checkbox', { name: /Fotos, áudios e documentos/ });
    const historico = within(dlg).getByRole('checkbox', { name: /Histórico das conversas/ });
    expect(historico).not.toBeChecked();
    expect(midia).toBeDisabled();
    expect(within(dlg).getByRole('checkbox', { name: /Contatos/ })).toBeChecked();

    fireEvent.click(historico);
    expect(midia).toBeEnabled();
    fireEvent.click(midia);
    expect(midia).toBeChecked();
    fireEvent.click(historico);
    expect(midia).not.toBeChecked();
    expect(midia).toBeDisabled();
  });

  it('exige nome e a confirmação antes de chamar o servidor', async () => {
    renderizar();
    const dlg = await abrirCriacao();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Criar chave' }));
    expect(await within(dlg).findByRole('alert')).toHaveTextContent('Dê um nome à chave.');

    fireEvent.change(within(dlg).getByLabelText('Nome da chave'), { target: { value: 'Painel' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Criar chave' }));
    expect(await within(dlg).findByRole('alert')).toHaveTextContent('Marque a confirmação');
    expect(mockRpc.mock.calls.some((c) => c[0] === 'api_chave_criar')).toBe(false);
  });

  it('envia exatamente os argumentos, mostra a chave uma vez e a remove ao fechar', async () => {
    renderizar();
    const dlg = await abrirCriacao();
    fireEvent.change(within(dlg).getByLabelText('Nome da chave'), { target: { value: '  Painel  ' } });
    fireEvent.click(within(dlg).getByRole('checkbox', { name: /Entendo que os dados escolhidos/ }));
    fireEvent.click(within(dlg).getByRole('radio', { name: /30 dias/ }));
    await act(async () => {
      fireEvent.click(within(dlg).getByRole('button', { name: 'Criar chave' }));
    });

    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('api_chave_criar', {
        p_nome: 'Painel',
        p_escopos: ['contatos', 'conversas', 'funil', 'equipe', 'metricas'],
        p_lojas: null,
        p_validade_dias: 30,
        p_aceite_versao: 'api-chave-2026-10-24',
      }),
    );
    expect(await screen.findByTestId('api-chave-secreta')).toHaveTextContent(CHAVE_SECRETA);
    expect(screen.getByText(/Ela não será mostrada de novo/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copiar chave/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Já guardei a chave' }));
    await waitFor(() => expect(screen.queryByTestId('api-chave-secreta')).toBeNull());
    expect(document.body).not.toHaveTextContent(CHAVE_SECRETA);
  });

  it('Lojas específicas: lista a Conta e as Lojas, e envia os ids', async () => {
    renderizar();
    const dlg = await abrirCriacao();
    fireEvent.change(within(dlg).getByLabelText('Nome da chave'), { target: { value: 'Loja' } });
    fireEvent.click(within(dlg).getByRole('radio', { name: 'Só algumas' }));
    expect(await within(dlg).findByRole('checkbox', { name: 'Grupo Exemplo (Conta)' })).toBeInTheDocument();
    fireEvent.click(within(dlg).getByRole('checkbox', { name: 'Loja Centro' }));
    fireEvent.click(within(dlg).getByRole('checkbox', { name: /Entendo que os dados escolhidos/ }));
    await act(async () => {
      fireEvent.click(within(dlg).getByRole('button', { name: 'Criar chave' }));
    });
    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('api_chave_criar', expect.objectContaining({ p_lojas: ['loja-1'], p_validade_dias: 90 })),
    );
  });

  it('mostra o erro do servidor no diálogo', async () => {
    mockRpc.mockImplementation(async (fn: string) =>
      fn === 'api_chave_criar'
        ? { data: null, error: { message: 'Limite de 10 chaves ativas atingido.' } }
        : { data: fn === 'api_addon_estado' ? [estado] : [], error: null },
    );
    renderizar();
    const dlg = await abrirCriacao();
    fireEvent.change(within(dlg).getByLabelText('Nome da chave'), { target: { value: 'Painel' } });
    fireEvent.click(within(dlg).getByRole('checkbox', { name: /Entendo que os dados escolhidos/ }));
    await act(async () => {
      fireEvent.click(within(dlg).getByRole('button', { name: 'Criar chave' }));
    });
    expect(await within(dlg).findByRole('alert')).toHaveTextContent('Limite de 10 chaves ativas atingido.');
  });
});

describe('lista', () => {
  it('mostra nome, prefixo, permissões, Lojas, validade, último uso e estado', async () => {
    chaves = [
      chave({ lojas: ['loja-1'] }),
      chave({ id: 'k3', nome: 'Antiga', estado: 'revogada', ultimo_uso_em: null, ultimo_uso_ip: null }),
    ];
    renderizar();
    const linha = await screen.findByTestId('chave-k1');
    expect(linha).toHaveTextContent('Painel de vendas');
    expect(linha).toHaveTextContent('cf_live_AbCd…');
    expect(linha).toHaveTextContent('Contatos');
    expect(linha).toHaveTextContent('Funil');
    expect(linha).toHaveTextContent('Loja Centro');
    expect(linha).toHaveTextContent('31/12/2026');
    expect(linha).toHaveTextContent('20/10/2026');
    expect(linha).toHaveTextContent('203.0.113.7');
    expect(linha).toHaveTextContent('Ativa');
    const revogada = screen.getByTestId('chave-k3');
    expect(revogada).toHaveTextContent('Revogada');
    expect(revogada).toHaveTextContent('Nunca usada');
    expect(within(revogada).queryByRole('button', { name: 'Revogar' })).toBeNull();
    expect(screen.getByText(/1 de 10 chaves em uso/)).toBeInTheDocument();
  });

  it('API desligada: avisa que as chaves ficam suspensas', async () => {
    estado = { ativo: false, motivo: 'desligado', ate: null };
    chaves = [chave({ estado: 'suspensa' })];
    renderizar();
    expect(
      await screen.findByText('A API está desligada nesta Conta: as chaves ficam suspensas até ela voltar.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('chave-k1')).toHaveTextContent('Suspensa');
  });

  it('com 10 chaves em uso, "Nova chave" fica travada', async () => {
    chaves = Array.from({ length: 10 }, (_, i) => chave({ id: `k${i}` }));
    renderizar();
    await screen.findByTestId('chave-k0');
    expect(screen.getByRole('button', { name: /Nova chave/ })).toBeDisabled();
  });

  it('endereço da API sempre; link da documentação só com a API liberada', async () => {
    const { unmount } = renderizar(true);
    expect(await screen.findByTestId('api-endereco')).toHaveTextContent('https://api.convoflow.com.br');
    expect(screen.getByRole('link', { name: 'Ver a documentação' })).toHaveAttribute('href', '/api');
    unmount();
    renderizar(false);
    await screen.findByTestId('api-endereco');
    expect(screen.queryByRole('link', { name: 'Ver a documentação' })).toBeNull();
    expect(document.body.textContent).not.toMatch(/ChatGPT|Claude/);
  });
});

describe('revogar', () => {
  it('pede confirmação e só então chama a RPC', async () => {
    chaves = [chave()];
    renderizar();
    fireEvent.click(await screen.findByRole('button', { name: 'Revogar' }));
    const dlg = await screen.findByRole('alertdialog');
    expect(dlg).toHaveTextContent('Revogar a chave "Painel de vendas"?');
    expect(mockRpc.mock.calls.some((c) => c[0] === 'api_chave_revogar')).toBe(false);
    await act(async () => {
      fireEvent.click(within(dlg).getByRole('button', { name: 'Revogar chave' }));
    });
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('api_chave_revogar', { p_id: 'k1' }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Chave revogada' })));
  });
});
