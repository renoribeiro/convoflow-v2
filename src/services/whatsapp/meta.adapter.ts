import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { IWhatsAppProvider } from './provider.interface';
import {
  WhatsAppAdapterError,
  type ProviderCapabilities,
  type ProviderInstance,
  type SendLocationPayload,
  type SendMediaPayload,
  type SendReactionPayload,
  type SendResult,
  type SendTemplatePayload,
  type SendTextOptions,
  type WhatsAppTemplate,
} from './types';

/**
 * Adapter para WhatsApp Cloud API (Meta oficial).
 * Endpoints: ver `.agent/skills/meta-cloud-api/SKILL.md`.
 *
 * Diferente dos outros providers, o ACCESS_TOKEN da Meta NÃO pode estar no
 * frontend (precisa permanecer no Vault). Por isso, todas as operações de
 * escrita passam por uma edge function `whatsapp-send-message` que usa o
 * `ProviderFactory` server-side.
 *
 * Pendência: a edge function `whatsapp-send-message` precisa existir. Caso
 * contrário, as operações de envio retornam falha controlada e a UI exibe
 * a mensagem para o usuário.
 */
export class MetaAdapter implements IWhatsAppProvider {
  readonly type = 'official' as const;
  readonly instance: ProviderInstance;

  constructor(instance: ProviderInstance) {
    this.instance = instance;
    const cfg = instance.connectionConfig as { phoneNumberId?: string } | null;
    if (!cfg?.phoneNumberId) {
      throw new WhatsAppAdapterError(
        'Instância Meta sem phoneNumberId em connection_config.',
        'AUTH_FAILED',
        'official',
      );
    }
  }

  getCapabilities(): ProviderCapabilities {
    return {
      // Meta NÃO suporta grupos via Cloud API.
      groups: false,
      // Meta suporta os interativos abaixo, mas dentro de regras específicas
      // (templates exigidos fora da janela de 24h).
      polls: false,
      buttons: true,
      lists: true,
      stickers: true,
      // Meta Cloud API NÃO oferece busca de histórico — só webhook ao vivo.
      fetchHistory: false,
      templates: true,
      markUnread: false,
      pin: false,
      archive: false,
      block: false,
      typingIndicator: true,
      requiresTemplateOutsideWindow: true,
      // Token vive no Vault — frontend não pode chamar a Graph API direto.
      serverSideOnlySend: true,
    };
  }

  isReadyToSend(): boolean {
    const s = this.instance.status?.toLowerCase();
    return s === 'connected' || s === 'open' || s === 'connecting';
  }

  private async invokeSend(payload: Record<string, unknown>): Promise<SendResult> {
    if (!this.isReadyToSend()) {
      return {
        status: 'failed',
        error: `Instância Meta "${this.instance.name}" não está pronta para envio (status=${this.instance.status}).`,
      };
    }
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-send-message', {
        body: {
          instance_id: this.instance.id,
          ...payload,
        },
      });
      if (error) {
        logger.error('[MetaAdapter] whatsapp-send-message non-2xx', {
          error: error.message,
          context: (error as any).context,
        });
        return { status: 'failed', error: error.message };
      }
      const res = data as {
        ok?: boolean;
        messageId?: string;
        error?: string;
        meta_code?: number;
        meta_subcode?: number;
        meta_status?: number;
        meta_raw?: unknown;
      } | null;
      if (!res?.ok) {
        // Log completo no console para diagnóstico (não em produção: já vai pro logger sanitizado)
        logger.warn('[MetaAdapter] Meta send failed', {
          error: res?.error,
          meta_code: res?.meta_code,
          meta_subcode: res?.meta_subcode,
          meta_status: res?.meta_status,
          meta_raw: res?.meta_raw,
        });
        return {
          status: 'failed',
          error: res?.error
            ? `${res.error}${res.meta_code ? ` (Meta code ${res.meta_code})` : ''}`
            : 'Falha ao enviar pelo edge function.',
        };
      }
      return { providerMessageId: res.messageId, status: 'sent' };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error('[MetaAdapter] invokeSend exception', { error: msg });
      return {
        status: 'failed',
        error:
          'Edge function whatsapp-send-message indisponível. ' +
          'Para envios via Meta Cloud API, implemente o endpoint em supabase/functions/whatsapp-send-message ' +
          'usando ProviderFactory.getProvider(instance).sendMessage(...).',
      };
    }
  }

  sendText(toPhone: string, content: string, options?: SendTextOptions): Promise<SendResult> {
    return this.invokeSend({
      type: 'text',
      to: toPhone,
      text: content,
      quoted_message_id: options?.quotedMessageId,
      preview_url: options?.linkPreview ?? true,
    });
  }

  sendMedia(toPhone: string, payload: SendMediaPayload): Promise<SendResult> {
    return this.invokeSend({
      type: payload.mediaType,
      to: toPhone,
      media_url: payload.mediaUrl,
      mime_type: payload.mimeType,
      file_name: payload.fileName,
      caption: payload.caption,
      ptt: payload.ptt,
      quoted_message_id: payload.quotedMessageId,
    });
  }

  sendLocation(toPhone: string, payload: SendLocationPayload): Promise<SendResult> {
    return this.invokeSend({
      type: 'location',
      to: toPhone,
      latitude: payload.latitude,
      longitude: payload.longitude,
      name: payload.name,
      address: payload.address,
    });
  }

  sendReaction(toPhone: string, payload: SendReactionPayload): Promise<SendResult> {
    return this.invokeSend({
      type: 'reaction',
      to: toPhone,
      message_id: payload.messageId,
      emoji: payload.emoji,
    });
  }

  /**
   * Envia um template aprovado (HSM). Reabre a conversa fora da janela de 24h —
   * o edge function isenta templates do bloqueio de janela (SKILL §2.12).
   */
  sendTemplate(toPhone: string, payload: SendTemplatePayload): Promise<SendResult> {
    return this.invokeSend({
      type: 'template',
      to: toPhone,
      template_name: payload.templateName,
      template_language: payload.language,
      template_body_params: payload.bodyParams,
      template_components: payload.components,
    });
  }

  /**
   * Lista os templates da Meta via edge function list-whatsapp-templates
   * (o token vive no Vault, então o frontend não chama a Graph API direto).
   */
  async listTemplates(): Promise<WhatsAppTemplate[]> {
    try {
      const { data, error } = await supabase.functions.invoke('list-whatsapp-templates', {
        body: { instance_id: this.instance.id },
      });
      if (error) {
        logger.error('[MetaAdapter] list-whatsapp-templates non-2xx', { error: error.message });
        throw new WhatsAppAdapterError(error.message, 'NETWORK_ERROR', 'official');
      }
      const res = data as { ok?: boolean; templates?: WhatsAppTemplate[]; error?: string } | null;
      if (!res?.ok) {
        throw new WhatsAppAdapterError(
          res?.error || 'Falha ao listar templates.',
          'UNKNOWN',
          'official',
        );
      }
      return res.templates ?? [];
    } catch (e) {
      if (e instanceof WhatsAppAdapterError) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      logger.error('[MetaAdapter] listTemplates exception', { error: msg });
      throw new WhatsAppAdapterError(msg, 'NETWORK_ERROR', 'official');
    }
  }

  async setTyping(_toPhone: string, _on: boolean): Promise<void> {
    /* Indicador de digitação Meta exige um message_id; o frontend não tem
     * essa informação prontamente. Ignoramos silenciosamente — quem quiser
     * pode acionar a partir do edge function ao processar o webhook. */
  }

  async markRead(_toPhone: string, _providerMessageId?: string): Promise<void> {
    /* Necessita do `wamid.*` da última mensagem recebida. Quando o webhook
     * popular essa coluna, podemos chamar via edge function. Por hora,
     * marcação como lida acontece apenas no banco local. */
  }

  async archiveChat(_toPhone: string, _archive: boolean): Promise<void> {
    throw new WhatsAppAdapterError(
      'Cloud API da Meta não suporta arquivamento de conversas pelo provider, apenas no banco local.',
      'CAPABILITY_UNSUPPORTED',
      'official',
    );
  }

  async checkNumberExists(_phone: string): Promise<boolean> {
    /* A Cloud API só revela existência ao tentar enviar. Para evitar gastar
     * cota, retornamos true otimista; a primeira tentativa de envio falhará
     * com 131026 caso o número não exista. */
    return true;
  }

  async getProfilePicture(_phone: string): Promise<string | null> {
    /* Meta Cloud API não expõe foto de perfil de contatos. */
    return null;
  }
}
