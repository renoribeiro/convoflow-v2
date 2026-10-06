// =============================================================================
// meta-webhook-delivery.ts — o que o meta-webhook precisa saber sobre UMA
// entrega, sem I/O (mesma convenção de `instance-access.ts`).
// =============================================================================
// Existe por causa da troca de app da Meta (2026-09): durante a janela em que
// os dois apps estão inscritos na mesma WABA, cada evento chega DUAS vezes,
// assinado por secrets diferentes. Duas coisas precisam ser observáveis e
// seguras nessa janela:
//
//   1. QUAL app entregou (`primary` / `secondary`) — é o que diz "o app antigo
//      parou de entregar", o sinal para limpar os secrets `_SECONDARY`.
//      Antes, o slot só saía no log do handshake GET; entrega nenhuma dizia
//      de onde veio.
//   2. A segunda entrega do MESMO wamid não pode disparar o chatbot de novo.
//      O dedupe do handler é um SELECT antes do INSERT; duas entregas dentro
//      da mesma janela de milissegundos passam pelo SELECT as duas, e a
//      segunda morre no índice único `idx_messages_evolution_message_id_unique`
//      (23505) DENTRO da RPC process_incoming_message. O handler ignorava esse
//      erro e seguia para os efeitos colaterais — resposta do bot em dobro.
//      `isDuplicateInsertError` é o que o handler consulta para parar ali.
// =============================================================================

export type MetaAppSlot = 'primary' | 'secondary';

/** Índice devolvido por verifyMetaSignatureAny → nome do slot para o log. */
export function appSlotName(signedBy: number): MetaAppSlot | 'unknown' {
  if (signedBy === 0) return 'primary';
  if (signedBy === 1) return 'secondary';
  return 'unknown';
}

/**
 * Erro de PostgREST/Supabase que significa "outra entrega deste wamid chegou
 * primeiro": unique_violation (23505). Qualquer outro erro NÃO é duplicata e
 * o handler segue o caminho de sempre.
 */
export function isDuplicateInsertError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; message?: unknown };
  if (e.code === '23505') return true;
  // PostgREST às vezes só repassa a mensagem do Postgres.
  return typeof e.message === 'string' && /duplicate key value violates unique constraint/i.test(e.message);
}

export interface DeliverySummary {
  /** WABAs (entry.id) presentes no payload. */
  wabaIds: string[];
  /** phone_number_id de cada bloco `messages`. */
  phoneNumberIds: string[];
  messages: number;
  statuses: number;
  /** Outros campos (account_update, phone_number_quality_update...). */
  otherFields: string[];
}

/** Resumo de um payload de webhook para UM log por request — sem conteúdo. */
export function summarizeDelivery(payload: unknown): DeliverySummary {
  const out: DeliverySummary = { wabaIds: [], phoneNumberIds: [], messages: 0, statuses: 0, otherFields: [] };
  const entries = (payload as { entry?: unknown })?.entry;
  if (!Array.isArray(entries)) return out;
  for (const entry of entries) {
    const id = (entry as { id?: unknown })?.id;
    if (typeof id === 'string' && !out.wabaIds.includes(id)) out.wabaIds.push(id);
    const changes = (entry as { changes?: unknown })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const field = (change as { field?: unknown })?.field;
      if (field !== 'messages') {
        if (typeof field === 'string' && !out.otherFields.includes(field)) out.otherFields.push(field);
        continue;
      }
      const value = (change as { value?: { metadata?: { phone_number_id?: unknown }; messages?: unknown; statuses?: unknown } })?.value;
      const pnid = value?.metadata?.phone_number_id;
      if (typeof pnid === 'string' && !out.phoneNumberIds.includes(pnid)) out.phoneNumberIds.push(pnid);
      if (Array.isArray(value?.messages)) out.messages += value!.messages.length;
      if (Array.isArray(value?.statuses)) out.statuses += value!.statuses.length;
    }
  }
  return out;
}
