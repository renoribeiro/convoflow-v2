/**
 * Vínculo à mão entre o contato do WhatsApp e o do Instagram da mesma pessoa
 * (migração 20261009000001). Puro, para o teste provar as regras da tela.
 *
 * O vínculo não junta nada: os dois contatos e as duas conversas continuam
 * existindo. Quem vincula decide os conflitos; o servidor grava as escolhas no
 * contato do WhatsApp (o "principal") e nunca escreve no do Instagram — nem o
 * telefone. Desvincular só desfaz o vínculo.
 *
 * As regras abaixo são o ESPELHO de `contact_link_create` (o que conta como
 * conflito e qual lado vale sem escolha). A decisão de verdade é do servidor;
 * este arquivo só decide o que perguntar e o que avisar.
 */
import type { ConversationChannel } from '@/lib/conversations/channel';

export type LinkSide = ConversationChannel;

/** Uma linha de `contact_links_list`. */
export interface ContactLink {
  link_id: string;
  whatsapp_contact_id: string;
  instagram_contact_id: string;
  linked_by: string | null;
  linked_by_name: string | null;
  linked_at: string;
  can_unlink: boolean;
}

/** O que a tela de conflitos precisa de cada lado. */
export interface LinkableContact {
  id: string;
  channel?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  username?: string | null;
  notes?: string | null;
  current_stage_id?: string | null;
  /** Nome da etapa, só para mostrar. */
  stage_name?: string | null;
  custom_fields?: unknown;
  opt_out_mass_message?: boolean | null;
  is_blocked?: boolean | null;
  tag_ids?: readonly string[];
}

/** O que vai para `p_choices`: cada campo diz de qual lado vem o valor. */
export interface LinkChoices {
  name?: LinkSide;
  email?: LinkSide;
  stage?: LinkSide;
  custom_fields?: Record<string, LinkSide>;
}

export type LinkConflictField = 'name' | 'email' | 'stage' | 'custom_field';

export interface LinkConflict {
  field: LinkConflictField;
  /** Só em `custom_field`: a chave do campo. */
  key?: string;
  whatsapp: string;
  instagram: string;
  /** O WhatsApp não tem valor (só acontece na etapa): o padrão vira o Instagram. */
  whatsappEmpty?: boolean;
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Valor de campo personalizado "vazio" para o servidor: ausente, null ou "". */
const isEmptyField = (v: unknown): boolean => v === undefined || v === null || v === '';

const fieldText = (v: unknown): string => (typeof v === 'string' ? v : JSON.stringify(v));

/**
 * Os campos em que os dois lados têm valor e os valores diferem — e só esses.
 * Campo que só um lado tem não é conflito: o servidor completa sozinho.
 */
export function findLinkConflicts(wa: LinkableContact, ig: LinkableContact): LinkConflict[] {
  const out: LinkConflict[] = [];

  const waName = text(wa.name);
  const igName = text(ig.name);
  if (waName && igName && waName !== igName) {
    out.push({ field: 'name', whatsapp: waName, instagram: igName });
  }

  const waEmail = text(wa.email);
  const igEmail = text(ig.email);
  if (waEmail && igEmail && waEmail !== igEmail) {
    out.push({ field: 'email', whatsapp: waEmail, instagram: igEmail });
  }

  // Etapa: se o Instagram não tem etapa, não há o que escolher. Se só o
  // Instagram tem, pergunta assim mesmo — "sem etapa" também é uma escolha.
  const waStage = wa.current_stage_id ?? null;
  const igStage = ig.current_stage_id ?? null;
  if (igStage && waStage !== igStage) {
    out.push({
      field: 'stage',
      whatsapp: waStage ? text(wa.stage_name) || 'Etapa atual' : 'Sem etapa',
      instagram: text(ig.stage_name) || 'Etapa do Instagram',
      whatsappEmpty: !waStage,
    });
  }

  const waFields = asRecord(wa.custom_fields);
  const igFields = asRecord(ig.custom_fields);
  for (const key of Object.keys(igFields).sort()) {
    const igVal = igFields[key];
    const waVal = waFields[key];
    if (isEmptyField(igVal) || isEmptyField(waVal)) continue;
    if (JSON.stringify(waVal) === JSON.stringify(igVal)) continue;
    out.push({ field: 'custom_field', key, whatsapp: fieldText(waVal), instagram: fieldText(igVal) });
  }

  return out;
}

/** Chave estável de um conflito, para o estado do formulário. */
export const conflictKey = (c: LinkConflict): string =>
  c.field === 'custom_field' ? `custom_field:${c.key ?? ''}` : c.field;

/** O lado já marcado quando a tela abre: o WhatsApp, se ele tem valor. */
export const defaultSide = (c: LinkConflict): LinkSide => (c.whatsappEmpty ? 'instagram' : 'whatsapp');

/** Monta `p_choices` só com o que foi perguntado. */
export function buildLinkChoices(
  conflicts: readonly LinkConflict[],
  selection: Readonly<Record<string, LinkSide>>,
): LinkChoices {
  const choices: LinkChoices = {};
  for (const c of conflicts) {
    const side = selection[conflictKey(c)] ?? defaultSide(c);
    if (c.field === 'custom_field') {
      if (!c.key) continue;
      choices.custom_fields = { ...(choices.custom_fields ?? {}), [c.key]: side };
    } else {
      choices[c.field] = side;
    }
  }
  return choices;
}

/**
 * O que acontece sozinho ao vincular (sem pergunta), em frases para a tela.
 * Espelha o servidor: etiquetas somadas, notas do Instagram embaixo, campos e
 * e-mail que só o Instagram tem, e o mais restritivo em opt-out e bloqueio.
 */
export function automaticLinkEffects(wa: LinkableContact, ig: LinkableContact): string[] {
  const out: string[] = [];

  if (!text(wa.name) && text(ig.name)) {
    out.push('O nome do Instagram passa para o contato do WhatsApp, que não tinha nome.');
  }

  const waTags = new Set(wa.tag_ids ?? []);
  const newTags = (ig.tag_ids ?? []).filter((id) => !waTags.has(id)).length;
  if (newTags > 0) {
    out.push(
      newTags === 1
        ? '1 etiqueta do Instagram passa a valer também no WhatsApp.'
        : `${newTags} etiquetas do Instagram passam a valer também no WhatsApp.`,
    );
  }

  const igNotes = text(ig.notes);
  if (igNotes && !(wa.notes ?? '').includes(igNotes)) {
    out.push('As notas do Instagram entram embaixo das do WhatsApp, marcadas "Do Instagram".');
  }

  if (!text(wa.email) && text(ig.email)) {
    out.push('O e-mail do Instagram passa para o contato do WhatsApp.');
  }

  const waFields = asRecord(wa.custom_fields);
  const igFields = asRecord(ig.custom_fields);
  const onlyIg = Object.keys(igFields).filter((k) => !isEmptyField(igFields[k]) && isEmptyField(waFields[k])).length;
  if (onlyIg > 0) {
    out.push(
      onlyIg === 1
        ? '1 campo personalizado que só o Instagram tem passa para o WhatsApp.'
        : `${onlyIg} campos personalizados que só o Instagram tem passam para o WhatsApp.`,
    );
  }

  if (ig.opt_out_mass_message && !wa.opt_out_mass_message) {
    out.push('O contato pediu para sair das campanhas pelo Instagram: o WhatsApp também fica fora delas.');
  }
  if (ig.is_blocked && !wa.is_blocked) {
    out.push('O contato do Instagram está bloqueado: o do WhatsApp também fica bloqueado.');
  }

  return out;
}

/** Recusa do servidor (`reason`) em frase para a pessoa. */
export function linkRefusalMessage(reason: string | null | undefined): string {
  switch (reason) {
    case 'no_profile':
      return 'Seu acesso não está ativo. Saia e entre de novo.';
    case 'no_capability':
      return 'Seu perfil não tem permissão para gerenciar contatos.';
    case 'invalid_choices':
      return 'As escolhas não chegaram certas. Feche a janela e tente de novo.';
    case 'not_visible':
      return 'Você não tem acesso a uma das duas conversas. Peça a quem atende ou a um gestor.';
    case 'wrong_channel':
      return 'É preciso um contato do WhatsApp e um do Instagram.';
    case 'different_store':
      return 'Os dois contatos são de Lojas diferentes.';
    case 'already_linked':
      return 'Um dos dois contatos já está vinculado a outro. A tela foi atualizada.';
    case 'not_linked':
      return 'Este contato não está mais vinculado. A tela foi atualizada.';
    case 'not_allowed':
      return 'Só gestor, gerente ou quem vinculou pode desfazer o vínculo.';
    default:
      return 'Não foi possível concluir. Tente novamente.';
  }
}

export interface ContactLinkIndex {
  /** O vínculo de um contato (de qualquer um dos dois lados). */
  byContact: ReadonlyMap<string, ContactLink>;
  /** Contatos do Instagram vinculados: o Funil mostra só o cartão do WhatsApp. */
  hiddenInstagramIds: ReadonlySet<string>;
}

export function buildLinkIndex(links: readonly ContactLink[]): ContactLinkIndex {
  const byContact = new Map<string, ContactLink>();
  const hiddenInstagramIds = new Set<string>();
  for (const link of links) {
    byContact.set(link.whatsapp_contact_id, link);
    byContact.set(link.instagram_contact_id, link);
    hiddenInstagramIds.add(link.instagram_contact_id);
  }
  return { byContact, hiddenInstagramIds };
}

/** O outro contato do vínculo. */
export const linkedCounterpartId = (link: ContactLink, contactId: string): string =>
  link.whatsapp_contact_id === contactId ? link.instagram_contact_id : link.whatsapp_contact_id;
