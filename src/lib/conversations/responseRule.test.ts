import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BUSINESS_HOURS,
  DEFAULT_RESPONSE_RULE_MAX_TRANSFERS,
  DEFAULT_RESPONSE_RULE_MINUTES,
  breachMoment,
  businessMinutesBetween,
  cloneBusinessHours,
  formatLocalMoment,
  hasResponseRuleErrors,
  normalizeBusinessHours,
  parseResponseRuleSettings,
  sameBusinessHours,
  validateResponseRule,
  type BusinessHours,
} from './responseRule';

// 2026-09-21 é segunda-feira. Brasil sem horário de verão: -03 o ano todo.
const sp = (iso: string) => new Date(`${iso}-03:00`);
const MON = '2026-09-21';
const TUE = '2026-09-22';
const FRI = '2026-09-25';
const SAT = '2026-09-26';
const SUN = '2026-09-27';
const NEXT_MON = '2026-09-28';

describe('businessMinutesBetween — o relógio de funcionamento (espelha business_minutes_between)', () => {
  const bh = DEFAULT_BUSINESS_HOURS;

  it('dentro do horário conta minuto a minuto', () => {
    expect(businessMinutesBetween(bh, sp(`${MON}T10:00`), sp(`${MON}T11:00`))).toBe(60);
    expect(businessMinutesBetween(bh, sp(`${MON}T10:00`), sp(`${MON}T10:59`))).toBe(59);
  });

  it('cliente às 22:00 não gera transferência de madrugada: o relógio retoma às 09:00', () => {
    expect(businessMinutesBetween(bh, sp(`${MON}T22:00`), sp(`${MON}T23:30`))).toBe(0);
    expect(businessMinutesBetween(bh, sp(`${MON}T22:00`), sp(`${TUE}T09:30`))).toBe(30);
    expect(businessMinutesBetween(bh, sp(`${MON}T22:00`), sp(`${TUE}T10:00`))).toBe(60);
  });

  it('fim de semana: sexta 17:00 → segunda 10:00 = 120 (60 na sexta + 60 na segunda)', () => {
    expect(businessMinutesBetween(bh, sp(`${FRI}T17:00`), sp(`${NEXT_MON}T10:00`))).toBe(120);
    expect(businessMinutesBetween(bh, sp(`${SAT}T10:00`), sp(`${SUN}T10:00`))).toBe(0);
  });

  it('um dia inteiro aberto 09–18 = 540, e antes/depois não conta', () => {
    expect(businessMinutesBetween(bh, sp(`${MON}T08:00`), sp(`${MON}T19:00`))).toBe(540);
  });

  it('de trás para frente ou instantes iguais = 0', () => {
    expect(businessMinutesBetween(bh, sp(`${MON}T12:00`), sp(`${MON}T10:00`))).toBe(0);
    expect(businessMinutesBetween(bh, sp(`${MON}T12:00`), sp(`${MON}T12:00`))).toBe(0);
  });

  it('horário próprio: sábado 08–12 e segunda 14–20', () => {
    const custom: BusinessHours = {
      timezone: 'America/Sao_Paulo',
      schedule: {
        '0': null,
        '1': { start: '14:00', end: '20:00' },
        '2': null,
        '3': null,
        '4': null,
        '5': null,
        '6': { start: '08:00', end: '12:00' },
      },
    };
    expect(businessMinutesBetween(custom, sp(`${SAT}T08:30`), sp(`${SAT}T09:29`))).toBe(59);
    expect(businessMinutesBetween(custom, sp(`${SAT}T08:30`), sp(`${SAT}T09:30`))).toBe(60);
    expect(businessMinutesBetween(custom, sp(`${MON}T10:00`), sp(`${MON}T13:59`))).toBe(0);
    expect(businessMinutesBetween(custom, sp(`${MON}T10:00`), sp(`${MON}T15:00`))).toBe(60);
  });

  it('fuso da Loja: em Manaus (-04), 12:00–13:00 de Brasília são 11:00–12:00 lá (aberto); 08:30–09:30 são 07:30–08:30 (fechado)', () => {
    const manaus = { ...cloneBusinessHours(DEFAULT_BUSINESS_HOURS), timezone: 'America/Manaus' };
    expect(businessMinutesBetween(manaus, sp(`${MON}T12:00`), sp(`${MON}T13:00`))).toBe(60);
    expect(businessMinutesBetween(manaus, sp(`${MON}T08:30`), sp(`${MON}T09:30`))).toBe(0);
  });

  it('fuso inválido cai em Brasília, como o SQL', () => {
    const marte = { ...cloneBusinessHours(DEFAULT_BUSINESS_HOURS), timezone: 'Marte/Olympus' };
    expect(businessMinutesBetween(marte, sp(`${MON}T10:00`), sp(`${MON}T11:00`))).toBe(60);
  });

  it('dia com fim antes do início é fechado', () => {
    const bad = cloneBusinessHours(DEFAULT_BUSINESS_HOURS);
    bad.schedule['1'] = { start: '18:00', end: '09:00' };
    expect(businessMinutesBetween(bad, sp(`${MON}T10:00`), sp(`${MON}T11:00`))).toBe(0);
  });
});

describe('breachMoment — o exemplo da tela', () => {
  it('cliente escreve sexta 17:50 com 60 min → transfere segunda 09:50', () => {
    const at = breachMoment(DEFAULT_BUSINESS_HOURS, sp(`${FRI}T17:50`), 60);
    expect(at).not.toBeNull();
    expect(formatLocalMoment(at!, 'America/Sao_Paulo')).toBe('segunda 09:50');
  });

  it('dentro do horário é só somar', () => {
    const at = breachMoment(DEFAULT_BUSINESS_HOURS, sp(`${MON}T10:00`), 60);
    expect(formatLocalMoment(at!, 'America/Sao_Paulo')).toBe('segunda 11:00');
  });

  it('segunda 22:00 → terça 10:00', () => {
    const at = breachMoment(DEFAULT_BUSINESS_HOURS, sp(`${MON}T22:00`), 60);
    expect(formatLocalMoment(at!, 'America/Sao_Paulo')).toBe('terça 10:00');
  });

  it('nenhum dia aberto → null', () => {
    const closed: BusinessHours = {
      timezone: 'America/Sao_Paulo',
      schedule: { '0': null, '1': null, '2': null, '3': null, '4': null, '5': null, '6': null },
    };
    expect(breachMoment(closed, sp(`${MON}T10:00`), 60)).toBeNull();
  });

  it('breachMoment e businessMinutesBetween concordam', () => {
    const from = sp(`${FRI}T17:50`);
    const at = breachMoment(DEFAULT_BUSINESS_HOURS, from, 90)!;
    expect(businessMinutesBetween(DEFAULT_BUSINESS_HOURS, from, at)).toBe(90);
  });
});

describe('normalizeBusinessHours — a mesma leitura do motor e do SQL', () => {
  it('nada gravado = seg–sex 09–18 Brasília', () => {
    expect(normalizeBusinessHours(undefined)).toEqual(DEFAULT_BUSINESS_HOURS);
    expect(normalizeBusinessHours(null)).toEqual(DEFAULT_BUSINESS_HOURS);
    expect(normalizeBusinessHours('9-18')).toEqual(DEFAULT_BUSINESS_HOURS);
  });

  it('timezone sem schedule = padrão com o fuso trocado', () => {
    const bh = normalizeBusinessHours({ timezone: 'America/Manaus' });
    expect(bh.timezone).toBe('America/Manaus');
    expect(bh.schedule).toEqual(DEFAULT_BUSINESS_HOURS.schedule);
  });

  it('schedule presente com dia ausente = dia FECHADO (não o padrão)', () => {
    const bh = normalizeBusinessHours({ schedule: { '2': { start: '09:00', end: '18:00' } } });
    expect(bh.schedule['1']).toBeNull();
    expect(bh.schedule['2']).toEqual({ start: '09:00', end: '18:00' });
  });

  it('start/end ausentes ou malformados caem em 09:00/18:00', () => {
    const bh = normalizeBusinessHours({ schedule: { '1': {}, '2': { start: 'nove', end: '25:99' } } });
    expect(bh.schedule['1']).toEqual({ start: '09:00', end: '18:00' });
    expect(bh.schedule['2']).toEqual({ start: '09:00', end: '18:00' });
  });

  it('sameBusinessHours e cloneBusinessHours', () => {
    const a = cloneBusinessHours(DEFAULT_BUSINESS_HOURS);
    expect(sameBusinessHours(a, DEFAULT_BUSINESS_HOURS)).toBe(true);
    a.schedule['1'] = null;
    expect(sameBusinessHours(a, DEFAULT_BUSINESS_HOURS)).toBe(false);
    expect(DEFAULT_BUSINESS_HOURS.schedule['1']).not.toBeNull(); // clone não compartilha
  });
});

describe('parseResponseRuleSettings — as quatro chaves com os defaults', () => {
  it('nada gravado = desligada, 60 min, 3 transferências, horário padrão', () => {
    const s = parseResponseRuleSettings(undefined);
    expect(s.response_rule_enabled).toBe(false);
    expect(s.response_rule_minutes).toBe(DEFAULT_RESPONSE_RULE_MINUTES);
    expect(s.response_rule_max_transfers).toBe(DEFAULT_RESPONSE_RULE_MAX_TRANSFERS);
    expect(s.business_hours).toEqual(DEFAULT_BUSINESS_HOURS);
    expect(s.businessHoursSaved).toBe(false);
  });

  it('lê o que está gravado', () => {
    const s = parseResponseRuleSettings({
      response_rule_enabled: true,
      response_rule_minutes: 15,
      response_rule_max_transfers: 5,
      business_hours: { timezone: 'America/Manaus', schedule: { '1': { start: '08:00', end: '12:00' } } },
    });
    expect(s.response_rule_enabled).toBe(true);
    expect(s.response_rule_minutes).toBe(15);
    expect(s.response_rule_max_transfers).toBe(5);
    expect(s.business_hours.timezone).toBe('America/Manaus');
    expect(s.businessHoursSaved).toBe(true);
  });

  it('valor fora da faixa ou lixo cai no default (a CHECK do banco nem deixaria gravar)', () => {
    const s = parseResponseRuleSettings({ response_rule_minutes: 3, response_rule_max_transfers: '11', response_rule_enabled: 'sim' });
    expect(s.response_rule_minutes).toBe(60);
    expect(s.response_rule_max_transfers).toBe(3);
    expect(s.response_rule_enabled).toBe(false);
  });
});

describe('validateResponseRule', () => {
  const ok = { minutes: 60, maxTransfers: 3, businessHours: DEFAULT_BUSINESS_HOURS };

  it('configuração válida não tem erro', () => {
    expect(hasResponseRuleErrors(validateResponseRule(ok))).toBe(false);
  });

  it('minutos abaixo de 5, acima de 1440 ou decimais', () => {
    expect(validateResponseRule({ ...ok, minutes: 4 }).minutes).toBeTruthy();
    expect(validateResponseRule({ ...ok, minutes: 1441 }).minutes).toBeTruthy();
    expect(validateResponseRule({ ...ok, minutes: 60.5 }).minutes).toBeTruthy();
    expect(validateResponseRule({ ...ok, minutes: 5 }).minutes).toBeUndefined();
  });

  it('limite de transferências entre 1 e 10', () => {
    expect(validateResponseRule({ ...ok, maxTransfers: 0 }).maxTransfers).toBeTruthy();
    expect(validateResponseRule({ ...ok, maxTransfers: 11 }).maxTransfers).toBeTruthy();
    expect(validateResponseRule({ ...ok, maxTransfers: 10 }).maxTransfers).toBeUndefined();
  });

  it('dia com fim antes do início', () => {
    const bh = cloneBusinessHours(DEFAULT_BUSINESS_HOURS);
    bh.schedule['3'] = { start: '18:00', end: '09:00' };
    const e = validateResponseRule({ ...ok, businessHours: bh });
    expect(e.days?.['3']).toBeTruthy();
    expect(hasResponseRuleErrors(e)).toBe(true);
  });

  it('nenhum dia aberto', () => {
    const bh: BusinessHours = {
      timezone: 'America/Sao_Paulo',
      schedule: { '0': null, '1': null, '2': null, '3': null, '4': null, '5': null, '6': null },
    };
    expect(validateResponseRule({ ...ok, businessHours: bh }).schedule).toBeTruthy();
  });
});
