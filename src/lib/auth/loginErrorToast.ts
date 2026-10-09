/**
 * O que a tela de login diz quando o Supabase recusa a entrada.
 *
 * Quem foi suspenso ou excluído em Equipe tem o login banido pelo manage-user
 * (supabase/functions/_shared/login-ban.ts). O Supabase responde com o código
 * `user_banned` e a frase em inglês "User is banned", que até 2026-10-08 ia
 * crua para o toast. A pessoa não sabia o que tinha acontecido nem a quem
 * pedir. O texto abaixo é o que a ajuda de Equipe (page:team) promete.
 *
 * Os outros erros seguem com a mensagem do Supabase, como antes.
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

export const loginErrorToast = (error: { message?: string; code?: string }): LoginErrorToast =>
  isBannedLoginError(error)
    ? LOGIN_SUSPENDED_TOAST
    : { title: 'Erro no login', description: error.message ?? '' };
