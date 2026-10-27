import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { corpoDaEdgeFunction } from '@/lib/edgeFunctionError';
import type { IWhatsAppProvider } from './provider.interface';
import {
  WhatsAppAdapterError,
  type ProviderCapabilities,
  type ProviderInstance,
  type SendLocationPayload,
  type SendMediaPayload,
  type SendReactionPayload,
  type SendResult,
  type SendTextOptions,
} from './types';

/**
 * Número Evolution ou WAHA: todo envio das Conversas passa pelo SERVIDOR
 * (edge function `whatsapp-send-message`, regra em
 * `supabase/functions/_shared/message-send.ts`).
 *
 * Desde a sessão 2 do docs/RUNBOOK_segredos_das_instancias.md (2026-10-26) o
 * navegador não fala mais com o Evolution nem com o WAHA: a chave e o endereço
 * do servidor de cada número ficam no cofre, e só o servidor os usa. Daqui sai
 * o pedido ("texto para tal contato"); volta o id da mensagem ou a frase do
 * erro em pt-BR. O anexo vai pelo caminho no bucket privado: o servidor lê o
 * arquivo e manda ao provedor.
 */

export const DESCONECTADO = 'Este número está desconectado. Peça ao Gestor da Loja para reconectar.';
const FALHA_DE_REDE = 'Não foi possível falar com o servidor de envio. Confira a internet e tente de novo.';

type Resposta = {
  ok?: boolean;
  messageId?: string;
  error?: string;
  reason?: string;
  url?: string | null;
  exists?: boolean;
};

export abstract class ServerSendAdapter implements IWhatsAppProvider {
  abstract readonly type: 'evolution' | 'waha';
  readonly instance: ProviderInstance;

  constructor(instance: ProviderInstance) {
    this.instance = instance;
  }

  abstract getCapabilities(): ProviderCapabilities;
  abstract isReadyToSend(): boolean;

  /** A tela mostra isto no lugar do envio quando o número não está pronto. */
  get notReadyReason(): string | undefined {
    return this.isReadyToSend() ? undefined : DESCONECTADO;
  }

  /** Chama o servidor. Recusa (4xx/5xx) volta com a frase do corpo. */
  protected async invoke(payload: Record<string, unknown>): Promise<Resposta> {
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-send-message', {
        body: { instance_id: this.instance.id, ...payload },
      });
      if (error) {
        const body = await corpoDaEdgeFunction(error);
        return {
          ok: false,
          error: typeof body?.error === 'string' ? body.error : FALHA_DE_REDE,
          reason: typeof body?.reason === 'string' ? body.reason : undefined,
        };
      }
      const res = (data ?? {}) as Resposta;
      return { ...res, ok: res.ok === true };
    } catch (e) {
      logger.error(`[${this.type}] envio pelo servidor falhou`, { error: e instanceof Error ? e.message : String(e) });
      return { ok: false, error: FALHA_DE_REDE };
    }
  }

  /** Mensagem para o cliente: o resultado que a tela grava. */
  protected async send(payload: Record<string, unknown>): Promise<SendResult> {
    if (!this.isReadyToSend()) return { status: 'failed', error: DESCONECTADO, reason: 'disconnected' };
    const res = await this.invoke(payload);
    if (!res.ok) {
      logger.warn(`[${this.type}] envio recusado`, { reason: res.reason });
      return {
        status: 'failed',
        error: res.error || 'O servidor recusou o envio.',
        ...(res.reason ? { reason: res.reason, errorCode: res.reason } : {}),
      };
    }
    return { status: 'sent', ...(res.messageId ? { providerMessageId: res.messageId } : {}) };
  }

  sendText(toPhone: string, content: string, options?: SendTextOptions): Promise<SendResult> {
    return this.send({
      type: 'text',
      to: toPhone,
      text: content,
      preview_url: options?.linkPreview ?? true,
      quoted_message_id: options?.quotedMessageId,
    });
  }

  async sendMedia(toPhone: string, payload: SendMediaPayload): Promise<SendResult> {
    if (payload.mediaType === 'sticker') {
      return { status: 'failed', error: 'Figurinha ainda não sai pelas Conversas.' };
    }
    // O servidor lê o anexo do bucket pelo caminho; link de fora não serve.
    if (!payload.mediaPath) {
      return { status: 'failed', error: 'Arquivo não encontrado. Anexe de novo e envie.' };
    }
    return this.send({
      type: payload.mediaType,
      to: toPhone,
      media_path: payload.mediaPath,
      mime_type: payload.mimeType,
      file_name: payload.fileName,
      caption: payload.caption,
      ptt: payload.ptt,
      quoted_message_id: payload.quotedMessageId,
    });
  }

  sendLocation(toPhone: string, payload: SendLocationPayload): Promise<SendResult> {
    return this.send({
      type: 'location',
      to: toPhone,
      latitude: payload.latitude,
      longitude: payload.longitude,
      name: payload.name,
      address: payload.address,
    });
  }

  sendReaction(toPhone: string, payload: SendReactionPayload): Promise<SendResult> {
    return this.send({
      type: 'reaction',
      to: toPhone,
      message_id: payload.messageId,
      emoji: payload.emoji,
      from_me: payload.fromMe === true,
    });
  }

  async setTyping(toPhone: string, on: boolean): Promise<void> {
    // Sinal: nunca atrapalha quem está digitando.
    if (!this.isReadyToSend() || !toPhone) return;
    await this.invoke({ type: 'typing', to: toPhone, on });
  }

  async markRead(toPhone: string, providerMessageId?: string): Promise<void> {
    if (!this.isReadyToSend() || !toPhone) return;
    await this.invoke({ type: 'mark_read', to: toPhone, message_id: providerMessageId });
  }

  async archiveChat(toPhone: string, archive: boolean): Promise<void> {
    const res = await this.invoke({ type: 'archive', to: toPhone, archive });
    if (!res.ok) {
      throw new WhatsAppAdapterError(res.error || 'Não foi possível arquivar no WhatsApp.', 'UNKNOWN', this.type);
    }
  }

  async checkNumberExists(phone: string): Promise<boolean> {
    const res = await this.invoke({ type: 'check_number', to: phone });
    return res.ok === true && res.exists === true;
  }

  async getProfilePicture(phone: string): Promise<string | null> {
    const res = await this.invoke({ type: 'profile_picture', to: phone });
    return res.ok && typeof res.url === 'string' ? res.url : null;
  }
}
