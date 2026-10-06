import { logger } from '@/lib/logger';
import { INSTAGRAM_COMPOSER_TEXT, INSTAGRAM_TEXT_MAX_BYTES, utf8ByteLength } from '@/lib/instagram/reply';
import type { IWhatsAppProvider } from '@/services/whatsapp';

/**
 * A resposta do inbox para um cliente do Instagram, do INSERT ao id da Meta.
 *
 *   1. grava a linha com a SESSÃO do usuário ('pending', sem mid, sem
 *      created_at — o relógio é o do banco, porque o casamento do eco mede
 *      "há 2 minutos" contra now()). As triggers registram autor e participante.
 *   2. envia pelo adapter (instagram-send-message).
 *   3. sucesso: UPDATE status 'sent' + o message_id no mid. Se o UPDATE bater
 *      no índice único (23505) — o eco chegou antes e NÃO casou com a linha —
 *      chama reconcile_instagram_send, que funde o eco nesta linha. Nunca
 *      falha calado.
 *   4. falha: 'failed', mas só se a linha ainda não tem mid: se o eco já a
 *      casou, a mensagem SAIU (o erro foi no caminho de volta) e ela fica
 *      'sent'.
 *
 * O cliente do Supabase é injetado para o teste não depender do componente.
 */

type SupabaseLike = {
  from: (table: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => any;
};

export interface SendInstagramReplyInput {
  client: SupabaseLike;
  adapter: Pick<IWhatsAppProvider, 'sendText'>;
  tenantId: string;
  instanceId: string;
  contactId: string;
  /** IGSID do cliente (`contacts.external_id`). */
  recipientId: string;
  text: string;
}

export type SendInstagramReplyResult =
  | { ok: true; messageRowId: string; reconciled?: string; warning?: string }
  | { ok: false; reason: string; error: string; messageRowId?: string };

export async function sendInstagramReply(input: SendInstagramReplyInput): Promise<SendInstagramReplyResult> {
  const { client, adapter, tenantId, instanceId, contactId, recipientId, text } = input;

  const bytes = utf8ByteLength(text);
  if (bytes > INSTAGRAM_TEXT_MAX_BYTES) {
    return { ok: false, reason: 'too_long', error: INSTAGRAM_COMPOSER_TEXT.tooLong(bytes) };
  }
  if (!recipientId) {
    return { ok: false, reason: 'contact_not_found', error: 'Este contato não tem identificação do Instagram.' };
  }

  // 1. A linha, com a sessão do usuário.
  const inserted = await client
    .from('messages')
    .insert({
      tenant_id: tenantId,
      whatsapp_instance_id: instanceId,
      contact_id: contactId,
      direction: 'outbound',
      message_type: 'text',
      content: text,
      status: 'pending',
      is_from_bot: false,
    })
    .select('id')
    .single();

  if (inserted.error || !inserted.data?.id) {
    logger.error('[sendInstagramReply] não gravou a linha', { code: inserted.error?.code ?? null });
    return { ok: false, reason: 'insert_failed', error: 'Não foi possível registrar a mensagem. Nada foi enviado.' };
  }
  const rowId: string = inserted.data.id;

  // 2. O envio.
  const result = await adapter.sendText(recipientId, text);

  if (result.status !== 'sent' && result.status !== 'pending') {
    // 4. Falhou. Só vira 'failed' se nenhum eco já provou que saiu.
    const upd = await client
      .from('messages')
      .update({ status: 'failed' })
      .eq('id', rowId)
      .is('evolution_message_id', null);
    if (upd?.error) {
      logger.warn('[sendInstagramReply] não marcou failed', { code: upd.error.code ?? null });
    }
    return {
      ok: false,
      reason: result.reason ?? 'unknown',
      error: result.error ?? 'O Instagram recusou a mensagem.',
      messageRowId: rowId,
    };
  }

  const mid = result.providerMessageId;
  if (!mid) {
    // Documentado que a Meta sempre devolve o id. Sem ele, a linha fica
    // 'pending' de propósito: é o estado em que o eco ainda consegue casá-la
    // pelo texto (e aí vira 'sent'). Marcar 'sent' sem mid tiraria a linha
    // do casamento e o eco viraria uma segunda linha.
    logger.warn('[sendInstagramReply] envio aceito sem message_id; aguardando o eco');
    return { ok: true, messageRowId: rowId, warning: 'sem_message_id' };
  }

  // 3. O id da Meta na linha.
  const upd = await client
    .from('messages')
    .update({ status: 'sent', evolution_message_id: mid })
    .eq('id', rowId);

  if (!upd?.error) return { ok: true, messageRowId: rowId };

  if (upd.error.code === '23505') {
    // O eco chegou antes, não casou, e gravou a própria linha com este mid.
    const rec = await client.rpc('reconcile_instagram_send', { p_message_id: rowId, p_mid: mid });
    const outcome: string | undefined = rec?.data?.outcome;
    if (!rec?.error && (outcome === 'merged' || outcome === 'attached' || outcome === 'already')) {
      logger.info('[sendInstagramReply] conflito do mid reconciliado', { outcome });
      return { ok: true, messageRowId: rowId, reconciled: outcome };
    }
    logger.error('[sendInstagramReply] conflito do mid NÃO reconciliado', {
      outcome: outcome ?? null,
      code: rec?.error?.code ?? null,
    });
    // A mensagem saiu. Tira o relógio da linha sem mexer no mid.
    await client.from('messages').update({ status: 'sent' }).eq('id', rowId);
    return {
      ok: true,
      messageRowId: rowId,
      warning: 'Mensagem enviada, mas o registro dela pode aparecer duas vezes nesta conversa.',
    };
  }

  logger.error('[sendInstagramReply] UPDATE do mid falhou', { code: upd.error.code ?? null });
  await client.from('messages').update({ status: 'sent' }).eq('id', rowId);
  return { ok: true, messageRowId: rowId, warning: 'Mensagem enviada, mas o registro dela não foi atualizado.' };
}
