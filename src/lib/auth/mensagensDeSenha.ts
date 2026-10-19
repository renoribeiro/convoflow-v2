/**
 * Regra e frases da senha, iguais em /definir-senha e em Configurações ›
 * Segurança.
 *
 * O texto que o Supabase devolve ("New password should be different from the
 * old password.", "Password is known to be weak and easy to guess…") é em
 * inglês e não diz o que fazer. Ele vai só para o log; a pessoa lê uma frase
 * fixa daqui. Até 2026-10-19 as duas telas mostravam o texto cru.
 */

/** Mínimo de caracteres da senha. Mesma regra do Supabase Auth por padrão. */
export const MIN_SENHA = 8;

export interface ErroDoAuth {
  message?: string;
  code?: string;
  status?: number;
}

export const SENHA_ERRO_GENERICO =
  'Não foi possível salvar a senha agora. Tente de novo em alguns minutos.';

export const SENHA_FRACA =
  'Essa senha é fraca. Use uma senha mais longa, misturando letras e números.';

export const SENHA_IGUAL_A_ATUAL = 'A nova senha precisa ser diferente da atual.';

export const SENHA_PEDE_LOGIN_RECENTE =
  'Por segurança, saia do sistema, entre de novo e troque a senha logo em seguida.';

export const SENHA_MUITAS_TENTATIVAS =
  'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.';

export const SENHA_SESSAO_TERMINOU = 'Sua sessão terminou. Entre de novo e tente outra vez.';

/**
 * Traduz o erro do `updateUser({ password })` (e da conferência da senha
 * atual) numa frase fixa em português. Nunca devolve o texto do Supabase.
 *
 * `code` só existe nas versões novas do auth-js; as expressões cobrem as
 * antigas, que só mandavam a frase.
 */
export function mensagemDoErroDeSenha(err: ErroDoAuth | null | undefined): string {
  const code = err?.code ?? '';
  const texto = err?.message ?? '';

  if (code === 'weak_password' || /weak|should be at least|password should/i.test(texto)) {
    return SENHA_FRACA;
  }
  if (code === 'same_password' || /different from the old password/i.test(texto)) {
    return SENHA_IGUAL_A_ATUAL;
  }
  // "Troca de senha segura" ligada no Supabase e login com mais de 24 horas.
  if (
    code === 'reauthentication_needed' ||
    code === 'reauth_nonce_missing' ||
    code === 'reauthentication_not_valid' ||
    /reauthenticat/i.test(texto)
  ) {
    return SENHA_PEDE_LOGIN_RECENTE;
  }
  if (code === 'over_request_rate_limit' || err?.status === 429 || /rate limit/i.test(texto)) {
    return SENHA_MUITAS_TENTATIVAS;
  }
  if (
    code === 'session_not_found' ||
    code === 'session_expired' ||
    code === 'refresh_token_not_found' ||
    code === 'bad_jwt' ||
    code === 'no_authorization'
  ) {
    return SENHA_SESSAO_TERMINOU;
  }
  return SENHA_ERRO_GENERICO;
}

/** O Supabase recusou o par e-mail + senha: a senha digitada está errada. */
export function ehSenhaErrada(err: ErroDoAuth | null | undefined): boolean {
  return (
    err?.code === 'invalid_credentials' ||
    /invalid login credentials/i.test(err?.message ?? '')
  );
}
