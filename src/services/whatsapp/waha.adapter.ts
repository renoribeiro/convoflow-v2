import { ServerSendAdapter } from './serverSend.adapter';
import type { ProviderCapabilities } from './types';

/**
 * Número WAHA. Todo envio vai pelo servidor (`ServerSendAdapter`), que chama
 * o servidor WAHA do cliente só depois de conferir que o endereço é público
 * (`supabase/functions/_shared/safe-outbound-url.ts`). Endpoints em
 * `supabase/functions/_shared/message-send.ts` (SKILL waha).
 *
 * `connectionConfig.engine` ('core' | 'plus', padrão 'plus') decide o que
 * depende da edição do WAHA.
 */
export class WahaAdapter extends ServerSendAdapter {
  readonly type = 'waha' as const;

  getCapabilities(): ProviderCapabilities {
    const isPlus = (this.instance.connectionConfig as { engine?: string } | null)?.engine !== 'core';
    return {
      groups: true,
      // Enquete, botões, lista e figurinha não saem pelas Conversas.
      polls: false,
      buttons: false,
      lists: false,
      stickers: false,
      fetchHistory: false,
      templates: false,
      markUnread: isPlus,
      pin: isPlus,
      archive: true,
      block: true,
      typingIndicator: true,
      requiresTemplateOutsideWindow: false,
      serverSideOnlySend: true,
    };
  }

  isReadyToSend(): boolean {
    const s = this.instance.status?.toLowerCase();
    return s === 'connected' || s === 'open' || s === 'working';
  }
}
