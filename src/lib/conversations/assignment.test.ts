/**
 * Responsável por conversa — as regras puras e as duas escritas.
 *
 * O dublê de cliente abaixo registra exatamente o que foi pedido ao banco:
 * patch, filtros e se a guarda `assigned_profile_id IS NULL` foi para o WHERE.
 * É isso que prova a concorrência: o segundo "Assumir" não é rejeitado por
 * lógica do front, e sim porque o UPDATE com a guarda não alcança a linha.
 */

import { describe, it, expect } from 'vitest';
import {
  assumeConversation,
  buildAssignmentPatch,
  isAssignedTo,
  isUnassigned,
  transferConversation,
  type AssignmentPatch,
  type ConversationsClient,
} from './assignment';

const AGORA = new Date('2026-09-13T12:00:00.000Z');
const CONVERSA = 'c0000000-0000-4000-8000-000000000001';
const LOJA = 'a0000000-0000-4000-8000-000000000001';
const MARIA = 'p0000000-0000-4000-8000-00000000000a';
const JOAO = 'p0000000-0000-4000-8000-00000000000b';

interface Chamada {
  patch?: AssignmentPatch;
  select?: string;
  filtros: Array<{ op: 'eq' | 'is'; column: string; value: string | null }>;
}

/**
 * Banco de mentira com UMA conversa. Aplica a guarda de verdade: o UPDATE só
 * "pega" a linha se todos os filtros casarem com o estado atual — igual ao
 * PostgreSQL. Devolve as chamadas para o teste afirmar o que foi pedido.
 */
function criarBanco(estadoInicial: { assigned_profile_id: string | null }) {
  const linha = { id: CONVERSA, tenant_id: LOJA, ...estadoInicial };
  const chamadas: Chamada[] = [];

  const casa = (filtros: Chamada['filtros']) =>
    filtros.every(({ op, column, value }) => {
      const atual = (linha as Record<string, string | null>)[column];
      return op === 'is' ? atual === value : atual === value;
    });

  const client: ConversationsClient = {
    from: () => ({
      update: (patch) => {
        const chamada: Chamada = { patch, filtros: [] };
        chamadas.push(chamada);
        const chain = {
          eq: (column: string, value: string) => {
            chamada.filtros.push({ op: 'eq', column, value });
            return chain;
          },
          is: (column: string, value: null) => {
            chamada.filtros.push({ op: 'is', column, value });
            return chain;
          },
          select: (columns: string) => {
            chamada.select = columns;
            if (!casa(chamada.filtros)) {
              return Promise.resolve({ data: [], error: null });
            }
            Object.assign(linha, patch);
            return Promise.resolve({ data: [{ id: linha.id }], error: null });
          },
        };
        return chain;
      },
      select: () => {
        const chamada: Chamada = { filtros: [] };
        chamadas.push(chamada);
        const chain = {
          eq: (column: string, value: string) => {
            chamada.filtros.push({ op: 'eq', column, value });
            return chain;
          },
          maybeSingle: () =>
            Promise.resolve({
              data: casa(chamada.filtros)
                ? { assigned_profile_id: linha.assigned_profile_id }
                : null,
              error: null,
            }),
        };
        return chain;
      },
    }),
  };

  return { client, linha, chamadas };
}

describe('buildAssignmentPatch', () => {
  it('grava as três colunas juntas, com o instante informado', () => {
    expect(buildAssignmentPatch(MARIA, JOAO, AGORA)).toEqual({
      assigned_profile_id: MARIA,
      assigned_at: AGORA.toISOString(),
      assigned_by: JOAO,
    });
  });

  it('assumir para si deixa assigned_by igual ao responsável — é o que cala o aviso no sino', () => {
    const patch = buildAssignmentPatch(MARIA, MARIA, AGORA);
    expect(patch.assigned_by).toBe(patch.assigned_profile_id);
  });
});

describe('isUnassigned / isAssignedTo', () => {
  it('null, ausente e conversa indefinida contam como sem responsável', () => {
    expect(isUnassigned({ assigned_profile_id: null })).toBe(true);
    expect(isUnassigned({})).toBe(true);
    expect(isUnassigned(undefined)).toBe(true);
    expect(isUnassigned({ assigned_profile_id: MARIA })).toBe(false);
  });

  it('isAssignedTo exige perfil e igualdade', () => {
    expect(isAssignedTo({ assigned_profile_id: MARIA }, MARIA)).toBe(true);
    expect(isAssignedTo({ assigned_profile_id: MARIA }, JOAO)).toBe(false);
    expect(isAssignedTo({ assigned_profile_id: MARIA }, null)).toBe(false);
    expect(isAssignedTo({ assigned_profile_id: null }, MARIA)).toBe(false);
  });
});

describe('assumeConversation', () => {
  it('assume uma conversa sem responsável e grava as três colunas', async () => {
    const { client, linha, chamadas } = criarBanco({ assigned_profile_id: null });

    const resultado = await assumeConversation(client, {
      conversationId: CONVERSA,
      tenantId: LOJA,
      profileId: MARIA,
      now: AGORA,
    });

    expect(resultado).toEqual({ status: 'assigned' });
    expect(linha).toMatchObject({
      assigned_profile_id: MARIA,
      assigned_at: AGORA.toISOString(),
      assigned_by: MARIA,
    });
    // Uma escrita só, com a guarda no WHERE, e nenhuma leitura extra.
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].filtros).toEqual([
      { op: 'eq', column: 'id', value: CONVERSA },
      { op: 'eq', column: 'tenant_id', value: LOJA },
      { op: 'is', column: 'assigned_profile_id', value: null },
    ]);
    expect(chamadas[0].select).toBe('id');
  });

  it('CONCORRÊNCIA: o segundo "Assumir" não sobrescreve e devolve quem ficou', async () => {
    const { client, linha, chamadas } = criarBanco({ assigned_profile_id: null });

    const primeiro = await assumeConversation(client, {
      conversationId: CONVERSA,
      tenantId: LOJA,
      profileId: MARIA,
      now: AGORA,
    });
    const segundo = await assumeConversation(client, {
      conversationId: CONVERSA,
      tenantId: LOJA,
      profileId: JOAO,
      now: new Date(AGORA.getTime() + 5_000),
    });

    expect(primeiro).toEqual({ status: 'assigned' });
    expect(segundo).toEqual({ status: 'taken', holderProfileId: MARIA });
    // A linha continua com a Maria — o João não passou por cima.
    expect(linha.assigned_profile_id).toBe(MARIA);
    expect(linha.assigned_by).toBe(MARIA);
    // O segundo fez a escrita guardada (0 linhas) e depois UMA leitura.
    expect(chamadas).toHaveLength(3);
    expect(chamadas[2].patch).toBeUndefined();
    expect(chamadas[2].filtros).toEqual([
      { op: 'eq', column: 'id', value: CONVERSA },
      { op: 'eq', column: 'tenant_id', value: LOJA },
    ]);
  });

  it('conversa que sumiu do alcance devolve taken sem responsável conhecido', async () => {
    const { client } = criarBanco({ assigned_profile_id: null });

    const resultado = await assumeConversation(client, {
      conversationId: 'outra-conversa',
      tenantId: LOJA,
      profileId: MARIA,
      now: AGORA,
    });

    expect(resultado).toEqual({ status: 'taken', holderProfileId: null });
  });

  it('propaga erro do banco em vez de fingir sucesso', async () => {
    const client: ConversationsClient = {
      from: () => ({
        update: () => {
          const chain = {
            eq: () => chain,
            is: () => chain,
            select: () =>
              Promise.resolve({ data: null, error: { code: '42703', message: 'column does not exist' } }),
          };
          return chain;
        },
        select: () => {
          throw new Error('não devia ler');
        },
      }),
    };

    await expect(
      assumeConversation(client, { conversationId: CONVERSA, tenantId: LOJA, profileId: MARIA }),
    ).rejects.toMatchObject({ code: '42703' });
  });
});

describe('transferConversation', () => {
  it('transfere uma conversa que já tem responsável, gravando quem transferiu', async () => {
    const { client, linha, chamadas } = criarBanco({ assigned_profile_id: MARIA });

    const resultado = await transferConversation(client, {
      conversationId: CONVERSA,
      tenantId: LOJA,
      toProfileId: JOAO,
      byProfileId: MARIA,
      now: AGORA,
    });

    expect(resultado).toEqual({ status: 'transferred' });
    expect(linha).toMatchObject({
      assigned_profile_id: JOAO,
      assigned_at: AGORA.toISOString(),
      assigned_by: MARIA,
    });
    // Transferir NÃO leva a guarda IS NULL — é para trocar de mãos mesmo.
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].filtros.some((f) => f.op === 'is')).toBe(false);
  });

  it('também atribui uma conversa sem responsável', async () => {
    const { client, linha } = criarBanco({ assigned_profile_id: null });

    await transferConversation(client, {
      conversationId: CONVERSA,
      tenantId: LOJA,
      toProfileId: JOAO,
      byProfileId: MARIA,
      now: AGORA,
    });

    expect(linha.assigned_profile_id).toBe(JOAO);
    expect(linha.assigned_by).toBe(MARIA);
  });

  it('falha alto quando o UPDATE não alcança nenhuma linha (RLS filtrou ou a conversa sumiu)', async () => {
    const { client, linha } = criarBanco({ assigned_profile_id: MARIA });

    await expect(
      transferConversation(client, {
        conversationId: 'outra-conversa',
        tenantId: LOJA,
        toProfileId: JOAO,
        byProfileId: MARIA,
      }),
    ).rejects.toThrow(/não encontrada/);
    expect(linha.assigned_profile_id).toBe(MARIA);
  });
});
