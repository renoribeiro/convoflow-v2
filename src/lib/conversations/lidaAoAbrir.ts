/**
 * Abrir a conversa marca como lida também para o cliente: os dois riscos
 * azuis, como o próprio WhatsApp faz (lote 6d, decisão D4 do dono).
 *
 * A regra de QUANDO mora no ChatWindow: só a conversa aberta, só com a tela
 * visível. Conversa que a pessoa não abriu nunca manda recibo. Aqui fica o
 * QUÊ: das mensagens do cliente ainda não lidas, os ids do WhatsApp que valem
 * um recibo.
 */
export interface MensagemParaLida {
  direction: string;
  status: string | null;
  message_type?: string | null;
  /** O id da mensagem no WhatsApp (wamid.* na Meta, key.id no Evolution). */
  evolution_message_id?: string | null;
}

/** Reação e mensagem apagada não têm recibo de leitura no WhatsApp. */
const SEM_RECIBO = new Set(['reaction', 'deleted']);

export const MAXIMO_DE_RECIBOS = 50;

/** As do cliente que ainda não foram lidas aqui. */
export function naoLidasDoCliente<T extends MensagemParaLida>(mensagens: readonly T[]): T[] {
  return mensagens.filter((m) => m.direction === 'inbound' && m.status !== 'read');
}

/** Os ids do WhatsApp para o recibo, na ordem, a última no fim (até 50). */
export function idsParaMarcarComoLidas(mensagens: readonly MensagemParaLida[]): string[] {
  const ids = naoLidasDoCliente(mensagens)
    .filter((m) => !SEM_RECIBO.has((m.message_type ?? 'text').toLowerCase()))
    .map((m) => (m.evolution_message_id ?? '').trim())
    .filter(Boolean);
  return [...new Set(ids)].slice(-MAXIMO_DE_RECIBOS);
}

/** Emojis da reação rápida na bolha (os do WhatsApp). */
export const REACOES_RAPIDAS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;
