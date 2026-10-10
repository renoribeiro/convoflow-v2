import { describe, expect, it } from 'vitest';
import { FEATURE_HELP } from '@/lib/help/featureHelp';
import { LOGIN_SUSPENDED_TOAST, isBannedLoginError, loginErrorToast } from './loginErrorToast';

describe('loginErrorToast', () => {
  it('troca o "User is banned" do Supabase pelo aviso de acesso suspenso', () => {
    expect(loginErrorToast({ code: 'user_banned', message: 'User is banned' })).toEqual(LOGIN_SUSPENDED_TOAST);
  });

  it('reconhece o banimento só pela frase, quando o código não vem', () => {
    expect(isBannedLoginError({ message: 'User is banned' })).toBe(true);
    expect(isBannedLoginError({ message: 'user is BANNED' })).toBe(true);
  });

  it('reconhece o banimento só pelo código', () => {
    expect(isBannedLoginError({ code: 'user_banned', message: '' })).toBe(true);
  });

  it('deixa os outros erros como o Supabase mandou', () => {
    expect(loginErrorToast({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toEqual({
      title: 'Erro no login',
      description: 'Invalid login credentials',
    });
  });

  it('o aviso fala português, sem o texto em inglês e sem travessão', () => {
    const texto = `${LOGIN_SUSPENDED_TOAST.title} ${LOGIN_SUSPENDED_TOAST.description}`;
    expect(texto).not.toMatch(/banned/i);
    expect(texto).not.toContain('—');
  });

  it('a ajuda de Equipe cita o título que a pessoa suspensa vê', () => {
    const tips = FEATURE_HELP['page:team']?.tips ?? [];
    expect(tips.some((tip) => tip.includes(`"${LOGIN_SUSPENDED_TOAST.title}"`))).toBe(true);
  });
});
