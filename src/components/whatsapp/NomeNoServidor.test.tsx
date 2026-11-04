import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { acao, mockRpc, mockToast } = vi.hoisted(() => ({ acao: vi.fn(), mockRpc: vi.fn(), mockToast: vi.fn() }));

vi.mock('@/services/whatsapp/instanceActions', () => ({
  instanceAction: acao,
  isConnectedState: (s: string | null | undefined) => s === 'open' || s === 'connected',
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: mockRpc, from: vi.fn(), functions: { invoke: vi.fn() } },
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }), toast: mockToast }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import { NomeNoServidor } from './NomeNoServidor';
import { ViewInstanceModal } from './ViewInstanceModal';
import { DeleteInstanceModal } from './DeleteInstanceModal';
import { RenameInstanceModal } from './RenameInstanceModal';
import { QRCodeModal } from './QRCodeModal';

/**
 * O nome no servidor de conexão (2026-11-04, decisão do dono): o mesmo rótulo
 * com botão de copiar no cartão e nas janelas de Detalhes, Excluir, Renomear e
 * QR Code; sem "Chave", "Chave técnica" nem "Código interno do número"; e
 * nenhuma janela mostra endereço do servidor ou chave, mesmo que a linha
 * chegasse com eles (cache antigo). Valores inventados.
 */

const SEGREDOS = {
  connection_config: { baseUrl: 'https://evo-FAKE.exemplo.com.br', apiKey: 'chave-FAKE-que-nao-aparece' },
  evolution_api_key: 'outra-chave-FAKE',
  evolution_api_url: 'https://evolution-FAKE.exemplo.com.br',
};

const EVOLUTION = {
  id: 'aaaaaaaa-0000-4000-8000-0000000000b1',
  name: 'WhatsApp Vendas',
  instance_key: 'whatsapp_vendas_k3f9',
  provider: 'evolution' as const,
  status: 'disconnected',
  phone_number: '5585999990201',
  created_at: '2026-11-04T12:00:00Z',
  ...SEGREDOS,
};

const comQuery = (ui: React.ReactElement) => (
  <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>
);

/** O texto da janela aberta, mais os atributos que a pessoa também lê. */
function textoDaTela(): string {
  const extras = Array.from(document.querySelectorAll('[title],[aria-label]')).flatMap((el) => [
    el.getAttribute('title') ?? '',
    el.getAttribute('aria-label') ?? '',
  ]);
  return `${document.body.textContent}\n${extras.join('\n')}\n${document.body.innerHTML}`;
}

function semSegredoNemRotuloVelho() {
  const texto = textoDaTela();
  for (const s of ['evo-FAKE', 'chave-FAKE', 'outra-chave-FAKE', 'evolution-FAKE']) expect(texto).not.toContain(s);
  expect(document.body.textContent).not.toMatch(/Código interno|Chave técnica|Chave:/);
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => {}) } });
});

describe('NomeNoServidor', () => {
  it('cartão: "Nome no servidor: ..." e copiar leva o nome', async () => {
    render(<NomeNoServidor nome="whatsapp_vendas_k3f9" provider="evolution" variante="cartao" />);
    expect(screen.getByTestId('nome-no-servidor')).toHaveTextContent('Nome no servidor: whatsapp_vendas_k3f9');
    fireEvent.click(screen.getByRole('button', { name: 'Copiar o nome no servidor' }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('whatsapp_vendas_k3f9'));
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Nome copiado' }));
  });

  it('janela: rótulo completo e a dica do dono, que diz que não é senha', async () => {
    render(<NomeNoServidor nome="whatsapp_vendas_k3f9" provider="evolution" variante="janela" />);
    expect(screen.getByText('Nome no servidor de conexão')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'O que é: Nome no servidor de conexão' }));
    expect(
      await screen.findByText('É o nome deste número no painel da Evolution e nas automações de fora. Não é senha.'),
    ).toBeInTheDocument();
  });

  it('WAHA: a dica fala do servidor WAHA da pessoa', async () => {
    render(<NomeNoServidor nome="suporte" provider="waha" variante="janela" />);
    fireEvent.click(screen.getByRole('button', { name: 'O que é: Nome no servidor de conexão' }));
    expect(await screen.findByText(/no seu servidor WAHA e nas automações de fora/)).toBeInTheDocument();
  });
});

describe('as janelas mostram o nome no servidor e nada secreto', () => {
  it('Detalhes', async () => {
    acao.mockResolvedValue({ ok: true, credential_configured: true });
    render(<ViewInstanceModal open onOpenChange={vi.fn()} instance={EVOLUTION} />);
    expect(await screen.findByText('Chave configurada: sim')).toBeInTheDocument();
    expect(screen.getByText('Nome no servidor de conexão')).toBeInTheDocument();
    expect(screen.getByTestId('nome-no-servidor-valor')).toHaveTextContent('whatsapp_vendas_k3f9');
    expect(screen.getByText('QR Code (Evolution), no servidor do ConvoFlow')).toBeInTheDocument();
    semSegredoNemRotuloVelho();
  });

  it('Excluir', () => {
    mockRpc.mockReturnValue(new Promise(() => {}));
    render(<DeleteInstanceModal open onOpenChange={vi.fn()} instance={EVOLUTION} onSuccess={vi.fn()} />);
    expect(screen.getByText('Nome no servidor de conexão')).toBeInTheDocument();
    expect(screen.getByTestId('nome-no-servidor-valor')).toHaveTextContent('whatsapp_vendas_k3f9');
    expect(screen.getByText('Tipo de conexão')).toBeInTheDocument();
    expect(screen.getByText('QR Code (Evolution)')).toBeInTheDocument();
    semSegredoNemRotuloVelho();
  });

  it('Renomear: o nome no servidor fica só para ler e copiar', () => {
    render(comQuery(<RenameInstanceModal open onOpenChange={vi.fn()} instance={EVOLUTION} />));
    expect(screen.getByTestId('nome-no-servidor-valor')).toHaveTextContent('whatsapp_vendas_k3f9');
    expect(screen.getByText('Este não muda ao renomear.')).toBeInTheDocument();
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    semSegredoNemRotuloVelho();
  });

  it('QR Code: os dois nomes', () => {
    acao.mockReturnValue(new Promise(() => {}));
    render(
      comQuery(
        <QRCodeModal
          open
          onOpenChange={vi.fn()}
          instanceId={EVOLUTION.id}
          instanceName={EVOLUTION.name}
          serverName={EVOLUTION.instance_key}
        />,
      ),
    );
    expect(screen.getByText('WhatsApp Vendas')).toBeInTheDocument();
    expect(screen.getByTestId('nome-no-servidor')).toHaveTextContent('Nome no servidor: whatsapp_vendas_k3f9');
    semSegredoNemRotuloVelho();
  });
});
