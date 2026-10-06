/**
 * Quem o seletor de contato do agendador de follow-up oferece.
 *
 * Decisão do dono (2026-09-25): contato do Instagram NÃO é oferecido onde o
 * follow-up manda WhatsApp sozinho — "Agendado" (envio automático na hora) e
 * "Sequência" (cadência automática). Ele não tem telefone, e o envio nunca
 * sairia. No "Manual" (tarefa que a pessoa faz: ligar, mandar e-mail) ele
 * continua na lista.
 *
 * A rede de segurança continua no servidor: process-followup-dispatch cancela
 * o agendado sem telefone ('Contato sem telefone válido.') e pula o passo de
 * WhatsApp da sequência.
 */
import { contactChannel, type ContactIdentity } from '@/lib/contacts/identity';
import type { FollowupMode } from '@/lib/followups/types';

/** Modos em que o próprio sistema envia WhatsApp. */
export const WHATSAPP_SENDING_FOLLOWUP_MODES: readonly FollowupMode[] = ['scheduled', 'sequence'] as const;

export const followupModeSendsWhatsapp = (mode: FollowupMode): boolean =>
  WHATSAPP_SENDING_FOLLOWUP_MODES.includes(mode);

/** O contato pode ser escolhido neste modo? */
export const contactAllowedInFollowupMode = (contact: ContactIdentity, mode: FollowupMode): boolean =>
  !followupModeSendsWhatsapp(mode) || contactChannel(contact) === 'whatsapp';

/** A lista do seletor, na mesma ordem de sempre. */
export function followupPickerContacts<T extends ContactIdentity>(contacts: readonly T[], mode: FollowupMode): T[] {
  return contacts.filter((c) => contactAllowedInFollowupMode(c, mode));
}
