// =============================================================================
// logic.ts — o que a edge function instagram-connect decide, sem Deno e sem
// rede (mesma convenção de instagram-token-renewal/logic.ts). Testado em
// `src/lib/instagram/instagramConnect.test.ts`.
// =============================================================================
//
// Fatos da documentação da Meta ("Instagram API with Instagram Login",
// Business Login), conferidos em 2026-09-25:
//   * autorização: https://www.instagram.com/oauth/authorize com client_id,
//     redirect_uri (IGUAL a um dos cadastrados no painel), response_type=code,
//     scope (lista separada por vírgula), state (devolvido na volta) e
//     force_reauth=true (pede a senha mesmo com alguém logado no Instagram);
//   * volta com ?code=...#_ ("#_" não faz parte do código) ou, se a pessoa
//     recusar, ?error=access_denied&error_reason=user_denied&error_description=...;
//   * o código vale 1 hora e UMA vez;
//   * POST https://api.instagram.com/oauth/access_token (formulário) →
//     token curto (1 h). A doc mostra a resposta dentro de data[0]; na prática
//     vem solta — lemos as duas formas;
//   * GET https://graph.instagram.com/access_token?grant_type=ig_exchange_token
//     → token longo { access_token, token_type, expires_in (segundos) }.
//     "Deve ser feito no servidor" (usa o segredo do app);
//   * GET https://graph.instagram.com/v25.0/me?fields=user_id,username →
//     user_id é "o ID da conta profissional, o valor do campo id das
//     notificações de webhook desta conta" = o nosso igAccountId;
//   * POST https://graph.instagram.com/v25.0/me/subscribed_apps
//     ?subscribed_fields=messages → { success: true }.
//
// ⚠️ IDs GRANDES: 17841419262135883 passa de 2^53. Se a Meta mandar o user_id
// como NÚMERO, JSON.parse arredonda e grava a conta errada. Por isso o id é
// tirado do TEXTO da resposta (idFromRawJson), nunca do número já convertido.
//
// ⚠️ NOMES DE CAMPO: o EdgeLogger censura chaves com 'token'/'secret'/'key'.
// =============================================================================

export const INSTAGRAM_AUTHORIZE_URL = 'https://www.instagram.com/oauth/authorize';
export const INSTAGRAM_CODE_EXCHANGE_URL = 'https://api.instagram.com/oauth/access_token';
export const INSTAGRAM_LONG_LIVED_URL = 'https://graph.instagram.com/access_token';
export const INSTAGRAM_GRAPH_HOST = 'https://graph.instagram.com';
export const INSTAGRAM_GRAPH_VERSION = 'v25.0';

/** Receber e responder DMs. Nada de comentários nem publicação. */
export const INSTAGRAM_SCOPES = ['instagram_business_basic', 'instagram_business_manage_messages'] as const;

/** Onde a pessoa cai de volta no ConvoFlow. */
export const RETURN_PATH = '/dashboard/whatsapp-numbers';

/** Parâmetros que a edge function acrescenta ao devolver o navegador. */
export const CALLBACK_PARAMS = {
  code: 'ig_code',
  state: 'ig_state',
  error: 'ig_error',
  errorDescription: 'ig_error_description',
} as const;

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATE_RE = /^[0-9a-f]{64}$/;
const IG_ID_RE = /^[0-9]{5,30}$/;

// -----------------------------------------------------------------------------
// 1. Para onde o navegador volta
// -----------------------------------------------------------------------------

/**
 * As origens do ConvoFlow (as mesmas do CORS em _shared/validation.ts) e
 * localhost em qualquer porta, para testar antes do merge. Qualquer outra
 * origem é recusada: o return_to nunca vem de fora desta lista.
 */
const APP_ORIGINS = new Set([
  'https://convoflow.com.br',
  'https://www.convoflow.com.br',
  'https://convoflow.vercel.app',
]);
const LOCAL_ORIGIN_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

export function resolveReturnTo(origin: string | null | undefined): string | null {
  if (!origin) return null;
  const o = origin.trim().replace(/\/+$/, '');
  if (APP_ORIGINS.has(o) || LOCAL_ORIGIN_RE.test(o)) return `${o}${RETURN_PATH}`;
  return null;
}

/**
 * O endereço que o Instagram chama de volta: a PRÓPRIA edge function. É o
 * único cadastrado no painel da Meta — HTTPS, igual em produção e no teste
 * pelo localhost.
 */
export function defaultRedirectUri(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/instagram-connect`;
}

export function buildAuthorizeUrl(p: { appId: string; redirectUri: string; state: string }): string {
  const qs = new URLSearchParams({
    client_id: p.appId,
    redirect_uri: p.redirectUri,
    response_type: 'code',
    scope: INSTAGRAM_SCOPES.join(','),
    state: p.state,
    // Pede usuário e senha mesmo se o navegador já estiver logado no
    // Instagram: quem reconecta escolhe a conta, em vez de o ConvoFlow pegar
    // a que estiver aberta.
    force_reauth: 'true',
  });
  return `${INSTAGRAM_AUTHORIZE_URL}?${qs.toString()}`;
}

// -----------------------------------------------------------------------------
// 2. Pedidos do navegador
// -----------------------------------------------------------------------------

export type StartRequest = { action: 'start'; tenantId: string | null; instanceId: string | null };
export type CompleteRequest = { action: 'complete'; code: string; state: string };

/** O "#_" que o Instagram cola no fim não faz parte do código. */
export function cleanAuthorizationCode(raw: string): string {
  return raw.trim().replace(/#_?$/, '').replace(/#.*$/, '');
}

export function parseRequestBody(
  raw: unknown,
): { ok: true; value: StartRequest | CompleteRequest } | { ok: false; error: string } {
  const b = asObj(raw);
  if (!b) return { ok: false, error: 'Pedido inválido.' };

  if (b.action === 'start') {
    const t = b.tenantId ?? null;
    const i = b.instanceId ?? null;
    if (t !== null && (typeof t !== 'string' || !UUID_RE.test(t))) return { ok: false, error: 'Loja inválida.' };
    if (i !== null && (typeof i !== 'string' || !UUID_RE.test(i))) return { ok: false, error: 'Conta do Instagram inválida.' };
    if (t === null && i === null) return { ok: false, error: 'Escolha a Loja em que o Instagram vai ser conectado.' };
    return { ok: true, value: { action: 'start', tenantId: t as string | null, instanceId: i as string | null } };
  }

  if (b.action === 'complete') {
    if (typeof b.code !== 'string' || typeof b.state !== 'string') {
      return { ok: false, error: 'Resposta do Instagram incompleta.' };
    }
    const code = cleanAuthorizationCode(b.code);
    const state = b.state.trim();
    if (!code || code.length > 2048) return { ok: false, error: 'Resposta do Instagram incompleta.' };
    if (!STATE_RE.test(state)) return { ok: false, error: 'Este pedido de conexão não é válido. Comece de novo pelo botão do Instagram.' };
    return { ok: true, value: { action: 'complete', code, state } };
  }

  return { ok: false, error: 'Pedido inválido.' };
}

// -----------------------------------------------------------------------------
// 3. A volta do Instagram (GET na edge function)
// -----------------------------------------------------------------------------

export type BounceInput = {
  state: string | null;
  code: string | null;
  error: string | null;
  errorDescription: string | null;
};

export function readBounceQuery(url: URL): BounceInput {
  const g = (k: string) => {
    const v = url.searchParams.get(k);
    return v === null || v.trim() === '' ? null : v;
  };
  return { state: g('state'), code: g('code'), error: g('error'), errorDescription: g('error_description') };
}

/** O state tem forma de state? (O banco confere se ele existe.) */
export const isStateShaped = (s: string | null): s is string => s !== null && STATE_RE.test(s);

/** A URL da tela com o que o Instagram mandou, em parâmetros nossos. */
export function buildReturnUrl(returnTo: string, input: BounceInput): string {
  const u = new URL(returnTo);
  u.searchParams.set(CALLBACK_PARAMS.state, input.state ?? '');
  if (input.code && !input.error) {
    u.searchParams.set(CALLBACK_PARAMS.code, cleanAuthorizationCode(input.code));
  } else {
    u.searchParams.set(CALLBACK_PARAMS.error, (input.error ?? 'missing_code').slice(0, 64));
    if (input.errorDescription) {
      u.searchParams.set(CALLBACK_PARAMS.errorDescription, input.errorDescription.slice(0, 300));
    }
  }
  return u.toString();
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Página curta para quando não dá para devolver (state desconhecido/vencido). */
export function bounceErrorPage(message: string): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ConvoFlow</title></head>` +
    `<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;line-height:1.5">` +
    `<h1 style="font-size:1.25rem">Não foi possível voltar ao ConvoFlow</h1><p>${escapeHtml(message)}</p></body></html>`;
}

export const BOUNCE_INVALID_MESSAGE =
  'Este link de conexão do Instagram não vale mais (ele dura 10 minutos e só pode ser usado uma vez). Volte ao ConvoFlow, abra Instâncias e APIs e clique de novo no botão do Instagram. Nada foi alterado.';

// -----------------------------------------------------------------------------
// 4. Respostas da Meta
// -----------------------------------------------------------------------------

/**
 * Lê um campo de id do TEXTO do JSON, sem passar por Number (ids do Instagram
 * passam de 2^53). Aceita "user_id":"123" e "user_id":123.
 */
export function idFromRawJson(rawText: string, field: string): string | null {
  const re = new RegExp(`"${field}"\\s*:\\s*"?([0-9]{1,40})"?`);
  const m = re.exec(rawText);
  return m?.[1] ?? null;
}

function firstRecord(json: unknown): Obj | null {
  const o = asObj(json);
  if (!o) return null;
  if (Array.isArray(o.data)) return asObj(o.data[0]);
  return o;
}

export type MetaFailure = { ok: false; step: MetaStep; metaCode: number | null; message: string };
export type MetaStep = 'code' | 'long_lived' | 'me' | 'subscribe';

const STEP_MESSAGES: Record<MetaStep, string> = {
  code: 'O Instagram não aceitou o pedido de conexão (o código vale 1 hora e uma vez só). Nada foi alterado. Tente de novo pelo botão.',
  long_lived: 'O Instagram não entregou o acesso de longa duração. Nada foi alterado. Tente de novo pelo botão.',
  me: 'O Instagram não informou qual conta entrou. Nada foi alterado. Tente de novo pelo botão.',
  subscribe: 'O Instagram não aceitou ligar o recebimento de mensagens desta conta. Nada foi alterado. Confira se a conta é profissional (Empresa ou Criador de conteúdo) e tente de novo.',
};

export function metaFailure(step: MetaStep, json: unknown): MetaFailure {
  const err = asObj(asObj(json)?.error);
  const code = typeof err?.code === 'number' ? err.code : null;
  // Conta sem papel no app, com o app ainda sem acesso avançado: a Meta
  // responde com erro de permissão/usuário. A mensagem diz o que fazer.
  const base = STEP_MESSAGES[step];
  return { ok: false, step, metaCode: code, message: code !== null ? `${base} (código ${code})` : base };
}

export function parseCodeExchange(
  status: number,
  rawText: string,
): { ok: true; accessToken: string } | MetaFailure {
  let json: unknown = null;
  try { json = JSON.parse(rawText); } catch { /* corpo não-JSON */ }
  const rec = firstRecord(json);
  const tokenValue = rec?.access_token;
  if (status < 200 || status >= 300 || typeof tokenValue !== 'string' || !tokenValue.trim()) {
    return metaFailure('code', json);
  }
  return { ok: true, accessToken: tokenValue.trim() };
}

/** expires_in em segundos, ou null (o banco cai em 60 dias). */
export function parseExpiresIn(v: unknown): number | null {
  let n: number | null = null;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string' && /^\d+$/.test(v)) n = Number(v);
  if (n === null || !Number.isInteger(n) || n <= 0 || n > 400 * 86_400) return null;
  return n;
}

export function parseLongLived(
  status: number,
  rawText: string,
): { ok: true; accessToken: string; expiresIn: number | null } | MetaFailure {
  let json: unknown = null;
  try { json = JSON.parse(rawText); } catch { /* corpo não-JSON */ }
  const rec = firstRecord(json);
  const tokenValue = rec?.access_token;
  if (status < 200 || status >= 300 || typeof tokenValue !== 'string' || !tokenValue.trim()) {
    return metaFailure('long_lived', json);
  }
  return { ok: true, accessToken: tokenValue.trim(), expiresIn: parseExpiresIn(rec?.expires_in) };
}

const USERNAME_RE = /^[A-Za-z0-9._]{1,30}$/;

export function parseMe(
  status: number,
  rawText: string,
): { ok: true; igAccountId: string; username: string | null } | MetaFailure {
  let json: unknown = null;
  try { json = JSON.parse(rawText); } catch { /* corpo não-JSON */ }
  if (status < 200 || status >= 300) return metaFailure('me', json);
  const igAccountId = idFromRawJson(rawText, 'user_id');
  if (!igAccountId || !IG_ID_RE.test(igAccountId)) return metaFailure('me', json);
  const u = firstRecord(json)?.username;
  const username = typeof u === 'string' && USERNAME_RE.test(u.trim()) ? u.trim() : null;
  return { ok: true, igAccountId, username };
}

export function parseSubscribe(status: number, rawText: string): { ok: true } | MetaFailure {
  let json: unknown = null;
  try { json = JSON.parse(rawText); } catch { /* corpo não-JSON */ }
  if (status >= 200 && status < 300 && asObj(json)?.success === true) return { ok: true };
  return metaFailure('subscribe', json);
}

export const meUrl = () =>
  `${INSTAGRAM_GRAPH_HOST}/${INSTAGRAM_GRAPH_VERSION}/me?fields=user_id,username`;
export const subscribeUrl = () =>
  `${INSTAGRAM_GRAPH_HOST}/${INSTAGRAM_GRAPH_VERSION}/me/subscribed_apps?subscribed_fields=messages`;

// -----------------------------------------------------------------------------
// 5. O retorno do login, na ordem — com as dependências injetadas
// -----------------------------------------------------------------------------

/** O que as RPCs do banco devolvem (formas de instagram_connect_*). */
export type RpcRefusal = { ok: false; reason: string; message: string };
export type ClaimOk = { ok: true; state_id: string; tenant_id: string; instance_id: string | null; redirect_uri: string; mode: 'connect' | 'reconnect' };
export type CheckOk = { ok: true; mode: 'connect' | 'reconnect'; tenant_id: string; instance_id: string | null };
export type CommitOk = {
  ok: true;
  mode: 'connect' | 'reconnect';
  instance: { id: string; tenant_id: string; name: string; profile_name: string | null; is_active: boolean; valid_until: string | null };
  expiry_from_meta: boolean;
};

export interface CallbackDeps {
  claim(state: string, userId: string): Promise<ClaimOk | RpcRefusal>;
  exchangeCode(code: string, redirectUri: string): Promise<{ ok: true; accessToken: string } | MetaFailure>;
  exchangeLongLived(shortToken: string): Promise<{ ok: true; accessToken: string; expiresIn: number | null } | MetaFailure>;
  fetchMe(longToken: string): Promise<{ ok: true; igAccountId: string; username: string | null } | MetaFailure>;
  check(stateId: string, userId: string, igAccountId: string): Promise<CheckOk | RpcRefusal>;
  subscribe(longToken: string): Promise<{ ok: true } | MetaFailure>;
  commit(args: {
    stateId: string; userId: string; igAccountId: string; username: string | null;
    longToken: string; expiresIn: number | null;
  }): Promise<CommitOk | RpcRefusal>;
}

export type CallbackResult =
  | { ok: true; mode: 'connect' | 'reconnect'; instance: CommitOk['instance']; expiryFromMeta: boolean; username: string | null }
  | { ok: false; reason: string; message: string; step: 'claim' | 'meta' | 'check' | 'commit'; metaStep?: MetaStep; metaCode?: number | null };

/**
 * A ordem é a segurança:
 *   1. claim  — queima o state ANTES da Meta; state inventado, de outro
 *               usuário, vencido ou usado para aqui, sem gastar o código.
 *   2. Meta   — código → token curto → token longo → /me.
 *   3. check  — decide com o igAccountId (conta de outra Loja, outra conta no
 *               cartão...). Recusa aqui NÃO inscreve nada na Meta.
 *   4. subscribed_apps — só para quem foi aceito. Se falhar, nada é gravado:
 *               melhor "tente de novo" do que um cartão verde que não recebe.
 *   5. commit — o banco repete o check sob lock e grava linha + token.
 * Nada que é segredo sai daqui (o token não está no resultado).
 */
export async function runCallback(
  deps: CallbackDeps,
  input: { userId: string; code: string; state: string },
): Promise<CallbackResult> {
  const claim = await deps.claim(input.state, input.userId);
  if (!claim.ok) return { ok: false, reason: claim.reason, message: claim.message, step: 'claim' };

  const short = await deps.exchangeCode(input.code, claim.redirect_uri);
  if (!short.ok) return metaResult(short);
  const long = await deps.exchangeLongLived(short.accessToken);
  if (!long.ok) return metaResult(long);
  const me = await deps.fetchMe(long.accessToken);
  if (!me.ok) return metaResult(me);

  const check = await deps.check(claim.state_id, input.userId, me.igAccountId);
  if (!check.ok) return { ok: false, reason: check.reason, message: check.message, step: 'check' };

  const sub = await deps.subscribe(long.accessToken);
  if (!sub.ok) return metaResult(sub);

  const commit = await deps.commit({
    stateId: claim.state_id,
    userId: input.userId,
    igAccountId: me.igAccountId,
    username: me.username,
    longToken: long.accessToken,
    expiresIn: long.expiresIn,
  });
  if (!commit.ok) return { ok: false, reason: commit.reason, message: commit.message, step: 'commit' };

  return { ok: true, mode: commit.mode, instance: commit.instance, expiryFromMeta: commit.expiry_from_meta, username: me.username };
}

function metaResult(f: MetaFailure): CallbackResult {
  return { ok: false, reason: `meta_${f.step}`, message: f.message, step: 'meta', metaStep: f.step, metaCode: f.metaCode };
}
