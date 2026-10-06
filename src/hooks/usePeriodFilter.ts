import { useMemo, useState } from 'react';
import {
  startOfDay,
  endOfDay,
  subDays,
  differenceInCalendarDays,
} from 'date-fns';

/**
 * Filtro de período global do Dashboard.
 *
 * Mantém o preset selecionado ("Hoje" / "7 dias" / "30 dias" / "Personalizado")
 * e deriva os intervalos de data correspondentes — tanto o período atual quanto
 * o período imediatamente anterior de mesma duração (para cálculo de variação).
 *
 * As datas são memoizadas por [preset, customFrom, customTo]: NÃO recalculam a
 * cada render. Isso é essencial porque os `startISO/endISO` entram nas queryKeys
 * do TanStack Query — se mudassem a cada ms, as queries refetchariam em loop.
 * (Trade-off conhecido: o intervalo não "avança" sozinho à meia-noite; basta o
 * usuário reabrir/trocar o período.)
 */

export type PeriodPreset = 'today' | '7d' | '30d' | 'custom';

export interface PeriodRange {
  start: Date;
  end: Date;
}

export interface CustomRange {
  from?: Date;
  to?: Date;
}

export interface UsePeriodFilterResult {
  preset: PeriodPreset;
  setPreset: (preset: PeriodPreset) => void;
  custom: CustomRange;
  setCustom: (range: CustomRange) => void;

  /** Período atual selecionado. */
  range: PeriodRange;
  /** Período anterior de mesma duração (para comparação de variação). */
  prevRange: PeriodRange;

  /** Número de dias inteiros no período (>= 1). Usado para granularidade de gráficos. */
  days: number;

  // Strings ISO estáveis — use estas em queryKeys e filtros do Supabase.
  startISO: string;
  endISO: string;
  prevStartISO: string;
  prevEndISO: string;

  /** Rótulo legível em pt-BR. */
  label: string;
}

const PRESET_LABELS: Record<PeriodPreset, string> = {
  today: 'Hoje',
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  custom: 'Personalizado',
};

function resolveRange(preset: PeriodPreset, custom: CustomRange): PeriodRange {
  const now = new Date();

  switch (preset) {
    case 'today':
      return { start: startOfDay(now), end: endOfDay(now) };
    case '7d':
      return { start: startOfDay(subDays(now, 6)), end: endOfDay(now) };
    case '30d':
      return { start: startOfDay(subDays(now, 29)), end: endOfDay(now) };
    case 'custom': {
      const from = custom.from ?? startOfDay(subDays(now, 6));
      const to = custom.to ?? endOfDay(now);
      // Garante ordem cronológica mesmo se o usuário escolher invertido.
      return from <= to
        ? { start: startOfDay(from), end: endOfDay(to) }
        : { start: startOfDay(to), end: endOfDay(from) };
    }
    default:
      return { start: startOfDay(now), end: endOfDay(now) };
  }
}

export function usePeriodFilter(
  initialPreset: PeriodPreset = '7d',
): UsePeriodFilterResult {
  const [preset, setPreset] = useState<PeriodPreset>(initialPreset);
  const [custom, setCustom] = useState<CustomRange>({});

  return useMemo<UsePeriodFilterResult>(() => {
    const range = resolveRange(preset, custom);

    // Duração do período (inclusiva) e janela anterior imediatamente antes dele.
    const lengthMs = range.end.getTime() - range.start.getTime();
    const prevEnd = new Date(range.start.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - lengthMs);

    const days = Math.max(1, differenceInCalendarDays(range.end, range.start) + 1);

    const label =
      preset === 'custom' && custom.from && custom.to
        ? PRESET_LABELS.custom
        : PRESET_LABELS[preset];

    return {
      preset,
      setPreset,
      custom,
      setCustom,
      range,
      prevRange: { start: prevStart, end: prevEnd },
      days,
      startISO: range.start.toISOString(),
      endISO: range.end.toISOString(),
      prevStartISO: prevStart.toISOString(),
      prevEndISO: prevEnd.toISOString(),
      label,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, custom.from, custom.to]);
}
