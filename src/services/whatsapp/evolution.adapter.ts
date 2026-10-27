import { ServerSendAdapter } from './serverSend.adapter';
import type { ProviderCapabilities } from './types';

/**
 * Número Evolution. Todo envio vai pelo servidor (`ServerSendAdapter`); os
 * endpoints que o servidor chama estão em
 * `supabase/functions/_shared/message-send.ts` (SKILL evolution-v2).
 */
export class EvolutionAdapter extends ServerSendAdapter {
  readonly type = 'evolution' as const;

  getCapabilities(): ProviderCapabilities {
    return {
      groups: true,
      // Enquete, botões, lista e figurinha não saem pelas Conversas.
      polls: false,
      buttons: false,
      lists: false,
      stickers: false,
      // Puxar o histórico do servidor pelo navegador usava a chave global, que
      // a tela não tem: as mensagens chegam pelo webhook.
      fetchHistory: false,
      templates: false,
      markUnread: true,
      pin: false,
      archive: true,
      block: true,
      typingIndicator: true,
      requiresTemplateOutsideWindow: false,
      serverSideOnlySend: true,
    };
  }

  isReadyToSend(): boolean {
    const s = this.instance.status;
    return s === 'connected' || s === 'open';
  }
}
