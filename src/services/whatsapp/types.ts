/**
 * Tipos compartilhados pelo adapter unificado de WhatsApp.
 * Toda interação com APIs (Evolution, WAHA, Meta Cloud) passa por aqui.
 *
 * Antes de alterar este arquivo, leia .agent/skills/{evolution-v2,waha,meta-cloud-api}/SKILL.md
 * conforme a regra registrada em CLAUDE.md "Regras Obrigatórias para Trabalho com APIs de WhatsApp".
 */

/** `instagram` responde só texto, pelo InstagramAdapter (fatia 3). */
export type ProviderType = 'evolution' | 'waha' | 'official' | 'instagram';

export interface ProviderInstance {
  id: string;
  tenantId: string;
  name: string;
  instanceKey: string;
  provider: ProviderType;
  status: 'connected' | 'disconnected' | 'connecting' | 'open' | 'close' | 'qrcode' | string;
  phoneNumber?: string | null;
  profileName?: string | null;
  profilePictureUrl?: string | null;
  /**
   * Configuração específica do provider. Forma esperada por tipo:
   *  - evolution: { baseUrl, apiKey }                       (com fallback para evolutionApiUrl/Key legados)
   *  - waha:      { baseUrl, apiKey, sessionName }
   *  - official:  { phoneNumberId, wabaId, graphApiVersion } (token fica no Vault)
   */
  connectionConfig: Record<string, unknown>;
  legacyEvolutionApiUrl?: string | null;
  legacyEvolutionApiKey?: string | null;
}

export interface ProviderCapabilities {
  groups: boolean;
  polls: boolean;
  buttons: boolean;
  lists: boolean;
  stickers: boolean;
  fetchHistory: boolean;
  templates: boolean;
  markUnread: boolean;
  pin: boolean;
  archive: boolean;
  block: boolean;
  typingIndicator: boolean;
  /**
   * Quando true, a API obriga a enviar templates pré-aprovados após 24h sem
   * mensagem do contato (caso da Meta Cloud API).
   */
  requiresTemplateOutsideWindow: boolean;
  /**
   * Quando false, o provider expõe envio direto a partir do navegador.
   * Quando true, o envio precisa passar por edge function porque o token é
   * sensível (caso da Meta — token vive no Vault).
   */
  serverSideOnlySend: boolean;
}

export type SendStatus = 'sent' | 'delivered' | 'read' | 'failed' | 'pending';

export interface SendResult {
  /** Identificador devolvido pela API do provider (`wamid.*`, `evt-id`, etc.). */
  providerMessageId?: string;
  status: SendStatus;
  error?: string;
  /**
   * Motivo estável da recusa, quando o provider informa. Hoje só o Instagram
   * (ver `instagram-send-message/logic.ts`: outside_window, token_expired…).
   */
  reason?: string;
}

export interface SendTextOptions {
  /** ID da mensagem citada (formato dependente do provider). */
  quotedMessageId?: string;
  /** Pré-visualização de link em mensagens de texto. */
  linkPreview?: boolean;
}

export interface SendMediaPayload {
  mediaUrl: string;
  mediaType: 'image' | 'video' | 'audio' | 'document' | 'sticker';
  mimeType?: string;
  fileName?: string;
  caption?: string;
  /** Apenas relevante para áudio: marca como PTT/voice note. */
  ptt?: boolean;
  quotedMessageId?: string;
}

export interface SendLocationPayload {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

export interface SendReactionPayload {
  messageId: string;
  emoji: string;
}

/** Formato do cabeçalho de um template Meta. */
export type WhatsAppTemplateHeaderFormat =
  | 'TEXT'
  | 'IMAGE'
  | 'VIDEO'
  | 'DOCUMENT'
  | 'LOCATION'
  | (string & {});

export interface WhatsAppTemplateHeader {
  format: WhatsAppTemplateHeaderFormat;
  /** Só vem preenchido quando `format === 'TEXT'`. Pode conter {{1}}. */
  text: string;
}

export interface WhatsAppTemplateFooter {
  text: string;
}

export interface WhatsAppTemplateButton {
  /** QUICK_REPLY | URL | PHONE_NUMBER | COPY_CODE | ... */
  type: string;
  text: string;
  /** Só em botões `URL`. */
  url?: string | null;
  /** Só em botões `PHONE_NUMBER`. */
  phoneNumber?: string | null;
}

export interface WhatsAppTemplate {
  name: string;
  language: string;
  /** Status na Meta: APPROVED | PENDING | REJECTED | PAUSED | ... */
  status?: string;
  category?: string;
  /** Texto do corpo do template (com {{1}}, {{2}}, ...), quando disponível. */
  bodyText?: string;
  /** Quantidade de parâmetros {{n}} distintos no corpo. */
  paramCount?: number;
  /**
   * Cabeçalho, rodapé e botões — opcionais porque foram acrescentados depois
   * do restante do shape (a edge function passou a normalizá-los em vez de
   * descartá-los). Quem consome o shape antigo continua válido.
   */
  header?: WhatsAppTemplateHeader | null;
  footer?: WhatsAppTemplateFooter | null;
  buttons?: WhatsAppTemplateButton[];
}

export interface SendTemplatePayload {
  /** Nome exato do template APROVADO na WABA. */
  templateName: string;
  /** Código de idioma do template (ex.: `pt_BR`, `en_US`, `es`). */
  language: string;
  /** Parâmetros do corpo, na ordem de {{1}}, {{2}}, ... */
  bodyParams: string[];
  /**
   * Array de componentes completo (header/body/buttons). Se informado, tem
   * precedência sobre bodyParams. Para v1, normalmente basta bodyParams.
   */
  components?: Record<string, unknown>[];
}

/**
 * Erros de adapter. `code` é estável e inspecionável; UI deve mapear para
 * mensagens em PT-BR.
 */
export class WhatsAppAdapterError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'INSTANCE_DISCONNECTED'
      | 'CAPABILITY_UNSUPPORTED'
      | 'SERVER_SIDE_ONLY'
      | 'INVALID_NUMBER'
      | 'OUTSIDE_24H_WINDOW'
      | 'AUTH_FAILED'
      | 'RATE_LIMITED'
      | 'NETWORK_ERROR'
      | 'UNKNOWN',
    public readonly providerType?: ProviderType,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'WhatsAppAdapterError';
  }
}
