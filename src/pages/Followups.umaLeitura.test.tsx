import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

/**
 * Follow ups (lote 6b, B15): a tela pede os mesmos dados uma vez só, com um
 * canal ao vivo só, e fechar uma parte não para a atualização das outras.
 * Antes: ao abrir, três leituras iguais (contadores, lista da aba, calendário)
 * e três canais com o mesmo nome; a saída de um derrubava os outros.
 */

const LOJA = 'aaaaaaaa-0000-4000-8000-000000000002';

const { banco, canal } = vi.hoisted(() => ({
  banco: {
    leituras: 0,
    linhas: [] as Record<string, unknown>[],
  },
  canal: {
    criados: [] as string[],
    removidos: 0,
    aoMudar: null as null | (() => void),
  },
}));

vi.mock('@/integrations/supabase/client', () => {
  const builder = () => {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.order = () => {
      banco.leituras += 1;
      return Promise.resolve({ data: banco.linhas.map((l) => ({ ...l })), error: null });
    };
    return b;
  };
  return {
    supabase: {
      from: (tabela: string) => {
        if (tabela !== 'individual_followups') throw new Error(`tabela inesperada: ${tabela}`);
        return builder();
      },
      channel: (nome: string) => {
        canal.criados.push(nome);
        const c = {
          on: (_tipo: string, _filtro: unknown, cb: () => void) => {
            canal.aoMudar = cb;
            return c;
          },
          subscribe: () => c,
        };
        return c;
      },
      removeChannel: () => {
        canal.removidos += 1;
        canal.aoMudar = null;
        return Promise.resolve('ok');
      },
    },
  };
});

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenant: { id: LOJA, name: 'Loja Exemplo', kind: 'store' }, tenantId: LOJA }),
  useTenantId: () => LOJA,
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
vi.mock('@/components/shared/PageHeader', () => ({
  PageHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {actions}
    </div>
  ),
}));
vi.mock('@/components/FollowupEditModal', () => ({ FollowupEditModal: () => null }));
vi.mock('@/components/followups/SequencesManager', () => ({ SequencesManager: () => null }));

import Followups from './Followups';
import { useFollowups } from '@/hooks/useFollowups';
import { partesNoCanal } from '@/lib/followups/canalAoVivo';

const pendente = (id: string) => ({
  id,
  tenant_id: LOJA,
  title: `FIX ${id}`,
  status: 'pending',
  priority: 'medium',
  type: 'call',
  due_date: '2099-01-01T12:00:00Z',
  contacts: { id: 'c1', name: 'Contato Exemplo', phone: '5585999990201' },
});

function novoCliente() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

beforeEach(() => {
  banco.leituras = 0;
  banco.linhas = [pendente('f1')];
  canal.criados = [];
  canal.removidos = 0;
  canal.aoMudar = null;
});

describe('abrir a tela de Follow ups', () => {
  it('uma leitura e um canal, para contadores, lista e calendário juntos', async () => {
    const qc = novoCliente();
    const { unmount } = render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <Followups />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText('Total de Follow ups').nextSibling).toHaveTextContent('1'));
    expect(banco.leituras).toBe(1);
    expect(canal.criados).toEqual([`individual_followups:${LOJA}`]);
    expect(partesNoCanal(LOJA)).toBeGreaterThanOrEqual(3);

    unmount();
    expect(partesNoCanal(LOJA)).toBe(0);
    expect(canal.removidos).toBe(1);
  });
});

function Parte({ nome }: { nome: string }) {
  const { stats } = useFollowups();
  return <p data-testid={nome}>{stats.total}</p>;
}

describe('fechar uma parte não para as outras', () => {
  it('a lista continua recebendo a mudança depois que o calendário fecha', async () => {
    const qc = novoCliente();
    const Tela = ({ comCalendario }: { comCalendario: boolean }) => (
      <QueryClientProvider client={qc}>
        <Parte nome="lista" />
        {comCalendario && <Parte nome="calendario" />}
      </QueryClientProvider>
    );
    const { rerender, unmount } = render(<Tela comCalendario />);
    await waitFor(() => expect(screen.getByTestId('lista')).toHaveTextContent('1'));
    expect(banco.leituras).toBe(1);
    expect(partesNoCanal(LOJA)).toBe(2);

    rerender(<Tela comCalendario={false} />);
    expect(partesNoCanal(LOJA)).toBe(1);
    expect(canal.removidos).toBe(0);
    expect(canal.aoMudar).not.toBeNull();

    // Chega um follow up novo pelo canal: a lista relê e mostra.
    banco.linhas = [pendente('f1'), pendente('f2')];
    await act(async () => {
      canal.aoMudar?.();
    });
    await waitFor(() => expect(screen.getByTestId('lista')).toHaveTextContent('2'));
    expect(banco.leituras).toBe(2);

    unmount();
    expect(canal.removidos).toBe(1);
  });
});
