/**
 * contact-link-reply.ts — a resposta no Instagram cancela os follow-ups do
 * WhatsApp da mesma pessoa, quando os dois contatos foram VINCULADOS à mão
 * (tabela contact_links, migração 20261009000001).
 *
 * Decisão do dono (2026-10-09): mesmo efeito de uma resposta no WhatsApp. Por
 * isso não há regra nova aqui — é `applyReplyCancellations`, a mesma função
 * dos webhooks do WhatsApp, chamada com o contato do WhatsApp do vínculo. As
 * preferências da Loja (agendado sim, tarefa manual não, por padrão) valem do
 * mesmo jeito.
 *
 * Só o instagram-webhook chama, e só para mensagem do CLIENTE gravada agora
 * (`outcome: 'stored'`, `direction: 'inbound'`). Eco (resposta dada pelo app do
 * Instagram) não é resposta do cliente; `duplicate` já foi tratado na primeira
 * entrega. Sem vínculo, nada acontece — o Instagram segue sem follow-up, como
 * sempre.
 *
 * Não-fatal: qualquer falha só vira log, nunca derruba a entrada da mensagem.
 */
import { applyReplyCancellations, type ReplyCancelResult } from './followup-reply.ts';

/** Ver a nota de `followup-reply.ts`: o mínimo do cliente, para o Vitest importar. */
type SupabaseLike = {
  from: (table: string) => any;
};

interface Logger {
  info?: (m: string, c?: unknown) => void;
  warn?: (m: string, c?: unknown) => void;
}

/** O que `process_instagram_message` devolve (só o que importa aqui). */
export interface InstagramRpcOutcome {
  outcome?: unknown;
  direction?: unknown;
  tenant_id?: unknown;
  contact_id?: unknown;
}

export interface LinkedCancelResult {
  whatsappContactId: string;
  result: ReplyCancelResult;
}

const asId = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

export async function cancelLinkedWhatsAppFollowups(
  supabase: SupabaseLike,
  rpc: InstagramRpcOutcome,
  logger?: Logger,
): Promise<LinkedCancelResult | null> {
  if (rpc.outcome !== 'stored' || rpc.direction !== 'inbound') return null;
  const tenantId = asId(rpc.tenant_id);
  const instagramContactId = asId(rpc.contact_id);
  if (!tenantId || !instagramContactId) return null;

  try {
    const { data, error } = await supabase
      .from('contact_links')
      .select('whatsapp_contact_id')
      .eq('tenant_id', tenantId)
      .eq('instagram_contact_id', instagramContactId)
      .maybeSingle();

    if (error) {
      logger?.warn?.('contact-link-reply: falha ao ler o vínculo; follow-ups do WhatsApp intactos', {
        tenantId,
        error: error.message,
      });
      return null;
    }

    const whatsappContactId = asId((data as { whatsapp_contact_id?: unknown } | null)?.whatsapp_contact_id);
    if (!whatsappContactId) return null;

    const result = await applyReplyCancellations(supabase, tenantId, whatsappContactId, logger);
    logger?.info?.('contact-link-reply: resposta no Instagram aplicada ao WhatsApp vinculado', {
      tenantId,
      ...result,
    });
    return { whatsappContactId, result };
  } catch (e) {
    logger?.warn?.('contact-link-reply falhou', { error: (e as Error)?.message });
    return null;
  }
}
