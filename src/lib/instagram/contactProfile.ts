/**
 * Nome e @ do cliente do Instagram (fatia 4a) — regras puras do navegador.
 *
 * Quem decide se um contato está na hora de buscar é o SERVIDOR
 * (`instagram_contact_profile_claim`). Esta cópia existe só para a tela não
 * chamar a função à toa; os dois prazos abaixo são os mesmos do SQL.
 */
import { UNNAMED_CONTACT, type ConversationChannel } from '@/lib/conversations/channel';
import { instagramConnectionView } from '@/lib/instagram/connection';

/** 'retry': tenta de novo depois de 6 h (o mesmo `interval '6 hours'` do SQL). */
export const PROFILE_RETRY_AFTER_MS = 6 * 3_600_000;
/** 'pending' esquecido: a tentativa morreu no meio depois de 10 min. */
export const PROFILE_PENDING_STALE_MS = 10 * 60_000;

export interface ProfileContact {
  id: string;
  channel?: string | null;
  name?: string | null;
  username?: string | null;
  profile_status?: string | null;
  profile_checked_at?: string | null;
  whatsapp_instance_id?: string | null;
}

/**
 * Está na hora de buscar? Só contato do Instagram, e só se a coluna veio na
 * consulta (`profile_status` presente, mesmo que nula) — sem ela não dá para
 * saber, e a tela não chama.
 */
export function isProfileFetchDue(contact: ProfileContact, now: Date): boolean {
  if (contact.channel !== 'instagram') return false;
  if (!('profile_status' in contact)) return false;
  const status = contact.profile_status ?? null;
  if (status === null) return true;
  const checked = contact.profile_checked_at ? Date.parse(contact.profile_checked_at) : NaN;
  if (Number.isNaN(checked)) return status === 'retry' || status === 'pending';
  const age = now.getTime() - checked;
  if (status === 'retry') return age > PROFILE_RETRY_AFTER_MS;
  if (status === 'pending') return age > PROFILE_PENDING_STALE_MS;
  return false; // ok / unavailable: nunca mais
}

/** A conexão do Instagram do contato atende? (a mesma regra do cartão) */
export function profileConnectionUsable(
  contact: ProfileContact,
  instances: ReadonlyArray<{ row: { id: string; provider?: string | null; is_active?: boolean | null; connection_config?: unknown } }>,
  now: Date,
): boolean {
  const inst = instances.find((i) => i.row.id === contact.whatsapp_instance_id);
  if (!inst || inst.row.provider !== 'instagram' || inst.row.is_active === false) return false;
  const state = instagramConnectionView(inst.row.connection_config, now).state;
  return state === 'valid' || state === 'expiring' || state === 'unknown';
}

/** "@paulo" a partir do username gravado (sem o @). */
export const instagramHandle = (username: string | null | undefined): string | null => {
  const clean = (username ?? '').trim().replace(/^@+/, '');
  return clean ? `@${clean}` : null;
};

/**
 * Nome para mostrar: o nome; sem ele, o @; sem os dois, "Cliente do Instagram"
 * (Instagram) ou "Contato sem nome" (WhatsApp, o de sempre).
 */
export function contactDisplayName(
  contact: Pick<ProfileContact, 'name' | 'username'> | null | undefined,
  channel: ConversationChannel,
): string {
  const name = contact?.name?.trim();
  if (name) return name;
  if (channel === 'instagram') {
    const handle = instagramHandle(contact?.username);
    if (handle) return handle;
  }
  return UNNAMED_CONTACT[channel];
}
