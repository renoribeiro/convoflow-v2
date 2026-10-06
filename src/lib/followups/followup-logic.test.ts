import { describe, it, expect } from 'vitest';
// Lógica pura do motor de follow-up (compartilhada com o edge function Deno).
import {
  addDelay,
  nextRecurrenceDate,
  recurrenceChild,
  isFreeFormBlocked,
  substituteVariables,
  buildFollowupVariables,
  extractMessageId,
} from '../../../supabase/functions/_shared/followup-logic';

describe('addDelay', () => {
  const base = new Date('2026-06-22T12:00:00.000Z');

  it('soma minutos', () => {
    expect(addDelay(base, 30, 'minutes').toISOString()).toBe('2026-06-22T12:30:00.000Z');
  });
  it('soma horas', () => {
    expect(addDelay(base, 3, 'hours').toISOString()).toBe('2026-06-22T15:00:00.000Z');
  });
  it('soma dias', () => {
    expect(addDelay(base, 2, 'days').toISOString()).toBe('2026-06-24T12:00:00.000Z');
  });
  it('não muta a data original', () => {
    addDelay(base, 5, 'days');
    expect(base.toISOString()).toBe('2026-06-22T12:00:00.000Z');
  });
});

describe('nextRecurrenceDate', () => {
  it('daily: +1 dia', () => {
    expect(nextRecurrenceDate(new Date('2026-06-22T09:00:00Z'), 'daily').toISOString())
      .toBe('2026-06-23T09:00:00.000Z');
  });
  it('weekly: +7 dias', () => {
    expect(nextRecurrenceDate(new Date('2026-06-22T09:00:00Z'), 'weekly').toISOString())
      .toBe('2026-06-29T09:00:00.000Z');
  });
  it('monthly: +1 mês', () => {
    const r = nextRecurrenceDate(new Date('2026-01-15T09:00:00Z'), 'monthly');
    expect(r.getUTCMonth()).toBe(1); // fevereiro
    expect(r.getUTCDate()).toBe(15);
  });
  it('monthly: rollover de dezembro→janeiro', () => {
    const r = nextRecurrenceDate(new Date('2026-12-10T09:00:00Z'), 'monthly');
    expect(r.getUTCFullYear()).toBe(2027);
    expect(r.getUTCMonth()).toBe(0); // janeiro
  });
  it('custom: +N dias (interval)', () => {
    expect(nextRecurrenceDate(new Date('2026-06-22T09:00:00Z'), 'custom', 5).toISOString())
      .toBe('2026-06-27T09:00:00.000Z');
  });
  it('custom sem interval usa mínimo 1', () => {
    expect(nextRecurrenceDate(new Date('2026-06-22T09:00:00Z'), 'custom', null).toISOString())
      .toBe('2026-06-23T09:00:00.000Z');
  });
});

describe('recurrenceChild', () => {
  const baseParent = {
    recurring: true,
    recurring_type: 'daily' as const,
    recurring_interval: null,
    recurring_count: null,
    recurring_end_date: null,
    due_date: '2026-06-22T09:00:00.000Z',
  };

  it('não gera para follow-up não recorrente', () => {
    expect(recurrenceChild({ ...baseParent, recurring: false }).generate).toBe(false);
  });

  it('count null = ilimitado: gera filho recorrente com count 0', () => {
    const r = recurrenceChild(baseParent);
    expect(r.generate).toBe(true);
    expect(r.childRecurring).toBe(true);
    expect(r.childCount).toBe(0);
    expect(r.nextDue?.toISOString()).toBe('2026-06-23T09:00:00.000Z');
  });

  it('count 0 = ilimitado', () => {
    const r = recurrenceChild({ ...baseParent, recurring_count: 0 });
    expect(r.generate).toBe(true);
    expect(r.childRecurring).toBe(true);
  });

  it('count > 1 decrementa e mantém recorrente', () => {
    const r = recurrenceChild({ ...baseParent, recurring_count: 3 });
    expect(r.generate).toBe(true);
    expect(r.childRecurring).toBe(true);
    expect(r.childCount).toBe(2);
  });

  it('count === 1 gera a última ocorrência (filho não recorrente)', () => {
    const r = recurrenceChild({ ...baseParent, recurring_count: 1 });
    expect(r.generate).toBe(true);
    expect(r.childRecurring).toBe(false);
    expect(r.childCount).toBe(0);
  });

  it('respeita recurring_end_date: não gera se próxima data ultrapassa o fim', () => {
    const r = recurrenceChild({ ...baseParent, recurring_end_date: '2026-06-22T23:59:00.000Z' });
    expect(r.generate).toBe(false);
  });

  it('gera se a próxima data ainda está dentro do fim', () => {
    const r = recurrenceChild({ ...baseParent, recurring_end_date: '2026-06-30T00:00:00.000Z' });
    expect(r.generate).toBe(true);
  });
});

describe('isFreeFormBlocked (janela de 24h da Meta)', () => {
  it('não-oficial nunca bloqueia', () => {
    expect(isFreeFormBlocked({ isOfficial: false, isTemplate: false, inWindow: false })).toBe(false);
  });
  it('oficial + template é isento (envia a qualquer hora)', () => {
    expect(isFreeFormBlocked({ isOfficial: true, isTemplate: true, inWindow: false })).toBe(false);
  });
  it('oficial + free-form dentro da janela: permite', () => {
    expect(isFreeFormBlocked({ isOfficial: true, isTemplate: false, inWindow: true })).toBe(false);
  });
  it('oficial + free-form fora da janela: BLOQUEIA', () => {
    expect(isFreeFormBlocked({ isOfficial: true, isTemplate: false, inWindow: false })).toBe(true);
  });
});

describe('substituteVariables', () => {
  it('substitui {{var}} e {var}', () => {
    const out = substituteVariables('Olá {{contact_name}}, telefone {phone}', {
      contact_name: 'Maria',
      phone: '5511999',
    });
    expect(out).toBe('Olá Maria, telefone 5511999');
  });
  it('texto vazio/undefined não quebra', () => {
    expect(substituteVariables('', {})).toBe('');
    // @ts-expect-error testando entrada nula
    expect(substituteVariables(undefined, {})).toBe('');
  });
});

describe('buildFollowupVariables', () => {
  it('extrai primeiro nome e popula aliases PT-BR', () => {
    const v = buildFollowupVariables({
      contactName: 'João da Silva',
      phone: '5511988887777',
      email: 'joao@x.example',
      operatorName: 'Paulo',
    });
    expect(v.contact_name).toBe('João da Silva');
    expect(v.first_name).toBe('João');
    expect(v.primeiro_nome).toBe('João');
    expect(v.telefone).toBe('5511988887777');
    expect(v.operador).toBe('Paulo');
  });
  it('lida com nome ausente', () => {
    const v = buildFollowupVariables({ contactName: null, phone: null, email: null });
    expect(v.contact_name).toBe('');
    expect(v.first_name).toBe('');
  });
});

describe('extractMessageId', () => {
  it('Evolution: key.id', () => {
    expect(extractMessageId({ key: { id: 'EVO123' } })).toBe('EVO123');
  });
  it('Meta: messages[0].id', () => {
    expect(extractMessageId({ messages: [{ id: 'wamid.X' }] })).toBe('wamid.X');
  });
  it('genérico: id / messageId', () => {
    expect(extractMessageId({ id: 42 })).toBe('42');
    expect(extractMessageId({ messageId: 'm1' })).toBe('m1');
  });
  it('null/indefinido', () => {
    expect(extractMessageId(null)).toBeNull();
    expect(extractMessageId({})).toBeNull();
  });
});
