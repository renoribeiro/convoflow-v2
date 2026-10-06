/**
 * Como um contato aparece fora de Conversas (fatia 4a do Instagram, Contatos).
 *
 * Regra de todas as telas: contato de WhatsApp sai EXATAMENTE como sempre saiu
 * (telefone); contato do Instagram, que não tem telefone, mostra o @ — ou
 * "Instagram", enquanto o @ não chegou. Nunca um espaço em branco.
 *
 * Contato nunca é juntado entre canais: a mesma pessoa no WhatsApp e no
 * Instagram são dois contatos, e nada aqui tenta casar um com o outro.
 */
import { CHANNEL_LABEL, asChannel, type ConversationChannel } from '@/lib/conversations/channel';
import { instagramHandle } from '@/lib/instagram/contactProfile';

export interface ContactIdentity {
  channel?: string | null;
  phone?: string | null;
  username?: string | null;
  name?: string | null;
  email?: string | null;
}

/** Filtro de canal da tela de Contatos. 'all' = sem filtro (o padrão). */
export type ContactChannelFilter = 'all' | ConversationChannel;

export const CONTACT_CHANNEL_FILTERS: readonly ContactChannelFilter[] = ['all', 'whatsapp', 'instagram'] as const;

export const CONTACT_CHANNEL_FILTER_LABEL: Record<ContactChannelFilter, string> = {
  all: 'Todos',
  whatsapp: CHANNEL_LABEL.whatsapp,
  instagram: CHANNEL_LABEL.instagram,
};

export const asContactChannelFilter = (value: unknown): ContactChannelFilter =>
  value === 'whatsapp' || value === 'instagram' ? value : 'all';

export const contactChannel = (contact: ContactIdentity): ConversationChannel => asChannel(contact.channel);

/**
 * A linha que identifica o contato: telefone (WhatsApp) ou @ (Instagram).
 * WhatsApp devolve o telefone como está, até vazio — é o comportamento de
 * sempre dessas telas, e ele não muda aqui.
 */
export function contactIdentifier(contact: ContactIdentity): string {
  if (contactChannel(contact) === 'instagram') {
    return instagramHandle(contact.username) ?? CHANNEL_LABEL.instagram;
  }
  return contact.phone ?? '';
}

/**
 * Onde a tela usava `name || phone`: o nome; sem ele, o identificador acima.
 * WhatsApp continua sendo literalmente `name || phone`.
 */
export function contactLabel(contact: ContactIdentity): string {
  if (contactChannel(contact) === 'instagram') {
    return contact.name?.trim() || contactIdentifier(contact);
  }
  return contact.name || (contact.phone ?? '');
}

/**
 * "Nome (identificador)" — só para o Instagram; quem chama mantém o texto de
 * sempre para o WhatsApp. Sem nome, só o identificador (nunca "@a (@a)").
 */
export function instagramNameWithHandle(contact: ContactIdentity): string {
  const name = contact.name?.trim();
  const id = contactIdentifier({ ...contact, channel: 'instagram' });
  return name ? `${name} (${id})` : id;
}

/**
 * Busca de texto da lista de Contatos: nome, telefone, e-mail e @ (com ou sem
 * o "@" digitado).
 */
export function contactMatchesSearch(contact: ContactIdentity, search: string): boolean {
  const term = search.trim().toLowerCase();
  if (!term) return true;
  const handleTerm = term.replace(/^@+/, '');
  return Boolean(
    contact.name?.toLowerCase().includes(term) ||
      contact.phone?.toLowerCase().includes(term) ||
      contact.email?.toLowerCase().includes(term) ||
      (handleTerm && contact.username?.toLowerCase().includes(handleTerm)),
  );
}

/** Filtro OR do PostgREST para buscar por nome, telefone ou @ no servidor. */
export function contactSearchOrFilter(search: string): string | null {
  const term = search.trim();
  if (term.length < 2) return null;
  const escaped = term.replace(/[%_,]/g, (c) => `\\${c}`);
  const handle = escaped.replace(/^@+/, '');
  const parts = [`name.ilike.%${escaped}%`, `phone.ilike.%${escaped}%`];
  if (handle) parts.push(`username.ilike.%${handle}%`);
  return parts.join(',');
}
