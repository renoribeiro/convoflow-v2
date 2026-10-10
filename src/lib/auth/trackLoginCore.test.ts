/**
 * Núcleo do track-login (supabase/functions/_shared/track-login.ts): um
 * registro por ENTRADA. Roda no Vitest porque o núcleo não importa nada do
 * Deno — mesma convenção de publicSignupHandler.test.ts.
 *
 * O "banco" aqui é uma lista em memória que imita o índice único de
 * user_activity_log(session_id) para logins (20261010000002).
 */
import { describe, expect, it } from 'vitest';
import {
  LEGACY_WINDOW_AFTER_MS,
  loginMoment,
  readLoginClaims,
  trackLogin,
  type LoginRow,
  type TrackLoginStore,
} from '../../../supabase/functions/_shared/track-login.ts';

const SESSAO_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const SESSAO_B = 'aaaaaaaa-0000-4000-8000-000000000002';
const USER = 'aaaaaaaa-0000-4000-8000-000000000101';
const PERFIL = 'aaaaaaaa-0000-4000-8000-0000000000f1';

const b64url = (obj: unknown) =>
  Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Token falso no formato do Auth (a assinatura não importa ao núcleo). */
function token(payload: Record<string, unknown>) {
  return `${b64url({ alg: 'ES256', typ: 'JWT' })}.${b64url(payload)}.assinatura`;
}

const ENTRADA = Date.UTC(2026, 9, 10, 12, 0, 0); // 10/10/2026 12:00 UTC
const AGORA = new Date(ENTRADA + 3 * 60 * 60 * 1000); // 3 h depois

const tokenDaSessao = (sessao: string, extra: Record<string, unknown> = {}) =>
  token({
    sub: USER,
    session_id: sessao,
    amr: [{ method: 'password', timestamp: ENTRADA / 1000 }],
    iat: AGORA.getTime() / 1000,
    ...extra,
  });

function bancoEmMemoria(antigas: Array<{ created_at: Date }> = []) {
  const linhas: LoginRow[] = [];
  const store: TrackLoginStore = {
    async profileIdFor(userId) {
      return userId === USER ? PERFIL : null;
    },
    async hasLegacyLoginBetween(_perfil, from, to) {
      return antigas.some((l) => l.created_at >= from && l.created_at <= to);
    },
    async insertLogin(row) {
      if (linhas.some((l) => l.session_id === row.session_id)) return 'duplicate';
      linhas.push(row);
      return 'inserted';
    },
  };
  return { linhas, store };
}

const entrada = (accessToken: string, now = AGORA) => ({
  userId: USER,
  accessToken,
  ip: '192.0.2.10',
  userAgent: 'FIXTURE-UA',
  now,
});

describe('readLoginClaims', () => {
  it('lê a sessão, o momento e o jeito de entrar', () => {
    expect(readLoginClaims(tokenDaSessao(SESSAO_A))).toEqual({
      sessionId: SESSAO_A,
      signedInAt: new Date(ENTRADA),
      method: 'password',
    });
  });

  it('com mais de um amr, vale o mais antigo (o início da sessão)', () => {
    const t = token({
      session_id: SESSAO_A,
      amr: [
        { method: 'totp', timestamp: ENTRADA / 1000 + 60 },
        { method: 'otp', timestamp: ENTRADA / 1000 },
      ],
    });
    expect(readLoginClaims(t)?.method).toBe('otp');
    expect(readLoginClaims(t)?.signedInAt).toEqual(new Date(ENTRADA));
  });

  it('token sem session_id, malformado ou com lixo não serve', () => {
    expect(readLoginClaims(token({ sub: USER }))).toBeNull();
    expect(readLoginClaims(token({ session_id: 'nao-e-uuid' }))).toBeNull();
    expect(readLoginClaims('abc')).toBeNull();
    expect(readLoginClaims('a.%%%.c')).toBeNull();
  });

  it('sem amr, sabe a sessão mas não o momento', () => {
    expect(readLoginClaims(token({ session_id: SESSAO_A }))).toEqual({
      sessionId: SESSAO_A,
      signedInAt: null,
      method: null,
    });
  });
});

describe('loginMoment', () => {
  it('usa a entrada; ausente ou no futuro vira agora', () => {
    expect(loginMoment(new Date(ENTRADA), AGORA)).toEqual(new Date(ENTRADA));
    expect(loginMoment(null, AGORA)).toBe(AGORA);
    expect(loginMoment(new Date(AGORA.getTime() + 1000), AGORA)).toBe(AGORA);
  });
});

describe('trackLogin — uma linha por entrada', () => {
  it('a primeira chamada de uma sessão grava, com a data da ENTRADA', async () => {
    const { linhas, store } = bancoEmMemoria();
    expect(await trackLogin(entrada(tokenDaSessao(SESSAO_A)), store)).toBe('inserted');
    expect(linhas).toEqual([
      {
        profile_id: PERFIL,
        event_type: 'login',
        ip: '192.0.2.10',
        user_agent: 'FIXTURE-UA',
        metadata: { metodo: 'password' },
        session_id: SESSAO_A,
        created_at: new Date(ENTRADA).toISOString(),
      },
    ]);
  });

  it('recarregar a página (mesmo token de novo) não grava outra', async () => {
    const { linhas, store } = bancoEmMemoria();
    await trackLogin(entrada(tokenDaSessao(SESSAO_A)), store);
    expect(await trackLogin(entrada(tokenDaSessao(SESSAO_A)), store)).toBe('duplicate');
    expect(linhas).toHaveLength(1);
  });

  it('renovar o token (token novo, mesma sessão) não grava outra', async () => {
    const { linhas, store } = bancoEmMemoria();
    await trackLogin(entrada(tokenDaSessao(SESSAO_A)), store);
    const renovado = tokenDaSessao(SESSAO_A, { iat: AGORA.getTime() / 1000 + 3600, exp: AGORA.getTime() / 1000 + 7200 });
    expect(await trackLogin(entrada(renovado, new Date(AGORA.getTime() + 3600_000)), store)).toBe('duplicate');
    expect(linhas).toHaveLength(1);
  });

  it('entrar de novo (sessão nova) grava outra', async () => {
    const { linhas, store } = bancoEmMemoria();
    await trackLogin(entrada(tokenDaSessao(SESSAO_A)), store);
    expect(await trackLogin(entrada(tokenDaSessao(SESSAO_B)), store)).toBe('inserted');
    expect(linhas.map((l) => l.session_id)).toEqual([SESSAO_A, SESSAO_B]);
  });

  it('link de convite e de nova senha também contam, uma vez cada', async () => {
    const { linhas, store } = bancoEmMemoria();
    const convite = token({ session_id: SESSAO_A, amr: [{ method: 'otp', timestamp: ENTRADA / 1000 }] });
    const novaSenha = token({ session_id: SESSAO_B, amr: [{ method: 'recovery', timestamp: ENTRADA / 1000 + 60 }] });
    expect(await trackLogin(entrada(convite), store)).toBe('inserted');
    expect(await trackLogin(entrada(novaSenha), store)).toBe('inserted');
    expect(await trackLogin(entrada(novaSenha), store)).toBe('duplicate');
    expect(linhas.map((l) => l.metadata.metodo)).toEqual(['otp', 'recovery']);
  });

  it('login já registrado pelo jeito antigo (sem sessão, logo após a entrada) não conta de novo', async () => {
    const { linhas, store } = bancoEmMemoria([{ created_at: new Date(ENTRADA + 5_000) }]);
    expect(await trackLogin(entrada(tokenDaSessao(SESSAO_A)), store)).toBe('duplicate');
    expect(linhas).toHaveLength(0);
  });

  it('linha antiga fora da janela é outra entrada', async () => {
    const { linhas, store } = bancoEmMemoria([{ created_at: new Date(ENTRADA + LEGACY_WINDOW_AFTER_MS + 60_000) }]);
    expect(await trackLogin(entrada(tokenDaSessao(SESSAO_A)), store)).toBe('inserted');
    expect(linhas).toHaveLength(1);
  });

  it('sem amr: grava com a hora da chamada e sem olhar as linhas antigas', async () => {
    const { linhas, store } = bancoEmMemoria([{ created_at: AGORA }]);
    expect(await trackLogin(entrada(token({ session_id: SESSAO_A })), store)).toBe('inserted');
    expect(linhas[0]?.created_at).toBe(AGORA.toISOString());
  });

  it('token sem sessão e login sem perfil não gravam nada', async () => {
    const { linhas, store } = bancoEmMemoria();
    expect(await trackLogin(entrada(token({ sub: USER })), store)).toBe('no_session');
    expect(await trackLogin({ ...entrada(tokenDaSessao(SESSAO_A)), userId: 'outro' }, store)).toBe('no_profile');
    expect(linhas).toHaveLength(0);
  });
});
