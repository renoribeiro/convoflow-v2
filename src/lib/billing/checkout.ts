// =============================================================================
// billing/checkout — a fonte única do plano e do checkout do Stripe
// =============================================================================
// Existiam DUAS constantes `CHECKOUT_ENABLED`, com valores OPOSTOS:
//
//   PaywallScreen.tsx        CHECKOUT_ENABLED = false
//   SubscriptionSettings.tsx CHECKOUT_ENABLED = true
//
// O efeito prático era o pior possível: a tela que BLOQUEIA não cobrava, e a
// tela que COBRA ficava atrás do bloqueio. Quem caía no paywall não tinha saída
// nenhuma — o botão só abria um toast dizendo "em breve".
//
// A decisão mora aqui, uma vez só. As duas telas importam deste arquivo e não
// podem mais discordar.
//
// SERVIDOR. Quem realmente autoriza é `create-checkout-session`:
//   - resolve o tenant pelo JWT (ninguém paga pela Conta de outro);
//   - exige `profiles.status = 'active'`;
//   - exige a capacidade `billing.manage` (nega o atendente);
//   - exige `tenants.kind = 'account'` (nega o gestor, cuja Loja não assina);
//   - devolve 409 se a Conta já tem assinatura ativa;
//   - devolve 500 "Cobrança ainda não configurada." se faltar
//     STRIPE_SECRET_KEY ou STRIPE_PRICE_GERENTE.
// Os cinco casos chegam aqui como texto em pt-BR escrito pelo servidor. Este
// módulo não os traduz nem os esconde: repassa. Botão que falha calado é o
// defeito que estamos consertando — não vale trocá-lo por outro.
// =============================================================================

import { supabase } from '@/integrations/supabase/client';
import { getRewardfulReferral } from '@/lib/rewardful';
import { mensagemDaEdgeFunction } from '@/lib/edgeFunctionError';

/**
 * Liga o checkout online.
 *
 * `true` desde 2026-08-19. Não é novidade nem risco novo: a aba
 * Configurações › Assinatura já chama esta mesma edge function em produção
 * desde 2026-07-27, com os Prices e a chave secreta em ENV secrets do lado do
 * servidor. O que muda é o paywall passar a usar o MESMO caminho, em vez de um
 * toast de "em breve".
 *
 * Se um dia a cobrança sair do ar, ponha `false` AQUI: as duas telas passam a
 * mostrar o caminho de contato em vez do botão, juntas.
 */
export const CHECKOUT_ENABLED = true;

// --------------------------------------------------------------- Plano
export const PLAN_NAME = 'Plano Gerente';
export const PLAN_PRICE_LABEL = 'R$ 499,90';
export const INCLUDED_SLOTS = 5;
export const SLOT_PRICE_LABEL = 'R$ 99,90';

/** O que o plano entrega. Usado no paywall do Gerente. */
export const PLAN_FEATURES = [
  'Conversas e multi-atendimento',
  'Contatos e Funil de Vendas',
  'Chatbots e Automação',
  'Campanhas e Follow-ups',
  'Relatórios e Rastreamento',
] as const;

// --------------------------------------------------------------- Suporte
// O mesmo contato publicado na landing (CTASection e LandingFooter) e nas
// páginas legais — o único canal de suporte do produto. Fica aqui para que a
// tela de bloqueio nunca seja um beco sem saída, mesmo quando o checkout está
// fora do ar.
export const SUPORTE_EMAIL = 'contato@convoflow.com.br';

export const CHECKOUT_DESLIGADO_MENSAGEM =
  'A assinatura online está temporariamente indisponível. Fale com o suporte para liberar seu acesso.';

/** Erro de "o botão está desligado", separado de "o servidor recusou". */
export class CheckoutDesligadoError extends Error {
  constructor() {
    super(CHECKOUT_DESLIGADO_MENSAGEM);
    this.name = 'CheckoutDesligadoError';
  }
}

export interface PedidoDeCheckout {
  /** Lojas extras contratadas junto da assinatura (0..100). */
  extraSlots?: number;
}

/**
 * Cria a sessão de Checkout e devolve a URL do Stripe para redirecionar.
 *
 * SEMPRE lança com a frase que o SERVIDOR escreveu, em pt-BR — nunca com a
 * frase genérica "Edge Function returned a non-2xx status code", que é o que
 * `supabase.functions.invoke` entrega quando ninguém abre o corpo da resposta
 * (ver src/lib/edgeFunctionError.ts).
 */
export async function criarSessaoDeCheckout(pedido: PedidoDeCheckout = {}): Promise<string> {
  if (!CHECKOUT_ENABLED) throw new CheckoutDesligadoError();

  // Se o visitante veio por indicação (Rewardful), anexa o referral ao checkout.
  const referral = getRewardfulReferral();
  const payload = referral ? { ...pedido, referral } : pedido;

  const { data, error } = await supabase.functions.invoke('create-checkout-session', {
    body: payload,
  });

  if (error) {
    throw new Error(
      await mensagemDaEdgeFunction(error, 'Não foi possível iniciar o pagamento. Tente de novo.'),
    );
  }

  // Algumas respostas 200 antigas carregam { error } no corpo.
  if (data?.error) {
    const mensagem = typeof data.error === 'string' ? data.error : data.error?.message;
    throw new Error(mensagem || 'Não foi possível iniciar o pagamento. Tente de novo.');
  }

  if (!data?.url || typeof data.url !== 'string') {
    throw new Error('O Stripe não devolveu o endereço de pagamento. Tente de novo em alguns minutos.');
  }

  return data.url;
}
