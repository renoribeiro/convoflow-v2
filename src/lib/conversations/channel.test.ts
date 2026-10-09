import { describe, it, expect } from 'vitest';
import {
  AWAITING_REPLY_FILTER,
  CONVERSATIONS_PAGE_DESCRIPTION,
  channelOfProvider,
  hasInstagramInstance,
  initialsOf,
  nameInitials,
  instancesOfChannel,
  isAwaitingReplyRow,
  otherChannel,
} from './channel';
import { resolveAttendanceGroup } from '@/components/conversations/conversationGroups';
import { normalizeLastMessageDirection } from '@/hooks/useConversations';

/**
 * O selo do outro canal conta no SERVIDOR (AWAITING_REPLY_FILTER). A pílula
 * "Aguardando" e o grupo "Aguardando resposta" classificam no CLIENTE
 * (resolveAttendanceGroup), depois que a lista normaliza a direção e aplica
 * `?? 'inbound'`. Este teste prova que os dois dizem a mesma coisa para toda
 * combinação que o banco produz.
 */
describe('selo "aguardando resposta": servidor × lista', () => {
  /** Como a ConversationsList enxerga a linha antes de classificar. */
  const comoALista = (row: { unread_count: number; last_message_direction: string | null }) =>
    resolveAttendanceGroup({
      unread_count: row.unread_count,
      last_message_direction: normalizeLastMessageDirection(row.last_message_direction) ?? 'inbound',
      last_message_at: '2026-09-25T12:00:00Z',
    }) === 'waiting';

  // Tudo que a trigger grava ('inbound'/'outbound'), o legado 'incoming' e
  // NULL (conversa sem mensagem), com e sem não lidas.
  const direcoes = ['inbound', 'outbound', 'incoming', null];
  const naoLidas = [0, 1, 7];

  for (const d of direcoes) {
    for (const u of naoLidas) {
      it(`direção ${d ?? 'NULL'}, ${u} não lida(s): mesma resposta nos dois`, () => {
        const row = { unread_count: u, last_message_direction: d };
        expect(isAwaitingReplyRow(row)).toBe(comoALista(row));
      });
    }
  }

  it('o filtro do servidor cobre exatamente os três casos do espelho', () => {
    // Vírgulas fora de parênteses separam as condições (a lista do `in` tem as suas).
    const condicoes = AWAITING_REPLY_FILTER.split(/,(?![^(]*\))/);
    expect(condicoes).toHaveLength(3);
    expect(AWAITING_REPLY_FILTER).toContain('unread_count.gt.0');
    expect(AWAITING_REPLY_FILTER).toContain('last_message_direction.is.null');
    expect(AWAITING_REPLY_FILTER).toContain('last_message_direction.in.(inbound,incoming)');
  });

  it('respondida e lida não aguarda; respondida com não lida aguarda (o eco do celular não zera)', () => {
    expect(isAwaitingReplyRow({ unread_count: 0, last_message_direction: 'outbound' })).toBe(false);
    expect(isAwaitingReplyRow({ unread_count: 1, last_message_direction: 'outbound' })).toBe(true);
  });
});

describe('canal das instâncias', () => {
  const lista = [
    { row: { id: 'wa-1', provider: 'official' } },
    { row: { id: 'wa-2', provider: 'evolution' } },
    { row: { id: 'wa-3', provider: null } },
    { row: { id: 'ig-1', provider: 'instagram' } },
  ];

  it('Instagram é só o provider instagram; o resto é WhatsApp', () => {
    expect(channelOfProvider('instagram')).toBe('instagram');
    for (const p of ['official', 'evolution', 'waha', null, undefined]) expect(channelOfProvider(p)).toBe('whatsapp');
  });

  it('o seletor de cada lado mostra só as instâncias daquele canal', () => {
    expect(instancesOfChannel(lista, 'whatsapp').map((i) => i.row.id)).toEqual(['wa-1', 'wa-2', 'wa-3']);
    expect(instancesOfChannel(lista, 'instagram').map((i) => i.row.id)).toEqual(['ig-1']);
  });

  it('a chave só existe com conta de Instagram na Loja', () => {
    expect(hasInstagramInstance(lista)).toBe(true);
    expect(hasInstagramInstance(lista.slice(0, 3))).toBe(false);
    expect(hasInstagramInstance([])).toBe(false);
  });

  it('outro canal', () => {
    expect(otherChannel('whatsapp')).toBe('instagram');
    expect(otherChannel('instagram')).toBe('whatsapp');
  });
});

describe('textos', () => {
  it('o subtítulo do WhatsApp é o de antes, palavra por palavra', () => {
    expect(CONVERSATIONS_PAGE_DESCRIPTION.whatsapp).toBe('Gerencie todas as suas conversas do WhatsApp em um só lugar');
    expect(CONVERSATIONS_PAGE_DESCRIPTION.instagram).not.toMatch(/WhatsApp/);
  });

  it('iniciais: duas do nome, uma do @, e "CI" para "Cliente do Instagram"', () => {
    expect(initialsOf('Ana Souza')).toBe('AS');
    expect(initialsOf('@paulo.andrade')).toBe('P');
    expect(initialsOf('Cliente do Instagram')).toBe('CI');
    expect(initialsOf('Ana de Souza')).toBe('AS');
    expect(initialsOf('')).toBe('?');
  });

  // `n[0]` pegava metade do emoji (um "surrogate" solto) e o avatar mostrava
  // um caractere quebrado. Nenhuma inicial pode ter um surrogate sozinho.
  const semMeioEmoji = (s: string) => expect(s).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);

  it('iniciais do WhatsApp (nameInitials): nome que começa com emoji usa as letras', () => {
    for (const [nome, esperado] of [
      ['🌸 Maria', 'M'],
      ['🌸Maria Souza', 'MS'],
      ['Maria 🌸 Recrutamento', 'MR'],
      ['👩🏽‍💼 Ana Lima', 'AL'],
      ['❤️ Bia', 'B'],
      ['Helena Duarte', 'HD'],
      ['Ana de Souza', 'AD'], // no WhatsApp o conector conta, como sempre contou
      ['(Ana) Paula', 'AP'],
      ['élio ramos', 'ÉR'],
      ['  Maria   Souza  ', 'MS'],
    ] as const) {
      const iniciais = nameInitials(nome);
      expect(iniciais, nome).toBe(esperado);
      semMeioEmoji(iniciais);
    }
  });

  it('nome só de emoji mostra o primeiro emoji inteiro; vazio devolve vazio', () => {
    expect(nameInitials('🌸🌸')).toBe('🌸');
    expect(nameInitials('👩🏽‍💼')).toBe('👩🏽‍💼');
    expect(nameInitials('')).toBe('');
    expect(nameInitials('   ')).toBe('');
  });

  it('iniciais do Instagram (initialsOf) também não quebram o emoji', () => {
    expect(initialsOf('🌸 Maria')).toBe('M');
    expect(initialsOf('Maria 🌸 da Silva')).toBe('MS');
    expect(initialsOf('🌸')).toBe('🌸');
    for (const nome of ['🌸 Maria', '🤝 Fechado', '😊']) semMeioEmoji(initialsOf(nome));
  });
});
