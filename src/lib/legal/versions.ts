// =============================================================================
// Versões dos Termos de Uso e da Política de Privacidade
// =============================================================================
// A versão é a data de "Última atualização" de cada página. O cadastro pelo
// site grava a versão aceita junto com a data do aceite (signup_requests).
//
// Cópia no servidor: SIGNUP_TERMS_VERSION / SIGNUP_PRIVACY_VERSION em
// supabase/functions/_shared/public-signup.ts — o servidor recusa (409) um
// aceite de versão diferente da dele, e src/lib/signup/publicSignupHandler.test.ts
// exige que as duas cópias sejam iguais. Mudou uma página, mude os dois lados
// e a data na página.
// =============================================================================

/** TermsOfService.tsx — "Última atualização: 10 de outubro de 2026" (cobrança do atendente adicional: 4.1, 4.3 e 4.7). */
export const TERMS_VERSION = '2026-10-10';

/** PrivacyPolicy.tsx — "Última atualização: 12 de setembro de 2026". */
export const PRIVACY_VERSION = '2026-09-12';
