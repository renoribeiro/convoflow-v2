// =============================================================================
// A oferta do teste grátis na tela de bloqueio
// =============================================================================
// Sem dependências (nada de supabase aqui): é importado também pela ajuda.
//
// TRIAL_OFFER_ENABLED diz se a tela de bloqueio PROMETE o teste grátis a uma
// Conta que nunca assinou. Ela só pode ser `true` quando o servidor de fato dá o
// teste — ou seja, quando o create-checkout-session com `trial_period_days`
// estiver no ar. Hoje (2026-09-26) ele está SEGURADO na v50, sem teste, por
// decisão do dono: prometer "você não paga nada hoje" e o Stripe cobrar na hora
// seria enganar o cliente. Por isso nasce `false`, e a tela de bloqueio fica
// exatamente como era.
//
// Ligar: no MESMO momento do deploy do create-checkout-session com teste
// (docs/RUNBOOK_teste_gratis.md). O cadastro pelo site
// (src/lib/signup/release.ts) exige esta chave ligada — há teste para isso.
// =============================================================================

export const TRIAL_OFFER_ENABLED = false;

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
