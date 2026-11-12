import { useTenant } from '@/contexts/TenantContext';
import { diaEmBrasilia, diaIso, horaEmBrasilia, rotuloDiaCurto, somarDias } from '@/lib/datas/brasilia';
import type { UsePeriodFilterResult } from './usePeriodFilter';
import { useLojaMessageCounts } from './useLojaStats';

/**
 * Série diária (ou horária, quando o período é "Hoje") de mensagens enviadas vs.
 * recebidas — alimenta o AreaChart de Atividade do Dashboard.
 *
 * Granularidade: períodos de 1 dia viram 24 buckets horários; demais, 1 bucket
 * por dia entre start e end (inclusive).
 *
 * Desde a migração 20260914000001 as contagens vêm de `loja_message_counts`
 * (já agrupadas por hora/dia no fuso de Brasília, desde 2026-11-12), não de linhas de
 * `messages`: o gráfico é da Loja inteira mesmo para um atendente cuja
 * visibilidade de conversas foi restringida — ver `LojaWideHint`.
 */

export interface ActivityPoint {
  label: string;
  enviadas: number;
  recebidas: number;
}

export interface UseActivityChartResult {
  data: ActivityPoint[];
  isLoading: boolean;
}

export function useActivityChartData(period: UsePeriodFilterResult): UseActivityChartResult {
  const { tenant } = useTenant();
  const { startISO, endISO, days } = period;
  const hourly = days <= 1;

  const { data: rows = [], isLoading } = useLojaMessageCounts({
    from: startISO,
    to: endISO,
    bucket: hourly ? 'hour' : 'day',
    enabled: !!tenant,
    keySuffix: ['activity'],
  });

  let data: ActivityPoint[];

  if (hourly) {
    const buckets: ActivityPoint[] = Array.from({ length: 24 }, (_, h) => ({
      label: `${String(h).padStart(2, '0')}h`,
      enviadas: 0,
      recebidas: 0,
    }));
    for (const r of rows) {
      if (!r.bucket) continue;
      const bucket = buckets[Number(horaEmBrasilia(new Date(r.bucket)).slice(0, 2))];
      if (!bucket) continue;
      if (r.direction === 'outbound') bucket.enviadas += r.n;
      else bucket.recebidas += r.n;
    }
    data = buckets;
  } else {
    const dayKeys = Array.from({ length: days }, (_, i) => diaIso(somarDias(period.firstDay, i)));
    const index = new Map<string, ActivityPoint>();
    const ordered: ActivityPoint[] = dayKeys.map((key) => {
      const point: ActivityPoint = {
        label: rotuloDiaCurto(key),
        enviadas: 0,
        recebidas: 0,
      };
      index.set(key, point);
      return point;
    });
    for (const r of rows) {
      if (!r.bucket) continue;
      const key = diaIso(diaEmBrasilia(new Date(r.bucket)));
      const point = index.get(key);
      if (!point) continue;
      if (r.direction === 'outbound') point.enviadas += r.n;
      else point.recebidas += r.n;
    }
    data = ordered;
  }

  return { data, isLoading };
}
