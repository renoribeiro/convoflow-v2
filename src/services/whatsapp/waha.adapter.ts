import { logger } from '@/lib/logger';
import { UrlSanitizer } from '@/lib/validation';
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
 * Adapter para WAHA API.
 * Endpoints: ver `.agent/skills/waha/SKILL.md`.
 *
 * IMPORTANTE: Capabilities `polls`, `buttons`, `lists` e `stickers` dependem
 * da edição (Core vs Plus). A UI deve confirmar engine via /api/server/status
 * antes de oferecer esses recursos. Por padrão assumimos Plus (mais comum
 * em produção). Para forçar Core, configure `connectionConfig.engine='core'`.
 */
export class WahaAdapter implements IWhatsAppProvider {
  readonly type = 'waha' as const;
  readonly instance: ProviderInstance;
  private baseUrl: string;
  private apiKey: string;
  private session: string;
  private engine: 'core' | 'plus';

  constructor(instance: ProviderInstance) {
    this.instance = instance;
    const cfg = instance.connectionConfig as
      | { baseUrl?: string; apiKey?: string; sessionName?: string; engine?: 'core' | 'plus' }
      | null;
    const baseUrl = cfg?.baseUrl;
    const apiKey = cfg?.apiKey;
    if (!baseUrl || !apiKey) {
      throw new WhatsAppAdapterError(
        'Instância WAHA sem baseUrl ou apiKey configurados.',
        'AUTH_FAILED',
        'waha',
      );
    }
    const sanitized = UrlSanitizer.sanitizeUrl(baseUrl);
    if (!sanitized) {
      throw new WhatsAppAdapterError('URL WAHA inválida.', 'AUTH_FAILED', 'waha');
    }
    this.baseUrl = sanitized.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.session = cfg?.sessionName || instance.instanceKey || 'default';
    this.engine = cfg?.engine ?? 'plus';
  }

  getCapabilities(): ProviderCapabilities {
    const isPlus = this.engine === 'plus';
    return {
      groups: true,
      polls: isPlus,
      buttons: isPlus,
      lists: isPlus,
      stickers: isPlus,
      fetchHistory: true,
      templates: false,
      markUnread: isPlus,
      pin: isPlus,
      archive: true,
      block: true,
      typingIndicator: true,
      requiresTemplateOutsideWindow: false,
      serverSideOnlySend: false,
    };
  }

  isReadyToSend(): boolean {
    const s = this.instance.status?.toLowerCase();
    return s === 'connected' || s === 'open' || s === 'working';
  }

  private requireReady(): void {
    if (!this.isReadyToSend()) {
      throw new WhatsAppAdapterError(
        `Sessão WAHA "${this.session}" não está em WORKING (status=${this.instance.status}).`,
        'INSTANCE_DISCONNECTED',
        'waha',
      );
    }
  }

  private chatIdFromPhone(phone: string): string {
    const cleaned = phone.replace(/\D/g, '');
    if (!cleaned) {
      throw new WhatsAppAdapterError('Número inválido.', 'INVALID_NUMBER', 'waha');
    }
    return `${cleaned}@c.us`;
  }

  private async request<T>(path: string, body?: unknown, method = 'POST'): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Api-Key': this.apiKey,
    };
    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const code = res.status === 401 ? 'AUTH_FAILED' : res.status === 429 ? 'RATE_LIMITED' : 'UNKNOWN';
      logger.error('[WahaAdapter] request falhou', { path, status: res.status, body: text.slice(0, 500) });
      throw new WhatsAppAdapterError(`WAHA ${res.status}: ${res.statusText}`, code, 'waha');
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  async sendText(toPhone: string, content: string, options?: SendTextOptions): Promise<SendResult> {
    this.requireReady();
    try {
      const res = await this.request<{ id?: string; _data?: { id?: { _serialized?: string } } }>('/api/sendText', {
        session: this.session,
        chatId: this.chatIdFromPhone(toPhone),
        text: content,
        linkPreview: options?.linkPreview ?? true,
        reply_to: options?.quotedMessageId,
      });
      const id = res?._data?.id?._serialized || res?.id;
      return { providerMessageId: id, status: 'sent' };
    } catch (e) {
      const err = e as WhatsAppAdapterError;
      return { status: 'failed', error: err.message };
    }
  }

  async sendMedia(toPhone: string, payload: SendMediaPayload): Promise<SendResult> {
    this.requireReady();
    if (payload.mediaType === 'sticker' && !this.getCapabilities().stickers) {
      return { status: 'failed', error: 'Stickers só estão disponíveis no WAHA Plus.' };
    }
    const endpoint = payload.mediaType === 'image'
      ? '/api/sendImage'
      : payload.mediaType === 'video'
      ? '/api/sendVideo'
      : payload.mediaType === 'audio'
      ? (payload.ptt ? '/api/sendVoice' : '/api/sendAudio')
      : payload.mediaType === 'sticker'
      ? '/api/sendSticker'
      : '/api/sendFile';

    try {
      const res = await this.request<{ id?: string }>(endpoint, {
        session: this.session,
        chatId: this.chatIdFromPhone(toPhone),
        file: {
          url: payload.mediaUrl,
          filename: payload.fileName,
          mimetype: payload.mimeType,
        },
        caption: payload.caption,
        reply_to: payload.quotedMessageId,
        convert: payload.mediaType === 'audio' ? true : undefined,
      });
      return { providerMessageId: res?.id, status: 'sent' };
    } catch (e) {
      const err = e as WhatsAppAdapterError;
      return { status: 'failed', error: err.message };
    }
  }

  async sendLocation(toPhone: string, payload: SendLocationPayload): Promise<SendResult> {
    this.requireReady();
    try {
      const res = await this.request<{ id?: string }>('/api/sendLocation', {
        session: this.session,
        chatId: this.chatIdFromPhone(toPhone),
        latitude: payload.latitude,
        longitude: payload.longitude,
        title: payload.name,
      });
      return { providerMessageId: res?.id, status: 'sent' };
    } catch (e) {
      const err = e as WhatsAppAdapterError;
      return { status: 'failed', error: err.message };
    }
  }

  async sendReaction(_toPhone: string, payload: SendReactionPayload): Promise<SendResult> {
    this.requireReady();
    try {
      await this.request('/api/reaction', {
        session: this.session,
        messageId: payload.messageId,
        reaction: payload.emoji,
      }, 'PUT');
      return { status: 'sent' };
    } catch (e) {
      const err = e as WhatsAppAdapterError;
      return { status: 'failed', error: err.message };
    }
  }

  async setTyping(toPhone: string, on: boolean): Promise<void> {
    if (!this.isReadyToSend()) return;
    try {
      await this.request(on ? '/api/startTyping' : '/api/stopTyping', {
        session: this.session,
        chatId: this.chatIdFromPhone(toPhone),
      });
    } catch {
      // Best-effort; não bloqueia o usuário.
    }
  }

  async markRead(toPhone: string, _providerMessageId?: string): Promise<void> {
    if (!this.isReadyToSend()) return;
    try {
      await this.request('/api/sendSeen', {
        session: this.session,
        chatId: this.chatIdFromPhone(toPhone),
      });
    } catch {
      // Não bloqueia.
    }
  }

  async archiveChat(toPhone: string, archive: boolean): Promise<void> {
    const chatId = this.chatIdFromPhone(toPhone);
    const path = `/api/${this.session}/chats/${encodeURIComponent(chatId)}/${archive ? 'archive' : 'unarchive'}`;
    await this.request(path, undefined, 'POST');
  }

  async checkNumberExists(phone: string): Promise<boolean> {
    const cleaned = phone.replace(/\D/g, '');
    try {
      const res = await this.request<{ numberExists?: boolean }>(
        `/api/${this.session}/contacts/check-exists?phone=${encodeURIComponent(cleaned)}`,
        undefined,
        'GET',
      );
      return Boolean(res?.numberExists);
    } catch {
      return false;
    }
  }

  async getProfilePicture(phone: string): Promise<string | null> {
    try {
      const chatId = this.chatIdFromPhone(phone);
      const res = await this.request<{ profilePictureURL?: string; url?: string }>(
        `/api/${this.session}/contacts/profile-picture?contactId=${encodeURIComponent(chatId)}`,
        undefined,
        'GET',
      );
      return res?.profilePictureURL || res?.url || null;
    } catch {
      return null;
    }
  }
}
