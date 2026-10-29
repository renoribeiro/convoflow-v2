import { describe, it, expect } from 'vitest';
import {
  dataHoraCurtaEmBrasilia,
  diaEmBrasilia,
  diaJaPassouEmBrasilia,
  horaEmBrasilia,
  horarioNoFuturo,
  instanteEmBrasilia,
} from './brasilia';

// Brasília é UTC-3: 23:30 de 28/10 em Brasília = 02:30 de 29/10 em UTC.
const ANTES_DA_MEIA_NOITE = new Date('2026-10-29T02:30:00Z'); // 28/10 23:30 Brasília
const DEPOIS_DA_MEIA_NOITE = new Date('2026-10-29T03:10:00Z'); // 29/10 00:10 Brasília
const AS_21H = new Date('2026-10-29T00:00:00Z'); // 28/10 21:00 Brasília (UTC já virou)

describe('dia e hora de Brasília', () => {
  it('o dia de Brasília não vira às 21h, quando o UTC vira', () => {
    expect(diaEmBrasilia(AS_21H)).toEqual({ ano: 2026, mes: 10, dia: 28 });
    expect(diaEmBrasilia(ANTES_DA_MEIA_NOITE)).toEqual({ ano: 2026, mes: 10, dia: 28 });
    expect(diaEmBrasilia(DEPOIS_DA_MEIA_NOITE)).toEqual({ ano: 2026, mes: 10, dia: 29 });
  });

  it('monta o instante de "dia às HH:mm" de Brasília em UTC', () => {
    expect(instanteEmBrasilia({ ano: 2026, mes: 10, dia: 28 }, '23:45')?.toISOString()).toBe('2026-10-29T02:45:00.000Z');
    expect(instanteEmBrasilia({ ano: 2026, mes: 10, dia: 29 }, '00:00')?.toISOString()).toBe('2026-10-29T03:00:00.000Z');
    expect(instanteEmBrasilia({ ano: 2026, mes: 10, dia: 29 }, '14:00')?.toISOString()).toBe('2026-10-29T17:00:00.000Z');
    expect(instanteEmBrasilia({ ano: 2026, mes: 10, dia: 29 }, '25:00')).toBeNull();
  });

  it('lê de volta a hora e a data curta em Brasília', () => {
    expect(horaEmBrasilia(new Date('2026-10-29T02:45:00Z'))).toBe('23:45');
    expect(dataHoraCurtaEmBrasilia(new Date('2026-10-29T02:45:00Z'))).toBe('28/10 23:45');
  });

  it('às 23:30 de Brasília, hoje ainda vale e só aceita hora depois de agora', () => {
    const hoje = { ano: 2026, mes: 10, dia: 28 };
    expect(diaJaPassouEmBrasilia(hoje, ANTES_DA_MEIA_NOITE)).toBe(false);
    expect(horarioNoFuturo(hoje, '23:45', ANTES_DA_MEIA_NOITE)).toBe(true);
    expect(horarioNoFuturo(hoje, '23:30', ANTES_DA_MEIA_NOITE)).toBe(false);
    expect(horarioNoFuturo(hoje, '23:00', ANTES_DA_MEIA_NOITE)).toBe(false);
    // O dia seguinte, de madrugada, também vale.
    expect(horarioNoFuturo({ ano: 2026, mes: 10, dia: 29 }, '00:15', ANTES_DA_MEIA_NOITE)).toBe(true);
  });

  it('às 21h de Brasília o calendário não trata hoje como passado', () => {
    expect(diaJaPassouEmBrasilia({ ano: 2026, mes: 10, dia: 28 }, AS_21H)).toBe(false);
    expect(horarioNoFuturo({ ano: 2026, mes: 10, dia: 28 }, '22:00', AS_21H)).toBe(true);
  });

  it('depois da meia noite de Brasília, ontem passou', () => {
    expect(diaJaPassouEmBrasilia({ ano: 2026, mes: 10, dia: 28 }, DEPOIS_DA_MEIA_NOITE)).toBe(true);
    expect(horarioNoFuturo({ ano: 2026, mes: 10, dia: 28 }, '23:59', DEPOIS_DA_MEIA_NOITE)).toBe(false);
    expect(horarioNoFuturo({ ano: 2026, mes: 10, dia: 29 }, '00:30', DEPOIS_DA_MEIA_NOITE)).toBe(true);
  });
});
