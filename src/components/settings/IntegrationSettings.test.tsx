import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const criar = vi.fn();
const salvar = vi.fn();
const remover = vi.fn();
const testar = vi.fn();
let lojasMock: { lojas: Array<{ id: string; name: string }>; escolhe: boolean; lojaAberta: string | null; carregando: boolean };
let avisosMock: unknown[] = [];

vi.mock('@/hooks/useAvisos', () => ({
  useLojasDosAvisos: () => lojasMock,
  useAvisos: () => ({ data: avisosMock, isLoading: false }),
  useEntregasDoAviso: () => ({ data: [], isLoading: false, isError: false }),
  useMexerNosAvisos: () => ({
    criar: { mutateAsync: criar, isPending: false },
    salvar: { mutateAsync: salvar, isPending: false },
    remover: { mutateAsync: remover, isPending: false },
    testar: { mutateAsync: testar, isPending: false },
  }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { IntegrationSettings } from './IntegrationSettings';
import { fraseDoTeste } from '@/lib/webhooks';

const LOJAS = [
  { id: 'loja-centro', name: 'Loja Centro' },
  { id: 'loja-praia', name: 'Loja Praia' },
];

function abrir() {
  render(
    <MemoryRouter>
      <IntegrationSettings />
    </MemoryRouter>,
  );
}

function preencherECriar() {
  fireEvent.change(screen.getByLabelText('Nome *'), { target: { value: 'Planilha de leads' } });
  fireEvent.change(screen.getByRole("textbox", { name: /Endereço do outro sistema/ }), { target: { value: 'https://hook.exemplo.com/abc' } });
  fireEvent.click(screen.getByLabelText('Lead novo'));
  fireEvent.click(screen.getByRole('button', { name: 'Criar aviso' }));
}

beforeEach(() => {
  criar.mockReset().mockResolvedValue([{ id: 'x' }]);
  salvar.mockReset();
  remover.mockReset();
  testar.mockReset();
  avisosMock = [];
});

describe('IntegrationSettings: Gerente', () => {
  it('com a Conta aberta, "Todas as Lojas" cria o mesmo aviso em cada Loja', async () => {
    lojasMock = { lojas: LOJAS, escolhe: true, lojaAberta: null, carregando: false };
    abrir();
    expect(screen.getByText('Todas as Lojas')).toBeInTheDocument();
    preencherECriar();
    await waitFor(() => expect(criar).toHaveBeenCalledOnce());
    expect(criar.mock.calls[0]?.[0]).toEqual({
      lojas: ['loja-centro', 'loja-praia'],
      dados: {
        name: 'Planilha de leads',
        url: 'https://hook.exemplo.com/abc',
        events: ['lead.novo'],
        secret: null,
        is_active: true,
      },
    });
  });

  it('com uma Loja aberta no topo, o aviso nasce nela', async () => {
    lojasMock = { lojas: LOJAS, escolhe: true, lojaAberta: 'loja-praia', carregando: false };
    abrir();
    preencherECriar();
    await waitFor(() => expect(criar).toHaveBeenCalledOnce());
    expect(criar.mock.calls[0]?.[0]?.lojas).toEqual(['loja-praia']);
  });

  it('cada aviso mostra a Loja dele', () => {
    lojasMock = { lojas: LOJAS, escolhe: true, lojaAberta: null, carregando: false };
    avisosMock = [
      { id: 'a1', tenant_id: 'loja-praia', name: 'Planilha', url: 'https://hook.exemplo.com/1', events: ['lead.novo'], is_active: true, secret: null, created_at: '2026-11-16T12:00:00Z' },
    ];
    abrir();
    const cartao = screen.getByTestId('aviso-cadastrado');
    expect(cartao).toHaveTextContent('Loja Praia');
    expect(cartao).toHaveTextContent('Avisa quando: Lead novo');
  });

  it('sem Loja na Conta, manda criar a Loja antes', () => {
    lojasMock = { lojas: [], escolhe: true, lojaAberta: null, carregando: false };
    abrir();
    expect(screen.getByText('A Conta ainda não tem Loja.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Criar aviso' })).not.toBeInTheDocument();
  });
});

describe('IntegrationSettings: Gestor', () => {
  it('não escolhe Loja: o aviso nasce na Loja dele', async () => {
    lojasMock = { lojas: [{ id: 'loja-centro', name: 'Loja Centro' }], escolhe: false, lojaAberta: 'loja-centro', carregando: false };
    abrir();
    expect(screen.queryByText('Todas as Lojas')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Loja')).not.toBeInTheDocument();
    preencherECriar();
    await waitFor(() => expect(criar).toHaveBeenCalledOnce());
    expect(criar.mock.calls[0]?.[0]?.lojas).toEqual(['loja-centro']);
  });
});

describe('Enviar aviso de teste', () => {
  it('mostra a resposta do outro sistema em português', async () => {
    lojasMock = { lojas: [{ id: 'loja-centro', name: 'Loja Centro' }], escolhe: false, lojaAberta: 'loja-centro', carregando: false };
    avisosMock = [
      { id: 'a1', tenant_id: 'loja-centro', name: 'Planilha', url: 'https://hook.exemplo.com/1', events: ['lead.novo'], is_active: false, secret: null, created_at: '2026-11-16T12:00:00Z' },
    ];
    testar.mockResolvedValue({ ok: true, aceito: false, status: 404, erro: 'HTTP 404' });
    abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar aviso de teste' }));
    expect(await screen.findByTestId('resultado-do-teste')).toHaveTextContent(
      'Não aceito: o endereço não existe no outro sistema (código 404).',
    );
    expect(testar).toHaveBeenCalledWith('a1');
  });

  it('as frases do resultado', () => {
    expect(fraseDoTeste({ ok: true, aceito: true, status: 200, erro: null })).toEqual({
      aceito: true,
      texto: 'Aceito: o outro sistema recebeu (código 200).',
    });
    expect(fraseDoTeste({ ok: false, error: 'Você já mandou 5 testes deste aviso no último minuto.' }).aceito).toBe(false);
    expect(fraseDoTeste({ ok: true, aceito: false, status: null, erro: 'tempo_esgotado' }).texto).toMatch(/demorou mais de 10 segundos/);
  });
});
