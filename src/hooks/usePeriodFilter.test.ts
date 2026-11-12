import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePeriodFilter } from './usePeriodFilter';

// O Dashboard conta dias de Brasília (2026-11-12), em qualquer fuso do
// computador. 12/11 às 23:30 em Brasília = 13/11 às 02:30 UTC.
describe('usePeriodFilter: dias de Brasília', () => {
  afterEach(() => vi.useRealTimers());

  it('"Hoje" às 23h30 de Brasília é o dia 12 inteiro, não o 13 do UTC', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-13T02:30:00Z'));
    const { result } = renderHook(() => usePeriodFilter('today'));
    expect(result.current.startISO).toBe('2026-11-12T03:00:00.000Z');
    expect(result.current.endISO).toBe('2026-11-13T02:59:59.999Z');
    expect(result.current.days).toBe(1);
    // Período anterior: o dia 11 inteiro.
    expect(result.current.prevStartISO).toBe('2026-11-11T03:00:00.000Z');
    expect(result.current.prevEndISO).toBe('2026-11-12T02:59:59.999Z');
  });

  it('"7 dias" vão de 06/11 a 12/11 e o anterior de 30/10 a 05/11', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-13T02:30:00Z'));
    const { result } = renderHook(() => usePeriodFilter('7d'));
    expect(result.current.startISO).toBe('2026-11-06T03:00:00.000Z');
    expect(result.current.days).toBe(7);
    expect(result.current.prevStartISO).toBe('2026-10-30T03:00:00.000Z');
    expect(result.current.firstDay).toEqual({ ano: 2026, mes: 11, dia: 6 });
    expect(result.current.lastDay).toEqual({ ano: 2026, mes: 11, dia: 12 });
  });

  it('o dia escolhido no calendário vale como dia de Brasília', () => {
    const { result } = renderHook(() => usePeriodFilter('7d'));
    act(() => {
      // O calendário devolve a meia noite local do dia escolhido.
      result.current.setCustom({ from: new Date(2026, 10, 1), to: new Date(2026, 10, 12) });
      result.current.setPreset('custom');
    });
    expect(result.current.startISO).toBe('2026-11-01T03:00:00.000Z');
    expect(result.current.endISO).toBe('2026-11-13T02:59:59.999Z');
    expect(result.current.days).toBe(12);
  });
});
