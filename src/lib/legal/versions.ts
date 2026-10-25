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

/**
 * TermsOfService.tsx — "Última atualização: 25 de outubro de 2026" (complemento API e integrações: 4.1, 4.3,
 * 4.6, 4.7 e 8.3; no mesmo dia, item 2 e o novo 6.6: conexões não oficiais, Evolution e WAHA). A data não
 * mudou porque as duas mudanças são do mesmo dia, e o cadastro pelo site estava desligado entre elas.
 */
export const TERMS_VERSION = '2026-10-25';

/** PrivacyPolicy.tsx — "Última atualização: 25 de outubro de 2026" (API e integrações: seções 5, 6, 7 e 8). */
export const PRIVACY_VERSION = '2026-10-25';
