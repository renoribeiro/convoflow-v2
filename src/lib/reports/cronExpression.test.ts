import { describe, it, expect } from 'vitest';
import {
  frequencyFromCron,
  isDue,
  matchesAt,
  nextRunAfter,
  parseCron,
} from '../../../supabase/functions/_shared/cron-expression.ts';

// America/Sao_Paulo = UTC-3 (o Brasil não usa horário de verão desde 2019).
// Então 09:00 de Brasília é 12:00Z. Todas as datas abaixo são escritas em UTC
// justamente para deixar essa conversão visível.
const SP = 'America/Sao_Paulo';
const utc = (iso: string) => new Date(iso);

describe('parseCron', () => {
  it('entende os formatos que a tela gera', () => {
    expect(parseCron('0 9 * * *')).toMatchObject({ minutes: [0], hours: [9] });
    expect(parseCron('30 18 * * 5')).toMatchObject({ minutes: [30], hours: [18], daysOfWeek: [5] });
    expect(parseCron('0 8 1 * *')).toMatchObject({ daysOfMonth: [1] });
  });

  it('entende listas, intervalos e passos', () => {
    expect(parseCron('0,30 * * * *')?.minutes).toEqual([0, 30]);
    expect(parseCron('0 9-11 * * *')?.hours).toEqual([9, 10, 11]);
    expect(parseCron('*/15 * * * *')?.minutes).toEqual([0, 15, 30, 45]);
    expect(parseCron('0 0 * * 1-5')?.daysOfWeek).toEqual([1, 2, 3, 4, 5]);
  });

  it('normaliza o domingo 7 para 0', () => {
    expect(parseCron('0 9 * * 7')?.daysOfWeek).toEqual([0]);
  });

  it('devolve null em expressão inválida em vez de aceitar qualquer coisa', () => {
    expect(parseCron('')).toBeNull();
    expect(parseCron('0 9 * *')).toBeNull(); // 4 campos
    expect(parseCron('0 9 * * * *')).toBeNull(); // 6 campos
    expect(parseCron('99 9 * * *')).toBeNull(); // minuto fora da faixa
    expect(parseCron('abc 9 * * *')).toBeNull();
  });
});

describe('matchesAt — o fuso é o de Brasília, não UTC', () => {
  it('dispara às 09:00 de Brasília (12:00Z), não às 09:00Z', () => {
    expect(matchesAt('0 9 * * *', utc('2026-08-19T12:00:00Z'), SP)).toBe(true);
    expect(matchesAt('0 9 * * *', utc('2026-08-19T09:00:00Z'), SP)).toBe(false);
  });

  it('respeita o dia da semana no fuso local', () => {
    // 2026-08-17T12:00Z = segunda-feira 09:00 em São Paulo.
    expect(matchesAt('0 9 * * 1', utc('2026-08-17T12:00:00Z'), SP)).toBe(true);
    expect(matchesAt('0 9 * * 2', utc('2026-08-17T12:00:00Z'), SP)).toBe(false);
  });

  it('usa o dia LOCAL quando UTC já virou o dia', () => {
    // 2026-08-18T02:00Z = 2026-08-17 23:00 em São Paulo (ainda segunda, dia 17).
    expect(matchesAt('0 23 17 * *', utc('2026-08-18T02:00:00Z'), SP)).toBe(true);
    expect(matchesAt('0 23 18 * *', utc('2026-08-18T02:00:00Z'), SP)).toBe(false);
  });
});

describe('isDue — vencimento a partir de cron + last_run', () => {
  const weekly = '0 9 * * 1'; // segunda 09:00 BRT = 12:00Z

  it('dispara no minuto exato quando nunca rodou', () => {
    expect(isDue({ expression: weekly, now: utc('2026-08-17T12:00:00Z'), lastRun: null, timeZone: SP })).toBe(true);
  });

  it('não dispara fora do horário', () => {
    expect(isDue({ expression: weekly, now: utc('2026-08-17T15:00:00Z'), lastRun: null, timeZone: SP })).toBe(false);
  });

  it('não dispara no dia errado', () => {
    // Terça no mesmo horário.
    expect(isDue({ expression: weekly, now: utc('2026-08-18T12:00:00Z'), lastRun: null, timeZone: SP })).toBe(false);
  });

  it('NÃO redispara quando já rodou nesta ocorrência', () => {
    // Tick seguinte, 5 minutos depois, com last_run gravado no horário.
    expect(isDue({
      expression: weekly,
      now: utc('2026-08-17T12:05:00Z'),
      lastRun: utc('2026-08-17T12:00:00Z'),
      timeZone: SP,
    })).toBe(false);
  });

  it('recupera horário perdido dentro da janela (worker fora do ar)', () => {
    // O horário era 12:00Z; o worker só voltou 25 minutos depois.
    expect(isDue({
      expression: weekly,
      now: utc('2026-08-17T12:25:00Z'),
      lastRun: null,
      lookbackMinutes: 60,
      timeZone: SP,
    })).toBe(true);
  });

  it('desiste do horário perdido além da janela de recuperação', () => {
    expect(isDue({
      expression: weekly,
      now: utc('2026-08-17T14:00:00Z'), // 2h depois
      lastRun: null,
      lookbackMinutes: 60,
      timeZone: SP,
    })).toBe(false);
  });

  it('dispara na semana seguinte mesmo com last_run da semana anterior', () => {
    expect(isDue({
      expression: weekly,
      now: utc('2026-08-24T12:00:00Z'),
      lastRun: utc('2026-08-17T12:00:00Z'),
      timeZone: SP,
    })).toBe(true);
  });

  it('recupera no máximo UMA vez, não uma por horário perdido', () => {
    // Diário às 09:00; o worker ficou dias fora. isDue é booleano: a execução
    // única é garantida pelo claim, não por contagem de ocorrências.
    const daily = '0 9 * * *';
    expect(isDue({
      expression: daily,
      now: utc('2026-08-19T12:00:00Z'),
      lastRun: utc('2026-08-15T12:00:00Z'),
      timeZone: SP,
    })).toBe(true);
  });

  it('expressão inválida nunca vence (não dispara "sempre")', () => {
    expect(isDue({ expression: 'lixo', now: utc('2026-08-17T12:00:00Z'), lastRun: null, timeZone: SP })).toBe(false);
  });

  it('mensal: dispara no dia 1 e não nos outros', () => {
    const monthly = '0 8 1 * *'; // dia 1 às 08:00 BRT = 11:00Z
    expect(isDue({ expression: monthly, now: utc('2026-09-01T11:00:00Z'), lastRun: null, timeZone: SP })).toBe(true);
    expect(isDue({ expression: monthly, now: utc('2026-09-02T11:00:00Z'), lastRun: null, timeZone: SP })).toBe(false);
  });
});

describe('nextRunAfter — valor de exibição', () => {
  it('aponta a próxima segunda 09:00 de Brasília', () => {
    const next = nextRunAfter('0 9 * * 1', utc('2026-08-17T12:00:00Z'), SP);
    expect(next?.toISOString()).toBe('2026-08-24T12:00:00.000Z');
  });

  it('aponta o mesmo dia quando o horário ainda não passou', () => {
    const next = nextRunAfter('0 9 * * *', utc('2026-08-19T06:00:00Z'), SP);
    expect(next?.toISOString()).toBe('2026-08-19T12:00:00.000Z');
  });

  it('vira o dia quando o horário já passou', () => {
    const next = nextRunAfter('0 9 * * *', utc('2026-08-19T13:00:00Z'), SP);
    expect(next?.toISOString()).toBe('2026-08-20T12:00:00.000Z');
  });

  it('vira o mês no agendamento mensal', () => {
    const next = nextRunAfter('0 8 1 * *', utc('2026-08-19T13:00:00Z'), SP);
    expect(next?.toISOString()).toBe('2026-09-01T11:00:00.000Z');
  });

  it('é sempre estritamente depois de `from`', () => {
    const from = utc('2026-08-19T12:00:00Z');
    const next = nextRunAfter('0 9 * * *', from, SP);
    expect(next!.getTime()).toBeGreaterThan(from.getTime());
  });

  it('devolve null em expressão inválida', () => {
    expect(nextRunAfter('lixo', utc('2026-08-19T12:00:00Z'), SP)).toBeNull();
  });
});

describe('frequencyFromCron', () => {
  it('classifica como a tela classifica', () => {
    expect(frequencyFromCron('0 9 * * *')).toBe('daily');
    expect(frequencyFromCron('0 9 * * 1')).toBe('weekly');
    expect(frequencyFromCron('0 9 15 * *')).toBe('monthly');
    expect(frequencyFromCron('lixo')).toBe('unknown');
  });
});
