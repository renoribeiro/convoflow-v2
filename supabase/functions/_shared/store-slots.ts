// =============================================================================
// store-slots.ts — regras puras das vagas de Loja extras
// =============================================================================
// Mesma convenção de `store-creation.ts` e `capabilities.ts`: só decisão, zero
// I/O, para o Vitest (Node) conseguir testar sem subir o Deno nem falar com o
// Stripe.
//
// O DEFEITO QUE ISTO EXISTE PARA CONSERTAR (achado em 2026-08-18):
//
//   1. `create-checkout-session` recusa com 409 quando a Conta já assina. Como
//      comprar vaga extra era feito por CHECKOUT, uma Conta assinante nunca
//      conseguia contratar mais nenhuma Loja.
//
//   2. `stripe-webhook` fazia `store_slots_extra: extraSlots`, lendo o metadata
//      da sessão — ATRIBUIÇÃO, não soma. Se o 409 fosse simplesmente removido,
//      um segundo checkout de "+1 loja" gravaria 1 por cima de um 3 existente e
//      a Conta PERDERIA capacidade. Com Lojas já criadas acima do novo teto, o
//      trigger `enforce_store_slot_capacity` não desfaz nada (ele só olha
//      INSERT/UPDATE de tenants) — a Conta ficaria acima do limite em silêncio.
//
// A CORREÇÃO é parar de confiar em metadata e DERIVAR a quantidade da própria
// assinatura: a linha do item de vaga é a verdade. Derivar também torna o
// webhook idempotente e imune à ordem de chegada dos eventos — em 2026-07-27 os
// dois eventos do único checkout real chegaram fora de ordem
// (invoice.payment_succeeded ANTES de checkout.session.completed).
// =============================================================================

import { can, normalizeRole, type Capability } from './capabilities.ts';

// -----------------------------------------------------------------------------
// Permissão
// -----------------------------------------------------------------------------

/**
 * Contratar vaga de Loja mexe na assinatura da CONTA. Mesmo recorte de quem
 * pode ver cobrança: gerente e superadmin. `billing.manage` NÃO serve aqui —
 * ela é verdadeira para o gestor (foi criada para o checkout da Loja, num
 * modelo que não existe mais desde que só a Conta assina).
 */
export const SLOT_PURCHASE_CAPABILITY: Capability = 'billing.view';

export const SLOT_PURCHASE_DENIAL =
  'Apenas o Gerente responsável pela Conta pode contratar Lojas adicionais.';

export interface SlotCaller {
  role: string;
  tenant_id: string | null;
  status: string;
  capabilities: Record<string, unknown> | null;
}

export interface SlotAccountRow {
  id: string;
  kind: string;
  subscription_id: string | null;
  subscription_status: string | null;
  store_slots_included: number | null;
  store_slots_extra: number | null;
}

/**
 * Status em que a Conta pode mudar as vagas na assinatura existente. É
 * `SUBSCRIPTION_UNLOCKING_STATUSES` (subscription-state.ts) MENOS o
 * `past_due`: com o cartão recusando, o sistema segue aberto, mas não se
 * contrata mais nada.
 */
export const SLOT_PURCHASE_STATUSES: readonly string[] = ['active', 'trialing'];

export type SlotAuthz =
  | { ok: true }
  | { ok: false; status: number; error: string };

/** Quem pode mexer nas vagas, e sob qual tenant. */
export function authorizeSlotChange(caller: SlotCaller, account: SlotAccountRow | null): SlotAuthz {
  if (caller.status !== 'active') {
    return { ok: false, status: 403, error: 'Sua conta não está ativa.' };
  }
  if (!can(normalizeRole(caller.role) ?? '', SLOT_PURCHASE_CAPABILITY, caller.capabilities)) {
    return { ok: false, status: 403, error: SLOT_PURCHASE_DENIAL };
  }
  if (!account) {
    return { ok: false, status: 404, error: 'Conta não encontrada.' };
  }
  // Só a CONTA assina. Uma Loja não tem assinatura própria — ela herda o acesso
  // da Conta (ver a RPC tenant_access_state, migração 20260818000001).
  if (account.kind !== 'account') {
    return {
      ok: false,
      status: 403,
      error: 'As Lojas adicionais são contratadas pela Conta, não pela Loja.',
    };
  }
  // Pagamento pendente: o cartão falhou e o Stripe está tentando de novo. A
  // Conta segue liberada (carência), mas não soma cobrança nova a um cartão
  // que está recusando.
  if (account.subscription_status === 'past_due' && account.subscription_id) {
    return {
      ok: false,
      status: 409,
      error: 'Há um pagamento pendente nesta Conta. Atualize o cartão antes de contratar Lojas adicionais.',
    };
  }
  // Ativa ou em teste grátis. No teste, a Loja adicional também fica sem
  // custo até o fim do teste (o Stripe gera fatura de R$ 0 para o item).
  if (!SLOT_PURCHASE_STATUSES.includes(account.subscription_status ?? '') || !account.subscription_id) {
    return {
      ok: false,
      status: 409,
      error: 'Esta Conta ainda não tem uma assinatura ativa. Assine o plano antes de contratar Lojas adicionais.',
    };
  }
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Quantidade pedida
// -----------------------------------------------------------------------------

export const SLOT_MIN = 0;
export const SLOT_MAX = 100;

export type SlotQuantityCheck =
  | { ok: true; value: number }
  | { ok: false; error: string };

/**
 * A quantidade TOTAL de vagas extras que a Conta passará a ter — não o quanto
 * somar. Total é o que o Stripe guarda no item da assinatura, então pedir o
 * total elimina a diferença entre "somar 2" e "ficar com 2", que é justamente
 * onde o defeito de atribuição-vs-soma nasceu.
 */
export function validateSlotQuantity(input: unknown): SlotQuantityCheck {
  // `Number()` é generoso demais para uma entrada que vem da rede: null, '',
  // false e [] viram 0 — ou seja, "apague todas as vagas extras" por omissão.
  // Aceitamos só número de verdade ou string numérica não vazia.
  let n: number;
  if (typeof input === 'number') {
    n = input;
  } else if (typeof input === 'string' && input.trim() !== '') {
    n = Number(input);
  } else {
    return { ok: false, error: 'Informe um número inteiro de Lojas adicionais.' };
  }

  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return { ok: false, error: 'Informe um número inteiro de Lojas adicionais.' };
  }
  if (n < SLOT_MIN) {
    return { ok: false, error: 'A quantidade não pode ser negativa.' };
  }
  if (n > SLOT_MAX) {
    return { ok: false, error: `O máximo é ${SLOT_MAX} Lojas adicionais.` };
  }
  return { ok: true, value: n };
}

// -----------------------------------------------------------------------------
// A trava que impede perder capacidade
// -----------------------------------------------------------------------------

export type CapacityCheck = { ok: true } | { ok: false; error: string };

/**
 * Reduzir vagas não pode deixar a Conta com menos capacidade do que Lojas em
 * uso. O trigger do banco NÃO cobre isso: `enforce_store_slot_capacity` roda em
 * INSERT/UPDATE de `tenants` (a Loja), não quando as vagas da Conta encolhem.
 * Sem esta checagem a Conta ficaria acima do limite em silêncio, e a próxima
 * criação de Loja falharia com uma mensagem que não explica nada.
 */
export function checkCapacityFits(
  novoExtra: number,
  included: number | null,
  lojasEmUso: number,
): CapacityCheck {
  const capacidade = (included ?? 0) + novoExtra;
  if (lojasEmUso > capacidade) {
    return {
      ok: false,
      error:
        `A Conta tem ${lojasEmUso} ${lojasEmUso === 1 ? 'Loja' : 'Lojas'} em uso e ` +
        `essa mudança deixaria só ${capacidade} ${capacidade === 1 ? 'vaga' : 'vagas'}. ` +
        'Exclua Lojas antes de reduzir.',
    };
  }
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Derivar a quantidade da assinatura — o coração do conserto
// -----------------------------------------------------------------------------

/** O mínimo que precisamos de um item de assinatura do Stripe. */
export interface SubscriptionItemLike {
  id?: string;
  quantity?: number | null;
  price?: { id?: string | null } | null;
}

export interface SubscriptionLike {
  items?: { data?: SubscriptionItemLike[] | null } | null;
}

/** O item da assinatura que representa a vaga de Loja, se existir. */
export function findSlotItem(
  subscription: SubscriptionLike | null | undefined,
  slotPriceId: string,
): SubscriptionItemLike | null {
  const itens = subscription?.items?.data ?? [];
  return itens.find((i) => i?.price?.id === slotPriceId) ?? null;
}

/**
 * Quantas vagas extras a assinatura declara HOJE.
 *
 * É esta função que substitui o `store_slots_extra: metadata.extra_slots`. A
 * assinatura é a fonte da verdade: derivar dela dá o mesmo resultado
 * independentemente de qual evento chegou, em que ordem, ou quantas vezes —
 * ou seja, o webhook vira idempotente de graça.
 *
 * Sem item de vaga = zero extras. Não é erro: é uma Conta só com o plano base.
 */
export function slotQuantityFromSubscription(
  subscription: SubscriptionLike | null | undefined,
  slotPriceId: string,
): number {
  const item = findSlotItem(subscription, slotPriceId);
  const q = item?.quantity;
  if (typeof q !== 'number' || !Number.isFinite(q) || q < 0) return 0;
  return Math.floor(q);
}

/**
 * O que fazer no Stripe para a assinatura passar a ter `desejado` vagas.
 *
 *   sem item + desejado > 0  → criar o item
 *   com item + desejado > 0  → atualizar a quantidade
 *   com item + desejado = 0  → remover o item (não deixar item com quantidade
 *                              zero, que continuaria aparecendo na fatura)
 *   sem item + desejado = 0  → nada a fazer
 */
export type SlotPlan =
  | { acao: 'nada' }
  | { acao: 'criar'; quantidade: number }
  | { acao: 'atualizar'; itemId: string; quantidade: number }
  | { acao: 'remover'; itemId: string };

export function planSlotChange(
  subscription: SubscriptionLike | null | undefined,
  slotPriceId: string,
  desejado: number,
): SlotPlan {
  const item = findSlotItem(subscription, slotPriceId);
  const atual = slotQuantityFromSubscription(subscription, slotPriceId);

  if (!item) {
    return desejado > 0 ? { acao: 'criar', quantidade: desejado } : { acao: 'nada' };
  }
  if (desejado === 0) {
    return item.id ? { acao: 'remover', itemId: item.id } : { acao: 'nada' };
  }
  if (desejado === atual) return { acao: 'nada' };
  return item.id
    ? { acao: 'atualizar', itemId: item.id, quantidade: desejado }
    : { acao: 'criar', quantidade: desejado };
}

/**
 * Chave de idempotência do pedido. Duas requisições iguais (clique duplo, retry
 * do navegador) viram UMA operação no Stripe — sem isso, cobra duas vezes.
 */
export function slotIdempotencyKey(
  tenantId: string,
  subscriptionId: string,
  desejado: number,
): string {
  return `slots:${tenantId}:${subscriptionId}:${desejado}`;
}
