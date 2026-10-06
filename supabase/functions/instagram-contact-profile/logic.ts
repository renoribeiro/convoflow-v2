// =============================================================================
// logic.ts — o que o instagram-contact-profile decide, sem I/O (mesma
// convenção de `instagram-send-message/logic.ts`). Testado em
// `src/lib/instagramContactProfile.test.ts`.
// =============================================================================
//
// Fatos da documentação da Meta ("Instagram API with Instagram login", User
// Profile API), conferidos em 2026-09-24:
//   * GET https://graph.instagram.com/<IGSID>?fields=name,username
//     com o token da conta do negócio;
//   * só funciona para quem MANDOU mensagem para a conta (o consentimento nasce
//     aí); para quem só comentou volta "User consent is required to access
//     user profile";
//   * se o cliente bloqueou a conta, não dá para ver nada dele;
//   * `name` pode vir vazio; `username` é o @;
//   * a foto (profile_pic) vence em poucos dias — por isso NÃO é buscada.
//
// INFERIDO (convenção da Graph API, não medido neste endpoint): 190/102/401 =
// acesso da conta recusado; 4, 17, 32, 613, 80002, 80006 e 429 = limite; 1, 2,
// 5xx e `is_transient` = instabilidade. O resto dos 4xx (consentimento,
// bloqueio, usuário inexistente) = "não dá para ver este cliente".
//
// ⚠️ NOMES DE CAMPO: o EdgeLogger censura chaves com 'token'/'secret'/'key'.
// =============================================================================

export const INSTAGRAM_GRAPH_HOST = 'https://graph.instagram.com';
export const INSTAGRAM_GRAPH_VERSION = 'v25.0';

/** Quantos contatos uma chamada aceita (a tela manda os que estão na lista). */
export const MAX_CONTACTS_PER_CALL = 20;

export type ProfileOutcome =
  | { kind: 'ok'; name: string | null; username: string | null }
  /** Bloqueou, não deu consentimento ou não existe: não tenta mais. */
  | { kind: 'unavailable'; metaCode: number | null }
  /** Rede, limite, instabilidade: tenta de novo mais tarde. */
  | { kind: 'retry'; metaCode: number | null }
  /** O problema é o acesso da CONTA do negócio: só reconectar resolve. */
  | { kind: 'token_invalid'; metaCode: number | null };

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null;
const text = (v: unknown): string | null =>
  typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;

const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80002, 80006]);
const UNAVAILABLE_CODES = new Set([1, 2]);

/** Traduz a resposta do perfil. Sempre devolve algo. */
export function classifyProfileResponse(httpStatus: number, json: unknown): ProfileOutcome {
  const body = asObj(json);

  if (httpStatus >= 200 && httpStatus < 300) {
    const name = text(body?.name);
    const username = text(body?.username)?.replace(/^@+/, '') ?? null;
    // 200 sem nome nem @: não há o que mostrar, e perguntar de novo não muda.
    if (!name && !username) return { kind: 'unavailable', metaCode: null };
    return { kind: 'ok', name, username };
  }

  const err = asObj(body?.error);
  const code = typeof err?.code === 'number' ? err.code : null;

  if (code === 190 || code === 102 || (httpStatus === 401 && err?.type === 'OAuthException')) {
    return { kind: 'token_invalid', metaCode: code };
  }
  if ((code !== null && RATE_LIMIT_CODES.has(code)) || httpStatus === 429) {
    return { kind: 'retry', metaCode: code };
  }
  if (err?.is_transient === true || (code !== null && UNAVAILABLE_CODES.has(code)) || httpStatus >= 500) {
    return { kind: 'retry', metaCode: code };
  }
  return { kind: 'unavailable', metaCode: code };
}

/** O que gravar no contato para cada resultado (instagram_contact_profile_record). */
export function recordStatusFor(outcome: ProfileOutcome): 'ok' | 'unavailable' | 'retry' | 'release' {
  switch (outcome.kind) {
    case 'ok':
      return 'ok';
    case 'unavailable':
      return 'unavailable';
    case 'retry':
      return 'retry';
    default:
      // O contato não tem culpa: tira a marca e ele volta a estar na hora
      // quando a conta for reconectada.
      return 'release';
  }
}

export function buildProfileUrl(igsid: string): string {
  return `${INSTAGRAM_GRAPH_HOST}/${INSTAGRAM_GRAPH_VERSION}/${encodeURIComponent(igsid)}?fields=name,username`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** { contactIds: uuid[] } — 1 a 20, sem repetição. */
export function validateProfileRequest(
  raw: unknown,
): { ok: true; contactIds: string[] } | { ok: false; error: string } {
  const b = asObj(raw);
  if (!b || !Array.isArray(b.contactIds)) return { ok: false, error: 'contactIds deve ser uma lista' };
  const ids = [...new Set(b.contactIds)];
  if (ids.length === 0) return { ok: false, error: 'contactIds vazio' };
  if (ids.length > MAX_CONTACTS_PER_CALL) {
    return { ok: false, error: `no máximo ${MAX_CONTACTS_PER_CALL} contatos por vez` };
  }
  if (!ids.every((id) => typeof id === 'string' && UUID_RE.test(id))) {
    return { ok: false, error: 'contactIds deve conter uuids' };
  }
  return { ok: true, contactIds: ids as string[] };
}

/** Mensagem gravada na instância quando o Instagram recusa o acesso da conta. */
export const TOKEN_INVALID_MESSAGE = 'O Instagram não aceita mais o acesso atual desta conta.';

/** Mensagem gravada na instância quando o acesso da conta não está no cofre. */
export const TOKEN_MISSING_MESSAGE = 'O acesso desta conta não foi encontrado no cofre do ConvoFlow.';
