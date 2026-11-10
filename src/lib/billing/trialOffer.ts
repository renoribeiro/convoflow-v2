// =============================================================================
// A oferta do teste grátis na tela de bloqueio
// =============================================================================
// Sem dependências (nada de supabase aqui): é importado também pela ajuda.
//
// TRIAL_OFFER_ENABLED diz se a tela de bloqueio PROMETE o teste grátis a uma
// Conta que nunca assinou. Desde a sessão 2 (2026-11-09) ela SEGUE a chave do
// cadastro pelo site (src/lib/signup/chave.ts), e o servidor também: o
// create-checkout-session só dá o teste com o secret PUBLIC_SIGNUP_ENABLED
// ligado. Assim a tela e o pagamento nunca discordam: com o cadastro
// desligado, a tela diz "Assinar agora" e o pagamento cobra no dia.
//
// Mesmo ligada, o teste só aparece para a Conta que nunca assinou e cujo CNPJ
// ou CPF nunca teve teste (public.teste_gratis_disponivel).
// =============================================================================

import { PUBLIC_SIGNUP_ENABLED } from '@/lib/signup/chave';

export const TRIAL_OFFER_ENABLED: boolean = PUBLIC_SIGNUP_ENABLED;

/**
 * Dias de teste. Cópia de TRIAL_DAYS em
 * supabase/functions/_shared/subscription-state.ts — o teste
 * src/lib/billing/paywallState.test.ts exige que sejam iguais.
 */
export const TRIAL_DAYS = 7;

/**
 * Como cancelar durante o teste, dito ao cliente ANTES de ele cadastrar o
 * cartão. Desde a entrega 3 é o botão da aba Assinatura (o Gerente cancela
 * sozinho, e nada é cobrado no fim do teste). Usada também pela ajuda
 * 'page:paywall' e pelo tutorial 'teste-gratis'.
 */
export const COMO_CANCELAR_NO_TESTE =
  'é só clicar em "Cancelar assinatura", em Configurações › Assinatura, antes dessa data';

/** "dd/mm/aaaa" do dia em que a primeira cobrança acontece (hoje + TRIAL_DAYS), no fuso de Brasília. */
export function trialChargeDateLabel(now: Date = new Date(), days: number = TRIAL_DAYS): string {
  const fim = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return fim.toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
