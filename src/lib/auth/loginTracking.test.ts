/**
 * Registro de entrada no navegador: uma chamada ao track-login por SESSÃO.
 *
 * Os eventos simulados são os que o auth-js 2.71 realmente dispara:
 *   - senha:            SIGNED_IN (signInWithPassword)
 *   - convite/nova senha pela URL: INITIAL_SESSION ou SIGNED_IN, e
 *                       PASSWORD_RECOVERY no link de nova senha
 *   - /definir-senha:   SIGNED_IN (verifyOtp)
 *   - recarregar:       INITIAL_SESSION com a MESMA sessão
 *   - voltar à aba:     SIGNED_IN com a MESMA sessão (_recoverAndRefresh)
 *   - renovar o token:  TOKEN_REFRESHED, token novo, MESMA sessão
 */
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { createLoginTracker, sessionIdFromAccessToken, SESSOES_REGISTRADAS_KEY } from './loginTracking';

const SESSAO_A = 'aaaaaaaa-0000-4000-8000-00000000000a';
const SESSAO_B = 'aaaaaaaa-0000-4000-8000-00000000000b';

const b64url = (obj: unknown) =>
  btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

let emitidos = 0;
/** Sessão falsa; cada chamada gera um token DIFERENTE (como uma renovação). */
function sessao(sessionId: string | null): Session {
  emitidos += 1;
  const payload = sessionId ? { session_id: sessionId, iat: emitidos } : { iat: emitidos };
  return { access_token: `${b64url({ alg: 'ES256' })}.${b64url(payload)}.sig` } as unknown as Session;
}

function memoria(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  } as unknown as Storage;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

type Invoke = (accessToken: string) => Promise<{ error: unknown }>;
let invoke: Mock<Invoke>;
let storage: Storage;
const novoTracker = () => createLoginTracker({ invoke, storage, defer: (fn) => fn() });

beforeEach(() => {
  invoke = vi.fn<Invoke>().mockResolvedValue({ error: null });
  storage = memoria();
});

async function disparar(track: ReturnType<typeof createLoginTracker>, ...eventos: Array<[AuthChangeEvent, Session | null]>) {
  for (const [e, s] of eventos) {
    track(e, s);
    await flush();
  }
}

describe('sessionIdFromAccessToken', () => {
  it('lê o session_id do token', () => {
    expect(sessionIdFromAccessToken(sessao(SESSAO_A).access_token)).toBe(SESSAO_A);
  });
  it('sem token, sem session_id ou lixo: null', () => {
    expect(sessionIdFromAccessToken(undefined)).toBeNull();
    expect(sessionIdFromAccessToken(sessao(null).access_token)).toBeNull();
    expect(sessionIdFromAccessToken('x.%%%.y')).toBeNull();
  });
});

describe('conta cada entrada uma vez', () => {
  it('senha: SIGNED_IN de uma sessão nova chama o track-login com o token dela', async () => {
    const track = novoTracker();
    const s = sessao(SESSAO_A);
    await disparar(track, ['SIGNED_IN', s]);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(s.access_token);
  });

  it('link de convite lido da URL (INITIAL_SESSION) conta', async () => {
    await disparar(novoTracker(), ['INITIAL_SESSION', sessao(SESSAO_A)]);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('link de nova senha: PASSWORD_RECOVERY e logo SIGNED_IN da mesma sessão contam uma vez', async () => {
    const track = novoTracker();
    // os dois chegam antes de a primeira chamada terminar
    let terminar: (v: { error: null }) => void = () => undefined;
    invoke.mockReturnValueOnce(new Promise((r) => (terminar = r)));
    track('PASSWORD_RECOVERY', sessao(SESSAO_A));
    track('SIGNED_IN', sessao(SESSAO_A));
    terminar({ error: null });
    await flush();
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('/definir-senha (verifyOtp → SIGNED_IN) conta', async () => {
    await disparar(novoTracker(), ['SIGNED_IN', sessao(SESSAO_B)]);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('sair e entrar de novo (sessão nova) conta de novo', async () => {
    const track = novoTracker();
    await disparar(track, ['SIGNED_IN', sessao(SESSAO_A)], ['SIGNED_OUT', null], ['SIGNED_IN', sessao(SESSAO_B)]);
    expect(invoke).toHaveBeenCalledTimes(2);
  });
});

describe('não conta o que não é entrada', () => {
  it('recarregar a página (tracker novo, mesma sessão em INITIAL_SESSION) não chama', async () => {
    await disparar(novoTracker(), ['SIGNED_IN', sessao(SESSAO_A)]);
    await disparar(novoTracker(), ['INITIAL_SESSION', sessao(SESSAO_A)]);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('voltar à aba (SIGNED_IN repetido da mesma sessão) não chama', async () => {
    const track = novoTracker();
    await disparar(track, ['SIGNED_IN', sessao(SESSAO_A)], ['SIGNED_IN', sessao(SESSAO_A)], ['SIGNED_IN', sessao(SESSAO_A)]);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('renovar o token não chama — nem antes de a entrada ter sido anotada', async () => {
    await disparar(novoTracker(), ['TOKEN_REFRESHED', sessao(SESSAO_A)], ['USER_UPDATED', sessao(SESSAO_A)]);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('sem sessão ou token sem session_id: não chama', async () => {
    await disparar(novoTracker(), ['INITIAL_SESSION', null], ['SIGNED_IN', sessao(null)]);
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('falhas', () => {
  it('falhou: não anota, e tenta de novo no próximo evento (até 3 vezes)', async () => {
    invoke.mockResolvedValue({ error: new Error('rede') });
    const track = novoTracker();
    for (let i = 0; i < 5; i++) await disparar(track, ['SIGNED_IN', sessao(SESSAO_A)]);
    expect(invoke).toHaveBeenCalledTimes(3);
    expect(storage.getItem(SESSOES_REGISTRADAS_KEY)).toBeNull();
  });

  it('sem localStorage: ainda chama uma vez só por carregamento', async () => {
    const quebrado = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
    } as unknown as Storage;
    const track = createLoginTracker({ invoke, storage: quebrado, defer: (fn) => fn() });
    await disparar(track, ['SIGNED_IN', sessao(SESSAO_A)], ['INITIAL_SESSION', sessao(SESSAO_A)]);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('guarda só as 20 últimas sessões', async () => {
    const track = novoTracker();
    for (let i = 0; i < 25; i++) {
      await disparar(track, ['SIGNED_IN', sessao(`aaaaaaaa-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`)]);
    }
    expect(JSON.parse(storage.getItem(SESSOES_REGISTRADAS_KEY) ?? '[]')).toHaveLength(20);
  });
});
