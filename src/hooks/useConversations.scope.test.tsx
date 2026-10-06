/**
 * Paridade entre a lista e a contagem das pílulas, e a forma da query com o
 * filtro de etiqueta.
 *
 * A lista (`useConversations`) e as três contagens de servidor
 * (`useConversationsCount`) precisam recortar o MESMO universo — foi aqui que
 * "12" na pílula e 9 conversas na lista poderiam divergir em silêncio. O teste
 * roda os dois hooks de verdade contra um cliente Supabase que só grava o que
 * foi pedido, e compara filtro por filtro.
 *
 * Também trava a forma do select com etiqueta: `contacts` vira `!inner`, o
 * embed de filtro entra com o alias `etiquetas_filtro`, e o embed de exibição
 * (`contact_tags`, sem filtro) continua lá — é dele que o cartão lê TODAS as
 * etiquetas do contato.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Call = { method: string; args: unknown[] };
type Recorded = { table: string; select: string; selectOptions?: unknown; calls: Call[] };

const gravador = vi.hoisted(() => ({ queries: [] as Recorded[] }));

vi.mock('@/integrations/supabase/client', () => {
  const FILTERS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is', 'or', 'order', 'limit'];
  const from = (table: string) => {
    const rec: Recorded = { table, select: '', calls: [] };
    gravador.queries.push(rec);
    const builder: Record<string, unknown> = {
      select: (cols: string, options?: unknown) => {
        rec.select = cols;
        rec.selectOptions = options;
        return builder;
      },
      // Thenable: `await query` devolve uma página vazia e contagem zero.
      then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null, count: 0 }),
    };
    for (const m of FILTERS) {
      builder[m] = (...args: unknown[]) => {
        rec.calls.push({ method: m, args });
        return builder;
      };
    }
    return builder;
  };
  return { supabase: { from } };
});
vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenant: { id: 'loja-1' } }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import {
  useConversations,
  useConversationsCount,
  endOfLocalDay,
  TAG_FILTER_EMBED,
} from './useConversations';
import { AWAITING_REPLY_FILTER } from '@/lib/conversations/channel';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

/** Só o recorte: fora ordenação, limite e cursor, que são da paginação. */
const recorte = (rec: Recorded) =>
  rec.calls.filter((c) => !['order', 'limit', 'lt'].includes(c.method));

/** Roda lista e contagem com as MESMAS opções e devolve as duas gravações. */
const rodarOsDois = async (opts: Parameters<typeof useConversations>[0]) => {
  gravador.queries.length = 0;
  renderHook(() => useConversations(opts), { wrapper });
  renderHook(() => useConversationsCount(opts), { wrapper });
  await waitFor(() => expect(gravador.queries).toHaveLength(2));
  await waitFor(() => expect(gravador.queries.every((q) => q.calls.length > 0)).toBe(true));
  const lista = gravador.queries.find((q) => q.selectOptions === undefined)!;
  const contagem = gravador.queries.find((q) => q.selectOptions !== undefined)!;
  return { lista, contagem };
};

const normalizar = (s: string) => s.replace(/\s+/g, ' ').trim();

beforeEach(() => {
  gravador.queries.length = 0;
});

describe('paridade lista × contagem', () => {
  it('só etiquetas: os dois recortam pelo mesmo caminho de embed', async () => {
    const { lista, contagem } = await rodarOsDois({ tagIds: ['t1', 't2'] });
    expect(recorte(lista)).toEqual(recorte(contagem));
    expect(recorte(lista)).toContainEqual({
      method: 'in',
      args: [`contacts.${TAG_FILTER_EMBED}.tag_id`, ['t1', 't2']],
    });
  });

  it('etiquetas + busca: o `.or()` da busca e o `in` da etiqueta vão nos dois', async () => {
    const { lista, contagem } = await rodarOsDois({ tagIds: ['t1'], searchQuery: ' Ana ' });
    expect(recorte(lista)).toEqual(recorte(contagem));
    expect(recorte(lista).map((c) => c.method)).toEqual(
      expect.arrayContaining(['or', 'in']),
    );
    // A busca já era `!inner`; com etiqueta o embed continua um só, inner.
    expect(normalizar(lista.select)).toContain('contacts!inner (');
    expect(normalizar(contagem.select)).toBe(
      `id, contacts!inner(id, ${TAG_FILTER_EMBED}:contact_tags!inner (tag_id))`,
    );
  });

  it('etiquetas + pílula "Não lidas" + arquivadas + período + instância: tudo igual nos dois', async () => {
    const opts = {
      tagIds: ['t1'],
      hasUnread: true,
      isArchived: true,
      whatsappInstanceId: 'inst-1',
      dateFrom: new Date(2026, 8, 1),
      dateTo: new Date(2026, 8, 20),
    };
    const { lista, contagem } = await rodarOsDois(opts);
    expect(recorte(lista)).toEqual(recorte(contagem));
    const metodos = recorte(lista).map((c) => `${c.method}:${c.args[0]}`);
    expect(metodos).toEqual([
      'eq:tenant_id',
      'eq:is_archived',
      'eq:whatsapp_instance_id',
      `in:contacts.${TAG_FILTER_EMBED}.tag_id`,
      'gt:unread_count',
      'gte:last_message_at',
      'lte:last_message_at',
    ]);
  });

  it('sem etiqueta nada muda: embed LEFT, sem alias de filtro, sem `in`', async () => {
    const { lista, contagem } = await rodarOsDois({});
    expect(recorte(lista)).toEqual(recorte(contagem));
    expect(recorte(lista).map((c) => c.method)).not.toContain('in');
    expect(normalizar(lista.select)).toContain(' contacts (');
    expect(normalizar(lista.select)).not.toContain(TAG_FILTER_EMBED);
    expect(contagem.select).toBe('id');
  });
});

describe('forma do select com etiqueta (o cartão continua com todas as etiquetas)', () => {
  it('a lista embute contact_tags DUAS vezes: o alias filtra, o original exibe', async () => {
    const { lista } = await rodarOsDois({ tagIds: ['t1'] });
    const select = normalizar(lista.select);
    expect(select).toContain('contacts!inner (');
    expect(select).toContain(`${TAG_FILTER_EMBED}:contact_tags!inner (tag_id)`);
    // O embed de exibição, sem `!inner` e com `tags (id, name, color)`:
    expect(select).toMatch(/[^:]contact_tags \( tag_id, tags \( id, name, color \) \)/);
    // ...e o alias não leva `tags(...)`: é só o join.
    expect(select).not.toMatch(new RegExp(`${TAG_FILTER_EMBED}:contact_tags!inner \\( tag_id, tags`));
  });

  it('a contagem NÃO embute o de exibição (não exibe nada), só o de filtro', async () => {
    const { contagem } = await rodarOsDois({ tagIds: ['t1'] });
    expect(contagem.select).toBe(`id, contacts!inner(id, ${TAG_FILTER_EMBED}:contact_tags!inner (tag_id))`);
    expect(contagem.selectOptions).toEqual({ count: 'exact', head: true });
  });
});

describe('"Até" inclui o dia inteiro', () => {
  it('endOfLocalDay devolve 23:59:59.999 do mesmo dia, no fuso local', () => {
    const fim = endOfLocalDay(new Date(2026, 8, 20, 0, 0, 0, 0));
    expect([fim.getFullYear(), fim.getMonth(), fim.getDate()]).toEqual([2026, 8, 20]);
    expect([fim.getHours(), fim.getMinutes(), fim.getSeconds(), fim.getMilliseconds()]).toEqual([
      23, 59, 59, 999,
    ]);
  });

  it('não importa a hora que veio no Date: o dia é o mesmo, o fim também', () => {
    const meioDia = endOfLocalDay(new Date(2026, 8, 20, 12, 30));
    const meiaNoite = endOfLocalDay(new Date(2026, 8, 20, 0, 0));
    expect(meioDia.getTime()).toBe(meiaNoite.getTime());
  });

  it('lista e contagem mandam o fim do dia no lte, não a meia-noite', async () => {
    const ate = new Date(2026, 8, 20);
    const { lista, contagem } = await rodarOsDois({ dateTo: ate });
    const esperado = endOfLocalDay(ate).toISOString();
    const lteLista = recorte(lista).find((c) => c.method === 'lte')!;
    const lteContagem = recorte(contagem).find((c) => c.method === 'lte')!;
    expect(lteLista.args).toEqual(['last_message_at', esperado]);
    expect(lteContagem.args).toEqual(['last_message_at', esperado]);
    expect(esperado).not.toBe(ate.toISOString());
  });

  it('"De" continua na meia-noite do dia (início inclusivo)', async () => {
    const de = new Date(2026, 8, 1);
    const { lista } = await rodarOsDois({ dateFrom: de });
    expect(recorte(lista).find((c) => c.method === 'gte')!.args).toEqual([
      'last_message_at',
      de.toISOString(),
    ]);
  });
});

// ---------------------------------------------------------------------------
// Filtro por responsável (2026-09-21): o filtro por atendente do modal e as
// pílulas "Minhas" / "Sem responsável", todos no servidor, pelo MESMO
// applyConversationScope — lista e contagem contam o mesmo universo.
// ---------------------------------------------------------------------------
describe('paridade lista × contagem — responsável', () => {
  it('só atendente: `in` em assigned_profile_id nos dois, sem embed nem `!inner`', async () => {
    const { lista, contagem } = await rodarOsDois({ assignedProfileIds: ['maria', 'joao'] });
    expect(recorte(lista)).toEqual(recorte(contagem));
    expect(recorte(lista)).toContainEqual({ method: 'in', args: ['assigned_profile_id', ['maria', 'joao']] });
    // Coluna da própria conversa: o embed de contatos continua LEFT e sem alias.
    expect(normalizar(lista.select)).toContain(' contacts (');
    expect(normalizar(lista.select)).not.toContain(TAG_FILTER_EMBED);
    expect(contagem.select).toBe('id');
  });

  it('pílula "Sem responsável": `is null` em assigned_profile_id nos dois', async () => {
    const { lista, contagem } = await rodarOsDois({ unassignedOnly: true });
    expect(recorte(lista)).toEqual(recorte(contagem));
    expect(recorte(lista)).toContainEqual({ method: 'is', args: ['assigned_profile_id', null] });
    expect(recorte(lista).map((c) => c.method)).not.toContain('in');
  });

  it('pílula "Minhas" (= eu, sozinho): `in` com um id só, nos dois', async () => {
    const { lista, contagem } = await rodarOsDois({ assignedProfileIds: ['eu'] });
    expect(recorte(lista)).toEqual(recorte(contagem));
    expect(recorte(lista)).toContainEqual({ method: 'in', args: ['assigned_profile_id', ['eu']] });
  });

  it('atendente + etiquetas + busca + pílula "Não lidas": tudo igual nos dois, na mesma ordem', async () => {
    const opts = {
      assignedProfileIds: ['maria'],
      tagIds: ['t1'],
      searchQuery: 'Ana',
      hasUnread: true,
    };
    const { lista, contagem } = await rodarOsDois(opts);
    expect(recorte(lista)).toEqual(recorte(contagem));
    const metodos = recorte(lista).map((c) => `${c.method}:${c.args[0]}`);
    expect(metodos).toEqual([
      'eq:tenant_id',
      'eq:is_archived',
      'or:name.ilike."%Ana%",phone.ilike."%Ana%"',
      `in:contacts.${TAG_FILTER_EMBED}.tag_id`,
      'in:assigned_profile_id',
      'gt:unread_count',
    ]);
    // A busca e a etiqueta continuam pedindo `!inner`; o responsável não muda isso.
    expect(normalizar(lista.select)).toContain('contacts!inner (');
    expect(normalizar(contagem.select)).toBe(
      `id, contacts!inner(id, ${TAG_FILTER_EMBED}:contact_tags!inner (tag_id))`,
    );
  });

  it('"Sem responsável" + etiquetas + período + arquivadas: igual nos dois', async () => {
    const opts = {
      unassignedOnly: true,
      tagIds: ['t1'],
      isArchived: true,
      dateFrom: new Date(2026, 8, 1),
      dateTo: new Date(2026, 8, 20),
    };
    const { lista, contagem } = await rodarOsDois(opts);
    expect(recorte(lista)).toEqual(recorte(contagem));
    expect(recorte(lista).map((c) => `${c.method}:${c.args[0]}`)).toEqual([
      'eq:tenant_id',
      'eq:is_archived',
      `in:contacts.${TAG_FILTER_EMBED}.tag_id`,
      'is:assigned_profile_id',
      'gte:last_message_at',
      'lte:last_message_at',
    ]);
  });

  it('sem responsável no recorte nada muda: nem `in` nem `is` em assigned_profile_id', async () => {
    const { lista, contagem } = await rodarOsDois({ tagIds: ['t1'] });
    expect(recorte(lista)).toEqual(recorte(contagem));
    expect(recorte(lista).map((c) => c.method)).not.toContain('is');
    expect(recorte(lista).filter((c) => c.args[0] === 'assigned_profile_id')).toHaveLength(0);
  });

  it('a contagem de "Minhas"/"Sem responsável" é exata: count exact + head, como as outras', async () => {
    const { contagem } = await rodarOsDois({ unassignedOnly: true });
    expect(contagem.selectOptions).toEqual({ count: 'exact', head: true });
    const { contagem: minhas } = await rodarOsDois({ assignedProfileIds: ['eu'] });
    expect(minhas.selectOptions).toEqual({ count: 'exact', head: true });
  });
});

// ---------------------------------------------------------------------------
// Canal (fatia 4a do Instagram, 2026-09-25): a chave WhatsApp/Instagram entra
// no MESMO applyConversationScope — lista e contagem recortam o mesmo canal por
// construção. O selo do outro canal é uma contagem com `awaitingReply`.
// ---------------------------------------------------------------------------
describe('paridade lista × contagem — canal', () => {
  it('só o canal: `eq channel` logo depois de arquivadas, nos dois', async () => {
    const { lista, contagem } = await rodarOsDois({ channel: 'instagram' });
    expect(recorte(lista)).toEqual(recorte(contagem));
    expect(recorte(lista).map((c) => `${c.method}:${c.args[0]}`)).toEqual([
      'eq:tenant_id',
      'eq:is_archived',
      'eq:channel',
    ]);
    expect(recorte(lista)).toContainEqual({ method: 'eq', args: ['channel', 'instagram'] });
  });

  it('WhatsApp também filtra: a lista do WhatsApp não traz conversa do Instagram', async () => {
    const { lista, contagem } = await rodarOsDois({ channel: 'whatsapp' });
    expect(recorte(lista)).toEqual(recorte(contagem));
    expect(recorte(contagem)).toContainEqual({ method: 'eq', args: ['channel', 'whatsapp'] });
  });

  it('canal + tudo (busca, etiquetas, responsável, não lidas, período, instância): igual nos dois, na mesma ordem', async () => {
    const opts = {
      channel: 'instagram' as const,
      searchQuery: 'ana',
      tagIds: ['t1'],
      assignedProfileIds: ['maria'],
      hasUnread: true,
      whatsappInstanceId: 'ig-1',
      dateFrom: new Date(2026, 8, 1),
      dateTo: new Date(2026, 8, 20),
    };
    const { lista, contagem } = await rodarOsDois(opts);
    expect(recorte(lista)).toEqual(recorte(contagem));
    expect(recorte(lista).map((c) => `${c.method}:${c.args[0]}`)).toEqual([
      'eq:tenant_id',
      'eq:is_archived',
      'eq:channel',
      'eq:whatsapp_instance_id',
      // Instagram busca no nome e no @ (o cliente não tem telefone).
      'or:name.ilike."%ana%",username.ilike."%ana%"',
      `in:contacts.${TAG_FILTER_EMBED}.tag_id`,
      'in:assigned_profile_id',
      'gt:unread_count',
      'gte:last_message_at',
      'lte:last_message_at',
    ]);
  });

  it('sem canal (quem não é a tela de Conversas): nada de `eq channel`, como antes da chave', async () => {
    const { lista, contagem } = await rodarOsDois({ tagIds: ['t1'] });
    expect(recorte(lista).filter((c) => c.args[0] === 'channel')).toHaveLength(0);
    expect(recorte(contagem).filter((c) => c.args[0] === 'channel')).toHaveLength(0);
  });

  it('a lista pede o canal da conversa e do contato no select', async () => {
    const { lista } = await rodarOsDois({ channel: 'whatsapp' });
    const select = normalizar(lista.select);
    expect(select).toMatch(/^id, contact_id, channel, /);
    expect(select).toMatch(/ contacts \( id, name, phone, channel, /);
  });
});

describe('selo do outro canal — "aguardando resposta" no servidor', () => {
  const rodarContagem = async (opts: Parameters<typeof useConversationsCount>[0]) => {
    gravador.queries.length = 0;
    renderHook(() => useConversationsCount(opts), { wrapper });
    await waitFor(() => expect(gravador.queries).toHaveLength(1));
    await waitFor(() => expect(gravador.queries[0]!.calls.length).toBeGreaterThan(0));
    return gravador.queries[0]!;
  };

  it('conta exato, no canal pedido, só não arquivadas, com a regra da pílula "Aguardando"', async () => {
    const q = await rodarContagem({ channel: 'instagram', isArchived: false, awaitingReply: true });
    expect(q.selectOptions).toEqual({ count: 'exact', head: true });
    expect(q.select).toBe('id');
    expect(q.calls.map((c) => `${c.method}:${c.args[0]}`)).toEqual([
      'eq:tenant_id',
      'eq:is_archived',
      'eq:channel',
      `or:${AWAITING_REPLY_FILTER}`,
    ]);
    expect(q.calls).toContainEqual({ method: 'eq', args: ['is_archived', false] });
    expect(q.calls).toContainEqual({ method: 'eq', args: ['channel', 'instagram'] });
  });

  it('o `.or()` é da própria conversa (sem referencedTable): não recorta o contato', async () => {
    const q = await rodarContagem({ channel: 'whatsapp', awaitingReply: true });
    const or = q.calls.find((c) => c.method === 'or')!;
    expect(or.args).toEqual([AWAITING_REPLY_FILTER]);
  });

  it('sem awaitingReply a contagem não ganha `.or()` nenhum', async () => {
    const q = await rodarContagem({ channel: 'whatsapp' });
    expect(q.calls.map((c) => c.method)).not.toContain('or');
  });
});

// ---------------------------------------------------------------------------
// Busca pelo @ do Instagram (fatia 4a, nome do contato)
// ---------------------------------------------------------------------------
describe('busca — @ do Instagram', () => {
  it('no Instagram procura nome e @; "@ana" procura o @ sem a arroba', async () => {
    const { lista, contagem } = await rodarOsDois({ channel: 'instagram', searchQuery: '@ana' });
    expect(recorte(lista)).toEqual(recorte(contagem));
    expect(recorte(lista)).toContainEqual({
      method: 'or',
      args: ['name.ilike."%@ana%",username.ilike."%ana%"', { referencedTable: 'contacts' }],
    });
    // Busca com filtro no contato precisa de join inner nos dois.
    expect(normalizar(lista.select)).toContain('contacts!inner (');
    expect(contagem.select).toBe('id, contacts!inner(id)');
  });

  it('sem arroba procura o mesmo texto no nome e no @', async () => {
    const { lista } = await rodarOsDois({ channel: 'instagram', searchQuery: 'paulo' });
    expect(recorte(lista)).toContainEqual({
      method: 'or',
      args: ['name.ilike."%paulo%",username.ilike."%paulo%"', { referencedTable: 'contacts' }],
    });
  });

  it('WhatsApp continua nome e telefone, igual a antes', async () => {
    const { lista, contagem } = await rodarOsDois({ channel: 'whatsapp', searchQuery: 'ana' });
    expect(recorte(lista)).toEqual(recorte(contagem));
    expect(recorte(lista)).toContainEqual({
      method: 'or',
      args: ['name.ilike."%ana%",phone.ilike."%ana%"', { referencedTable: 'contacts' }],
    });
  });

  it('a lista traz o @ e o estado da busca do perfil no embed do contato', async () => {
    const { lista } = await rodarOsDois({ channel: 'instagram' });
    const select = normalizar(lista.select);
    expect(select).toContain('channel, username, profile_status, profile_checked_at, whatsapp_instance_id,');
  });
});
