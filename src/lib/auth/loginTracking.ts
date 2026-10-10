import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

/**
 * Registro de entrada (track-login) — uma chamada por SESSÃO, não por evento.
 *
 * Por que não basta ouvir 'SIGNED_IN': o auth-js (2.71) dispara SIGNED_IN toda
 * vez que a aba volta a ficar visível (`_recoverAndRefresh`) e INITIAL_SESSION
 * a cada carregamento de página. Contar eventos inflaria o "Total de acessos".
 *
 * O que É uma entrada: uma sessão nova — senha (signInWithPassword), link de
 * convite ou de nova senha lido da URL (detectSessionInUrl) ou pelo código em
 * /definir-senha (verifyOtp). Todas chegam aqui por um destes três eventos,
 * com um session_id que não muda quando o token é renovado. Então: viu sessão
 * que ainda não registrou → chama uma vez e anota.
 *
 * A anotação fica no localStorage (recarregar a página não repete) e em
 * memória (sem localStorage, repete no máximo uma vez por carregamento). Se
 * mesmo assim chegar repetido, o servidor descarta: índice único por sessão
 * em user_activity_log (20261010000002).
 */

const EVENTOS_DE_ENTRADA: ReadonlySet<AuthChangeEvent> = new Set<AuthChangeEvent>([
  'SIGNED_IN',
  'INITIAL_SESSION',
  'PASSWORD_RECOVERY',
]);

export const SESSOES_REGISTRADAS_KEY = 'convoflow-sessoes-registradas';
const MAX_ANOTADAS = 20;
const MAX_TENTATIVAS = 3;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** session_id de dentro do access token, ou null. Não confere assinatura. */
export function sessionIdFromAccessToken(accessToken: string | null | undefined): string | null {
  const segmento = accessToken?.split('.')[1];
  if (!segmento) return null;
  try {
    const b64 = segmento.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((segmento.length + 3) % 4);
    const payload = JSON.parse(atob(b64)) as { session_id?: unknown };
    return typeof payload.session_id === 'string' && UUID.test(payload.session_id)
      ? payload.session_id.toLowerCase()
      : null;
  } catch {
    return null;
  }
}

type Armazenamento = Pick<Storage, 'getItem' | 'setItem'>;

export interface LoginTrackerDeps {
  /** Chama a edge function com o token DESTA sessão. */
  invoke: (accessToken: string) => Promise<{ error: unknown }>;
  storage?: Armazenamento | null;
  /** Adia a chamada para fora do callback do auth (lá dentro ela travaria no lock). */
  defer?: (fn: () => void) => void;
}

export function createLoginTracker({ invoke, storage = null, defer = (fn) => setTimeout(fn, 0) }: LoginTrackerDeps) {
  const feitas = new Set<string>();
  const emVoo = new Set<string>();
  const tentativas = new Map<string, number>();

  const anotadas = (): string[] => {
    try {
      const lista: unknown = JSON.parse(storage?.getItem(SESSOES_REGISTRADAS_KEY) ?? '[]');
      return Array.isArray(lista) ? lista.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  };

  const anotar = (sessao: string) => {
    feitas.add(sessao);
    try {
      const lista = [sessao, ...anotadas().filter((x) => x !== sessao)].slice(0, MAX_ANOTADAS);
      storage?.setItem(SESSOES_REGISTRADAS_KEY, JSON.stringify(lista));
    } catch {
      // Sem localStorage: fica só em memória; o servidor descarta a repetição.
    }
  };

  return (event: AuthChangeEvent, session: Session | null): void => {
    if (!session || !EVENTOS_DE_ENTRADA.has(event)) return;
    const sessao = sessionIdFromAccessToken(session.access_token);
    if (!sessao || feitas.has(sessao) || emVoo.has(sessao)) return;
    if (anotadas().includes(sessao)) {
      feitas.add(sessao);
      return;
    }
    const n = (tentativas.get(sessao) ?? 0) + 1;
    if (n > MAX_TENTATIVAS) return;
    tentativas.set(sessao, n);
    emVoo.add(sessao);

    const accessToken = session.access_token;
    defer(() => {
      invoke(accessToken)
        .then(({ error }) => {
          if (!error) anotar(sessao);
        })
        .catch(() => undefined)
        .finally(() => emVoo.delete(sessao));
    });
  };
}
