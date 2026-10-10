/**
 * AuthProvider liga o registro de entrada ao onAuthStateChange — e não mais
 * ao login por senha. Prova de ponta do lado do navegador: o que o provider
 * faz com os eventos reais do auth-js.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Callback = (event: string, session: unknown) => void;
const { mockInvoke, mockSignIn, ouvintes } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockSignIn: vi.fn(),
  ouvintes: [] as Array<(event: string, session: unknown) => void>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: Callback) => {
        ouvintes.push(cb);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      getSession: () => Promise.resolve({ data: { session: null } }),
      signInWithPassword: mockSignIn,
      signOut: vi.fn(),
    },
    functions: { invoke: mockInvoke },
  },
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import { AuthProvider, useAuth } from './AuthContext';
import { SESSOES_REGISTRADAS_KEY } from '@/lib/auth/loginTracking';

const b64url = (obj: unknown) => btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sessao = (sessionId: string, n = 1) => ({
  access_token: `${b64url({ alg: 'ES256' })}.${b64url({ session_id: sessionId, iat: n })}.sig`,
  user: { id: 'aaaaaaaa-0000-4000-8000-000000000101' },
});

let auth: ReturnType<typeof useAuth> | null = null;
function Espiao() {
  auth = useAuth();
  return null;
}

async function montar() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>
        <Espiao />
      </AuthProvider>
    </QueryClientProvider>,
  );
  await act(async () => undefined);
}

async function emitir(event: string, session: unknown) {
  await act(async () => {
    ouvintes.at(-1)?.(event, session);
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  ouvintes.length = 0;
  mockInvoke.mockReset().mockResolvedValue({ data: { success: true }, error: null });
  mockSignIn.mockReset().mockResolvedValue({ error: null });
  window.localStorage.removeItem(SESSOES_REGISTRADAS_KEY);
});

describe('AuthProvider → track-login', () => {
  it('login por senha: o login() em si não chama; o evento SIGNED_IN chama uma vez', async () => {
    await montar();
    await act(async () => {
      await auth!.login('fix@example.com', 'senha');
    });
    expect(mockInvoke).not.toHaveBeenCalled();

    await emitir('SIGNED_IN', sessao('aaaaaaaa-0000-4000-8000-0000000000a1'));
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith('track-login', {
      headers: { Authorization: `Bearer ${sessao('aaaaaaaa-0000-4000-8000-0000000000a1').access_token}` },
    });
  });

  it('voltar à aba e renovar o token não chamam de novo', async () => {
    await montar();
    await emitir('SIGNED_IN', sessao('aaaaaaaa-0000-4000-8000-0000000000a2', 1));
    await emitir('SIGNED_IN', sessao('aaaaaaaa-0000-4000-8000-0000000000a2', 2));
    await emitir('TOKEN_REFRESHED', sessao('aaaaaaaa-0000-4000-8000-0000000000a2', 3));
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it('recarregar a página (provider novo, INITIAL_SESSION da mesma sessão) não chama de novo', async () => {
    await montar();
    await emitir('SIGNED_IN', sessao('aaaaaaaa-0000-4000-8000-0000000000a3'));
    await montar();
    await emitir('INITIAL_SESSION', sessao('aaaaaaaa-0000-4000-8000-0000000000a3', 2));
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it('entrada por convite ou nova senha (sessão vinda da URL) conta', async () => {
    await montar();
    await emitir('INITIAL_SESSION', sessao('aaaaaaaa-0000-4000-8000-0000000000a4'));
    await emitir('PASSWORD_RECOVERY', sessao('aaaaaaaa-0000-4000-8000-0000000000a5'));
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });
});
