import { describe, it, expect } from 'vitest';
import { diaLocal, FUSO_BRASILIA } from '../../../supabase/functions/_shared/dia-local.ts';

/**
 * O dia do limite diário da campanha (lote 6b, B6; decisão D5): da meia noite
 * à meia noite de Brasília. Até o lote 6b a janela contada ia das 21h de
 * Brasília do dia anterior às 20h59, e das 21h à meia noite o limite parava
 * de somar. O teto de aquecimento usa a mesma fronteira no banco
 * (docs/teste_dia_brasilia.sql).
 */

const DIA_29 = { inicio: '2026-10-29T03:00:00.000Z', fim: '2026-10-30T03:00:00.000Z' };
const DIA_30 = { inicio: '2026-10-30T03:00:00.000Z', fim: '2026-10-31T03:00:00.000Z' };

const iso = (d: { inicio: Date; fim: Date }) => ({ inicio: d.inicio.toISOString(), fim: d.fim.toISOString() });
const dentro = (instante: string, d: { inicio: Date; fim: Date }) => {
  const t = new Date(instante).getTime();
  return t >= d.inicio.getTime() && t < d.fim.getTime();
};

describe('as quatro horas, em Brasília', () => {
  it('20h59: ainda é o dia 29', () => {
    expect(iso(diaLocal(new Date('2026-10-29T20:59:00-03:00')))).toEqual(DIA_29);
  });

  it('21h00: continua o dia 29 (era aqui que o limite zerava)', () => {
    expect(iso(diaLocal(new Date('2026-10-29T21:00:00-03:00')))).toEqual(DIA_29);
  });

  it('23h59: continua o dia 29', () => {
    expect(iso(diaLocal(new Date('2026-10-29T23:59:00-03:00')))).toEqual(DIA_29);
  });

  it('00h00: começa o dia 30', () => {
    expect(iso(diaLocal(new Date('2026-10-30T00:00:00-03:00')))).toEqual(DIA_30);
  });
});

describe('o limite soma o dia inteiro', () => {
  it('envio das 20h59, das 21h e das 23h59 caem na mesma janela; o da meia noite, na seguinte', () => {
    const agora = diaLocal(new Date('2026-10-29T23:59:00-03:00'));
    expect(dentro('2026-10-29T00:00:00-03:00', agora)).toBe(true);
    expect(dentro('2026-10-29T20:59:00-03:00', agora)).toBe(true);
    expect(dentro('2026-10-29T21:00:00-03:00', agora)).toBe(true);
    expect(dentro('2026-10-29T23:59:59-03:00', agora)).toBe(true);
    expect(dentro('2026-10-30T00:00:00-03:00', agora)).toBe(false);
    expect(dentro('2026-10-28T23:59:59-03:00', agora)).toBe(false);
  });

  it('a janela antiga (data de Brasília lida como UTC) deixava as 21h de fora; a nova não', () => {
    const antigaInicio = new Date('2026-10-29T00:00:00Z');
    const antigaFim = new Date('2026-10-29T23:59:59.999Z');
    const envio = new Date('2026-10-29T22:00:00-03:00');
    expect(envio >= antigaInicio && envio < antigaFim).toBe(false);
    expect(dentro(envio.toISOString(), diaLocal(new Date('2026-10-29T23:00:00-03:00')))).toBe(true);
  });
});

describe('viradas do calendário', () => {
  it('fim de mês e fim de ano', () => {
    expect(iso(diaLocal(new Date('2026-10-31T22:00:00-03:00')))).toEqual({
      inicio: '2026-10-31T03:00:00.000Z',
      fim: '2026-11-01T03:00:00.000Z',
    });
    expect(iso(diaLocal(new Date('2026-12-31T23:30:00-03:00')))).toEqual({
      inicio: '2026-12-31T03:00:00.000Z',
      fim: '2027-01-01T03:00:00.000Z',
    });
  });

  it('o padrão é Brasília', () => {
    expect(FUSO_BRASILIA).toBe('America/Sao_Paulo');
    const t = new Date('2026-10-29T21:30:00-03:00');
    expect(iso(diaLocal(t))).toEqual(iso(diaLocal(t, 'America/Sao_Paulo')));
  });

  it('fuso com horário de verão: o dia da mudança tem 23 horas e a meia noite certa', () => {
    // Nova York adianta o relógio em 2026-03-08 (EST, UTC-5 → EDT, UTC-4).
    const d = diaLocal(new Date('2026-03-08T12:00:00-04:00'), 'America/New_York');
    expect(d.inicio.toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(d.fim.toISOString()).toBe('2026-03-09T04:00:00.000Z');
  });
});
