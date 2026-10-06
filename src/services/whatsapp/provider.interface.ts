/**
 * Interface comum para todos os providers de WhatsApp no frontend.
 * Cada implementação (Evolution, WAHA, Meta) traduz essa interface para a
 * API específica seguindo `.agent/skills/<provider>/SKILL.md`.
 */
import type {
  ProviderCapabilities,
  ProviderInstance,
  ProviderType,
  SendLocationPayload,
  SendMediaPayload,
  SendReactionPayload,
  SendResult,
  SendTemplatePayload,
  SendTextOptions,
  WhatsAppTemplate,
} from './types';

export interface IWhatsAppProvider {
  readonly type: ProviderType;
  readonly instance: ProviderInstance;

  /** Capabilities estáticas — UI pode usar para esconder/desabilitar botões. */
  getCapabilities(): ProviderCapabilities;

  /** Status considerado "online" pelo provider para envio de mensagens. */
  isReadyToSend(): boolean;

  /* ------------------------------- Envio --------------------------------- */
  sendText(toPhone: string, content: string, options?: SendTextOptions): Promise<SendResult>;
  sendMedia(toPhone: string, payload: SendMediaPayload): Promise<SendResult>;
  sendLocation(toPhone: string, payload: SendLocationPayload): Promise<SendResult>;
  sendReaction(toPhone: string, payload: SendReactionPayload): Promise<SendResult>;
  /**
   * Envia um template aprovado (HSM). Usado para reabrir a conversa fora da
   * janela de 24h. Opcional — só o provider Meta (`official`) implementa; os
   * demais podem omitir. Ver `capabilities.templates`.
   */
  sendTemplate?(toPhone: string, payload: SendTemplatePayload): Promise<SendResult>;
  /**
   * Lista os templates disponíveis do provider (Meta). Opcional — só o provider
   * Meta implementa. Usado para o seletor de templates no inbox.
   */
  listTemplates?(): Promise<WhatsAppTemplate[]>;

  /* ----------------------------- Sinalizações ---------------------------- */
  /** Envia o indicador de "digitando..." (true=on, false=off). */
  setTyping(toPhone: string, on: boolean): Promise<void>;
  /** Marca uma conversa (ou mensagem) como lida pelo lado do cliente. */
  markRead(toPhone: string, providerMessageId?: string): Promise<void>;

  /* ------------------------------- Chats --------------------------------- */
  archiveChat(toPhone: string, archive: boolean): Promise<void>;
  /** Verifica se um número está cadastrado no WhatsApp. */
  checkNumberExists(phone: string): Promise<boolean>;
  /** Busca a foto de perfil pública (URL). */
  getProfilePicture(phone: string): Promise<string | null>;
}
