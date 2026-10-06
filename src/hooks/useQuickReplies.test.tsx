/**
 * Isolamento por Conta nas respostas rápidas — leitura E escrita.
 *
 * Por que este teste existe: a tabela passou a vida inteira com uma policy que
 * comparava `auth.jwt() ->> 'tenant_id'`, um campo que ninguém neste projeto
 * escreve no token. O predicado era sempre nulo, então a policy negava tudo e
 * ninguém percebeu que ela também não isolava nada — não dava para ver a
 * diferença entre "isola certo" e "nega tudo".
 *
 * Agora que a policy correta libera a leitura, o filtro por Conta precisa estar
 * comprovado dos dois lados. O RLS continua sendo a trava de verdade; o que se
 * verifica aqui é que o cliente não manda consulta larga e que nenhuma escrita
 * sai sem `tenant_id`.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── mock do cliente Supabase ────────────────────────────────────────────────
// Um builder encadeável que grava tudo o que foi chamado, para o teste poder
// afirmar sobre os filtros em vez de sobre a rede.

interface Chamada {
  table: string;
  ops: { metodo: string; args: unknown[] }[];
}

const chamadas: Chamada[] = [];
let resultadoSelect: unknown[] = [];

function criarBuilder(table: string) {
  const chamada: Chamada = { table, ops: [] };
  chamadas.push(chamada);

  const builder: Record<string, unknown> = {};
  const encadear = (metodo: string) => (...args: unknown[]) => {
    chamada.ops.push({ metodo, args });
    return builder;
  };

  for (const m of ['select', 'insert', 'update', 'delete', 'eq', 'order', 'limit', 'is', 'in']) {
    builder[m] = encadear(m);
  }
  builder.single = (...args: unknown[]) => {
    chamada.ops.push({ metodo: 'single', args });
    return Promise.resolve({ data: resultadoSelect[0] ?? null, error: null });
  };
  builder.maybeSingle = builder.single;
  // Thenable: `await query` resolve na lista.
  builder.then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: resultadoSelect, error: null });

  return builder;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (table: string) => criarBuilder(table) },
}));

const TENANT_ATUAL = 'conta-a-1111';

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenant: { id: TENANT_ATUAL } }),
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { useQuickReplies } from './useQuickReplies';

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

/**
 * A chamada cuja PRIMEIRA operação é `metodo`.
 *
 * Não dá para pegar "a última chamada da tabela": toda mutação invalida a lista
 * e dispara um refetch, então a última chamada depois de um insert é o SELECT do
 * refetch, não o insert. Cada operação abre o próprio builder, e é a primeira
 * chamada nele que diz o que aquela ida ao banco era.
 */
function chamadaQueComecaCom(table: string, metodo: string) {
  return chamadas.find((c) => c.table === table && c.ops[0]?.metodo === metodo);
}

/** Filtros `eq` da chamada que começa com `metodo`. */
function filtrosDe(table: string, metodo: string) {
  return (chamadaQueComecaCom(table, metodo)?.ops ?? [])
    .filter((o) => o.metodo === 'eq')
    .map((o) => ({ coluna: o.args[0], valor: o.args[1] }));
}

/** Payload enviado na operação de escrita (`insert` ou `update`). */
function payloadDe(table: string, metodo: 'insert' | 'update') {
  return chamadaQueComecaCom(table, metodo)?.ops[0]?.args[0] as
    | Record<string, unknown>
    | undefined;
}

beforeEach(() => {
  chamadas.length = 0;
  resultadoSelect = [];
});

describe('leitura', () => {
  it('recorta por tenant_id da Conta em foco', async () => {
    resultadoSelect = [
      {
        id: 'r1',
        name: 'Saudação',
        content: 'Olá {first_name}',
        created_by_name: 'Paulo Andrade',
        updated_by_name: 'Paulo Andrade',
        created_at: '2026-08-24T10:00:00Z',
        updated_at: '2026-08-24T10:00:00Z',
      },
    ];

    const { result } = renderHook(() => useQuickReplies(), { wrapper });
    await waitFor(() => expect(result.current.quickReplies).toHaveLength(1));

    expect(filtrosDe('quick_replies', 'select')).toContainEqual({
      coluna: 'tenant_id',
      valor: TENANT_ATUAL,
    });
  });

  it('lê a tabela quick_replies — e não a message_templates aposentada', async () => {
    renderHook(() => useQuickReplies(), { wrapper });
    await waitFor(() => expect(chamadas.length).toBeGreaterThan(0));

    expect(chamadas.map((c) => c.table)).toContain('quick_replies');
    expect(chamadas.map((c) => c.table)).not.toContain('message_templates');
  });
});

describe('escrita', () => {
  it('grava tenant_id no insert', async () => {
    resultadoSelect = [{ id: 'novo', name: 'Horário', content: 'Das 9h às 18h' }];
    const { result } = renderHook(() => useQuickReplies(), { wrapper });

    await act(async () => {
      await result.current.criar.mutateAsync({ name: 'Horário', content: 'Das 9h às 18h' });
    });

    expect(payloadDe('quick_replies', 'insert')).toMatchObject({ tenant_id: TENANT_ATUAL });
  });

  it('não deixa a tela forjar autoria — quem carimba é o gatilho no banco', async () => {
    resultadoSelect = [{ id: 'novo', name: 'X', content: 'Y' }];
    const { result } = renderHook(() => useQuickReplies(), { wrapper });

    await act(async () => {
      await result.current.criar.mutateAsync({ name: 'X', content: 'Y' });
    });

    const enviado = payloadDe('quick_replies', 'insert')!;
    expect(Object.keys(enviado)).toEqual(['tenant_id', 'name', 'content']);
  });

  it('filtra por Conta no update, além do id', async () => {
    resultadoSelect = [{ id: 'r1', name: 'Novo nome', content: 'Novo texto' }];
    const { result } = renderHook(() => useQuickReplies(), { wrapper });

    await act(async () => {
      await result.current.atualizar.mutateAsync({
        id: 'r1',
        name: 'Novo nome',
        content: 'Novo texto',
      });
    });

    expect(filtrosDe('quick_replies', 'update')).toEqual(
      expect.arrayContaining([
        { coluna: 'id', valor: 'r1' },
        { coluna: 'tenant_id', valor: TENANT_ATUAL },
      ]),
    );
  });

  it('filtra por Conta no delete, além do id', async () => {
    const { result } = renderHook(() => useQuickReplies(), { wrapper });

    await act(async () => {
      await result.current.remover.mutateAsync('r1');
    });

    expect(filtrosDe('quick_replies', 'delete')).toEqual(
      expect.arrayContaining([
        { coluna: 'id', valor: 'r1' },
        { coluna: 'tenant_id', valor: TENANT_ATUAL },
      ]),
    );
  });

  it('apara espaços em volta do nome e do conteúdo', async () => {
    resultadoSelect = [{ id: 'novo' }];
    const { result } = renderHook(() => useQuickReplies(), { wrapper });

    await act(async () => {
      await result.current.criar.mutateAsync({
        name: '  Saudação  ',
        content: '  Olá!  ',
      });
    });

    expect(payloadDe('quick_replies', 'insert')).toMatchObject({
      name: 'Saudação',
      content: 'Olá!',
    });
  });
});
