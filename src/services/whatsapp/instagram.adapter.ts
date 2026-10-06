import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { INSTAGRAM_TEXT_MAX_BYTES, INSTAGRAM_COMPOSER_TEXT, utf8ByteLength } from '@/lib/instagram/reply';
import type { IWhatsAppProvider } from './provider.interface';
import {
  WhatsAppAdapterError,
  type ProviderCapabilities,
  type ProviderInstance,
  type SendResult,
} from './types';

/**
 * Adapter do Instagram (fatia 3/5): responde TEXTO, e só texto.
 *
 * Mora aqui porque a tabela e o inbox são os do WhatsApp (a instância de
 * Instagram é uma linha de whatsapp_instances com provider='instagram'), não
 * porque o Instagram seja WhatsApp. `toPhone` na interface é, aqui, o IGSID
 * do cliente (`contacts.external_id`).
 *
 * O token vive no Vault: o envio passa pela edge function
 * `instagram-send-message`, nunca pelo `whatsapp-send-message`.
 *
 * Mídia, localização e reação: recusadas (CAPABILITY_UNSUPPORTED). A tela
 * esconde esses controles para conversas do Instagram; a recusa aqui é a rede
 * de baixo. Digitação, leitura e foto de perfil: não fazem nada.
 */
export class InstagramAdapter implements IWhatsAppProvider {
  readonly type = 'instagram' as const;
  readonly instance: ProviderInstance;

  constructor(instance: ProviderInstance) {
    this.instance = instance;
    const cfg = instance.connectionConfig as { igAccountId?: unknown } | null;
    if (typeof cfg?.igAccountId !== 'string' || cfg.igAccountId.length === 0) {
      throw new WhatsAppAdapterError(
        'Instância de Instagram sem igAccountId em connection_config.',
        'AUTH_FAILED',
        'instagram',
      );
    }
  }

  getCapabilities(): ProviderCapabilities {
    return {
      groups: false,
      polls: false,
      buttons: false,
      lists: false,
      stickers: false,
      fetchHistory: false,
      // O Instagram não tem template para reabrir a conversa: a janela fechada
      // é tratada pelo compositor do Instagram, não pelo aviso de template.
      templates: false,
      markUnread: false,
      pin: false,
      archive: false,
      block: false,
      typingIndicator: false,
      requiresTemplateOutsideWindow: false,
      serverSideOnlySend: true,
    };
  }

  isReadyToSend(): boolean {
    const s = this.instance.status?.toLowerCase();
    return s === 'connected' || s === 'open';
  }

  /**
   * Manda uma resposta de texto. `options` (resposta citada, prévia de link)
   * é ignorado: a citação não está na documentação da API do Instagram.
   */
  async sendText(toIgsid: string, content: string): Promise<SendResult> {
    if (!this.isReadyToSend()) {
      return {
        status: 'failed',
        reason: 'instance_inactive',
        error: `A conexão do Instagram "${this.instance.name}" não está ativa.`,
      };
    }
    const bytes = utf8ByteLength(content);
    if (bytes > INSTAGRAM_TEXT_MAX_BYTES) {
      return { status: 'failed', reason: 'too_long', error: INSTAGRAM_COMPOSER_TEXT.tooLong(bytes) };
    }

    try {
      const { data, error } = await supabase.functions.invoke('instagram-send-message', {
        body: { instance_id: this.instance.id, to: toIgsid, text: content },
      });

      if (error) {
        // Não-2xx (sem sessão, sem acesso, corpo inválido). Tenta ler a
        // mensagem que a função mandou; senão, genérico.
        let detail: { error?: string; reason?: string } | null = null;
        try {
          const ctx = (error as { context?: Response }).context;
          if (ctx && typeof ctx.json === 'function') detail = await ctx.json();
        } catch {
          /* corpo ilegível */
        }
        logger.warn('[InstagramAdapter] instagram-send-message não-2xx', {
          reason: detail?.reason ?? null,
        });
        return {
          status: 'failed',
          reason: detail?.reason ?? 'unknown',
          error: detail?.error ?? 'Não foi possível enviar pelo Instagram agora.',
        };
      }

      const res = data as {
        ok?: boolean;
        messageId?: string | null;
        reason?: string;
        error?: string;
      } | null;

      if (!res?.ok) {
        return {
          status: 'failed',
          reason: res?.reason ?? 'unknown',
          error: res?.error ?? 'O Instagram recusou a mensagem.',
        };
      }
      return { status: 'sent', providerMessageId: res.messageId ?? undefined };
    } catch (e) {
      logger.error('[InstagramAdapter] falha ao chamar instagram-send-message', {
        error: e instanceof Error ? e.message : String(e),
      });
      return {
        status: 'failed',
        reason: 'network_error',
        error: 'Não foi possível falar com o Instagram agora. Tente de novo.',
      };
    }
  }

  async sendMedia(): Promise<SendResult> {
    throw this.unsupported('mídia');
  }

  async sendLocation(): Promise<SendResult> {
    throw this.unsupported('localização');
  }

  async sendReaction(): Promise<SendResult> {
    throw this.unsupported('reação');
  }

  async setTyping(): Promise<void> {
    /* O Instagram não recebe "digitando" nesta fatia. */
  }

  async markRead(): Promise<void> {
    /* Leitura fica só no banco local. */
  }

  async archiveChat(): Promise<void> {
    /* Arquivar é só no banco local. */
  }

  async checkNumberExists(): Promise<boolean> {
    return false;
  }

  async getProfilePicture(): Promise<string | null> {
    return null;
  }

  private unsupported(what: string): WhatsAppAdapterError {
    return new WhatsAppAdapterError(
      `O Instagram só responde texto por aqui (${what} não é enviado).`,
      'CAPABILITY_UNSUPPORTED',
      'instagram',
    );
  }
}
