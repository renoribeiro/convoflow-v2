/**
 * CSV da exportação de Contatos. Puro, para o teste provar as colunas.
 *
 * "Canal" e "Usuário do Instagram" entraram com a fatia 4a: contato do
 * Instagram não tem telefone, e sem essas duas colunas ele saía na planilha
 * como uma linha sem identificação nenhuma.
 */
import { CHANNEL_LABEL, asChannel } from '@/lib/conversations/channel';
import { instagramHandle } from '@/lib/instagram/contactProfile';

export interface ContactExportRow {
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
] as const;

export const escapeCsv = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

/** Linhas do CSV (sem o BOM). A primeira é o cabeçalho. */
export function buildContactsCsv(rows: readonly ContactExportRow[]): string {
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
      ].join(','),
    );
  }
  return lines.join('\n');
}
