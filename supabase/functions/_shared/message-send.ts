// =============================================================================
// message-send.ts — envio das Conversas por número Evolution ou WAHA, feito
// pelo SERVIDOR (edge function `whatsapp-send-message`)
// =============================================================================
// Até a sessão 2 do docs/RUNBOOK_segredos_das_instancias.md (2026-10-26) o
// navegador chamava o Evolution e o WAHA direto, com a chave lida da linha de
// whatsapp_instances, que todo membro da Loja lê. Agora a chave e o endereço
// ficam no cofre e só o servidor os usa: a tela manda o pedido ("texto para
// tal contato") e recebe o id da mensagem ou a frase do erro, nunca a chave.
//
// QUEM PODE: a mesma regra que o envio da Meta já usava
// (`decideInstanceAccess`): perfil ativo, na própria Conta/Loja, ou o Gerente
// numa Loja filha direta. Não há capacidade extra: quem atende a conversa
// responde por ela (docs/PERMISSOES_POR_CARGO.md).
//
// MÍDIA: o anexo mora no bucket privado `whatsapp-media`. O servidor confere,
// com o token de quem envia, que a regra do Storage deixa essa pessoa ler o
// arquivo; depois LÊ o arquivo com a chave do servidor e manda os bytes
// (base64) ao provedor. Nenhum arquivo fica público e nenhum link sai daqui.
//
// Endpoints (conferidos no código oficial em 2026-10-26):
//   evolution  .agent/skills/evolution-v2/SKILL.md §3.1 sendText, §3.2
//              sendMedia, §3.3 sendWhatsAppAudio (voz, `encoding` converte para
//              OGG/Opus), §3.5 sendLocation, §3.7 sendReaction, §4.2
//              markMessageAsRead, §4.4 archiveChat, §4.1 whatsappNumbers, §4.9
//              fetchProfilePictureUrl, e /chat/sendPresence (digitando). Todos
//              POST (src/api/routes/chat.router.ts não tem nenhum PUT).
//              Header `apikey` com a chave DA INSTÂNCIA.
//   waha       .agent/skills/waha/SKILL.md §3.1 a §3.8, §3.13 digitando e
//              lida, §5.5 arquivar, §6.2 e §6.3. Header `X-Api-Key`. Servidor
//              do cliente: quem executa passa por safeFetch (endereço interno
//              recusado, redirecionamento não seguido).
//
// O texto e a mídia das mensagens nunca vão para o log.
//
// Regra pura com as dependências injetadas: o Vitest roda sem Deno.
// =============================================================================

import { statusDenialMessage } from './capabilities.ts';
import { decideInstanceAccess, type InstanceAccessTenant } from './instance-access.ts';
import type { ProviderCredentials, ResolvedCredentials } from './instance-credentials.ts';
import type { ProviderRequest, ProviderResponse } from './instance-control.ts';
import { caminhoDeEnvioValido } from './media-links.ts';

export const PROVIDER_SEND_TYPES = [
  'text',
  'image',
  'video',
  'audio',
  'document',
  'location',
  'reaction',
  'typing',
  'mark_read',
  'archive',
  'profile_picture',
  'check_number',
] as const;
export type ProviderSendType = (typeof PROVIDER_SEND_TYPES)[number];

const MEDIA_TYPES = ['image', 'video', 'audio', 'document'] as const;
type MediaType = (typeof MEDIA_TYPES)[number];
const isMediaType = (t: string): t is MediaType => (MEDIA_TYPES as readonly string[]).includes(t);

/** Sinalizações: falham em silêncio na tela (não são mensagem para o cliente). */
const SIGNAL_TYPES: readonly ProviderSendType[] = ['typing', 'mark_read', 'archive', 'profile_picture', 'check_number'];

/** O corpo que a tela manda (os mesmos nomes do envio da Meta, mais os sinais). */
export interface ProviderSendBody {
  type?: unknown;
  to?: unknown;
  text?: unknown;
  preview_url?: unknown;
  /** Caminho do anexo em `whatsapp-media` (`<tenant>/<ms>-<arquivo>`). */
  media_path?: unknown;
  mime_type?: unknown;
  file_name?: unknown;
  caption?: unknown;
  /** Áudio: true = mensagem de voz (gravada); false = arquivo de áudio. */
  ptt?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  name?: unknown;
  address?: unknown;
  /** Reação e lida: o id do WhatsApp da mensagem (evolution_message_id). */
  message_id?: unknown;
  /**
   * Lida: os ids de TODAS as mensagens do cliente que a pessoa acabou de ver
   * (lote 6d, decisão D4). O Evolution manda um recibo por id; o WAHA marca a
   * conversa inteira pelo chatId. Até 50.
   */
  message_ids?: unknown;
  emoji?: unknown;
  /** Reação: a mensagem é nossa (enviada) ou do cliente. */
  from_me?: unknown;
  quoted_message_id?: unknown;
  /** typing: true liga, false desliga. */
  on?: unknown;
  /** archive: true arquiva, false desarquiva. */
  archive?: unknown;
}

export interface SendCaller {
  tenant_id: string | null;
  role: string | null;
  status: string | null;
}

export interface SendInstance {
  id: string;
  tenant_id: string;
  instance_key: string;
  provider: string | null;
  status: string | null;
  connection_config?: unknown;
}

export interface MediaFile {
  base64: string;
  /** O tipo gravado no Storage (o upload já limpa os parâmetros). */
  contentType: string;
  size: number;
}

export interface SendDeps {
  caller: SendCaller | null;
  instance: SendInstance | null;
  instanceTenant: InstanceAccessTenant | null;
  loadCredentials: () => Promise<ResolvedCredentials>;
  /** A regra do Storage deixa QUEM ENVIA ler este arquivo? (com o token dele) */
  canReadMedia: (path: string) => Promise<boolean>;
  /** Lê o arquivo com a chave do servidor. null = não existe. */
  readMedia: (path: string, maxBytes: number) => Promise<MediaFile | 'too_large' | null>;
  callProvider: (req: ProviderRequest) => Promise<ProviderResponse>;
}

export interface SendResult {
  status: number;
  body: Record<string, unknown>;
}

// ------------------------------------------------------------- frases

/** Frases da tela (docs/GLOSSARIO_UX.md: número de WhatsApp, Gestor da Loja). */
export const SEND_MESSAGES = {
  disconnected: 'Este número está desconectado. Peça ao Gestor da Loja para reconectar.',
  noCredentials:
    'Este número não tem a chave salva no ConvoFlow. Peça ao Gestor da Loja para abrir os detalhes do número e usar "Substituir chave".',
  providerAuth:
    'O servidor do WhatsApp recusou a chave deste número. Peça ao Gestor da Loja para abrir os detalhes do número e usar "Substituir chave".',
  providerNotFound:
    'Este número não existe mais no servidor do WhatsApp. Peça ao Gestor da Loja para conferir o número em Números de WhatsApp.',
  unreachableEvolution: 'Não foi possível falar com o servidor do WhatsApp agora. Tente de novo em instantes.',
  unreachableWaha:
    'Não foi possível falar com o servidor WAHA deste número. Peça ao Gestor da Loja para conferir se ele está no ar.',
  blockedAddress:
    'O endereço do servidor WAHA deste número foi recusado por segurança. Peça ao Gestor da Loja para cadastrar o endereço público do servidor.',
  numberWithoutWhatsapp: 'Este contato não tem WhatsApp neste número de telefone. Confira o número do contato.',
  rejected: 'O WhatsApp não aceitou esta mensagem. Confira o número do contato e tente de novo.',
  providerError: 'O servidor do WhatsApp falhou ao enviar. Tente de novo em instantes.',
  forbidden: 'Você não tem acesso a este número de WhatsApp.',
  notFound: 'Número de WhatsApp não encontrado.',
  noProfile: 'Seu perfil não está ligado a nenhuma Loja.',
  invalidType: 'Este tipo de envio não existe.',
  invalidRecipient: 'O contato não tem um número de telefone válido.',
  emptyText: 'Escreva a mensagem antes de enviar.',
  invalidMedia: 'Arquivo inválido para este número.',
  mediaNotFound: 'Arquivo não encontrado. Anexe de novo e envie.',
  mediaTooLarge: (limiteMb: number) =>
    `Arquivo grande demais para enviar por este número. O limite é ${limiteMb} MB.`,
  /** A mesma frase que a tela mostra antes de subir (src/lib/whatsapp/limiteDocumento.ts). */
  documentTooLarge:
    'Este arquivo passa de 30 MB e não pode ser enviado por este número. Envie um link para o arquivo.',
  invalidLocation: 'Localização inválida. Escolha o lugar de novo em Localização, no clipe.',
  invalidReaction: 'Não foi possível achar a mensagem para reagir.',
} as const;

/** WhatsApp aceita até 16 MB em foto, vídeo e áudio; documento vai até 30 MB aqui (base64 cabe na memória da função). */
export const MEDIA_LIMIT_BYTES: Record<MediaType, number> = {
  image: 16 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  document: 30 * 1024 * 1024,
};

const fail = (status: number, reason: string, error: string, extra: Record<string, unknown> = {}): SendResult => ({
  status,
  body: { ok: false, reason, error, ...extra },
});

// ------------------------------------------------------------- utilidades

/** Lida: message_ids (até 50, sem repetir) ou o message_id sozinho. */
export function idsDaLida(body: Pick<ProviderSendBody, 'message_id' | 'message_ids'>): string[] {
  const lista = Array.isArray(body.message_ids)
    ? body.message_ids.filter((v): v is string => typeof v === 'string').map((v) => v.trim()).filter(Boolean)
    : [];
  const unico = typeof body.message_id === 'string' ? body.message_id.trim() : '';
  const todos = lista.length ? lista : unico ? [unico] : [];
  return [...new Set(todos)].slice(-50);
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const trimSlash = (u: string) => u.replace(/\/+$/, '');

/** Só os dígitos do telefone (E.164 sem +), como os dois provedores pedem. */
export function digitsOf(to: unknown): string {
  return typeof to === 'string' ? to.replace(/\D/g, '') : '';
}

/** "audio/ogg; codecs=opus" → "audio/ogg". */
export function baseMime(mime: unknown): string {
  return ((typeof mime === 'string' ? mime : '').split(';')[0] ?? '').trim().toLowerCase();
}

export function isReadyStatus(provider: string, status: string | null | undefined): boolean {
  const s = (status ?? '').toLowerCase();
  if (provider === 'waha') return s === 'connected' || s === 'open' || s === 'working';
  return s === 'connected' || s === 'open';
}

function sessionOf(instance: SendInstance): string {
  const cfg = instance.connection_config;
  const name =
    cfg && typeof cfg === 'object' && !Array.isArray(cfg)
      ? (cfg as Record<string, unknown>).sessionName
      : undefined;
  return typeof name === 'string' && name ? name : instance.instance_key;
}

const evolutionHeaders = (apiKey: string): Record<string, string> => ({
  'Content-Type': 'application/json',
  apikey: apiKey,
});

function wahaHeaders(apiKey: string): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (apiKey) h['X-Api-Key'] = apiKey;
  return h;
}

/** O que o pedido montado precisa já resolvido (mídia lida, telefone limpo). */
export interface PreparedSend {
  type: ProviderSendType;
  number: string;
  text?: string;
  linkPreview?: boolean;
  quotedId?: string;
  media?: { base64: string; mimeType: string; fileName: string; caption?: string; voice: boolean };
  latitude?: number;
  longitude?: number;
  name?: string;
  address?: string;
  messageId?: string;
  /** Lida no Evolution: um recibo para cada mensagem vista. */
  messageIds?: string[];
  emoji?: string;
  fromMe?: boolean;
  on?: boolean;
  archive?: boolean;
}

// ------------------------------------------------------------- Evolution

export function buildEvolutionRequest(
  creds: ProviderCredentials,
  instanceName: string,
  p: PreparedSend,
): ProviderRequest {
  const base = trimSlash(creds.baseUrl);
  const inst = encodeURIComponent(instanceName);
  const headers = evolutionHeaders(creds.apiKey);
  const jid = `${p.number}@s.whatsapp.net`;
  const quoted = p.quotedId ? { quoted: { key: { id: p.quotedId } } } : {};
  const post = (path: string, body: unknown): ProviderRequest => ({
    method: 'POST',
    url: `${base}${path}/${inst}`,
    headers,
    body,
    customerServer: false,
  });

  switch (p.type) {
    case 'text':
      return post('/message/sendText', {
        number: p.number,
        text: p.text,
        linkPreview: p.linkPreview !== false,
        ...quoted,
      });
    case 'image':
    case 'video':
    case 'document':
    case 'audio': {
      const m = p.media!;
      if (p.type === 'audio' && m.voice) {
        // Voz: o Evolution converte qualquer entrada para OGG/Opus mono com
        // ffmpeg (`encoding`) e manda com ptt. A rota não aceita citação.
        return post('/message/sendWhatsAppAudio', { number: p.number, audio: m.base64, encoding: true });
      }
      // Arquivo de áudio anexado vai como arquivo (mediatype 'audio'), sem virar voz.
      return post('/message/sendMedia', {
        number: p.number,
        mediatype: p.type,
        mimetype: m.mimeType,
        media: m.base64,
        fileName: m.fileName,
        ...(p.type !== 'audio' && m.caption ? { caption: m.caption } : {}),
        ...quoted,
      });
    }
    case 'location':
      // name e address são obrigatórios no schema do Evolution.
      return post('/message/sendLocation', {
        number: p.number,
        latitude: p.latitude,
        longitude: p.longitude,
        name: p.name || 'Localização',
        address: p.address || '',
      });
    case 'reaction':
      return post('/message/sendReaction', {
        key: { remoteJid: jid, fromMe: p.fromMe === true, id: p.messageId },
        reaction: p.emoji ?? '',
      });
    case 'typing':
      // O Evolution segura a resposta durante `delay` e manda "paused" no fim.
      return post('/chat/sendPresence', {
        number: p.number,
        presence: p.on ? 'composing' : 'paused',
        delay: p.on ? 3000 : 0,
      });
    case 'mark_read':
      return post('/chat/markMessageAsRead', {
        readMessages: (p.messageIds?.length ? p.messageIds : [p.messageId]).map((id) => ({
          remoteJid: jid,
          fromMe: false,
          id,
        })),
      });
    case 'archive':
      // Com `chat`, o Evolution acha a última mensagem da conversa sozinho.
      return post('/chat/archiveChat', { chat: jid, archive: p.archive === true });
    case 'profile_picture':
      return post('/chat/fetchProfilePictureUrl', { number: p.number });
    case 'check_number':
      return post('/chat/whatsappNumbers', { numbers: [p.number] });
  }
}

// ------------------------------------------------------------- WAHA

export function buildWahaRequest(creds: ProviderCredentials, session: string, p: PreparedSend): ProviderRequest {
  const base = trimSlash(creds.baseUrl);
  const headers = wahaHeaders(creds.apiKey);
  const chatId = `${p.number}@c.us`;
  const req = (method: ProviderRequest['method'], path: string, body?: unknown): ProviderRequest => ({
    method,
    url: `${base}${path}`,
    headers,
    ...(body !== undefined ? { body } : {}),
    customerServer: true,
  });
  const replyTo = p.quotedId ? { reply_to: p.quotedId } : {};
  const sess = encodeURIComponent(session);

  switch (p.type) {
    case 'text':
      return req('POST', '/api/sendText', {
        session,
        chatId,
        text: p.text,
        linkPreview: p.linkPreview !== false,
        ...replyTo,
      });
    case 'image':
    case 'video':
    case 'document':
    case 'audio': {
      const m = p.media!;
      if (p.type === 'audio' && m.voice) {
        // Voz só em OGG/Opus: `convert` pede a conversão ao WAHA quando o
        // arquivo é de outro formato (a gravação do navegador sai em WebM).
        const jaEhOggOpus = baseMime(m.mimeType) === 'audio/ogg';
        return req('POST', '/api/sendVoice', {
          session,
          chatId,
          file: {
            data: m.base64,
            mimetype: jaEhOggOpus ? 'audio/ogg; codecs=opus' : m.mimeType || 'audio/ogg; codecs=opus',
          },
          convert: !jaEhOggOpus,
        });
      }
      // Não existe /api/sendAudio: áudio anexado vai por /api/sendFile.
      const path = p.type === 'image' ? '/api/sendImage' : p.type === 'video' ? '/api/sendVideo' : '/api/sendFile';
      return req('POST', path, {
        session,
        chatId,
        file: { data: m.base64, filename: m.fileName, mimetype: m.mimeType },
        ...(p.type !== 'audio' && m.caption ? { caption: m.caption } : {}),
        ...replyTo,
      });
    }
    case 'location':
      return req('POST', '/api/sendLocation', {
        session,
        chatId,
        latitude: p.latitude,
        longitude: p.longitude,
        ...(p.name ? { title: p.name } : {}),
      });
    case 'reaction':
      return req('PUT', '/api/reaction', { session, messageId: p.messageId, reaction: p.emoji ?? '' });
    case 'typing':
      return req('POST', p.on ? '/api/startTyping' : '/api/stopTyping', { session, chatId });
    case 'mark_read':
      return req('POST', '/api/sendSeen', { session, chatId });
    case 'archive':
      return req('POST', `/api/${sess}/chats/${encodeURIComponent(chatId)}/${p.archive ? 'archive' : 'unarchive'}`);
    case 'profile_picture':
      return req('GET', `/api/${sess}/contacts/profile-picture?contactId=${encodeURIComponent(chatId)}`);
    case 'check_number':
      return req('GET', `/api/${sess}/contacts/check-exists?phone=${encodeURIComponent(p.number)}`);
  }
}

// ------------------------------------------------------------- respostas

/** Id do WhatsApp da mensagem enviada, no formato que o webhook grava. */
export function messageIdFrom(provider: string, json: unknown): string | undefined {
  const j = (json ?? {}) as Record<string, any>;
  if (provider === 'evolution') {
    const id = j.key?.id ?? j.messageId;
    return typeof id === 'string' && id ? id : undefined;
  }
  // WAHA: `id` é texto ("true_<chatId>_<id>") ou objeto com `_serialized`.
  const id = typeof j.id === 'string' ? j.id : j.id?._serialized ?? j._data?.id?._serialized ?? j.key?.id;
  return typeof id === 'string' && id ? id : undefined;
}

function profilePictureFrom(json: unknown): string | null {
  const j = (json ?? {}) as Record<string, unknown>;
  const url = j.profilePictureUrl ?? j.profilePictureURL ?? j.picture ?? j.url;
  return typeof url === 'string' && /^https:\/\//i.test(url) ? url : null;
}

function numberExistsFrom(provider: string, json: unknown): boolean {
  if (provider === 'waha') return (json as { numberExists?: unknown } | null)?.numberExists === true;
  const first = Array.isArray(json) ? json[0] : json;
  return (first as { exists?: unknown } | null)?.exists === true;
}

/** Evolution responde 400 com `exists: false` quando o número não tem WhatsApp. */
function saysNoWhatsapp(json: unknown): boolean {
  const msg = (json as { response?: { message?: unknown } } | null)?.response?.message;
  return Array.isArray(msg) && msg.some((m) => (m as { exists?: unknown } | null)?.exists === false);
}

/** Erro do provedor em pt-BR. Nunca repete o corpo cru (pode ter de tudo). */
export function providerSendFailure(provider: string, res: ProviderResponse): SendResult {
  if (res.blocked) return fail(400, 'blocked_address', SEND_MESSAGES.blockedAddress);
  if (res.networkError) {
    return fail(502, 'provider_unreachable',
      provider === 'waha' ? SEND_MESSAGES.unreachableWaha : SEND_MESSAGES.unreachableEvolution);
  }
  if (res.status === 401 || res.status === 403) return fail(502, 'provider_auth', SEND_MESSAGES.providerAuth);
  if (res.status === 404) return fail(502, 'provider_not_found', SEND_MESSAGES.providerNotFound);
  if (res.status === 400 || res.status === 422) {
    if (saysNoWhatsapp(res.json)) return fail(400, 'number_not_on_whatsapp', SEND_MESSAGES.numberWithoutWhatsapp);
    return fail(400, 'provider_rejected', SEND_MESSAGES.rejected, { provider_status: res.status });
  }
  return fail(502, 'provider_error', SEND_MESSAGES.providerError, { provider_status: res.status });
}

const ok2xx = (r: ProviderResponse) => !r.blocked && !r.networkError && r.status >= 200 && r.status < 300;

// ------------------------------------------------------------- rota

/**
 * Qual caminho do `whatsapp-send-message` atende o número. `official` e
 * qualquer outro provider (Instagram tem função própria) seguem pelo caminho
 * da Meta, intocado; sem provider é Evolution, como em todo o projeto.
 */
export function rotaDoEnvio(provider: string | null | undefined): 'provider' | 'meta' {
  const p = provider || 'evolution';
  return p === 'evolution' || p === 'waha' ? 'provider' : 'meta';
}

// ------------------------------------------------------------- portão

/** Quem pode enviar por qual número. Devolve o erro ou null. */
export function sendGate(deps: Pick<SendDeps, 'caller' | 'instance' | 'instanceTenant'>): SendResult | null {
  const { caller, instance, instanceTenant } = deps;
  if (!caller || !caller.tenant_id) return fail(403, 'no_profile', SEND_MESSAGES.noProfile);
  if (!instance) return fail(404, 'not_found', SEND_MESSAGES.notFound);
  const access = decideInstanceAccess(caller, instance, instanceTenant);
  if (!access.allowed) {
    if (access.reason === 'inactive') return fail(403, 'inactive', statusDenialMessage(caller.status ?? ''));
    return fail(403, 'forbidden', SEND_MESSAGES.forbidden);
  }
  const provider = instance.provider || 'evolution';
  if (provider !== 'evolution' && provider !== 'waha') {
    return fail(400, 'unsupported_provider', 'Este envio vale só para números Evolution e WAHA.');
  }
  return null;
}

// ------------------------------------------------------------- entrada

/** Valida o corpo e lê o anexo. Devolve o pedido pronto ou o erro. */
async function prepare(
  body: ProviderSendBody,
  instance: SendInstance,
  deps: SendDeps,
): Promise<PreparedSend | SendResult> {
  const type = body.type as ProviderSendType;
  const number = digitsOf(body.to);
  if (number.length < 8 || number.length > 15) return fail(400, 'invalid_recipient', SEND_MESSAGES.invalidRecipient);
  const quotedId = str(body.quoted_message_id) || undefined;
  const base: PreparedSend = { type, number, ...(quotedId ? { quotedId } : {}) };

  if (type === 'text') {
    const text = typeof body.text === 'string' ? body.text : '';
    if (!text.trim()) return fail(400, 'empty_text', SEND_MESSAGES.emptyText);
    return { ...base, text, linkPreview: body.preview_url !== false };
  }

  if (isMediaType(type)) {
    const path = caminhoDeEnvioValido(body.media_path, instance.tenant_id);
    if (!path) return fail(400, 'invalid_media', SEND_MESSAGES.invalidMedia);
    // A regra do Storage, com o token de quem envia, decide antes de o
    // servidor tocar no arquivo.
    if (!(await deps.canReadMedia(path))) return fail(403, 'media_not_found', SEND_MESSAGES.mediaNotFound);
    const limit = MEDIA_LIMIT_BYTES[type];
    const file = await deps.readMedia(path, limit);
    if (file === 'too_large') {
      return fail(400, 'media_too_large', type === 'document'
        ? SEND_MESSAGES.documentTooLarge
        : SEND_MESSAGES.mediaTooLarge(Math.round(limit / (1024 * 1024))));
    }
    if (!file) return fail(403, 'media_not_found', SEND_MESSAGES.mediaNotFound);
    const mimeType = baseMime(body.mime_type) || baseMime(file.contentType) || 'application/octet-stream';
    const fileName = str(body.file_name) || path.split('/').pop() || 'arquivo';
    const caption = typeof body.caption === 'string' && body.caption.trim() ? body.caption : undefined;
    return {
      ...base,
      media: { base64: file.base64, mimeType, fileName, caption, voice: type === 'audio' && body.ptt === true },
    };
  }

  if (type === 'location') {
    const lat = body.latitude;
    const lng = body.longitude;
    if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng) ||
      Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return fail(400, 'invalid_location', SEND_MESSAGES.invalidLocation);
    }
    return { ...base, latitude: lat, longitude: lng, name: str(body.name) || undefined, address: str(body.address) || undefined };
  }

  if (type === 'reaction') {
    const messageId = str(body.message_id);
    if (!messageId) return fail(400, 'invalid_reaction', SEND_MESSAGES.invalidReaction);
    return { ...base, messageId, emoji: typeof body.emoji === 'string' ? body.emoji : '', fromMe: body.from_me === true };
  }

  if (type === 'mark_read') {
    const messageIds = idsDaLida(body);
    const messageId = messageIds.at(-1);
    return { ...base, ...(messageId ? { messageId, messageIds } : {}) };
  }
  if (type === 'typing') return { ...base, on: body.on === true };
  if (type === 'archive') return { ...base, archive: body.archive !== false };
  return base; // profile_picture, check_number
}

export async function runProviderSend(body: ProviderSendBody, deps: SendDeps): Promise<SendResult> {
  const denied = sendGate(deps);
  if (denied) return denied;
  const instance = deps.instance as SendInstance;
  const provider = instance.provider || 'evolution';

  const type = body.type;
  if (typeof type !== 'string' || !(PROVIDER_SEND_TYPES as readonly string[]).includes(type)) {
    return fail(400, 'invalid_type', SEND_MESSAGES.invalidType);
  }
  const isSignal = SIGNAL_TYPES.includes(type as ProviderSendType);

  // Ler foto e conferir número não exigem o número pronto no ConvoFlow; o
  // resto sim. Desconectado não chama o provedor.
  if (!isReadyStatus(provider, instance.status) && type !== 'profile_picture' && type !== 'check_number') {
    return fail(409, 'disconnected', SEND_MESSAGES.disconnected);
  }

  // Sinais sem a mensagem de que precisam não chamam ninguém.
  if (type === 'mark_read' && provider === 'evolution' && idsDaLida(body).length === 0) {
    return { status: 200, body: { ok: true, skipped: true } };
  }

  const { credentials } = await deps.loadCredentials();
  if (!credentials) return fail(409, 'no_credentials', SEND_MESSAGES.noCredentials);

  const prepared = await prepare(body, instance, deps);
  if ('status' in prepared && 'body' in prepared) return prepared as SendResult;
  const p = prepared as PreparedSend;

  const request =
    provider === 'evolution'
      ? buildEvolutionRequest(credentials, instance.instance_key, p)
      : buildWahaRequest(credentials, sessionOf(instance), p);
  const res = await deps.callProvider(request);
  if (!ok2xx(res)) {
    // Foto e "tem WhatsApp?" que falham respondem vazio, não erro de tela.
    if (type === 'profile_picture') return { status: 200, body: { ok: true, url: null } };
    if (type === 'check_number' && !res.blocked && !res.networkError) {
      return { status: 200, body: { ok: true, exists: false } };
    }
    const failure = providerSendFailure(provider, res);
    return isSignal ? { ...failure, body: { ...failure.body, signal: true } } : failure;
  }

  if (type === 'profile_picture') return { status: 200, body: { ok: true, url: profilePictureFrom(res.json) } };
  if (type === 'check_number') return { status: 200, body: { ok: true, exists: numberExistsFrom(provider, res.json) } };
  if (isSignal) return { status: 200, body: { ok: true } };
  const messageId = messageIdFrom(provider, res.json);
  return { status: 200, body: { ok: true, ...(messageId ? { messageId } : {}) } };
}
