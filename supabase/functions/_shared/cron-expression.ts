// =============================================================================
// cron-expression — avaliação de expressões cron de 5 campos num fuso horário.
// =============================================================================
// Usado pelo agendador de relatórios (process-report-dispatch) para responder
// duas perguntas:
//
//   1. isDue()        — "esta agenda deveria ter disparado desde a última vez
//                       que rodou?" É assim, e não por um next_run gravado, que
//                       a execução é decidida: se o worker ficar fora do ar, na
//                       volta ele ainda enxerga o horário perdido dentro da
//                       janela de catch-up e se recupera sozinho. Um next_run
//                       gravado só acumularia atraso.
//   2. nextRunAfter() — valor de EXIBIÇÃO, gravado depois de cada execução para
//                       a tela mostrar "Próximo envio".
//
// FUSO: as expressões são interpretadas em America/Sao_Paulo por padrão, não em
// UTC. Quem marca "09:00" na tela quer 9h de Brasília; avaliar em UTC entregaria
// o relatório às 6h da manhã. O Brasil não usa horário de verão desde 2019, mas
// nada aqui depende disso — o deslocamento é perguntado ao Intl a cada conversão.
//
// Sem imports de propósito: este módulo roda tanto no Deno (edge function)
// quanto no Vitest (testes em src/lib/reports/), então não pode depender de
// nada específico de runtime.
// =============================================================================

export const DEFAULT_TIME_ZONE = 'America/Sao_Paulo';

/** Janela de recuperação: horário perdido há até 1h ainda é disparado. */
export const DEFAULT_LOOKBACK_MINUTES = 60;

export interface CronFields {
  minutes: number[];
  hours: number[];
  daysOfMonth: number[];
  months: number[];
  daysOfWeek: number[];
  /** true quando o campo dia-do-mês não é '*' (importa para a semântica OR). */
  domRestricted: boolean;
  /** true quando o campo dia-da-semana não é '*' (importa para a semântica OR). */
  dowRestricted: boolean;
}

interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
  weekday: number; // 0-6, 0 = domingo
}

// ── Parsing ──────────────────────────────────────────────────────────────────

/**
 * Um campo cron: `*`, `5`, `1-5`, `*\/15`, `1-20/2`, `1,3,5` e combinações.
 * Devolve null em qualquer coisa que não seja entendida — o chamador trata
 * expressão inválida como "nunca dispara", nunca como "dispara sempre".
 */
function parseField(spec: string, min: number, max: number): number[] | null {
  const values = new Set<number>();

  for (const part of spec.split(',')) {
    if (!part) return null;
    const slash = part.indexOf('/');
    const rangeSpec = slash === -1 ? part : part.slice(0, slash);
    const stepSpec = slash === -1 ? undefined : part.slice(slash + 1);
    if (stepSpec !== undefined && !/^\d+$/.test(stepSpec)) return null;
    const step = stepSpec === undefined ? 1 : Number(stepSpec);
    if (step < 1) return null;

    let lo: number;
    let hi: number;
    if (rangeSpec === '*') {
      lo = min;
      hi = max;
    } else if (rangeSpec.includes('-')) {
      const dash = rangeSpec.indexOf('-');
      const a = rangeSpec.slice(0, dash);
      const b = rangeSpec.slice(dash + 1);
      if (!/^\d+$/.test(a) || !/^\d+$/.test(b)) return null;
      lo = Number(a);
      hi = Number(b);
    } else {
      if (!/^\d+$/.test(rangeSpec)) return null;
      lo = Number(rangeSpec);
      // Um valor único com passo (ex.: `5/10`) vale como `5-max/10`.
      hi = stepSpec === undefined ? lo : max;
    }

    if (lo < min || hi > max || lo > hi) return null;
    for (let v = lo; v <= hi; v += step) values.add(v);
  }

  if (values.size === 0) return null;
  return [...values].sort((a, b) => a - b);
}

/** Converte "0 9 * * 1" nos conjuntos de valores aceitos por campo. */
export function parseCron(expression: string): CronFields | null {
  if (typeof expression !== 'string') return null;
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return null;

  const [minuteSpec = '', hourSpec = '', domSpec = '', monthSpec = '', dowSpec = ''] = fields;

  const minutes = parseField(minuteSpec, 0, 59);
  const hours = parseField(hourSpec, 0, 23);
  const daysOfMonth = parseField(domSpec, 1, 31);
  const months = parseField(monthSpec, 1, 12);
  // 0 e 7 são domingo no cron clássico; normalizamos 7 para 0.
  const rawDow = parseField(dowSpec, 0, 7);
  if (!minutes || !hours || !daysOfMonth || !months || !rawDow) return null;

  const daysOfWeek = [...new Set(rawDow.map((d) => (d === 7 ? 0 : d)))].sort((a, b) => a - b);

  return {
    minutes,
    hours,
    daysOfMonth,
    months,
    daysOfWeek,
    domRestricted: domSpec !== '*',
    dowRestricted: dowSpec !== '*',
  };
}

// ── Fuso horário ─────────────────────────────────────────────────────────────

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let fmt = formatterCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    formatterCache.set(timeZone, fmt);
  }
  return fmt;
}

/** Relógio de parede (ano/mês/dia/hora/minuto + dia da semana) no fuso dado. */
export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');

  const year = get('year');
  const month = get('month');
  const day = get('day');
  // Alguns runtimes devolvem 24 para meia-noite com hour12:false.
  const hour = get('hour') % 24;
  const minute = get('minute');
  // Dia da semana derivado do calendário, sem depender do nome localizado.
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  return { year, month, day, hour, minute, weekday };
}

/** Deslocamento do fuso, em ms, no instante dado (positivo a leste de Greenwich). */
function zoneOffsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  // Compara no mesmo grão (minuto) — deslocamentos de fuso são minutos inteiros.
  const flooredToMinute = Math.floor(date.getTime() / 60_000) * 60_000;
  return asUtc - flooredToMinute;
}

/**
 * Instante UTC correspondente a um relógio de parede no fuso dado.
 * Duas passadas: a primeira estima o deslocamento, a segunda o corrige caso a
 * estimativa tenha caído do outro lado de uma virada de horário de verão.
 */
export function utcFromZoned(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const wallClock = Date.UTC(year, month - 1, day, hour, minute);
  const firstGuess = wallClock - zoneOffsetMs(new Date(wallClock), timeZone);
  const corrected = wallClock - zoneOffsetMs(new Date(firstGuess), timeZone);
  return new Date(corrected);
}

// ── Avaliação ────────────────────────────────────────────────────────────────

function dayMatches(fields: CronFields, parts: ZonedParts): boolean {
  const domHit = fields.daysOfMonth.includes(parts.day);
  const dowHit = fields.daysOfWeek.includes(parts.weekday);

  // Semântica clássica do cron: com dia-do-mês E dia-da-semana restritos, basta
  // UM dos dois bater. Com apenas um restrito, o outro é '*' e sempre bate.
  if (fields.domRestricted && fields.dowRestricted) return domHit || dowHit;
  return domHit && dowHit;
}

/** A expressão dispara exatamente no minuto deste instante? */
export function matchesAt(
  expression: string,
  date: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
): boolean {
  const fields = parseCron(expression);
  if (!fields) return false;
  const parts = zonedParts(date, timeZone);
  return (
    fields.minutes.includes(parts.minute) &&
    fields.hours.includes(parts.hour) &&
    fields.months.includes(parts.month) &&
    dayMatches(fields, parts)
  );
}

export interface IsDueOptions {
  expression: string;
  now: Date;
  /** Última execução registrada; null quando a agenda nunca rodou. */
  lastRun?: Date | null;
  /** Quanto tempo para trás procurar um horário perdido. */
  lookbackMinutes?: number;
  timeZone?: string;
}

/**
 * Houve algum minuto de disparo entre a última execução e agora?
 *
 * Varre minuto a minuto para trás a partir de agora e para assim que alcança a
 * última execução — então uma agenda que já rodou nesta janela não dispara de
 * novo, e uma que perdeu o horário (worker fora do ar) ainda dispara na volta.
 *
 * Uma agenda que nunca rodou (`lastRun` nulo) só olha a janela de catch-up: ela
 * não vai disparar retroativamente meses de horários que nunca existiram.
 */
export function isDue(options: IsDueOptions): boolean {
  const {
    expression,
    now,
    lastRun = null,
    lookbackMinutes = DEFAULT_LOOKBACK_MINUTES,
    timeZone = DEFAULT_TIME_ZONE,
  } = options;

  const fields = parseCron(expression);
  if (!fields) return false;

  const nowMinute = Math.floor(now.getTime() / 60_000) * 60_000;
  const lastRunMs = lastRun ? lastRun.getTime() : null;

  for (let i = 0; i <= lookbackMinutes; i++) {
    const candidate = nowMinute - i * 60_000;
    // Já rodou neste minuto ou depois dele: nada anterior interessa.
    if (lastRunMs !== null && candidate <= lastRunMs) break;
    const parts = zonedParts(new Date(candidate), timeZone);
    if (
      fields.minutes.includes(parts.minute) &&
      fields.hours.includes(parts.hour) &&
      fields.months.includes(parts.month) &&
      dayMatches(fields, parts)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Próximo disparo estritamente depois de `from`. Valor de exibição.
 *
 * Caminha por dia de calendário (no máximo ~14 meses) e, nos dias que batem,
 * testa as horas e minutos aceitos. Devolve null se não houver disparo no
 * horizonte — o caso de expressão impossível, tipo 30 de fevereiro.
 */
export function nextRunAfter(
  expression: string,
  from: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
): Date | null {
  const fields = parseCron(expression);
  if (!fields) return null;

  const start = zonedParts(from, timeZone);
  // Date em UTC usado só como contador de calendário — nunca como instante.
  const calendar = new Date(Date.UTC(start.year, start.month - 1, start.day));

  for (let dayOffset = 0; dayOffset < 400; dayOffset++) {
    const year = calendar.getUTCFullYear();
    const month = calendar.getUTCMonth() + 1;
    const day = calendar.getUTCDate();
    const weekday = calendar.getUTCDay();

    if (
      fields.months.includes(month) &&
      dayMatches(fields, { year, month, day, hour: 0, minute: 0, weekday })
    ) {
      for (const hour of fields.hours) {
        for (const minute of fields.minutes) {
          const candidate = utcFromZoned(year, month, day, hour, minute, timeZone);
          if (candidate.getTime() > from.getTime()) return candidate;
        }
      }
    }

    calendar.setUTCDate(calendar.getUTCDate() + 1);
  }

  return null;
}

/**
 * Rótulo de frequência a partir da expressão — mesma leitura que a tela faz.
 * Usado para escolher o período de dados quando a agenda não gravou um.
 */
export function frequencyFromCron(expression: string): 'daily' | 'weekly' | 'monthly' | 'unknown' {
  const fields = parseCron(expression);
  if (!fields) return 'unknown';
  if (!fields.domRestricted && !fields.dowRestricted) return 'daily';
  if (!fields.domRestricted && fields.dowRestricted) return 'weekly';
  if (fields.domRestricted && !fields.dowRestricted) return 'monthly';
  return 'unknown';
}
