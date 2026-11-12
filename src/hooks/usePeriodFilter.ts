import { useMemo, useState } from 'react';
import {
  DiaCivil,
  diaDoCalendario,
  diaEmBrasilia,
  diasNoIntervalo,
  compararDias,
  fimDoDiaEmBrasilia,
  inicioDoDiaEmBrasilia,
  somarDias,
} from '@/lib/datas/brasilia';

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
 *
 * Desde 2026-11-12 os dias são os de Brasília (meia noite a meia noite em
 * America/Sao_Paulo), em qualquer fuso do computador. O dia escolhido no
 * calendário vale como DIA (ano, mês, dia), não como instante.
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

  /** Primeiro e último dia do período, em Brasília. */
  firstDay: DiaCivil;
  lastDay: DiaCivil;

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

interface DiasDoPeriodo {
  primeiro: DiaCivil;
  ultimo: DiaCivil;
}

function resolveDays(preset: PeriodPreset, custom: CustomRange): DiasDoPeriodo {
  const hoje = diaEmBrasilia(new Date());

  switch (preset) {
    case 'today':
      return { primeiro: hoje, ultimo: hoje };
    case '7d':
      return { primeiro: somarDias(hoje, -6), ultimo: hoje };
    case '30d':
      return { primeiro: somarDias(hoje, -29), ultimo: hoje };
    case 'custom': {
      const de = custom.from ? diaDoCalendario(custom.from) : somarDias(hoje, -6);
      const ate = custom.to ? diaDoCalendario(custom.to) : hoje;
      // Garante ordem cronológica mesmo se o usuário escolher invertido.
      return compararDias(de, ate) <= 0 ? { primeiro: de, ultimo: ate } : { primeiro: ate, ultimo: de };
    }
    default:
      return { primeiro: hoje, ultimo: hoje };
  }
}

export function usePeriodFilter(
  initialPreset: PeriodPreset = '7d',
): UsePeriodFilterResult {
  const [preset, setPreset] = useState<PeriodPreset>(initialPreset);
  const [custom, setCustom] = useState<CustomRange>({});

  return useMemo<UsePeriodFilterResult>(() => {
    const { primeiro, ultimo } = resolveDays(preset, custom);
    const range: PeriodRange = { start: inicioDoDiaEmBrasilia(primeiro), end: fimDoDiaEmBrasilia(ultimo) };

    // Janela anterior: os mesmos N dias de Brasília, imediatamente antes.
    const days = Math.max(1, diasNoIntervalo(primeiro, ultimo));
    const prevStart = inicioDoDiaEmBrasilia(somarDias(primeiro, -days));
    const prevEnd = new Date(range.start.getTime() - 1);

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
      firstDay: primeiro,
      lastDay: ultimo,
      startISO: range.start.toISOString(),
      endISO: range.end.toISOString(),
      prevStartISO: prevStart.toISOString(),
      prevEndISO: prevEnd.toISOString(),
      label,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, custom.from, custom.to]);
}
