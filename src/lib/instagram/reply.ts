/**
 * Regras puras da resposta pelo Instagram no inbox (fatia 3/5).
 *
 * O servidor tem a cópia dele em
 * `supabase/functions/instagram-send-message/logic.ts` (o Deno não importa de
 * `src/`). `src/lib/instagramSend.test.ts` confere que as duas concordam.
 */

/** Limite do texto no Instagram: 1000 BYTES de UTF-8, não caracteres. */
export const INSTAGRAM_TEXT_MAX_BYTES = 1000;

/** A partir daqui o compositor mostra o contador. */
export const INSTAGRAM_TEXT_WARN_BYTES = 800;

const encoder = new TextEncoder();

export function utf8ByteLength(text: string): number {
  return encoder.encode(text).length;
}

export interface InstagramWindowState {
  /** A janela de 24 h está aberta agora. */
  open: boolean;
  /** Quando fecha (ou fechou). null = o cliente nunca escreveu. */
  closesAt: Date | null;
}

/**
 * Estado da janela de 24 h a partir de `closes_at` devolvido por
 * `instagram_reply_window` (o servidor é a fonte; aqui só se reavalia com o
 * relógio, para a janela fechar na tela sem precisar de nova consulta).
 */
export function instagramWindowState(
  closesAt: string | null | undefined,
  now: Date,
): InstagramWindowState {
  if (!closesAt) return { open: false, closesAt: null };
  const t = Date.parse(closesAt);
  if (Number.isNaN(t)) return { open: false, closesAt: null };
  return { open: now.getTime() < t, closesAt: new Date(t) };
}

/**
 * A conexão do Instagram venceu? `connection_config.tokenExpiresAt` é gravado
 * na criação da instância (emissão + 60 dias). Sem data legível: não afirma
 * que venceu — quem decide é o servidor.
 */
export function isInstagramConnectionExpired(
  connectionConfig: unknown,
  now: Date,
): boolean {
  const cfg = (connectionConfig ?? {}) as Record<string, unknown>;
  const raw = cfg.tokenExpiresAt;
  if (typeof raw !== 'string' || raw.length === 0) return false;
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return false;
  return now.getTime() >= t;
}

/** Textos do compositor — um lugar só, para a tela e os testes. */
export const INSTAGRAM_COMPOSER_TEXT = {
  windowClosed:
    'O cliente não escreve há mais de 24 horas. O Instagram só deixa responder depois que o cliente mandar uma nova mensagem.',
  noConnection:
    'Não dá para responder por aqui: a conexão do Instagram desta conversa não está disponível. Nada é enviado por outra conexão.',
  connectionExpired:
    'A conexão com o Instagram expirou e precisa ser refeita. Peça ao administrador para reconectar a conta do Instagram.',
  tooLong: (bytes: number) =>
    `Mensagem longa demais para o Instagram: ${bytes} de ${INSTAGRAM_TEXT_MAX_BYTES} bytes. Acentos e emojis ocupam mais de um.`,
  placeholder: 'Responder no Instagram...',
} as const;
