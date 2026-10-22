import { EvolutionApiService, createEvolutionApiService } from '@/services/evolutionApi';
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
  type SendTextOptions,
} from './types';

/**
 * Citação no Evolution v2: basta a chave. Ele procura a mensagem no banco dele
 * pelo `key.id` (whatsapp.baileys.service.ts, `getMessage`). O id é o do
 * WhatsApp (o que gravamos em `evolution_message_id`), nunca o nosso.
 */
function quotedPorId(id: string | undefined): { key: { id: string } } | undefined {
  return id ? { key: { id } } : undefined;
}

/**
 * Adapter que envelopa EvolutionApiService na interface comum.
 * Endpoints: ver `.agent/skills/evolution-v2/SKILL.md`.
 */
export class EvolutionAdapter implements IWhatsAppProvider {
  readonly type = 'evolution' as const;
  readonly instance: ProviderInstance;
  private service: EvolutionApiService;

  constructor(instance: ProviderInstance) {
    this.instance = instance;
    const cfg = instance.connectionConfig as { baseUrl?: string; apiKey?: string } | null;
    const baseUrl = cfg?.baseUrl || instance.legacyEvolutionApiUrl || '';
    const apiKey = cfg?.apiKey || instance.legacyEvolutionApiKey || '';
    if (!baseUrl || !apiKey) {
      throw new WhatsAppAdapterError(
        'Instância Evolution sem baseUrl ou apiKey configurados.',
        'AUTH_FAILED',
        'evolution',
      );
    }
    this.service = createEvolutionApiService(baseUrl, apiKey);
  }

  getCapabilities(): ProviderCapabilities {
    return {
      groups: true,
      polls: true,
      buttons: true,
      lists: true,
      stickers: true,
      fetchHistory: true,
      templates: false,
      markUnread: true,
      pin: false,
      archive: true,
      block: true,
      typingIndicator: true,
      requiresTemplateOutsideWindow: false,
      serverSideOnlySend: false,
    };
  }

  isReadyToSend(): boolean {
    const s = this.instance.status;
    return s === 'connected' || s === 'open';
  }

  private requireReady(): void {
    if (!this.isReadyToSend()) {
      throw new WhatsAppAdapterError(
        `Instância Evolution "${this.instance.name}" não está conectada (status=${this.instance.status}).`,
        'INSTANCE_DISCONNECTED',
        'evolution',
      );
    }
  }

  async sendText(toPhone: string, content: string, options?: SendTextOptions): Promise<SendResult> {
    this.requireReady();
    try {
      const res = await this.service.sendMessage(this.instance.instanceKey, toPhone, content, {
        quoted: quotedPorId(options?.quotedMessageId),
        linkPreview: options?.linkPreview,
      });
      const id = (res as any)?.key?.id ?? (res as any)?.messageId;
      return { providerMessageId: id, status: 'sent' };
    } catch (e) {
      logger.error('[EvolutionAdapter] sendText falhou', { error: e instanceof Error ? e.message : String(e) });
      return { status: 'failed', error: e instanceof Error ? e.message : String(e) };
    }
  }

  async sendMedia(toPhone: string, payload: SendMediaPayload): Promise<SendResult> {
    this.requireReady();
    try {
      let res: any;
      const ik = this.instance.instanceKey;
      const quoted = quotedPorId(payload.quotedMessageId);
      if (payload.mediaType === 'audio' && payload.ptt) {
        // Mensagem de voz. O Evolution converte para OGG/Opus mono (encoding)
        // e manda como ptt. Esta rota não aceita citação nem legenda.
        res = await this.service.sendAudioMessage(ik, toPhone, payload.mediaUrl, { encoding: true });
      } else if (payload.mediaType === 'audio') {
        // Arquivo de áudio anexado: vai como arquivo, sem virar voz.
        res = await this.service.sendAudioFileMessage(ik, toPhone, payload.mediaUrl, {
          mimetype: payload.mimeType,
          fileName: payload.fileName,
          quoted,
        });
      } else if (payload.mediaType === 'sticker') {
        res = await this.service.sendStickerMessage(ik, toPhone, payload.mediaUrl);
      } else if (payload.mediaType === 'image') {
        res = await this.service.sendImageMessage(ik, toPhone, payload.mediaUrl, payload.caption, { quoted });
      } else if (payload.mediaType === 'video') {
        res = await this.service.sendVideoMessage(ik, toPhone, payload.mediaUrl, payload.caption, { quoted });
      } else {
        res = await this.service.sendDocumentMessage(
          ik,
          toPhone,
          payload.mediaUrl,
          payload.fileName ?? 'arquivo',
          { caption: payload.caption, quoted },
        );
      }
      const id = res?.key?.id ?? res?.messageId;
      return { providerMessageId: id, status: 'sent' };
    } catch (e) {
      logger.error('[EvolutionAdapter] sendMedia falhou', { error: e instanceof Error ? e.message : String(e) });
      return { status: 'failed', error: e instanceof Error ? e.message : String(e) };
    }
  }

  async sendLocation(toPhone: string, payload: SendLocationPayload): Promise<SendResult> {
    this.requireReady();
    try {
      const res: any = await this.service.sendLocationMessage(
        this.instance.instanceKey,
        toPhone,
        payload.latitude,
        payload.longitude,
        payload.name,
        payload.address,
      );
      return { providerMessageId: res?.key?.id, status: 'sent' };
    } catch (e) {
      return { status: 'failed', error: e instanceof Error ? e.message : String(e) };
    }
  }

  async sendReaction(toPhone: string, payload: SendReactionPayload): Promise<SendResult> {
    this.requireReady();
    try {
      const remoteJid = `${toPhone.replace(/\D/g, '')}@s.whatsapp.net`;
      await this.service.sendReactionMessage(
        this.instance.instanceKey,
        { remoteJid, fromMe: false, id: payload.messageId },
        payload.emoji,
      );
      return { status: 'sent' };
    } catch (e) {
      return { status: 'failed', error: e instanceof Error ? e.message : String(e) };
    }
  }

  async setTyping(_toPhone: string, on: boolean): Promise<void> {
    try {
      await this.service.setPresence(this.instance.instanceKey, on ? 'composing' : 'paused');
    } catch (e) {
      logger.debug('[EvolutionAdapter] setTyping ignorado', { error: e instanceof Error ? e.message : String(e) });
    }
  }

  async markRead(toPhone: string, providerMessageId?: string): Promise<void> {
    if (!providerMessageId) return;
    try {
      await this.service.markMessageAsRead(this.instance.instanceKey, `${toPhone.replace(/\D/g, '')}@s.whatsapp.net`, [providerMessageId]);
    } catch (e) {
      logger.debug('[EvolutionAdapter] markRead ignorado', { error: e instanceof Error ? e.message : String(e) });
    }
  }

  async archiveChat(toPhone: string, archive: boolean): Promise<void> {
    try {
      const remoteJid = `${toPhone.replace(/\D/g, '')}@s.whatsapp.net`;
      await this.service.archiveChat(this.instance.instanceKey, remoteJid, archive);
    } catch (e) {
      throw new WhatsAppAdapterError(
        e instanceof Error ? e.message : 'Falha ao arquivar conversa.',
        'UNKNOWN',
        'evolution',
        e,
      );
    }
  }

  async checkNumberExists(phone: string): Promise<boolean> {
    try {
      const info: any = await this.service.getContactInfo(this.instance.instanceKey, phone);
      if (Array.isArray(info)) return Boolean(info[0]?.exists);
      return Boolean(info?.exists);
    } catch {
      return false;
    }
  }

  async getProfilePicture(phone: string): Promise<string | null> {
    try {
      const jid = `${phone}@s.whatsapp.net`;
      const res: any = await this.service.getProfilePicture(this.instance.instanceKey, jid);
      return res?.picture || res?.profilePictureUrl || res?.pictureUrl || res?.url || null;
    } catch {
      return null;
    }
  }
}
