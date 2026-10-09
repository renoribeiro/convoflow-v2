/**
 * CSV da exportação de Contatos. Puro, para o teste provar as colunas.
 *
 * "Canal" e "Usuário do Instagram" entraram com a fatia 4a: contato do
 * Instagram não tem telefone, e sem essas duas colunas ele saía na planilha
 * como uma linha sem identificação nenhuma.
 *
 * "Vinculado a" entrou com o vínculo WhatsApp ↔ Instagram (migração
 * 20261009000001): a mesma pessoa continua em duas linhas, e esta coluna diz
 * qual é a outra. Vai no FIM, para não mudar a posição das colunas de quem já
 * tem planilha montada em cima da exportação.
 */
import { CHANNEL_LABEL, asChannel } from '@/lib/conversations/channel';
import { instagramHandle } from '@/lib/instagram/contactProfile';
import { contactIdentifier, type ContactIdentity } from '@/lib/contacts/identity';

export interface ContactExportRow {
  id?: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  channel?: string | null;
  username?: string | null;
  notes: string | null;
  created_at: string | null;
  stage?: { name: string | null } | null;
  lead_sources?: { name: string | null } | null;
}

export const CONTACTS_CSV_HEADER = [
  'Nome',
  'Email',
  'Telefone',
  'Canal',
  'Usuário do Instagram',
  'Estágio',
  'Origem',
  'Notas',
  'Criado em',
  'Vinculado a',
] as const;

export const escapeCsv = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

/** "Instagram: Maria (@maria)" — o outro contato do vínculo, numa célula. */
export function linkedContactLabel(contact: ContactIdentity): string {
  const channel = asChannel(contact.channel);
  const id = contactIdentifier(contact);
  const name = contact.name?.trim();
  // Instagram sem nome e sem @ ainda: o identificador é só o nome do canal.
  if (!name && (!id || id === CHANNEL_LABEL[channel])) return `${CHANNEL_LABEL[channel]} (sem nome)`;
  const who = name && name !== id ? (id ? `${name} (${id})` : name) : id;
  return `${CHANNEL_LABEL[channel]}: ${who}`;
}

/**
 * Linhas do CSV (sem o BOM). A primeira é o cabeçalho.
 * @param linkedTo id do contato → rótulo do contato vinculado a ele.
 */
export function buildContactsCsv(
  rows: readonly ContactExportRow[],
  linkedTo?: ReadonlyMap<string, string>,
): string {
  const lines = [CONTACTS_CSV_HEADER.join(',')];
  for (const r of rows) {
    const channel = asChannel(r.channel);
    lines.push(
      [
        escapeCsv(r.name),
        escapeCsv(r.email),
        escapeCsv(r.phone),
        escapeCsv(CHANNEL_LABEL[channel]),
        escapeCsv(channel === 'instagram' ? instagramHandle(r.username) : null),
        escapeCsv(r.stage?.name),
        escapeCsv(r.lead_sources?.name),
        escapeCsv(r.notes),
        escapeCsv(r.created_at),
        escapeCsv(r.id ? linkedTo?.get(r.id) : null),
      ].join(','),
    );
  }
  return lines.join('\n');
}
