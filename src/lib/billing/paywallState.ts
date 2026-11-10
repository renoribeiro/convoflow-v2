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
  /**
   * O CNPJ ou CPF da Conta já teve teste grátis em outra Conta
   * (public.teste_gratis_disponivel = 'documento_ja_usou'). Um teste por
   * documento (sessão 2). `null` = não se sabe: não se promete teste.
   */
  documentoJaUsou?: boolean | null;
  retorno: CheckoutReturn;
}

export function paywallVariant(i: PaywallInputs): PaywallVariant {
  if (i.role !== 'gerente' || !i.checkoutEnabled) return 'sem-pagamento';
  if (i.retorno === 'success') return 'confirmando';
  if (i.trialOfferEnabled && i.contaNuncaAssinou === true && i.documentoJaUsou === false) return 'teste-gratis';
  return 'assinar';
}

/** A resposta de public.teste_gratis_disponivel, nas duas perguntas da tela. */
export function lerDisponibilidadeDoTeste(
  resposta: string | null | undefined,
): { contaNuncaAssinou: boolean | null; documentoJaUsou: boolean | null } {
  switch (resposta) {
    case 'disponivel':
      return { contaNuncaAssinou: true, documentoJaUsou: false };
    case 'documento_ja_usou':
      return { contaNuncaAssinou: true, documentoJaUsou: true };
    case 'conta_ja_assinou':
      return { contaNuncaAssinou: false, documentoJaUsou: null };
    default:
      return { contaNuncaAssinou: null, documentoJaUsou: null };
  }
}

/** De quanto em quanto tempo a tela "confirmando" pergunta de novo. */
export const CONFIRMACAO_INTERVALO_MS = 3_000;

/** Depois disso, a tela admite que está demorando e oferece suporte. */
export const CONFIRMACAO_LIMITE_MS = 120_000;
