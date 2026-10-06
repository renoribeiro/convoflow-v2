/**
 * Regra de tempo de resposta (passo 5 da atribuição) — regras puras, sem React.
 *
 * O que existe no banco (migração 20260916000001):
 *   - quatro chaves em `tenants.settings`: `response_rule_enabled`,
 *     `response_rule_minutes` (5..1440), `response_rule_max_transfers` (1..10)
 *     e `business_hours` ({timezone, schedule});
 *   - a varredura `response_rule_sweep` (cron a cada 2 min), que transfere a conversa
 *     COM dono quando o cliente espera resposta humana há mais de
 *     `response_rule_minutes` DE FUNCIONAMENTO, contados do início da espera
 *     (ou de quando o responsável atual recebeu a conversa);
 *   - a RPC `loja_response_rule_preview`, que a tela usa para dizer "com X
 *     minutos, N das esperas dos últimos 30 dias teriam sido transferidas".
 *
 * `business_hours` é a MESMA chave e a MESMA forma que o motor do chatbot lê
 * em `isOutOfHours()` (supabase/functions/_shared/chatbot-engine.ts) e que a
 * função SQL `business_minutes_between` lê. `businessMinutesBetween` daqui é o
 * mesmo algoritmo, para a tela mostrar o exemplo ("cliente escreve sexta 17:50
 * → transfere segunda 09:50") e para o teste de unidade — nunca para decidir
 * de verdade. Quem decide é o banco.
 */

export const DEFAULT_RESPONSE_RULE_ENABLED = false;
export const DEFAULT_RESPONSE_RULE_MINUTES = 60;
export const DEFAULT_RESPONSE_RULE_MAX_TRANSFERS = 3;

/** Limites da CHECK `tenants_response_rule_settings_check`. */
export const RESPONSE_RULE_MINUTES_MIN = 5;
export const RESPONSE_RULE_MINUTES_MAX = 1440;
export const RESPONSE_RULE_MAX_TRANSFERS_MIN = 1;
export const RESPONSE_RULE_MAX_TRANSFERS_MAX = 10;

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

/** Fusos oferecidos no seletor. O banco aceita qualquer nome IANA válido. */
export const TIMEZONE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'America/Sao_Paulo', label: 'Brasília (São Paulo, Rio, Sul, Nordeste)' },
  { value: 'America/Fortaleza', label: 'Fortaleza (Ceará, Maranhão, Piauí)' },
  { value: 'America/Recife', label: 'Recife (Pernambuco, Paraíba)' },
  { value: 'America/Bahia', label: 'Salvador (Bahia)' },
  { value: 'America/Belem', label: 'Belém (Pará, Amapá)' },
  { value: 'America/Cuiaba', label: 'Cuiabá (Mato Grosso)' },
  { value: 'America/Campo_Grande', label: 'Campo Grande (Mato Grosso do Sul)' },
  { value: 'America/Manaus', label: 'Manaus (Amazonas, Roraima, Rondônia)' },
  { value: 'America/Rio_Branco', label: 'Rio Branco (Acre)' },
  { value: 'America/Noronha', label: 'Fernando de Noronha' },
  { value: 'America/Lisbon', label: 'Lisboa' },
];

export type WeekdayKey = '0' | '1' | '2' | '3' | '4' | '5' | '6';
export const WEEKDAY_KEYS: readonly WeekdayKey[] = ['0', '1', '2', '3', '4', '5', '6'];
export const WEEKDAY_LABELS: Record<WeekdayKey, string> = {
  '0': 'Domingo',
  '1': 'Segunda',
  '2': 'Terça',
  '3': 'Quarta',
  '4': 'Quinta',
  '5': 'Sexta',
  '6': 'Sábado',
};

export interface DayWindow {
  start: string; // 'HH:MM'
  end: string; // 'HH:MM'
}

/** Forma de `tenants.settings.business_hours` — igual à do motor do chatbot. */
export interface BusinessHours {
  timezone: string;
  /** null = fechado. Dia ausente no objeto também é fechado (regra do motor). */
  schedule: Record<WeekdayKey, DayWindow | null>;
}

const WORK_DAY: DayWindow = { start: '09:00', end: '18:00' };

/** Padrão do motor quando nada foi gravado: seg–sex 09:00–18:00, Brasília. */
export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  timezone: DEFAULT_TIMEZONE,
  schedule: {
    '0': null,
    '1': { ...WORK_DAY },
    '2': { ...WORK_DAY },
    '3': { ...WORK_DAY },
    '4': { ...WORK_DAY },
    '5': { ...WORK_DAY },
    '6': null,
  },
};

export interface ResponseRuleSettings {
  response_rule_enabled: boolean;
  response_rule_minutes: number;
  response_rule_max_transfers: number;
  /** Já normalizado. `businessHoursSaved` diz se havia algo gravado. */
  business_hours: BusinessHours;
  businessHoursSaved: boolean;
}

const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/;

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

const toInt = (v: unknown, fallback: number, min: number, max: number): number => {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) return fallback;
  return n;
};

/**
 * Sanitiza o JSON de `business_hours`. Segue o motor: `schedule` ausente =
 * padrão inteiro; `schedule` presente com dia ausente = dia FECHADO; start/end
 * ausentes = 09:00/18:00; malformados = idem (o SQL faz o mesmo).
 */
export const normalizeBusinessHours = (raw: unknown): BusinessHours => {
  if (!isRecord(raw)) return cloneBusinessHours(DEFAULT_BUSINESS_HOURS);
  const timezone = typeof raw.timezone === 'string' && raw.timezone.trim() ? raw.timezone : DEFAULT_TIMEZONE;
  if (!isRecord(raw.schedule)) return { ...cloneBusinessHours(DEFAULT_BUSINESS_HOURS), timezone };
  const schedule = {} as Record<WeekdayKey, DayWindow | null>;
  for (const key of WEEKDAY_KEYS) {
    const entry = raw.schedule[key];
    if (!isRecord(entry)) {
      schedule[key] = null;
      continue;
    }
    const start = typeof entry.start === 'string' && HHMM.test(entry.start) ? entry.start : '09:00';
    const end = typeof entry.end === 'string' && HHMM.test(entry.end) ? entry.end : '18:00';
    schedule[key] = { start, end };
  }
  return { timezone, schedule };
};

export const cloneBusinessHours = (bh: BusinessHours): BusinessHours => ({
  timezone: bh.timezone,
  schedule: Object.fromEntries(
    WEEKDAY_KEYS.map((k) => [k, bh.schedule[k] ? { ...bh.schedule[k]! } : null]),
  ) as Record<WeekdayKey, DayWindow | null>,
});

export const sameBusinessHours = (a: BusinessHours, b: BusinessHours): boolean =>
  a.timezone === b.timezone &&
  WEEKDAY_KEYS.every((k) => {
    const x = a.schedule[k];
    const y = b.schedule[k];
    if (!x && !y) return true;
    if (!x || !y) return false;
    return x.start === y.start && x.end === y.end;
  });

/** Lê as quatro chaves do JSON de settings, com os defaults. Puro, testável. */
export const parseResponseRuleSettings = (settings: unknown): ResponseRuleSettings => {
  const raw = isRecord(settings) ? settings : {};
  return {
    response_rule_enabled:
      typeof raw.response_rule_enabled === 'boolean' ? raw.response_rule_enabled : DEFAULT_RESPONSE_RULE_ENABLED,
    response_rule_minutes: toInt(
      raw.response_rule_minutes,
      DEFAULT_RESPONSE_RULE_MINUTES,
      RESPONSE_RULE_MINUTES_MIN,
      RESPONSE_RULE_MINUTES_MAX,
    ),
    response_rule_max_transfers: toInt(
      raw.response_rule_max_transfers,
      DEFAULT_RESPONSE_RULE_MAX_TRANSFERS,
      RESPONSE_RULE_MAX_TRANSFERS_MIN,
      RESPONSE_RULE_MAX_TRANSFERS_MAX,
    ),
    business_hours: normalizeBusinessHours(raw.business_hours),
    businessHoursSaved: isRecord(raw.business_hours),
  };
};

// ---------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------

export interface ResponseRuleErrors {
  minutes?: string;
  maxTransfers?: string;
  /** Por dia da semana. */
  days?: Partial<Record<WeekdayKey, string>>;
  /** Nenhum dia aberto. */
  schedule?: string;
}

export const validateResponseRule = (input: {
  minutes: number;
  maxTransfers: number;
  businessHours: BusinessHours;
}): ResponseRuleErrors => {
  const errors: ResponseRuleErrors = {};
  const { minutes, maxTransfers, businessHours } = input;

  if (!Number.isInteger(minutes) || minutes < RESPONSE_RULE_MINUTES_MIN || minutes > RESPONSE_RULE_MINUTES_MAX) {
    errors.minutes = `Informe um número inteiro entre ${RESPONSE_RULE_MINUTES_MIN} e ${RESPONSE_RULE_MINUTES_MAX} minutos.`;
  }
  if (
    !Number.isInteger(maxTransfers) ||
    maxTransfers < RESPONSE_RULE_MAX_TRANSFERS_MIN ||
    maxTransfers > RESPONSE_RULE_MAX_TRANSFERS_MAX
  ) {
    errors.maxTransfers = `Informe um número inteiro entre ${RESPONSE_RULE_MAX_TRANSFERS_MIN} e ${RESPONSE_RULE_MAX_TRANSFERS_MAX}.`;
  }

  let anyOpen = false;
  for (const key of WEEKDAY_KEYS) {
    const day = businessHours.schedule[key];
    if (!day) continue;
    anyOpen = true;
    if (!HHMM.test(day.start) || !HHMM.test(day.end)) {
      (errors.days ??= {})[key] = 'Use o formato HH:MM.';
    } else if (toMinutes(day.end) <= toMinutes(day.start)) {
      (errors.days ??= {})[key] = 'O fim precisa ser depois do início.';
    }
  }
  if (!anyOpen) {
    errors.schedule = 'Deixe pelo menos um dia aberto, senão a regra nunca dispara.';
  }
  return errors;
};

export const hasResponseRuleErrors = (e: ResponseRuleErrors): boolean =>
  !!e.minutes || !!e.maxTransfers || !!e.schedule || !!(e.days && Object.keys(e.days).length > 0);

// ---------------------------------------------------------------------------
// O relógio de funcionamento — mesmo algoritmo de business_minutes_between
// ---------------------------------------------------------------------------

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

interface LocalParts {
  year: number;
  month: number; // 1..12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = domingo
}

const WEEKDAY_MAP: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const formatterCache = new Map<string, Intl.DateTimeFormat>();

const formatterFor = (timezone: string): Intl.DateTimeFormat => {
  let f = formatterCache.get(timezone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    formatterCache.set(timezone, f);
  }
  return f;
};

/** Fuso válido para o Intl deste ambiente? (o SQL faz a mesma checagem por tentativa) */
export const isValidTimezone = (timezone: string): boolean => {
  try {
    formatterFor(timezone);
    return true;
  } catch {
    return false;
  }
};

const localParts = (instant: number, timezone: string): LocalParts => {
  const parts = formatterFor(timezone).formatToParts(new Date(instant));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
  // "24" aparece em alguns runtimes para meia-noite com hour12:false.
  const hour = Number(get('hour')) % 24;
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour,
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: WEEKDAY_MAP[get('weekday')] ?? 0,
  };
};

/** Diferença (ms) entre o relógio local do fuso e o UTC naquele instante. */
const tzOffsetMs = (instant: number, timezone: string): number => {
  const p = localParts(instant, timezone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
};

/** Instante UTC de um horário local (y, m, d, hh:mm) num fuso — resolve DST em duas passadas. */
const zonedToUtc = (year: number, month: number, day: number, minutes: number, timezone: string): number => {
  const guess = Date.UTC(year, month - 1, day, 0, minutes);
  const off1 = tzOffsetMs(guess, timezone);
  let result = guess - off1;
  const off2 = tzOffsetMs(result, timezone);
  if (off2 !== off1) result = guess - off2;
  return result;
};

const addDays = (year: number, month: number, day: number, n: number): { year: number; month: number; day: number } => {
  const d = new Date(Date.UTC(year, month - 1, day + n));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
};

/**
 * Minutos DENTRO do horário de funcionamento entre dois instantes. 0 quando
 * `to <= from`. Intervalo meio-aberto [start, end) por dia, como o motor.
 */
export const businessMinutesBetween = (bh: BusinessHours, from: Date, to: Date): number => {
  const fromMs = from.getTime();
  const toMs = to.getTime();
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) return 0;
  const timezone = isValidTimezone(bh.timezone) ? bh.timezone : DEFAULT_TIMEZONE;

  let cursor = localParts(fromMs, timezone);
  const last = localParts(toMs, timezone);
  let total = 0;
  let guard = 0;
  while (guard < 400) {
    guard += 1;
    const key = String(cursor.weekday) as WeekdayKey;
    const day = bh.schedule[key];
    if (day) {
      const s = toMinutes(day.start);
      const e = toMinutes(day.end);
      if (e > s) {
        const ws = zonedToUtc(cursor.year, cursor.month, cursor.day, s, timezone);
        const we = zonedToUtc(cursor.year, cursor.month, cursor.day, e, timezone);
        const segStart = Math.max(ws, fromMs);
        const segEnd = Math.min(we, toMs);
        if (segEnd > segStart) total += (segEnd - segStart) / 60_000;
      }
    }
    if (cursor.year === last.year && cursor.month === last.month && cursor.day === last.day) break;
    const next = addDays(cursor.year, cursor.month, cursor.day, 1);
    // Meio-dia local evita cair no dia errado por DST; só o (y,m,d) importa.
    cursor = localParts(zonedToUtc(next.year, next.month, next.day, 12 * 60, timezone), timezone);
  }
  return Math.floor(total);
};

/**
 * O instante em que uma espera iniciada em `from` completa `minutes` de
 * funcionamento — ou null se o horário nunca abre. É o que a tela usa para o
 * exemplo "cliente escreve sexta 17:50 → transfere segunda 09:50".
 */
export const breachMoment = (bh: BusinessHours, from: Date, minutes: number): Date | null => {
  const timezone = isValidTimezone(bh.timezone) ? bh.timezone : DEFAULT_TIMEZONE;
  if (!WEEKDAY_KEYS.some((k) => {
    const d = bh.schedule[k];
    return d && toMinutes(d.end) > toMinutes(d.start);
  })) {
    return null;
  }
  let remaining = minutes;
  let cursorMs = from.getTime();
  let cursor = localParts(cursorMs, timezone);
  for (let guard = 0; guard < 400; guard += 1) {
    const day = bh.schedule[String(cursor.weekday) as WeekdayKey];
    if (day) {
      const s = toMinutes(day.start);
      const e = toMinutes(day.end);
      if (e > s) {
        const ws = zonedToUtc(cursor.year, cursor.month, cursor.day, s, timezone);
        const we = zonedToUtc(cursor.year, cursor.month, cursor.day, e, timezone);
        const start = Math.max(ws, cursorMs);
        if (we > start) {
          const available = (we - start) / 60_000;
          if (available >= remaining) return new Date(start + remaining * 60_000);
          remaining -= available;
        }
      }
    }
    const next = addDays(cursor.year, cursor.month, cursor.day, 1);
    cursorMs = zonedToUtc(next.year, next.month, next.day, 0, timezone);
    cursor = localParts(zonedToUtc(next.year, next.month, next.day, 12 * 60, timezone), timezone);
  }
  return null;
};

/** "sexta 17:50" no fuso da Loja, para o exemplo da tela. */
export const formatLocalMoment = (d: Date, timezone: string): string => {
  const tz = isValidTimezone(timezone) ? timezone : DEFAULT_TIMEZONE;
  const p = localParts(d.getTime(), tz);
  const weekday = WEEKDAY_LABELS[String(p.weekday) as WeekdayKey].toLowerCase();
  const hh = String(p.hour).padStart(2, '0');
  const mm = String(p.minute).padStart(2, '0');
  return `${weekday} ${hh}:${mm}`;
};
