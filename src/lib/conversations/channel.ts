/**
 * Canal da tela de Conversas (fatia 4a do Instagram): WhatsApp ou Instagram,
 * cada um com a sua lista.
 *
 * Tudo aqui é puro. O filtro de canal em si mora em `applyConversationScope`
 * (useConversations.ts), que a lista e TODAS as contagens usam — é isso que
 * mantém lista e números no mesmo universo.
 */
export type ConversationChannel = 'whatsapp' | 'instagram';

export const CONVERSATION_CHANNELS: readonly ConversationChannel[] = ['whatsapp', 'instagram'] as const;

export const CHANNEL_LABEL: Record<ConversationChannel, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
};

export const otherChannel = (channel: ConversationChannel): ConversationChannel =>
  channel === 'whatsapp' ? 'instagram' : 'whatsapp';

/** O canal de uma instância, pelo provedor. Tudo que não é Instagram é WhatsApp. */
export const channelOfProvider = (provider: string | null | undefined): ConversationChannel =>
  provider === 'instagram' ? 'instagram' : 'whatsapp';

/** Só as instâncias do canal aberto (o seletor da lista não mistura os dois). */
export function instancesOfChannel<T extends { row: { provider?: string | null } }>(
  list: readonly T[],
  channel: ConversationChannel,
): T[] {
  return list.filter((it) => channelOfProvider(it.row.provider) === channel);
}

/** A Loja tem conta de Instagram? Sem ela a chave nem aparece. */
export const hasInstagramInstance = (list: readonly { row: { provider?: string | null } }[]): boolean =>
  list.some((it) => channelOfProvider(it.row.provider) === 'instagram');

/**
 * "Aguardando resposta" no SERVIDOR — o selo do outro canal.
 *
 * É a mesma regra do agrupamento "Aguardando resposta" e da pílula
 * "Aguardando" (`resolveAttendanceGroup`): há não lidas OU a última mensagem é
 * do cliente. Conversa sem mensagem nenhuma (direção NULL) a lista trata como
 * do cliente (`?? 'inbound'`), então conta também. `incoming` é o sinônimo
 * histórico de `inbound` (ver normalizeLastMessageDirection).
 *
 * Filtro no formato do `.or()` do PostgREST, em colunas da própria conversa.
 */
export const AWAITING_REPLY_FILTER =
  'unread_count.gt.0,last_message_direction.is.null,last_message_direction.in.(inbound,incoming)';

/**
 * Espelho em JS do filtro acima, para o teste provar que servidor e lista
 * classificam igual. Vale para todo valor que o banco produz: a trigger grava
 * só 'inbound'/'outbound'; 'incoming' é legado; NULL = conversa sem mensagem.
 */
export function isAwaitingReplyRow(row: {
  unread_count: number | null | undefined;
  last_message_direction: string | null | undefined;
}): boolean {
  if ((row.unread_count ?? 0) > 0) return true;
  const d = row.last_message_direction;
  if (d === null || d === undefined) return true;
  return d === 'inbound' || d === 'incoming';
}

// ---------------------------------------------------------------------------
// Textos que mudam com o canal
// ---------------------------------------------------------------------------

/** Subtítulo da página. O do WhatsApp é o de sempre, palavra por palavra. */
export const CONVERSATIONS_PAGE_DESCRIPTION: Record<ConversationChannel, string> = {
  whatsapp: 'Gerencie todas as suas conversas do WhatsApp em um só lugar',
  instagram: 'Responda as mensagens diretas do Instagram da Loja em um só lugar',
};

/** "Todas" do seletor de instância/conta. */
export const INSTANCE_SELECTOR_ALL_LABEL: Record<ConversationChannel, string> = {
  whatsapp: 'Todas as instâncias',
  instagram: 'Todas as contas do Instagram',
};

/** Nome de quem ainda não tem nome nenhum. */
export const UNNAMED_CONTACT: Record<ConversationChannel, string> = {
  whatsapp: 'Contato sem nome',
  instagram: 'Cliente do Instagram',
};

/** Aviso do nível crítico do SLA: a janela de 24 h é regra dos dois canais. */
export const SLA_CRITICAL_HINT_BY_CHANNEL: Record<ConversationChannel, string> = {
  whatsapp: 'Janela de 24h do WhatsApp perto de expirar',
  instagram: 'Janela de 24h do Instagram perto de expirar',
};

/** Canal de um valor qualquer vindo do banco (null/lixo = WhatsApp, o padrão da coluna). */
export const asChannel = (value: unknown): ConversationChannel =>
  value === 'instagram' ? 'instagram' : 'whatsapp';

const CONNECTORS = new Set(['de', 'da', 'do', 'dos', 'das', 'e']);

/**
 * Iniciais para o avatar: duas letras do nome (sem "de", "do"...), ou a
 * primeira do @. "Cliente do Instagram" vira "CI"; "Ana de Souza", "AS".
 */
export function initialsOf(displayName: string): string {
  const clean = displayName.replace(/^@/, '').trim();
  if (!clean) return '?';
  if (displayName.startsWith('@')) return clean[0]!.toUpperCase();
  const words = clean.split(/\s+/);
  const significant = words.filter((w) => !CONNECTORS.has(w.toLowerCase()));
  return (significant.length > 0 ? significant : words)
    .map((n) => n[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2);
}
