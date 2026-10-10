// =============================================================================
// track-login (núcleo) — um registro de login por ENTRADA, não por evento
// =============================================================================
// O index.ts da função só liga isto ao Deno e ao Supabase; toda decisão mora
// aqui, sem nada do Deno, para o Vitest testar
// (src/lib/auth/trackLoginCore.test.ts).
//
// O QUE É UMA ENTRADA
//   Uma sessão nova do Auth: senha, link de convite, link de nova senha. Cada
//   uma tem um session_id próprio, que vem dentro do token e não muda quando
//   o token é renovado. Recarregar a página, voltar à aba e renovar o token
//   reaproveitam a sessão — por isso o navegador pode chamar esta função mais
//   de uma vez para a mesma entrada, e ela só grava a primeira.
//
// QUANDO FOI A ENTRADA
//   O token traz em `amr` o momento em que a pessoa se autenticou. É ele que
//   vai para created_at, não a hora da chamada: uma sessão aberta antes deste
//   registro existir (por exemplo, quem entrou pelo convite e nunca digitou a
//   senha) é registrada com a data verdadeira da entrada quando a pessoa abre
//   o app de novo. Data no futuro ou ausente vira "agora".
//
// AS LINHAS ANTIGAS
//   Até 2026-10-10 o registro era feito só no login por senha, sem session_id.
//   Para não contar duas vezes a mesma entrada, uma linha sem sessão gravada
//   entre 1 min antes e 10 min depois do momento da entrada vale como ela.
//
// A GARANTIA FINAL é do banco: índice único em user_activity_log(session_id)
// para event_type = 'login' (20261010000002). Duas chamadas ao mesmo tempo
// gravam uma linha só; a segunda recebe 23505 e vira 'duplicate'.
// =============================================================================

export const LEGACY_WINDOW_BEFORE_MS = 60_000;
export const LEGACY_WINDOW_AFTER_MS = 10 * 60_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface LoginClaims {
  sessionId: string;
  /** Momento da autenticação (o mais antigo de `amr`), ou null. */
  signedInAt: Date | null;
  /** Como entrou (`amr[].method` do mais antigo): password, otp, recovery… */
  method: string | null;
}

function base64UrlDecode(segment: string): string {
  const b64 = segment.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((segment.length + 3) % 4);
  const bin = atob(b64);
  return new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
}

/**
 * Lê session_id e amr do token. Não confere assinatura: quem chama já validou
 * o token com o Auth (getUser) antes.
 */
export function readLoginClaims(accessToken: string): LoginClaims | null {
  const parts = accessToken.split('.');
  const corpo = parts[1];
  if (parts.length !== 3 || !corpo) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(base64UrlDecode(corpo));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object') return null;
  const { session_id, amr } = payload as { session_id?: unknown; amr?: unknown };
  if (typeof session_id !== 'string' || !UUID.test(session_id)) return null;

  let first: { ts: number; method: string | null } | null = null;
  if (Array.isArray(amr)) {
    for (const entry of amr) {
      const ts = (entry as { timestamp?: unknown } | null)?.timestamp;
      const method = (entry as { method?: unknown } | null)?.method;
      if (typeof ts !== 'number' || !Number.isFinite(ts) || ts <= 0) continue;
      if (!first || ts < first.ts) first = { ts, method: typeof method === 'string' ? method : null };
    }
  }
  return {
    sessionId: session_id.toLowerCase(),
    signedInAt: first ? new Date(first.ts * 1000) : null,
    method: first?.method ?? null,
  };
}

/** O created_at do registro: a entrada, ou agora se ela faltar ou estiver no futuro. */
export function loginMoment(signedInAt: Date | null, now: Date): Date {
  if (!signedInAt || signedInAt.getTime() > now.getTime()) return now;
  return signedInAt;
}

export interface LoginRow {
  profile_id: string;
  event_type: 'login';
  ip: string | null;
  user_agent: string | null;
  metadata: { metodo: string | null };
  session_id: string;
  created_at: string;
}

export interface TrackLoginStore {
  /** id do perfil do login, ou null se não houver perfil. */
  profileIdFor(userId: string): Promise<string | null>;
  /** Há login SEM sessão (registro anterior a 2026-10-10) entre `from` e `to`? */
  hasLegacyLoginBetween(profileId: string, from: Date, to: Date): Promise<boolean>;
  /** Grava. 'duplicate' quando a sessão já tem login (índice único, 23505). */
  insertLogin(row: LoginRow): Promise<'inserted' | 'duplicate'>;
}

export type TrackLoginOutcome = 'inserted' | 'duplicate' | 'no_session' | 'no_profile';

export interface TrackLoginInput {
  userId: string;
  accessToken: string;
  ip: string | null;
  userAgent: string | null;
  now: Date;
}

export async function trackLogin(input: TrackLoginInput, store: TrackLoginStore): Promise<TrackLoginOutcome> {
  const claims = readLoginClaims(input.accessToken);
  if (!claims) return 'no_session';

  const profileId = await store.profileIdFor(input.userId);
  if (!profileId) return 'no_profile';

  const at = loginMoment(claims.signedInAt, input.now);
  if (claims.signedInAt) {
    const from = new Date(at.getTime() - LEGACY_WINDOW_BEFORE_MS);
    const to = new Date(at.getTime() + LEGACY_WINDOW_AFTER_MS);
    if (await store.hasLegacyLoginBetween(profileId, from, to)) return 'duplicate';
  }

  return store.insertLogin({
    profile_id: profileId,
    event_type: 'login',
    ip: input.ip,
    user_agent: input.userAgent,
    metadata: { metodo: claims.method },
    session_id: claims.sessionId,
    created_at: at.toISOString(),
  });
}
