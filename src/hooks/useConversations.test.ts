/**
 * Testes das regras puras que sustentam a prévia desnormalizada da última
 * mensagem em `useConversations`.
 *
 * São dois comportamentos que já existiam por acidente e agora ficam travados
 * por teste, porque a desnormalização passa perto dos dois:
 *
 *   Armadilha 1 — conversa SEM mensagem nenhuma continua caindo em
 *   "Aguardando". Antes isso saía do `?? 'inbound'` da lista sobre um
 *   `last_message` indefinido. Se as colunas novas fizessem `mapLastMessage`
 *   devolver um objeto com direção 'outbound', a conversa sumiria da fila de
 *   trabalho e ninguém perceberia.
 *
 *   Armadilha 2 — 'incoming' é sinônimo histórico de 'inbound' no banco, mas
 *   todo leitor do front testa `!== 'inbound'`. Sem normalizar, uma mensagem do
 *   cliente seria lida como mensagem nossa.
 */

import { describe, it, expect, vi } from 'vitest';

// Só as funções puras interessam aqui; o cliente do Supabase não é usado.
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import {
  mapLastMessage,
  normalizeLastMessageDirection,
  isMissingLastMessageColumnsError,
} from './useConversations';
import { resolveAttendanceGroup } from '@/components/conversations/conversationGroups';
import { resolveSlaLevel, DEFAULT_SLA_THRESHOLDS } from '@/components/conversations/slaLevels';

/**
 * Reproduz o mapeamento que a lista faz (ConversationsList: `?? 'inbound'`).
 * Os testes de grupo/SLA abaixo passam por aqui de propósito — é o caminho real
 * que a conversa percorre até virar bucket na tela.
 */
const comoALista = (
  row: Parameters<typeof mapLastMessage>[0],
  extras: { unread_count?: number; last_message_at?: string | null } = {},
) => {
  const lastMessage = mapLastMessage(row);
  return {
    unread_count: extras.unread_count ?? 0,
    last_message_direction: (lastMessage?.direction ?? 'inbound') as 'inbound' | 'outbound',
    last_message_at: extras.last_message_at ?? '2026-08-17T12:00:00.000Z',
  };
};

const AGORA = new Date('2026-08-17T12:10:00.000Z');

describe('normalizeLastMessageDirection', () => {
  it('mantém inbound e outbound', () => {
    expect(normalizeLastMessageDirection('inbound')).toBe('inbound');
    expect(normalizeLastMessageDirection('outbound')).toBe('outbound');
  });

  // Armadilha 2: o CASE da trigger é `IN ('inbound','incoming')`.
  it('trata incoming como inbound (sinônimo histórico do banco)', () => {
    expect(normalizeLastMessageDirection('incoming')).toBe('inbound');
  });

  it('trata qualquer outro valor não vazio como outbound, igual ao ELSE da trigger', () => {
    expect(normalizeLastMessageDirection('outgoing')).toBe('outbound');
    expect(normalizeLastMessageDirection('sent')).toBe('outbound');
  });

  it('devolve null para ausência de mensagem', () => {
    expect(normalizeLastMessageDirection(null)).toBeNull();
    expect(normalizeLastMessageDirection(undefined)).toBeNull();
    expect(normalizeLastMessageDirection('')).toBeNull();
    expect(normalizeLastMessageDirection('   ')).toBeNull();
    expect(normalizeLastMessageDirection(42)).toBeNull();
  });
});

describe('mapLastMessage', () => {
  it('monta a prévia a partir das colunas desnormalizadas', () => {
    expect(
      mapLastMessage({
        last_message_content: 'Bom dia!',
        last_message_direction: 'inbound',
        last_message_status: 'delivered',
        last_message_type: 'text',
      }),
    ).toEqual({
      content: 'Bom dia!',
      direction: 'inbound',
      message_type: 'text',
      status: 'delivered',
    });
  });

  // Armadilha 2 na borda que importa: linha antiga ou banco sem o CHECK.
  it('normaliza incoming vindo do banco', () => {
    expect(mapLastMessage({ last_message_direction: 'incoming' })?.direction).toBe('inbound');
  });

  it('aceita conteúdo nulo (mídia sem legenda) sem perder a prévia', () => {
    expect(
      mapLastMessage({
        last_message_content: null,
        last_message_direction: 'inbound',
        last_message_type: 'image',
      }),
    ).toEqual({
      content: null,
      direction: 'inbound',
      message_type: 'image',
      status: null,
    });
  });

  it('assume tipo "text" quando a coluna de tipo está vazia', () => {
    expect(mapLastMessage({ last_message_direction: 'outbound' })?.message_type).toBe('text');
  });

  // Armadilha 1: a direção é a sentinela de "existe mensagem".
  it('devolve undefined quando a conversa não tem mensagem', () => {
    expect(mapLastMessage({})).toBeUndefined();
    expect(mapLastMessage(null)).toBeUndefined();
    expect(
      mapLastMessage({
        last_message_content: null,
        last_message_direction: null,
        last_message_status: null,
        last_message_type: null,
      }),
    ).toBeUndefined();
  });

  // Migração pendente: PostgREST devolve a linha sem as colunas novas.
  it('devolve undefined quando as colunas nem vieram na resposta', () => {
    expect(mapLastMessage({} as never)).toBeUndefined();
  });
});

describe('conversa sem mensagem continua na fila de trabalho (armadilha 1)', () => {
  it('cai no grupo "Aguardando"', () => {
    expect(resolveAttendanceGroup(comoALista({}), AGORA)).toBe('waiting');
  });

  it('cai em "Aguardando" também quando as colunas não existem no banco', () => {
    expect(resolveAttendanceGroup(comoALista(null), AGORA)).toBe('waiting');
  });

  it('continua sendo sinalizada pelo SLA depois do limite', () => {
    const semMensagem = comoALista(null, { last_message_at: '2026-08-16T12:00:00.000Z' });
    expect(resolveSlaLevel(semMensagem, DEFAULT_SLA_THRESHOLDS, AGORA)).toBe('critica');
  });
});

describe('mensagem do cliente não vaza como saída (armadilha 2)', () => {
  it('"incoming" mantém a conversa em "Aguardando"', () => {
    const row = { last_message_direction: 'incoming' };
    expect(resolveAttendanceGroup(comoALista(row), AGORA)).toBe('waiting');
  });

  it('"incoming" continua contando para a sinalização de SLA', () => {
    const row = { last_message_direction: 'incoming' };
    const conversa = comoALista(row, { last_message_at: '2026-08-17T06:00:00.000Z' });
    expect(resolveSlaLevel(conversa, DEFAULT_SLA_THRESHOLDS, AGORA)).toBe('atrasada');
  });

  it('resposta nossa sem pendência sai da sinalização, como antes', () => {
    const row = { last_message_direction: 'outbound' };
    const conversa = comoALista(row, { last_message_at: '2026-08-16T06:00:00.000Z' });
    expect(resolveAttendanceGroup(conversa, AGORA)).toBe('idle');
    expect(resolveSlaLevel(conversa, DEFAULT_SLA_THRESHOLDS, AGORA)).toBe('ok');
  });
});

describe('isMissingLastMessageColumnsError', () => {
  it('reconhece o 42703 do PostgREST', () => {
    expect(
      isMissingLastMessageColumnsError({
        code: '42703',
        message: 'column conversations.last_message_content does not exist',
      }),
    ).toBe(true);
  });

  it('reconhece pelo nome da coluna, se o código vier diferente', () => {
    expect(
      isMissingLastMessageColumnsError({
        code: 'PGRST100',
        message: 'failed to parse select parameter (last_message_direction)',
      }),
    ).toBe(true);
  });

  it('não confunde com erro comum de rede ou de permissão', () => {
    expect(isMissingLastMessageColumnsError(null)).toBe(false);
    expect(isMissingLastMessageColumnsError(undefined)).toBe(false);
    expect(
      isMissingLastMessageColumnsError({ code: '42501', message: 'permission denied for table conversations' }),
    ).toBe(false);
    expect(isMissingLastMessageColumnsError({ message: 'Failed to fetch' })).toBe(false);
  });
});
