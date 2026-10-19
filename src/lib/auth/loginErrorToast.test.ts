import { describe, expect, it } from 'vitest';
import { FEATURE_HELP } from '@/lib/help/featureHelp';
import {
  LOGIN_CREDENCIAIS_ERRADAS,
  LOGIN_EMAIL_NAO_CONFIRMADO,
  LOGIN_ERRO_GENERICO,
  LOGIN_MUITAS_TENTATIVAS,
  LOGIN_SUSPENDED_TOAST,
  isBannedLoginError,
  loginErrorToast,
} from './loginErrorToast';

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

  it('senha errada vira frase em português que aponta o "Esqueci minha senha"', () => {
    expect(loginErrorToast({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toEqual({
      title: 'Erro no login',
      description: LOGIN_CREDENCIAIS_ERRADAS,
    });
    // Versões antigas do auth-js mandam só a frase.
    expect(loginErrorToast({ message: 'Invalid login credentials' }).description).toBe(LOGIN_CREDENCIAIS_ERRADAS);
    expect(LOGIN_CREDENCIAIS_ERRADAS).toContain('"Esqueci minha senha"');
  });

  it('e-mail não confirmado e excesso de tentativas têm frase própria', () => {
    expect(loginErrorToast({ code: 'email_not_confirmed', message: 'Email not confirmed' }).description)
      .toBe(LOGIN_EMAIL_NAO_CONFIRMADO);
    expect(loginErrorToast({ code: 'over_request_rate_limit', message: 'Request rate limit reached' }).description)
      .toBe(LOGIN_MUITAS_TENTATIVAS);
  });

  it('erro desconhecido nunca chega cru à tela', () => {
    const t = loginErrorToast({ code: 'unexpected_failure', message: 'Database error querying schema' });
    expect(t.description).toBe(LOGIN_ERRO_GENERICO);
    expect(t.description).not.toMatch(/Database error/);
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
