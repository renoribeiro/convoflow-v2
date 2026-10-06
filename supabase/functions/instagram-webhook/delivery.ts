// =============================================================================
// delivery.ts — o que o instagram-webhook precisa saber sobre UMA entrega, sem
// I/O (mesma convenção de `_shared/meta-webhook-delivery.ts`).
// =============================================================================
//
// Fatos medidos pela sonda da fatia 2, em produção — não suposições:
//   * a entrega é assinada com o INSTAGRAM_APP_SECRET (o do app de Instagram,
//     1445899737404624); os dois segredos do app do WhatsApp NÃO batem;
//   * object = 'instagram'; entry[].id = o id da conta profissional (quem
//     RECEBEU); entry[].messaging[] traz sender, recipient, timestamp, message;
//   * o mid tem ~164 caracteres; o texto vem em message.text;
//   * a resposta enviada pelo app do Instagram no celular volta como eco:
//     mesmo formato, message.is_echo = true.
//
// O `timestamp` de cada item (horário do evento na Meta, em MILISSEGUNDOS desde
// 1970 — é o que os exemplos da doc da Meta mostram; a doc não diz a unidade
// por extenso) vai para a RPC desde a migração 20260925000004. É ele que decide
// se o eco pode zerar as não lidas: ver `parseMetaTimestamp`.
//
// Tudo aqui é função pura e testada em `src/lib/instagramWebhook.test.ts`.
//
// ⚠️ NOMES DE CAMPO: o `EdgeLogger` (_shared/logger.ts) censura qualquer chave
// cujo NOME contenha 'token', 'secret', 'key', 'apikey', 'password' ou
// 'authorization'. Nada do resumo de log se chama assim — há teste para isso.
// =============================================================================

import { verifyMetaSignature } from '../_shared/cryptoSignature.ts';

// -----------------------------------------------------------------------------
// 1. Assinatura
// -----------------------------------------------------------------------------

/**
 * Verifica `X-Hub-Signature-256` contra o segredo do app de Instagram. UM
 * segredo só: a sonda provou qual é, e aceitar outros candidatos aqui seria
 * aceitar entrega que a Meta não assinou com ele.
 */
export async function verifyInstagramSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string | null | undefined,
): Promise<boolean> {
  if (typeof appSecret !== 'string' || appSecret.length === 0) return false;
  return verifyMetaSignature(rawBody, signatureHeader, appSecret);
}

/** `sha256=` + 64 hex. Distingue "header ausente" de "header estranho" no log do 401. */
export function isWellFormedSignatureHeader(header: string | null): boolean {
  return typeof header === 'string' && /^sha256=[0-9a-f]{64}$/.test(header);
}

// -----------------------------------------------------------------------------
// 2. Classificação dos eventos
// -----------------------------------------------------------------------------

/**
 * O que um item de `messaging` é. Só `text` vira linha no banco nesta fatia;
 * todo o resto é registrado no log pelo tipo e descartado — nunca gravado pela
 * metade.
 */
export type InstagramEventKind =
  | 'text'
  | 'attachment'   // foto, vídeo, áudio, compartilhamento — fora do escopo
  | 'story_reply'  // resposta a story (message.reply_to.story) — fora do escopo
  | 'deleted'      // o cliente desfez o envio (message.is_deleted)
  | 'unsupported'  // a Meta não entrega o conteúdo (message.is_unsupported)
  | 'empty'        // message sem texto nem anexo
  | 'edit'         // message_edit
  | 'read'         // confirmação de leitura
  | 'reaction'
  | 'postback'
  | 'referral'
  | 'malformed'    // faltou id, mid ou conta — não dá para gravar com segurança
  | 'other';

/** Mensagem de texto pronta para `process_instagram_message`. */
export interface InstagramTextEvent {
  /** entry[].id — a conta profissional. É por ele que a instância é achada. */
  accountId: string;
  senderId: string;
  recipientId: string;
  mid: string;
  text: string;
  /** true = o próprio negócio falou (resposta pelo app do celular). */
  isEcho: boolean;
  /**
   * Horário do evento na Meta (messaging[].timestamp), em ISO 8601. `null`
   * quando faltou ou não é plausível — e aí o eco nunca zera as não lidas.
   */
  metaTimestamp: string | null;
}

export interface InstagramSkippedEvent {
  accountId: string | null;
  kind: Exclude<InstagramEventKind, 'text'>;
  isEcho: boolean;
}

export interface ParsedInstagramDelivery {
  /** Esperado: 'instagram'. O WhatsApp manda 'whatsapp_business_account'. */
  object: string | null;
  isInstagram: boolean;
  texts: InstagramTextEvent[];
  skipped: InstagramSkippedEvent[];
}

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null;

/**
 * Identificador só como string não vazia. Número NÃO é aceito: um id de 17
 * dígitos que chegasse como número já teria perdido precisão no JSON.parse, e
 * gravar um id errado é pior que descartar.
 */
const idOf = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

// -----------------------------------------------------------------------------
// Horário da Meta
// -----------------------------------------------------------------------------

/** Antes disto não existe mensagem nossa: valor menor é outra unidade ou lixo. */
export const META_TS_MIN_MS = Date.UTC(2020, 0, 1);
/** Folga para relógio adiantado da Meta. Mais que isso no futuro é lixo. */
export const META_TS_MAX_AHEAD_MS = 24 * 60 * 60 * 1000;

/**
 * `messaging[].timestamp` → ISO 8601, ou `null`.
 *
 * Só aceita NÚMERO inteiro de milissegundos entre 2020-01-01 e amanhã (pelo
 * relógio `nowMs`). Tudo o mais vira `null`, inclusive:
 *   * string, mesmo numérica — a sonda viu número, e o resto do parser também
 *     não adivinha tipo;
 *   * valor em SEGUNDOS (~1,7e9): cairia em 1970 e é recusado pelo piso, em
 *     vez de ser "consertado" por palpite de unidade.
 *
 * `null` é o lado seguro: a mensagem é gravada normalmente, e um eco sem
 * horário nunca zera as não lidas (a RPC aplica a mesma faixa de novo).
 */
export function parseMetaTimestamp(raw: unknown, nowMs: number = Date.now()): string | null {
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw)) return null;
  if (raw < META_TS_MIN_MS || raw > nowMs + META_TS_MAX_AHEAD_MS) return null;
  return new Date(raw).toISOString();
}

/**
 * É eco? `is_echo === true` é o sinal que a Meta documenta e que a sonda viu.
 * `sender.id === entry.id` é a rede: se algum dia um eco vier sem a flag, o
 * remetente ser a própria conta basta para não virar mensagem de cliente. (A
 * RPC ainda recusa, por conta própria, criar contato para a própria conta.)
 */
export function isEchoItem(item: unknown, accountId: string | null): boolean {
  const o = asObj(item);
  if (!o) return false;
  const msg = asObj(o.message);
  if (msg && msg.is_echo === true) return true;
  const sender = idOf(asObj(o.sender)?.id);
  return accountId !== null && sender !== null && sender === accountId;
}

/** Tipo do item, pelo NOME do campo presente — o payload não tem `type`. */
export function classifyMessagingItem(item: unknown): InstagramEventKind {
  const o = asObj(item);
  if (!o) return 'other';
  const msg = asObj(o.message);
  if (msg) {
    if (msg.is_deleted === true) return 'deleted';
    if (msg.is_unsupported === true) return 'unsupported';
    if (asObj(msg.reply_to)?.story) return 'story_reply';
    if (Array.isArray(msg.attachments) && msg.attachments.length > 0) return 'attachment';
    if (typeof msg.text === 'string' && msg.text.trim().length > 0) return 'text';
    return 'empty';
  }
  if (o.message_edit) return 'edit';
  if (o.read) return 'read';
  if (o.reaction) return 'reaction';
  if (o.postback) return 'postback';
  if (o.referral) return 'referral';
  return 'other';
}

/**
 * Lê uma entrega inteira. Tolerante a lixo: nunca levanta; o que não for
 * reconhecível sai em `skipped` como `malformed`/`other`.
 */
export function parseInstagramDelivery(
  payload: unknown,
  nowMs: number = Date.now(),
): ParsedInstagramDelivery {
  const root = asObj(payload) ?? {};
  const object = typeof root.object === 'string' ? root.object : null;
  const out: ParsedInstagramDelivery = {
    object,
    isInstagram: object === 'instagram',
    texts: [],
    skipped: [],
  };
  if (!out.isInstagram) return out;

  const entries = Array.isArray(root.entry) ? root.entry : [];
  for (const rawEntry of entries) {
    const entry = asObj(rawEntry);
    const accountId = idOf(entry?.id);
    const messaging = Array.isArray(entry?.messaging) ? (entry!.messaging as unknown[]) : [];

    for (const item of messaging) {
      const kind = classifyMessagingItem(item);
      const isEcho = isEchoItem(item, accountId);

      if (kind !== 'text') {
        out.skipped.push({ accountId, kind, isEcho });
        continue;
      }

      const o = item as Obj;
      const msg = o.message as Obj;
      const senderId = idOf(asObj(o.sender)?.id);
      const recipientId = idOf(asObj(o.recipient)?.id);
      const mid = idOf(msg.mid);

      if (!accountId || !senderId || !recipientId || !mid) {
        out.skipped.push({ accountId, kind: 'malformed', isEcho });
        continue;
      }

      out.texts.push({
        accountId,
        senderId,
        recipientId,
        mid,
        text: msg.text as string,
        isEcho,
        metaTimestamp: parseMetaTimestamp(o.timestamp, nowMs),
      });
    }
  }
  return out;
}

// -----------------------------------------------------------------------------
// 3. Resumo para o log
// -----------------------------------------------------------------------------

export interface InstagramDeliveryLogSummary {
  object: string | null;
  /** Mensagens de cliente a gravar. */
  inbound: number;
  /** Ecos (respostas do negócio pelo app) a gravar. */
  echoes: number;
  /** Mensagens a gravar SEM horário da Meta utilizável (eco assim não zera não lidas). */
  withoutMetaTime: number;
  /** Contagem por tipo do que foi descartado. */
  skippedKinds: Record<string, number>;
  /** entry[].id distintos — a CONTA do negócio, não o cliente. */
  accounts: string[];
}

/**
 * Uma linha de log por entrega. Nunca carrega texto, IGSID do cliente nem mid:
 * o cliente é a pessoa; a conta do negócio sai de propósito, porque é ela que
 * explica um `unknown_account`.
 */
export function summarizeForLog(parsed: ParsedInstagramDelivery): InstagramDeliveryLogSummary {
  const skippedKinds: Record<string, number> = {};
  for (const s of parsed.skipped) skippedKinds[s.kind] = (skippedKinds[s.kind] ?? 0) + 1;
  const accounts = new Set<string>();
  for (const t of parsed.texts) accounts.add(t.accountId);
  for (const s of parsed.skipped) if (s.accountId) accounts.add(s.accountId);
  return {
    object: parsed.object,
    inbound: parsed.texts.filter((t) => !t.isEcho).length,
    echoes: parsed.texts.filter((t) => t.isEcho).length,
    withoutMetaTime: parsed.texts.filter((t) => t.metaTimestamp === null).length,
    skippedKinds,
    accounts: [...accounts].sort(),
  };
}

/** Argumentos da RPC, com os nomes do SQL. */
export function toRpcArgs(ev: InstagramTextEvent) {
  return {
    p_ig_account_id: ev.accountId,
    p_sender_id: ev.senderId,
    p_recipient_id: ev.recipientId,
    p_mid: ev.mid,
    p_text: ev.text,
    p_is_echo: ev.isEcho,
    p_meta_ts: ev.metaTimestamp,
  };
}
