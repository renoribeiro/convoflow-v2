import { describe, expect, it } from 'vitest';
import {
  groupByAttendance,
  resolveAttendanceGroup,
  type AttendanceInput,
} from './conversationGroups';

const NOW = new Date('2026-07-27T15:00:00.000Z');

function conv(overrides: Partial<AttendanceInput> = {}): AttendanceInput {
  return {
    unread_count: 0,
    last_message_direction: 'outbound',
    last_message_at: NOW.toISOString(),
    ...overrides,
  };
}

describe('resolveAttendanceGroup', () => {
  it('classifica como aguardando quando há mensagens não lidas', () => {
    expect(resolveAttendanceGroup(conv({ unread_count: 3 }), NOW)).toBe('waiting');
  });

  it('classifica como aguardando quando o cliente falou por último, mesmo já lido', () => {
    expect(
      resolveAttendanceGroup(conv({ unread_count: 0, last_message_direction: 'inbound' }), NOW),
    ).toBe('waiting');
  });

  it('mantém aguardando mesmo se a conversa do cliente for antiga', () => {
    expect(
      resolveAttendanceGroup(
        conv({ last_message_direction: 'inbound', last_message_at: '2026-07-01T09:00:00.000Z' }),
        NOW,
      ),
    ).toBe('waiting');
  });

  it('classifica como em atendimento quando você respondeu por último dentro da janela', () => {
    expect(
      resolveAttendanceGroup(conv({ last_message_at: '2026-07-27T02:00:00.000Z' }), NOW),
    ).toBe('in_progress');
  });

  it('trata a borda de 24h como ainda em atendimento', () => {
    expect(
      resolveAttendanceGroup(conv({ last_message_at: '2026-07-26T15:00:00.000Z' }), NOW),
    ).toBe('in_progress');
  });

  it('classifica como sem pendência quando respondida e parada há mais de 24h', () => {
    expect(
      resolveAttendanceGroup(conv({ last_message_at: '2026-07-25T15:00:00.000Z' }), NOW),
    ).toBe('idle');
  });

  it('cai em sem pendência quando last_message_at é nulo ou inválido', () => {
    expect(resolveAttendanceGroup(conv({ last_message_at: null }), NOW)).toBe('idle');
    expect(resolveAttendanceGroup(conv({ last_message_at: 'nao-e-data' }), NOW)).toBe('idle');
  });
});

describe('groupByAttendance', () => {
  it('devolve os buckets na ordem aguardando → em atendimento → sem pendência', () => {
    const items = [
      conv({ last_message_at: '2026-07-01T09:00:00.000Z' }), // idle
      conv({ last_message_at: '2026-07-27T14:00:00.000Z' }), // in_progress
      conv({ unread_count: 2 }), // waiting
    ];
    expect(groupByAttendance(items, NOW).map((b) => b.group)).toEqual([
      'waiting',
      'in_progress',
      'idle',
    ]);
  });

  it('omite buckets vazios', () => {
    const buckets = groupByAttendance([conv({ unread_count: 1 })], NOW);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]?.group).toBe('waiting');
  });

  it('preserva a ordem original dentro de cada bucket', () => {
    const a = { ...conv({ unread_count: 1 }), id: 'a' };
    const b = { ...conv({ unread_count: 5 }), id: 'b' };
    const c = { ...conv({ unread_count: 2 }), id: 'c' };
    const [waiting] = groupByAttendance([a, b, c], NOW);
    expect(waiting?.items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('não perde nem duplica conversas', () => {
    const items = [
      conv({ unread_count: 1 }),
      conv({ last_message_direction: 'inbound' }),
      conv({ last_message_at: '2026-07-27T14:00:00.000Z' }),
      conv({ last_message_at: '2026-06-01T14:00:00.000Z' }),
      conv({ last_message_at: null }),
    ];
    const total = groupByAttendance(items, NOW).reduce((sum, b) => sum + b.items.length, 0);
    expect(total).toBe(items.length);
  });

  it('devolve lista vazia quando não há conversas', () => {
    expect(groupByAttendance([], NOW)).toEqual([]);
  });
});
