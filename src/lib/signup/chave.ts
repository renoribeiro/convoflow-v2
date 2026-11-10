// =============================================================================
// A chave do cadastro pelo site, sozinha num arquivo
// =============================================================================
// É A chave do site. Desde a sessão 2 (2026-11-09), o teste grátis na tela de
// bloqueio segue esta mesma chave (src/lib/billing/trialOffer.ts), e o servidor
// segue o secret de mesmo nome: o cadastro e o teste ligam juntos, nos dois
// lados. Mora aqui, sem dependência nenhuma, para release.ts e trialOffer.ts a
// lerem sem um importar o outro.
//
// PARA LIGAR (docs/RUNBOOK_ligar_teste_gratis.md): primeiro o secret
// PUBLIC_SIGNUP_ENABLED = true no Supabase, depois esta chave.
// =============================================================================

export const PUBLIC_SIGNUP_ENABLED = false;
