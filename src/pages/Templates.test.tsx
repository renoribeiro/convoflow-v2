/**
 * Testes da tela de Templates (/dashboard/templates).
 *
 * Cobrem os três comportamentos que a tela precisa acertar e que ninguém
 * percebe olhando o código:
 *  - o estado vazio (a situação da MAIORIA das Lojas hoje) tem de informar,
 *    não parecer quebrado;
 *  - a falha tem de APARECER com o texto real — o SendTemplateDialog degrada em
 *    silêncio, e é por isso que ninguém nunca notou essa função falhando;
 *  - o mesmo nome de template em vários idiomas aparece UMA vez.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { WhatsAppTemplate } from '@/services/whatsapp';
import type { WabaGroup } from '@/lib/templates/metaTemplates';

// ── mocks ────────────────────────────────────────────────────────────────────
// Os hooks são mockados para que o teste exercite a TELA (qual estado ela
// escolhe, o que ela escreve), não a rede.

interface EstadoWabas {
  groups: WabaGroup[];
  officialCount: number;
  isLoading: boolean;
  error: Error | null;
}

interface EstadoTemplates {
  data?: WhatsAppTemplate[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
}

let estadoWabas: EstadoWabas;
let estadoTemplates: EstadoTemplates;
const refetch = vi.fn();

vi.mock('@/hooks/useMetaTemplates', () => ({
  useMetaWabaGroups: () => estadoWabas,
  useMetaTemplates: () => ({ ...estadoTemplates, refetch }),
}));

import Templates from './Templates';

const grupo = (wabaId: string, label: string, instanceId: string): WabaGroup => ({
  wabaId,
  instanceId,
  label,
  instanceNames: [label],
});

const template = (
  name: string,
  language: string,
  status = 'APPROVED',
  extra: Partial<WhatsAppTemplate> = {},
): WhatsAppTemplate => ({
  name,
  language,
  status,
  category: 'UTILITY',
  bodyText: 'Olá {{1}}',
  paramCount: 1,
  ...extra,
});

const renderTela = () =>
  render(
    <MemoryRouter>
      <Templates />
    </MemoryRouter>,
  );

beforeEach(() => {
  refetch.mockClear();
  estadoWabas = {
    groups: [grupo('waba-aaa', 'Principal', 'inst-1')],
    officialCount: 1,
    isLoading: false,
    error: null,
  };
  estadoTemplates = {
    data: [],
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
  };
});

// ── estado vazio ─────────────────────────────────────────────────────────────

describe('sem número na API Oficial', () => {
  beforeEach(() => {
    estadoWabas = { groups: [], officialCount: 0, isLoading: false, error: null };
  });

  it('explica que templates só existem na API Oficial, sem parecer erro', () => {
    renderTela();

    expect(screen.getByText('Nenhum número na API Oficial da Meta')).toBeInTheDocument();
    expect(screen.getByText(/Instâncias e APIs/)).toBeInTheDocument();
    expect(screen.getByText(/QR Code/)).toBeInTheDocument();
  });

  it('não oferece busca nem Atualizar quando não há o que buscar', () => {
    renderTela();

    expect(screen.queryByLabelText('Buscar')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Atualizar/ })).not.toBeInTheDocument();
  });
});

describe('número oficial sem WABA ID', () => {
  it('é uma mensagem DIFERENTE da de "nenhum número oficial"', () => {
    // Problema diferente, solução diferente: aqui falta terminar a conexão.
    estadoWabas = { groups: [], officialCount: 2, isLoading: false, error: null };
    renderTela();

    expect(screen.getByText('Falta o WABA ID na conexão')).toBeInTheDocument();
    expect(
      screen.queryByText('Nenhum número na API Oficial da Meta'),
    ).not.toBeInTheDocument();
  });
});

// ── erro ─────────────────────────────────────────────────────────────────────

describe('falha ao carregar', () => {
  it('mostra a mensagem REAL, não uma frase genérica', () => {
    estadoTemplates = {
      data: undefined,
      isLoading: false,
      isFetching: false,
      isError: true,
      error: new Error('connection_config.wabaId ausente: não é possível listar templates.'),
    };
    renderTela();

    expect(
      screen.getByText('connection_config.wabaId ausente: não é possível listar templates.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Não foi possível carregar os templates')).toBeInTheDocument();
  });

  it('a falha não é engolida: nenhuma lista aparece no lugar dela', () => {
    estadoTemplates = {
      data: undefined,
      isLoading: false,
      isFetching: false,
      isError: true,
      error: new Error('Meta Cloud API Error (401): token expirado'),
    };
    renderTela();

    expect(screen.getByText('Meta Cloud API Error (401): token expirado')).toBeInTheDocument();
    // Nada de degradar para digitação manual, como faz o SendTemplateDialog.
    expect(screen.queryByText('Nenhum template nesta conta')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tentar de novo/ })).toBeInTheDocument();
  });
});

// ── agrupamento ──────────────────────────────────────────────────────────────

describe('lista de templates', () => {
  it('o mesmo nome em três idiomas aparece UMA vez', () => {
    estadoTemplates = {
      data: [
        template('boas_vindas', 'pt_BR'),
        template('boas_vindas', 'en_US'),
        template('boas_vindas', 'es'),
      ],
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
    };
    renderTela();

    expect(screen.getAllByText('boas_vindas')).toHaveLength(1);
    // ...e os três idiomas aparecem como filhos.
    expect(screen.getByText('Português (Brasil)')).toBeInTheDocument();
    expect(screen.getByText('English (US)')).toBeInTheDocument();
    expect(screen.getByText('Español')).toBeInTheDocument();
    expect(screen.getByText('3 idiomas')).toBeInTheDocument();
  });

  it('mostra cabeçalho, rodapé e botões — o que a edge function descartava', () => {
    estadoTemplates = {
      data: [
        template('promo', 'pt_BR', 'APPROVED', {
          header: { format: 'TEXT', text: 'Oferta da semana' },
          footer: { text: 'Responda SAIR para não receber mais' },
          buttons: [
            { type: 'QUICK_REPLY', text: 'Quero ver' },
            { type: 'URL', text: 'Abrir site', url: 'https://exemplo.com' },
          ],
        }),
      ],
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
    };
    renderTela();

    expect(screen.getByText('Oferta da semana')).toBeInTheDocument();
    expect(screen.getByText('Responda SAIR para não receber mais')).toBeInTheDocument();
    expect(screen.getByText(/Quero ver/)).toBeInTheDocument();
    expect(screen.getByText(/Abrir site/)).toBeInTheDocument();
    expect(screen.getByText(/Cabeçalho/)).toBeInTheDocument();
  });

  it('traduz o status e destaca as variáveis do corpo', () => {
    estadoTemplates = {
      data: [template('pausado', 'pt_BR', 'PAUSED')],
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
    };
    renderTela();

    // PAUSED chegava cru em inglês antes do selo compartilhado.
    expect(screen.getByText('Pausado')).toBeInTheDocument();
    expect(screen.getByText('{{1}}')).toBeInTheDocument();
  });

  it('conta vazia diz que a criação é no WhatsApp Manager', () => {
    renderTela();

    expect(screen.getByText('Nenhum template nesta conta')).toBeInTheDocument();
    // Trecho exclusivo do estado vazio — "WhatsApp Manager" sozinho casaria
    // também com a descrição do cabeçalho da página.
    expect(screen.getByText(/assim que a Meta aprovar/)).toBeInTheDocument();
  });
});

// ── seletor de WABA ──────────────────────────────────────────────────────────

describe('seletor de conta', () => {
  it('some quando a Loja tem um WABA só', () => {
    renderTela();
    expect(screen.queryByLabelText('Conta do WhatsApp Business')).not.toBeInTheDocument();
  });

  it('aparece quando há mais de um WABA, rotulado por nome e não por ID', () => {
    estadoWabas = {
      groups: [grupo('waba-aaa', 'Matriz', 'inst-1'), grupo('waba-bbb', 'Filial', 'inst-2')],
      officialCount: 2,
      isLoading: false,
      error: null,
    };
    renderTela();

    expect(screen.getByLabelText('Conta do WhatsApp Business')).toBeInTheDocument();
    expect(screen.getByText('Matriz')).toBeInTheDocument();
    expect(screen.queryByText('waba-aaa')).not.toBeInTheDocument();
  });
});
