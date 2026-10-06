// =============================================================================
// Qual tela de bloqueio mostrar
// =============================================================================
// Sem dependências: a PaywallScreen decide o texto por aqui, e o teste cobre
// cada caso sem montar a tela (src/lib/billing/paywallState.test.ts).
//
//   sem-pagamento  gestor/atendente, ou checkout desligado: ninguém aqui paga
//   confirmando    voltou do Stripe (?checkout=success) e o webhook ainda não
//                  liberou a Conta: "confirmando seu pagamento", sem botão de
//                  pagar (um segundo checkout criaria uma segunda assinatura)
//   teste-gratis   gerente de uma Conta que NUNCA assinou, com a oferta ligada
//   assinar        gerente de uma Conta que já assinou (voltou a travar), ou
//                  quando não dá para saber — na dúvida, não se promete teste
// =============================================================================

export type PaywallVariant = 'sem-pagamento' | 'confirmando' | 'teste-gratis' | 'assinar';

export type CheckoutReturn = 'success' | 'cancel' | null;

/** Lê o `?checkout=` com que o Stripe devolve a pessoa. */
export function checkoutReturnFrom(search: string | null | undefined): CheckoutReturn {
  const valor = new URLSearchParams(search ?? '').get('checkout');
  return valor === 'success' || valor === 'cancel' ? valor : null;
}

export interface PaywallInputs {
  role: string | null;
  checkoutEnabled: boolean;
  trialOfferEnabled: boolean;
  /**
   * A Conta de cobrança do gerente nunca teve assinatura
   * (`tenants.subscription_id` nulo — a mesma regra do servidor em
   * trialDaysForCheckout). `null` = não se sabe (carregando, erro, sem Conta).
   */
  contaNuncaAssinou: boolean | null;
  retorno: CheckoutReturn;
}

export function paywallVariant(i: PaywallInputs): PaywallVariant {
  if (i.role !== 'gerente' || !i.checkoutEnabled) return 'sem-pagamento';
  if (i.retorno === 'success') return 'confirmando';
  if (i.trialOfferEnabled && i.contaNuncaAssinou === true) return 'teste-gratis';
  return 'assinar';
}

/** De quanto em quanto tempo a tela "confirmando" pergunta de novo. */
export const CONFIRMACAO_INTERVALO_MS = 3_000;

/** Depois disso, a tela admite que está demorando e oferece suporte. */
export const CONFIRMACAO_LIMITE_MS = 120_000;
