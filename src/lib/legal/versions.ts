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
 * TermsOfService.tsx — "Última atualização: 9 de novembro de 2026" (sessão 2 do cadastro: 4.3 com o
 * cartão antes do uso, um teste por CNPJ ou CPF e os limites do teste; 4.4 com o arrependimento junto
 * do teste e a devolução à mão; antes, 27/10/2026, lote 3 de textos: "O ConvoFlow" em
 * todo o texto, 6.4 com verbo, 8.1 e 8.2 numerados, "email" sem hífen; antes, 25/10/2026: complemento API e integrações: 4.1, 4.3,
 * 4.6, 4.7 e 8.3; no mesmo dia, item 2 e o novo 6.6: conexões não oficiais, Evolution e WAHA). A data não
 * mudou porque as duas mudanças são do mesmo dia, e o cadastro pelo site estava desligado entre elas.
 */
export const TERMS_VERSION = '2026-11-09';

/**
 * PrivacyPolicy.tsx — "Última atualização: 9 de novembro de 2026" (sessão 2 do cadastro: seção 3 com
 * a verificação da Cloudflare, o CPF ou CNPJ pedido antes do pagamento e a impressão do documento; seção
 * 5 com Stripe, Resend e Cloudflare; seção 7 com a guarda de 90 dias dos cadastros; antes, 30/10/2026,
 * lote 7: seção 5, o endereço digitado
 * para enviar localização nas Conversas vai só ele para a busca do OpenStreetMap; antes, 27/10/2026,
 * lote 3 de textos: o prazo de resposta é
 * o mesmo da página de exclusão de dados, 5 dias úteis para confirmar e 15 corridos para responder, e
 * "email" sem hífen; antes, 26/10/2026, seção 6: conexões não oficiais, Evolution
 * e WAHA; antes, 25/10/2026: API e integrações, seções 5, 6, 7 e 8).
 */
export const PRIVACY_VERSION = '2026-11-09';
