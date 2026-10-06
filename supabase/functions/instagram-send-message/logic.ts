// =============================================================================
// logic.ts — o que o instagram-send-message decide, sem I/O (mesma convenção
// de `instagram-webhook/delivery.ts`). Testado em `src/lib/instagramSend.test.ts`.
// =============================================================================
//
// Fatos da documentação da Meta ("Instagram API with Instagram login",
// Messaging API), conferidos em 2026-09-23:
//   * POST https://graph.instagram.com/v25.0/<IG_ID>/messages
//     Authorization: Bearer <token>; corpo {recipient:{id}, message:{text}};
//   * resposta: { recipient_id, message_id };
//   * texto: UTF-8, no máximo 1000 BYTES (não caracteres);
//   * 24 h para responder depois da última mensagem do cliente; não existe
//     template para reabrir.
//
// INFERIDO (a página de códigos de erro da Meta devolveu 500 na consulta):
//   code 10 / subcode 2534022 = fora da janela; 190 = token expirado/inválido;
//   100 + 2534014 e 551 = destinatário inexistente/indisponível;
//   4, 17, 32, 613, 80002, 80006 = limite de chamadas. Por isso o mapeamento
//   também olha o texto da mensagem e sempre tem um genérico de reserva.
//
// ⚠️ NOMES DE CAMPO: o EdgeLogger censura chaves com 'token'/'secret'/'key'.
// =============================================================================

export const INSTAGRAM_GRAPH_HOST = 'https://graph.instagram.com';
export const INSTAGRAM_GRAPH_VERSION = 'v25.0';
/** Limite do texto, em bytes UTF-8. Espelhado em src/lib/instagram/reply.ts. */
export const INSTAGRAM_TEXT_MAX_BYTES = 1000;

export type InstagramSendReason =
  | 'bad_request'
  | 'empty'
  | 'too_long'
  | 'forbidden'
  | 'not_instagram'
  | 'instance_inactive'
  | 'contact_not_found'
  | 'outside_window'
  | 'window_unavailable'
  | 'token_expired'
  | 'token_missing'
  | 'invalid_recipient'
  | 'rate_limited'
  | 'network_error'
  | 'meta_error';

/** Mensagens em pt-BR, na voz do produto. A UI mostra exatamente isto. */
export const REASON_MESSAGES: Record<InstagramSendReason, string> = {
  bad_request: 'Pedido de envio incompleto.',
  empty: 'A mensagem está vazia.',
  too_long:
    'Mensagem longa demais para o Instagram: o limite é de 1.000 bytes (acentos e emojis ocupam mais de um). Encurte e envie de novo.',
  forbidden: 'Você não tem acesso a esta conexão do Instagram.',
  not_instagram: 'Esta conexão não é do Instagram.',
  instance_inactive: 'A conexão do Instagram desta conversa está desativada.',
  contact_not_found: 'Este contato não é do Instagram desta conexão.',
  outside_window:
    'O cliente não escreve há mais de 24 horas. O Instagram só deixa responder depois que o cliente mandar uma nova mensagem.',
  window_unavailable: 'Não foi possível conferir a janela de 24 horas agora. Tente de novo em instantes.',
  token_expired:
    'A conexão com o Instagram expirou e precisa ser refeita. Peça ao administrador para reconectar a conta do Instagram.',
  token_missing:
    'A conexão com o Instagram está incompleta e precisa ser refeita. Peça ao administrador para reconectar a conta do Instagram.',
  invalid_recipient: 'O Instagram não encontrou esta pessoa, ou ela não pode receber mensagens agora.',
  rate_limited: 'O Instagram limitou os envios por alguns instantes. Espere um pouco e tente de novo.',
  network_error: 'Não foi possível falar com o Instagram agora. Tente de novo.',
  meta_error: 'O Instagram recusou a mensagem.',
};

export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export interface SendRequestBody {
  instance_id: string;
  /** IGSID do cliente (contacts.external_id). */
  to: string;
  text: string;
}

export type ValidatedRequest =
  | { ok: true; value: SendRequestBody }
  | { ok: false; reason: 'bad_request' | 'empty' | 'too_long' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Confere o corpo. O texto NÃO é alterado (nem trim): o que a Meta recebe tem
 * de ser o que o navegador gravou, porque é pelo texto que o eco é casado.
 */
export function validateSendRequest(body: unknown): ValidatedRequest {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, reason: 'bad_request' };
  }
  const b = body as Record<string, unknown>;
  if (typeof b.instance_id !== 'string' || !UUID_RE.test(b.instance_id)) {
    return { ok: false, reason: 'bad_request' };
  }
  // IGSID: só dígitos. Número não é aceito (perderia precisão no JSON).
  if (typeof b.to !== 'string' || !/^[0-9]{5,40}$/.test(b.to)) {
    return { ok: false, reason: 'bad_request' };
  }
  if (typeof b.text !== 'string' || b.text.trim().length === 0) {
    return { ok: false, reason: 'empty' };
  }
  if (utf8ByteLength(b.text) > INSTAGRAM_TEXT_MAX_BYTES) {
    return { ok: false, reason: 'too_long' };
  }
  return { ok: true, value: { instance_id: b.instance_id, to: b.to, text: b.text } };
}

/**
 * O token venceu? Lê `connection_config.tokenExpiresAt` (gravado por
 * create_instagram_instance: emissão + 60 dias). Sem data, ou data ilegível:
 * NÃO recusa — quem decide é a Meta (erro 190, mapeado abaixo).
 */
export function isTokenExpired(tokenExpiresAt: unknown, now: Date): boolean {
  if (typeof tokenExpiresAt !== 'string' || tokenExpiresAt.length === 0) return false;
  const t = Date.parse(tokenExpiresAt);
  if (Number.isNaN(t)) return false;
  return now.getTime() >= t;
}

export function buildGraphRequest(igAccountId: string, recipientId: string, text: string) {
  return {
    url: `${INSTAGRAM_GRAPH_HOST}/${INSTAGRAM_GRAPH_VERSION}/${encodeURIComponent(igAccountId)}/messages`,
    body: { recipient: { id: recipientId }, message: { text } },
  };
}

export interface MetaErrorInfo {
  reason: InstagramSendReason;
  code: number | null;
  subcode: number | null;
}

const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80002, 80006]);

/** Traduz a resposta de erro da Graph API. Sempre devolve algo. */
export function mapMetaError(httpStatus: number, json: unknown): MetaErrorInfo {
  const err = (json && typeof json === 'object' ? (json as Record<string, unknown>).error : null) as
    | Record<string, unknown>
    | null
    | undefined;
  const code = typeof err?.code === 'number' ? err.code : null;
  const subcode = typeof err?.error_subcode === 'number' ? err.error_subcode : null;
  const message = typeof err?.message === 'string' ? err.message : '';

  let reason: InstagramSendReason = 'meta_error';
  if ((code === 10 && subcode === 2534022) || /outside of (the )?allowed window/i.test(message)) {
    reason = 'outside_window';
  } else if (code === 190 || (httpStatus === 401 && err?.type === 'OAuthException')) {
    reason = 'token_expired';
  } else if ((code === 100 && subcode === 2534014) || code === 551) {
    reason = 'invalid_recipient';
  } else if ((code !== null && RATE_LIMIT_CODES.has(code)) || httpStatus === 429) {
    reason = 'rate_limited';
  }
  return { reason, code, subcode };
}

/** Texto final para a UI; o genérico leva o código, para suporte. */
export function reasonMessage(info: MetaErrorInfo): string {
  const base = REASON_MESSAGES[info.reason];
  if (info.reason === 'meta_error' && info.code !== null) return `${base} (código ${info.code})`;
  return base;
}
