import type { IWhatsAppProvider } from './provider.interface';
import type { ProviderCapabilities, ProviderInstance, SendResult } from './types';

/**
 * Número Evolution ou WAHA cuja chave está SÓ no servidor (o cofre, desde
 * 2026-10-26). O navegador não tem mais como montar o adapter dele, e o envio
 * de Evolution/WAHA pela tela só passa para o servidor na sessão 2 do
 * docs/RUNBOOK_segredos_das_instancias.md.
 *
 * Por que este adapter existe em vez de a instância sumir da lista: sem ela,
 * `pickActiveInstance` caía na primeira OUTRA instância pronta da Loja e a
 * resposta sairia por outro número. Com ele, a conversa fica no número certo,
 * marcado como não pronto, e a tela diz por quê. Nada é enviado.
 */
export function serverKeyPendingReason(name: string): string {
  return `O número "${name}" guarda a chave só no servidor. Responder por ele nesta tela chega na próxima atualização do ConvoFlow; as mensagens dele continuam entrando.`;
}

export class ServerKeyPendingAdapter implements IWhatsAppProvider {
  readonly type: IWhatsAppProvider['type'];
  readonly instance: ProviderInstance;
  readonly notReadyReason: string;

  constructor(instance: ProviderInstance) {
    this.instance = instance;
    this.type = instance.provider;
    this.notReadyReason = serverKeyPendingReason(instance.name);
  }

  getCapabilities(): ProviderCapabilities {
    return {
      groups: false,
      polls: false,
      buttons: false,
      lists: false,
      stickers: false,
      fetchHistory: false,
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
    return false;
  }

  private async recusa(): Promise<SendResult> {
    return { status: 'failed', error: this.notReadyReason };
  }

  sendText(): Promise<SendResult> {
    return this.recusa();
  }
  sendMedia(): Promise<SendResult> {
    return this.recusa();
  }
  sendLocation(): Promise<SendResult> {
    return this.recusa();
  }
  sendReaction(): Promise<SendResult> {
    return this.recusa();
  }
  async setTyping(): Promise<void> {}
  async markRead(): Promise<void> {}
  async archiveChat(): Promise<void> {}
  async checkNumberExists(): Promise<boolean> {
    return false;
  }
  async getProfilePicture(): Promise<string | null> {
    return null;
  }
}
