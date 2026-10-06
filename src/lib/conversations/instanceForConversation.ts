/**
 * Por qual instância uma conversa responde.
 *
 * A REGRA DA FATIA 3 DO INSTAGRAM: conversa que não é de WhatsApp NUNCA cai
 * em outra instância. Nem quando o adapter do Instagram não monta (ele some
 * da lista), nem quando a instância não existe, nunca. Sem a instância exata
 * da conversa, a resposta é `null` e o compositor diz que não dá para enviar.
 *
 * Por que existe: até a fatia 3, a instância de Instagram era descartada da
 * lista e `pickActiveInstance` caía na primeira instância pronta da Conta — o
 * WhatsApp. A única coisa que impedia uma resposta de Instagram de sair pelo
 * WhatsApp era o contato não ter telefone.
 *
 * Allowlist, como os gates do banco (fatia 2): só `channel === 'whatsapp'`
 * mantém o comportamento antigo (o `legacyPick`, intocado). Qualquer outro
 * canal — inclusive um que ainda não existe — nasce estrito.
 *
 * Conversa sem `channel` carregado (fixture antiga, cache): é WhatsApp só se
 * o contato tem telefone. Sem canal e sem telefone não há por onde enviar de
 * qualquer forma, e o estrito é o lado seguro.
 */

/** O mínimo que a regra olha de cada instância carregada. */
export interface InstanceCandidate {
  row: { id: string; provider?: string | null };
}

export type ConversationChannel = 'whatsapp' | 'instagram' | (string & {});

export interface ResolveInstanceInput<T extends InstanceCandidate> {
  list: T[];
  preferredInstanceId: string | null | undefined;
  channel: ConversationChannel | null | undefined;
  contactPhone: string | null | undefined;
  /** O escolhedor de sempre do WhatsApp (`pickActiveInstance`). */
  legacyPick: (list: T[], preferredInstanceId?: string | null) => T | null;
}

export function isWhatsAppConversation(
  channel: string | null | undefined,
  contactPhone: string | null | undefined,
): boolean {
  if (channel === 'whatsapp') return true;
  if (channel === null || channel === undefined || channel === '') return !!contactPhone;
  return false;
}

/** Provider que cada canal estrito exige na instância. */
const PROVIDER_FOR_CHANNEL: Record<string, string> = {
  instagram: 'instagram',
};

export function resolveConversationInstance<T extends InstanceCandidate>(
  input: ResolveInstanceInput<T>,
): T | null {
  const { list, preferredInstanceId, channel, contactPhone, legacyPick } = input;

  if (isWhatsAppConversation(channel, contactPhone)) {
    return legacyPick(list, preferredInstanceId);
  }

  // Estrito: a instância DA conversa, do provider do canal, ou nada.
  if (!preferredInstanceId) return null;
  const match = list.find((x) => x.row.id === preferredInstanceId);
  if (!match) return null;
  const required = channel ? PROVIDER_FOR_CHANNEL[channel] : undefined;
  if (!required || match.row.provider !== required) return null;
  return match;
}
