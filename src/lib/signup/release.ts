// =============================================================================
// Chave do cadastro pelo site (teste grátis, entrega 2)
// =============================================================================
// O cadastro público está PRONTO e DESLIGADO. Ele só abre depois das entregas
// 3 (botão de cancelar) e 4 (página de vendas + Termos que falam do teste):
// sem elas, quem se cadastra aceitaria Termos que dizem que não há teste e não
// teria como cancelar pelo produto.
//
// DESLIGADO (false), que é o estado de hoje:
//   - os botões "Começar Agora" da página de vendas levam para o login
//     (/auth), como sempre levaram, e a página não fala em teste grátis;
//   - /cadastro e /register redirecionam para o login;
//   - o tutorial do teste grátis não aparece na Ajuda.
//
// LIGADO, os mesmos botões dizem "Começar teste grátis" e levam a /cadastro, e
// o preço, o topo, a chamada final e a FAQ explicam o teste (entrega 4).
//
// PARA LIGAR, as duas chaves juntas (docs/RUNBOOK_ligar_teste_gratis.md):
//   1. aqui, PUBLIC_SIGNUP_ENABLED = true (e TRIAL_OFFER_ENABLED = true em
//      src/lib/billing/trialOffer.ts — um teste exige o outro);
//   2. no Supabase, o secret PUBLIC_SIGNUP_ENABLED = true da função
//      public-signup (sem ele a função responde 503 a tudo).
// O servidor é a trava de verdade: com o front ligado e o secret desligado,
// ninguém se cadastra.
// =============================================================================

import { TRIAL_OFFER_ENABLED } from '@/lib/billing/trialOffer';

export const PUBLIC_SIGNUP_ENABLED = false;

/** A rota do formulário. */
export const SIGNUP_PATH = '/cadastro';

/** O login, destino dos botões enquanto o cadastro está desligado. */
export const LOGIN_PATH = '/auth';

/**
 * Para onde vai um botão de "começar" da página de vendas. O parâmetro existe
 * para o teste provar os dois lados da chave.
 */
export function signupEntryPath(enabled: boolean = PUBLIC_SIGNUP_ENABLED): string {
  return enabled ? SIGNUP_PATH : LOGIN_PATH;
}

/**
 * A página de vendas anuncia o teste grátis? Só com as DUAS chaves ligadas: o
 * cadastro (para o visitante ter onde pegar o teste) e a oferta do teste (para a
 * tela seguinte não cobrar no dia). Um teste já exige que o cadastro não ligue
 * sem a oferta; o `&&` é a mesma regra escrita onde o texto nasce, para nenhuma
 * combinação de chaves prometer o que o servidor não dá.
 */
export function salesTrialOn(
  signup: boolean = PUBLIC_SIGNUP_ENABLED,
  trial: boolean = TRIAL_OFFER_ENABLED,
): boolean {
  return signup && trial;
}

/** O rótulo de todo botão de "começar" da página de vendas, inclusive o do menu. */
export function startCtaLabel(on: boolean = salesTrialOn()): string {
  return on ? 'Começar teste grátis' : 'Começar Agora';
}
