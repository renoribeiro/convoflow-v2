import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

/**
 * Escolha do template (achado 93, decisão D12): a lista é só de APROVADOS, a
 * escolha monta um campo por variável, e digitar o nome fica escondido em
 * "Digitar o nome à mão" (que abre sozinho quando a lista falha).
 */

const { estado } = vi.hoisted(() => ({
  estado: {
    data: [] as Array<Record<string, unknown>> | undefined,
    isLoading: false,
    error: null as Error | null,
  },
}));

vi.mock('@/hooks/useMetaTemplates', () => ({
  useMetaTemplates: () => ({ ...estado, isFetching: false, refetch: vi.fn() }),
  useMetaWabaGroups: () => ({ groups: [], officialCount: 0, isLoading: false, error: null }),
}));

import { EscolherTemplate } from './EscolherTemplate';
import { TEMPLATE_VAZIO, type TemplateEscolhido } from '@/lib/templates/escolherTemplate';

const LISTA = [
  { name: 'retorno_orcamento', language: 'pt_BR', status: 'APPROVED', paramCount: 2, bodyText: 'Oi {{1}}, o orçamento de {{2}} está pronto.' },
  { name: 'boas_vindas', language: 'pt_BR', status: 'APPROVED', paramCount: 0, bodyText: 'Bem vindo!' },
  { name: 'promo_rejeitada', language: 'pt_BR', status: 'REJECTED', paramCount: 0 },
  { name: 'aviso_pendente', language: 'pt_BR', status: 'PENDING', paramCount: 1 },
];

let ultimo: TemplateEscolhido = TEMPLATE_VAZIO;

function Montar({ inicial = TEMPLATE_VAZIO }: { inicial?: TemplateEscolhido }) {
  const [valor, setValor] = useState(inicial);
  ultimo = valor;
  return (
    <MemoryRouter>
      <EscolherTemplate
        instanceId="inst-oficial"
        valor={valor}
        aoMudar={(v) => {
          ultimo = v;
          setValor(v);
        }}
        dicaDasVariaveis="Pode usar {name}."
      />
    </MemoryRouter>
  );
}

// Radix Select precisa disto no jsdom.
const proto = Element.prototype as unknown as Record<string, unknown>;
proto.hasPointerCapture ??= () => false;
proto.releasePointerCapture ??= () => {};
proto.setPointerCapture ??= () => {};

beforeEach(() => {
  estado.data = LISTA;
  estado.isLoading = false;
  estado.error = null;
  ultimo = TEMPLATE_VAZIO;
});

describe('EscolherTemplate', () => {
  it('a lista mostra só os aprovados', async () => {
    const user = userEvent.setup();
    render(<Montar />);
    await user.click(screen.getByRole('combobox', { name: 'Template aprovado *' }));
    const opcoes = screen.getAllByRole('option').map((o) => o.textContent);
    expect(opcoes).toEqual(['boas_vindas · Português (Brasil)', 'retorno_orcamento · Português (Brasil)']);
  });

  it('escolher o template mostra o texto e um campo por variável', async () => {
    const user = userEvent.setup();
    render(<Montar />);
    await user.click(screen.getByRole('combobox', { name: 'Template aprovado *' }));
    await user.click(screen.getByRole('option', { name: /retorno_orcamento/ }));
    expect(screen.getByText('Oi {{1}}, o orçamento de {{2}} está pronto.')).toBeInTheDocument();
    expect(screen.getByLabelText('Variável 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Variável 2')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Variável 1'), { target: { value: '{name}' } });
    expect(ultimo).toEqual({ nome: 'retorno_orcamento', idioma: 'pt_BR', parametros: ['{name}', ''] });
    // O campo de nome digitado não aparece enquanto se escolhe da lista.
    expect(screen.queryByLabelText('Nome do template *')).toBeNull();
  });

  it('"Digitar o nome à mão" abre o nome, o idioma e as variáveis livres', () => {
    render(<Montar />);
    fireEvent.click(screen.getByRole('button', { name: 'Digitar o nome à mão' }));
    fireEvent.change(screen.getByLabelText('Nome do template *'), { target: { value: 'pedido_confirmado' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Adicionar variável' }));
    expect(ultimo.nome).toBe('pedido_confirmado');
    expect(ultimo.parametros).toEqual(['']);
    fireEvent.click(screen.getByRole('button', { name: 'Escolher da lista' }));
    expect(screen.getByRole('combobox', { name: 'Template aprovado *' })).toBeInTheDocument();
  });

  it('se a lista não carrega, cai no nome à mão com o motivo', () => {
    estado.data = undefined;
    estado.error = new Error('Meta Cloud API Error (401): {"error":{"message":"Error validating access token: Session has expired","type":"OAuthException","code":190}}');
    render(<Montar />);
    expect(screen.getByText(/o acesso deste número à Meta venceu\. Reconecte o número em Números de WhatsApp/)).toBeInTheDocument();
    expect(screen.queryByText(/OAuthException/)).toBeNull();
    expect(screen.getByLabelText('Nome do template *')).toBeInTheDocument();
  });

  it('template gravado que não está mais aprovado abre à mão e avisa', () => {
    render(<Montar inicial={{ nome: 'promo_rejeitada', idioma: 'pt_BR', parametros: [] }} />);
    expect(screen.getByText(/"promo_rejeitada" não está entre os aprovados/)).toBeInTheDocument();
    expect(screen.getByLabelText('Nome do template *')).toHaveValue('promo_rejeitada');
  });

  it('sem nenhum aprovado, explica onde aprovar', () => {
    estado.data = [LISTA[2]!];
    render(<Montar />);
    expect(screen.getByText(/ainda não tem template aprovado/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Templates' })).toHaveAttribute('href', '/dashboard/templates');
  });
});
