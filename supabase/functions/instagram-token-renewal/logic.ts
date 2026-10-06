// =============================================================================
// logic.ts — o que o instagram-token-renewal decide, sem I/O (mesma convenção
// de `instagram-send-message/logic.ts`). Testado em
// `src/lib/instagramTokenRenewal.test.ts`.
// =============================================================================
//
// Fatos da documentação da Meta ("Instagram API with Instagram login",
// Business Login), conferidos em 2026-09-24:
//   * GET https://graph.instagram.com/refresh_access_token
//         ?grant_type=ig_refresh_token&access_token=<token longo>
//   * só renova um token longo que tem PELO MENOS 24 h e que AINDA NÃO VENCEU,
//     e só se a conta concedeu instagram_business_basic;
//   * resposta: { access_token, token_type, expires_in } — expires_in em
//     SEGUNDOS. A validade vem daqui; nunca supomos 60 dias.
//
// INFERIDO (convenção da Graph API, não medido neste endpoint):
//   190 = token inválido/expirado, 102 = sessão; 10 e 200–299 = permissão;
//   4, 17, 32, 613, 80002, 80006 = limite de chamadas; 1, 2 e `is_transient`
//   = instabilidade da Meta. Por isso o que não reconhecemos cai em
//   "tentar de novo amanhã": errar para esse lado custa uma chamada por dia e
//   os avisos de 7 dias e de vencimento continuam valendo; errar para o outro
//   lado pararia a renovação de uma conexão que ainda tinha conserto.
//
// ⚠️ NOMES DE CAMPO: o EdgeLogger censura chaves com 'token'/'secret'/'key'.
// =============================================================================

export const INSTAGRAM_REFRESH_URL = 'https://graph.instagram.com/refresh_access_token';

/** Renova quando faltam até 30 dias para vencer. */
export const RENEWAL_WINDOW_DAYS = 30;
/** A Meta só renova token com pelo menos 24 h de vida. */
export const MIN_TOKEN_AGE_HOURS = 24;
/** Marco do aviso "vai vencer". Espelhado no SQL e em src/lib/instagram/connection.ts. */
export const EXPIRING_SOON_DAYS = 7;
/** expires_in acima disto é tratado como ausente (defesa contra lixo). */
export const MAX_EXPIRES_IN_SECONDS = 400 * 86_400;

/** Cabeçalho com o segredo do cron. O valor mora no Vault, nunca no código. */
export const CRON_SECRET_HEADER = 'x-cron-secret';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

// -----------------------------------------------------------------------------
// 1. Estado de renovação gravado na instância
// -----------------------------------------------------------------------------

export type RenewalStatus = 'ok' | 'retrying' | 'needs_reconnect';

/**
 * `connection_config.renewal`. `forTokenIssuedAt` diz a QUAL token o estado se
 * refere: é o `tokenIssuedAt` de quando o estado foi gravado. Se o token for
 * trocado por outro caminho (reconexão, troca manual do runbook), o
 * `tokenIssuedAt` muda e o estado antigo deixa de valer sozinho — ninguém
 * precisa lembrar de limpá-lo.
 */
export interface RenewalState {
  status: RenewalStatus;
  forTokenIssuedAt: string | null;
  reason: string | null;
  message: string | null;
  metaCode: number | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
}

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null;
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

const STATUSES: ReadonlySet<string> = new Set(['ok', 'retrying', 'needs_reconnect']);

/**
 * O estado de renovação que vale para o token ATUAL, ou null (nunca houve
 * tentativa, estado ilegível, ou o estado é de um token que já foi trocado).
 */
export function currentRenewalState(connectionConfig: unknown): RenewalState | null {
  const cfg = asObj(connectionConfig);
  if (!cfg) return null;
  const r = asObj(cfg.renewal);
  if (!r || typeof r.status !== 'string' || !STATUSES.has(r.status)) return null;
  const forToken = strOrNull(r.forTokenIssuedAt);
  const issued = strOrNull(cfg.tokenIssuedAt);
  if (forToken === null || issued === null || forToken !== issued) return null;
  return {
    status: r.status as RenewalStatus,
    forTokenIssuedAt: forToken,
    reason: strOrNull(r.reason),
    message: strOrNull(r.message),
    metaCode: typeof r.metaCode === 'number' ? r.metaCode : null,
    lastAttemptAt: strOrNull(r.lastAttemptAt),
    lastSuccessAt: strOrNull(r.lastSuccessAt),
    lastErrorAt: strOrNull(r.lastErrorAt),
  };
}

function parseTime(v: unknown): number | null {
  if (typeof v !== 'string' || v.length === 0) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

// -----------------------------------------------------------------------------
// 2. Renovar ou não
// -----------------------------------------------------------------------------

export type SkipReason =
  | 'inactive'        // instância desligada (is_active = false)
  | 'no_dates'        // sem tokenIssuedAt/tokenExpiresAt legíveis: não dá para saber idade nem validade
  | 'expired'         // já venceu: a Meta não renova, só um login novo resolve
  | 'needs_reconnect' // a Meta já recusou ESTE token de um jeito que só reconectar resolve
  | 'too_young'       // menos de 24 h: a Meta recusaria
  | 'not_due';        // faltam mais de 30 dias

export type RenewalDecision = { action: 'renew' } | { action: 'skip'; reason: SkipReason };

export interface RenewalInput {
  isActive: boolean | null | undefined;
  connectionConfig: unknown;
}

export interface RenewalOptions {
  /**
   * Só para a execução manual: renova mesmo faltando mais de 30 dias. As
   * regras da Meta (24 h, não vencido) e a parada por "precisa reconectar"
   * continuam valendo.
   */
  ignoreWindow?: boolean;
}

export function decideRenewal(
  input: RenewalInput,
  now: Date,
  opts: RenewalOptions = {},
): RenewalDecision {
  if (input.isActive === false) return { action: 'skip', reason: 'inactive' };

  const cfg = asObj(input.connectionConfig) ?? {};
  const issued = parseTime(cfg.tokenIssuedAt);
  const expires = parseTime(cfg.tokenExpiresAt);
  if (issued === null || expires === null) return { action: 'skip', reason: 'no_dates' };

  const t = now.getTime();
  if (t >= expires) return { action: 'skip', reason: 'expired' };

  if (currentRenewalState(cfg)?.status === 'needs_reconnect') {
    return { action: 'skip', reason: 'needs_reconnect' };
  }

  if (t - issued < MIN_TOKEN_AGE_HOURS * HOUR_MS) return { action: 'skip', reason: 'too_young' };

  if (!opts.ignoreWindow && expires - t > RENEWAL_WINDOW_DAYS * DAY_MS) {
    return { action: 'skip', reason: 'not_due' };
  }
  return { action: 'renew' };
}

// -----------------------------------------------------------------------------
// 3. O que a Meta respondeu
// -----------------------------------------------------------------------------

export type FailureReason =
  // tentar de novo amanhã
  | 'network_error'
  | 'rate_limited'
  | 'meta_unavailable'
  | 'bad_response'
  | 'meta_error'
  // só um login novo resolve
  | 'token_invalid'
  | 'permission_removed'
  | 'token_missing';

export type FailureKind = 'transient' | 'needs_reconnect';

export const FAILURE_KIND: Record<FailureReason, FailureKind> = {
  network_error: 'transient',
  rate_limited: 'transient',
  meta_unavailable: 'transient',
  bad_response: 'transient',
  meta_error: 'transient',
  token_invalid: 'needs_reconnect',
  permission_removed: 'needs_reconnect',
  token_missing: 'needs_reconnect',
};

/** Frases curtas, sem jargão. Ficam gravadas na instância e aparecem no cartão. */
export const FAILURE_MESSAGES: Record<FailureReason, string> = {
  network_error: 'Não foi possível falar com o Instagram.',
  rate_limited: 'O Instagram pediu para esperar antes de tentar de novo.',
  meta_unavailable: 'O Instagram estava instável na hora da renovação.',
  bad_response: 'O Instagram respondeu sem o novo acesso.',
  meta_error: 'O Instagram recusou a renovação.',
  token_invalid: 'O Instagram não aceita mais o acesso atual desta conta.',
  permission_removed: 'A permissão dada ao ConvoFlow foi retirada no Instagram.',
  token_missing: 'O acesso desta conta não foi encontrado no cofre do ConvoFlow.',
};

export type RefreshResult =
  | { ok: true; accessToken: string; expiresIn: number | null }
  | { ok: false; reason: FailureReason; kind: FailureKind; metaCode: number | null };

export function failure(reason: FailureReason, metaCode: number | null = null): RefreshResult {
  return { ok: false, reason, kind: FAILURE_KIND[reason], metaCode };
}

/** Mensagem gravada; o genérico leva o código, para quem opera. */
export function failureMessage(reason: FailureReason, metaCode: number | null): string {
  const base = FAILURE_MESSAGES[reason];
  return reason === 'meta_error' && metaCode !== null ? `${base} (código ${metaCode})` : base;
}

const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80002, 80006]);
const UNAVAILABLE_CODES = new Set([1, 2]);

/** expires_in válido em segundos, ou null. Nunca inventa uma validade. */
export function parseExpiresIn(v: unknown): number | null {
  let n: number | null = null;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string' && /^\d+$/.test(v)) n = Number(v);
  if (n === null || !Number.isFinite(n) || !Number.isInteger(n)) return null;
  if (n <= 0 || n > MAX_EXPIRES_IN_SECONDS) return null;
  return n;
}

/** Traduz a resposta do refresh. Sempre devolve algo. */
export function classifyRefreshResponse(httpStatus: number, json: unknown): RefreshResult {
  const body = asObj(json);

  if (httpStatus >= 200 && httpStatus < 300) {
    const tokenValue = body?.access_token;
    if (typeof tokenValue !== 'string' || tokenValue.trim().length === 0) return failure('bad_response');
    return { ok: true, accessToken: tokenValue.trim(), expiresIn: parseExpiresIn(body?.expires_in) };
  }

  const err = asObj(body?.error);
  const code = typeof err?.code === 'number' ? err.code : null;

  if (code === 190 || code === 102 || (httpStatus === 401 && err?.type === 'OAuthException')) {
    return failure('token_invalid', code);
  }
  if (code === 10 || (code !== null && code >= 200 && code <= 299)) {
    return failure('permission_removed', code);
  }
  if ((code !== null && RATE_LIMIT_CODES.has(code)) || httpStatus === 429) {
    return failure('rate_limited', code);
  }
  if (err?.is_transient === true || (code !== null && UNAVAILABLE_CODES.has(code)) || httpStatus >= 500) {
    return failure('meta_unavailable', code);
  }
  return failure('meta_error', code);
}

/** URL do refresh. O token vai na query porque é assim que a Meta documenta. */
export function buildRefreshUrl(currentToken: string): string {
  const qs = new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: currentToken });
  return `${INSTAGRAM_REFRESH_URL}?${qs.toString()}`;
}

// -----------------------------------------------------------------------------
// 4. Pedido de execução (cron ou manual)
// -----------------------------------------------------------------------------

export interface RunRequest {
  /** Só diz o que faria: não lê o cofre, não chama a Meta, não grava, não avisa. */
  dryRun: boolean;
  /** Limita a uma instância. null = todas as de Instagram. */
  instanceId: string | null;
  /** Ver RenewalOptions.ignoreWindow. */
  ignoreWindow: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Corpo vazio = execução do cron (todas, sem forçar, de verdade). */
export function validateRunRequest(
  raw: unknown,
): { ok: true; value: RunRequest } | { ok: false; error: string } {
  if (raw === null || raw === undefined) {
    return { ok: true, value: { dryRun: false, instanceId: null, ignoreWindow: false } };
  }
  const b = asObj(raw);
  if (!b) return { ok: false, error: 'corpo deve ser um objeto JSON' };

  const flag = (name: string): boolean | null => {
    const v = b[name];
    if (v === undefined || v === null) return false;
    return typeof v === 'boolean' ? v : null;
  };
  const dryRun = flag('dryRun');
  const ignoreWindow = flag('ignoreWindow');
  if (dryRun === null) return { ok: false, error: 'dryRun deve ser true ou false' };
  if (ignoreWindow === null) return { ok: false, error: 'ignoreWindow deve ser true ou false' };

  let instanceId: string | null = null;
  if (b.instanceId !== undefined && b.instanceId !== null) {
    if (typeof b.instanceId !== 'string' || !UUID_RE.test(b.instanceId)) {
      return { ok: false, error: 'instanceId deve ser um uuid' };
    }
    instanceId = b.instanceId;
  }
  return { ok: true, value: { dryRun, instanceId, ignoreWindow } };
}
