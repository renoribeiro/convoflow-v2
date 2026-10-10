import { differenceInCalendarDays, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const MIN = 60_000;
const HORA = 60 * MIN;

const plural = (n: number, um: string, varios: string) => `há ${n} ${n === 1 ? um : varios}`;

/**
 * Data relativa em pt-BR, para leitura rápida em tabela: "agora mesmo",
 * "há 5 minutos", "há 2 horas", "ontem", "há 9 dias", "há 3 meses", "há 1 ano".
 *
 * Menos de 24 h conta em horas (às 00:30, algo das 22:30 é "há 2 horas", não
 * "ontem"); daí em diante conta dias de calendário. Data no futuro (relógio
 * do aparelho adiantado) vira "agora mesmo".
 */
export function formatRelativePtBR(value: string | Date, now: Date = new Date()): string {
  const data = typeof value === 'string' ? new Date(value) : value;
  const diff = now.getTime() - data.getTime();
  if (diff < MIN) return 'agora mesmo';
  if (diff < HORA) return plural(Math.floor(diff / MIN), 'minuto', 'minutos');
  if (diff < 24 * HORA) return plural(Math.floor(diff / HORA), 'hora', 'horas');

  const dias = differenceInCalendarDays(now, data);
  if (dias <= 1) return 'ontem';
  if (dias < 30) return `há ${dias} dias`;
  if (dias < 365) return plural(Math.floor(dias / 30), 'mês', 'meses');
  return plural(Math.floor(dias / 365), 'ano', 'anos');
}

/** Data completa, para o "passar o mouse": 10/10/2026 às 14:03. */
export function formatFullPtBR(value: string | Date): string {
  return format(typeof value === 'string' ? new Date(value) : value, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}
