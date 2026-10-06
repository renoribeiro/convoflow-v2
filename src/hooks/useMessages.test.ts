import { describe, expect, it } from 'vitest';
import { getAllMessages, type Message, type MessagesPage } from './useMessages';

/**
 * Regressão: conversa embaralhada na emenda entre páginas.
 *
 * A Helena relatou (2026-08-28) mensagens de 14 de julho aparecendo no meio das
 * de ontem. Não era a lista de conversas se refazendo — era a própria conversa:
 * o trecho antigo, carregado ao rolar para cima, entrava DEPOIS do recente.
 */

/** Mensagem mínima; só `id` e `created_at` importam para a ordem. */
function msg(id: string, createdAt: string): Message {
  return {
    id,
    content: id,
    created_at: createdAt,
    direction: 'inbound',
    status: 'read',
    message_type: 'text',
    contact_id: 'contato-1',
    tenant_id: 'loja-1',
    is_from_bot: false,
    source: null,
    campaign_id: null,
  };
}

/**
 * Monta uma página como o `queryFn` de `useMessages` monta.
 *
 * A query pede `created_at` DECRESCENTE e o hook chama `.reverse()` antes de
 * devolver, então dentro da página a ordem é crescente. O teste reproduz esse
 * caminho em vez de já entregar a lista pronta: é justamente a diferença entre
 * "ordem dentro da página" e "ordem entre páginas" que o bug explorava.
 */
function page(maisNovaPrimeiro: Message[], hasMore: boolean): MessagesPage {
  const emOrdemDeChegada = [...maisNovaPrimeiro];
  return {
    data: emOrdemDeChegada.reverse(),
    nextCursor: hasMore ? maisNovaPrimeiro.at(-1)?.created_at : undefined,
    hasMore,
  };
}

/** Só o que `getAllMessages` lê do retorno do hook. */
function query(pages: MessagesPage[]) {
  return { data: { pages } } as unknown as Parameters<typeof getAllMessages>[0];
}

const JULHO_1 = msg('julho-1', '2026-07-14T09:00:00.000Z');
const JULHO_2 = msg('julho-2', '2026-07-14T09:05:00.000Z');
const ONTEM_1 = msg('ontem-1', '2026-08-27T10:00:00.000Z');
const ONTEM_2 = msg('ontem-2', '2026-08-27T10:05:00.000Z');

describe('getAllMessages', () => {
  it('devolve lista vazia antes da primeira página chegar', () => {
    expect(getAllMessages(query([]))).toEqual([]);
    expect(getAllMessages({ data: undefined } as never)).toEqual([]);
  });

  it('mantém a ordem crescente dentro de uma única página', () => {
    const uma = page([ONTEM_2, ONTEM_1], false);

    expect(getAllMessages(query([uma])).map((m) => m.id)).toEqual([
      'ontem-1',
      'ontem-2',
    ]);
  });

  it('coloca a página mais antiga ANTES da mais recente na emenda', () => {
    // Página 0 = fim da conversa (ontem). Página 1 = trecho anterior (julho),
    // que é o que `fetchNextPage` traz ao rolar para cima.
    const recente = page([ONTEM_2, ONTEM_1], true);
    const antiga = page([JULHO_2, JULHO_1], false);

    const ids = getAllMessages(query([recente, antiga])).map((m) => m.id);

    expect(ids).toEqual(['julho-1', 'julho-2', 'ontem-1', 'ontem-2']);
  });

  it('fica em ordem cronológica crescente com três páginas', () => {
    const maisAntiga = page([msg('a-2', '2026-06-01T09:05:00.000Z'), msg('a-1', '2026-06-01T09:00:00.000Z')], false);
    const meio = page([JULHO_2, JULHO_1], true);
    const recente = page([ONTEM_2, ONTEM_1], true);

    const timestamps = getAllMessages(query([recente, meio, maisAntiga])).map((m) =>
      new Date(m.created_at).getTime(),
    );

    const crescente = [...timestamps].sort((a, b) => a - b);
    expect(timestamps).toEqual(crescente);
  });

  it('não altera o array de páginas do cache', () => {
    const recente = page([ONTEM_2, ONTEM_1], true);
    const antiga = page([JULHO_2, JULHO_1], false);
    const pages = [recente, antiga];

    getAllMessages(query(pages));

    // `reverse()` mexe no array original: se o cache do React Query fosse
    // invertido no lugar, a próxima página entraria no lado errado.
    expect(pages[0]).toBe(recente);
    expect(pages[1]).toBe(antiga);
  });
});
