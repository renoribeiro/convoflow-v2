/**
 * Derivação das vagas extras a partir da assinatura, para o `stripe-webhook`.
 *
 * Duas coisas podem dar errado aqui, e elas merecem destinos diferentes:
 *
 *   1. A releitura da assinatura no Stripe falha (rede, timeout, chave). É
 *      transitório: devolvemos null, o handler NÃO toca em
 *      `tenants.store_slots_extra` e o resto do evento segue. Gravar 0 numa
 *      Conta que pagou por vagas seria pior que não gravar.
 *
 *   2. A derivação em si lança (defeito de código: import faltando, formato
 *      inesperado). Isso NÃO é transitório e NÃO pode virar null em silêncio:
 *      foi exatamente assim que, de 2026-08-18 a 2026-09-16, o webhook nunca
 *      escreveu a coluna — o `ReferenceError` de uma função sem import caía no
 *      mesmo catch da chamada ao Stripe e virava "inalterado" no log. Agora o
 *      erro sobe, o handler responde 500, o Stripe reenvia o evento (até três
 *      dias em produção) e a entrega aparece como FALHA no painel do Stripe.
 *      O reenvio é seguro: a guarda por `stripe_event_id` só grava o log
 *      DEPOIS do processamento, então um evento que falhou ainda não está
 *      registrado e é reprocessado do zero.
 *
 * Só o passo 1 fica dentro do try. Recebe a função de busca por parâmetro para
 * ser testável sem Deno nem Stripe (mesma convenção de `store-slots.ts`).
 */
import { slotQuantityFromSubscription, type SubscriptionLike } from './store-slots.ts';

export type FetchSubscription = (subscriptionId: string) => Promise<unknown>;

export async function deriveExtraSlots(
  fetchSubscription: FetchSubscription,
  subscriptionId: string,
  slotPriceId: string,
): Promise<number | null> {
  if (!slotPriceId) return null;   // sem Price de vaga configurado, não mexe

  let subscription: unknown;
  try {
    subscription = await fetchSubscription(subscriptionId);
  } catch (e) {
    const err = e as { name?: unknown; message?: unknown } | null | undefined;
    const name = typeof err?.name === 'string' && err.name ? err.name : 'Error';
    const message = typeof err?.message === 'string' ? err.message : String(e);
    console.error(`Falha ao reler assinatura ${subscriptionId} para derivar vagas [${name}]: ${message}`);
    return null;
  }

  // Fora do try de propósito: se isto lançar, é bug, e bug tem que aparecer.
  return slotQuantityFromSubscription(subscription as SubscriptionLike, slotPriceId);
}
