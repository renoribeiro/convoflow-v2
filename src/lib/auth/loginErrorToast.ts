/**
 * O que a tela de login diz quando o Supabase recusa a entrada.
 *
 * Quem foi suspenso ou excluído em Equipe tem o login banido pelo manage-user
 * (supabase/functions/_shared/login-ban.ts). O Supabase responde com o código
 * `user_banned` e a frase em inglês "User is banned", que até 2026-10-08 ia
 * crua para o toast. A pessoa não sabia o que tinha acontecido nem a quem
 * pedir. O texto abaixo é o que a ajuda de Equipe (page:team) promete.
 *
 * Desde 2026-10-19 os outros erros também ganham frase fixa em português
 * ("Invalid login credentials" ia cru para o toast). O texto do Supabase fica
 * só no console (AuthContext.login já registra o erro).
 */
export interface LoginErrorToast {
  title: string;
  description: string;
}

export const LOGIN_SUSPENDED_TOAST: LoginErrorToast = {
  title: 'Acesso suspenso',
  description:
    'Quem administra a sua equipe no ConvoFlow suspendeu ou removeu este usuário, por isso ele não consegue entrar. Se você acha que é um engano, fale com essa pessoa.',
};

/** `code` só existe nas versões novas do auth-js; a frase cobre as antigas. */
export const isBannedLoginError = (error: { message?: string; code?: string }): boolean =>
  error.code === 'user_banned' || /user is banned/i.test(error.message ?? '');

export const LOGIN_CREDENCIAIS_ERRADAS =
  'E-mail ou senha incorretos. Se você esqueceu a senha, use "Esqueci minha senha".';

export const LOGIN_EMAIL_NAO_CONFIRMADO =
  'Este e-mail ainda não foi confirmado. Abra o convite que chegou por e-mail ou use "Esqueci minha senha".';

export const LOGIN_MUITAS_TENTATIVAS = 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.';

export const LOGIN_ERRO_GENERICO = 'Não foi possível entrar agora. Tente de novo em alguns minutos.';

const descricaoDoErro = (error: { message?: string; code?: string; status?: number }): string => {
  const texto = error.message ?? '';
  if (error.code === 'invalid_credentials' || /invalid login credentials/i.test(texto)) {
    return LOGIN_CREDENCIAIS_ERRADAS;
  }
  if (error.code === 'email_not_confirmed' || /email not confirmed/i.test(texto)) {
    return LOGIN_EMAIL_NAO_CONFIRMADO;
  }
  if (error.code === 'over_request_rate_limit' || error.status === 429 || /rate limit/i.test(texto)) {
    return LOGIN_MUITAS_TENTATIVAS;
  }
  return LOGIN_ERRO_GENERICO;
};

export const loginErrorToast = (error: { message?: string; code?: string; status?: number }): LoginErrorToast =>
  isBannedLoginError(error)
    ? LOGIN_SUSPENDED_TOAST
    : { title: 'Erro no login', description: descricaoDoErro(error) };
