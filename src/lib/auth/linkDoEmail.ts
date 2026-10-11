/**
 * Como a pessoa chegou em /definir-senha, e o que a tela faz com isso.
 *
 * Os e-mails de convite e de nova senha têm um link e um código de 6 dígitos.
 * Os dois são o MESMO acesso: o Supabase guarda um hash do código, o link leva
 * esse hash, e usar um apaga o outro.
 *
 * LINK ANTIGO ({{ .ConfirmationURL }}): aponta para o /verify do Supabase, que
 * gasta o acesso no primeiro GET e devolve a pessoa para cá com a sessão no
 * fragmento (#access_token=...). Qualquer robô que "abre" o link para conferir
 * (varredura de e-mail, pré-carregamento) gasta o acesso antes da pessoa. Foi
 * o que aconteceu em 2026-08-18. Continua aceito: e-mails já enviados valem
 * por 24 horas.
 *
 * LINK NOVO ({{ .SiteURL }}/definir-senha?token_hash=...&type=...): abre esta
 * tela SEM gastar nada. A tela mostra "Continuar", e só o clique troca o
 * token_hash por uma sessão (verifyOtp). Robô não clica em botão.
 */

import type { EmailOtpType } from '@supabase/supabase-js';

/**
 * Tipo usado para conferir o CÓDIGO de 6 dígitos.
 *
 * Com 'email', o Supabase confere o código contra os dois acessos que a pessoa
 * pode ter recebido, nesta ordem: primeiro o de convite/cadastro
 * (confirmation_token), depois o de nova senha (recovery_token), e segue o
 * caminho certo de cada um (internal/api/verify.go e verify_ott.go do
 * supabase/auth, conferidos em 2026-10-11). Uma chamada só cobre o código do
 * e-mail de convite e o do e-mail de nova senha, sem tentar tipo por tipo.
 */
export const TIPO_DO_CODIGO: EmailOtpType = 'email';

/** Tipos que o link novo pode trazer em `type`. São os dos nossos templates. */
const TIPOS_DO_LINK: readonly EmailOtpType[] = ['recovery', 'invite', 'email'];

export type ChegadaPorLink =
  /** Link novo: token_hash na busca. Ainda não foi usado. */
  | { tipo: 'link_novo'; tokenHash: string; otpType: EmailOtpType }
  /** Link antigo que funcionou: o Supabase mandou a sessão no fragmento. */
  | { tipo: 'link_antigo' }
  /** O Supabase (ou um link mal copiado) devolveu um erro. */
  | { tipo: 'erro'; mensagem: string }
  /** Ninguém trouxe link: é o "Esqueci minha senha". */
  | { tipo: 'visita' };

/**
 * Traduz o erro que o Supabase devolve no endereço.
 *
 * O link é de USO ÚNICO. Abrir no celular e depois no computador queima o
 * primeiro acesso e o segundo chega aqui com `otp_expired`.
 */
export function mensagemDoErro(code: string | null, description: string | null): string {
  if (code === 'otp_expired') {
    return 'Este link expirou ou já foi usado. Cada link vale por um acesso só. Peça um código novo abaixo.';
  }
  if (code === 'access_denied') {
    return 'Este link não é mais válido. Peça um código novo abaixo.';
  }
  return description || 'Não foi possível validar este link. Peça um código novo abaixo.';
}

/**
 * Lê a chegada UMA vez, na montagem: o supabase-js limpa o fragmento assim que
 * o processa, e depois disso não dá mais para saber de onde a pessoa veio.
 */
export function lerChegada(search: string, hash: string): ChegadaPorLink {
  const busca = new URLSearchParams(search.replace(/^\?/, ''));
  const fragmento = new URLSearchParams(hash.replace(/^#/, ''));

  const tokenHash = busca.get('token_hash');
  if (tokenHash) {
    const tipo = busca.get('type') as EmailOtpType | null;
    if (!tipo || !TIPOS_DO_LINK.includes(tipo)) {
      return { tipo: 'erro', mensagem: mensagemDoErro(null, null) };
    }
    return { tipo: 'link_novo', tokenHash, otpType: tipo };
  }

  for (const p of [fragmento, busca]) {
    if (p.get('error') || p.get('error_code')) {
      return { tipo: 'erro', mensagem: mensagemDoErro(p.get('error_code'), p.get('error_description')) };
    }
  }

  if (fragmento.get('access_token')) return { tipo: 'link_antigo' };
  return { tipo: 'visita' };
}

/** Frase para o erro do clique em "Continuar" (link novo). */
export function mensagemDoErroDoLink(err: { message?: string; code?: string } | null | undefined): string {
  const texto = `${err?.code ?? ''} ${err?.message ?? ''}`;
  if (/otp_expired|expired|invalid/i.test(texto)) {
    return mensagemDoErro('otp_expired', null);
  }
  return 'Não foi possível usar este link agora. Tente de novo ou peça um código novo abaixo.';
}
