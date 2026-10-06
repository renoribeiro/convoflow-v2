// Porta das funções que só o nosso backend chama: os 6 workers do pg_cron
// (job-worker, process-campaign-dispatch, process-followup-dispatch,
// webhook-dispatcher, process-report-dispatch, policy-watch) e
// automation-processor (trigger fire_automation_trigger e motor do chatbot).
//
// Também a stripe-admin (item 10, 2026-09-29), que além do login de superadmin
// aceita estas credenciais para uma lista curta de ações (BACKEND_ACTIONS em
// stripe-admin-core.ts) — é o que deixa conferir o Stripe por SQL/pg_net.
//
// Item 14, lote 2 (2026-09-29). Antes, job-worker e automation-processor
// aceitavam qualquer chave do projeto — inclusive a publishable, que está no
// JavaScript do site — e os outros cinco não conferiam nada. Agora a chamada
// passa só com UMA destas credenciais:
//
//   1. x-cron-secret = segredo `cron_worker_secret` do Vault. Quem manda:
//      public.cron_worker_kick (os 6 crons) e public.fire_automation_trigger.
//      A função lê o valor pela RPC cron_worker_secret() (só service_role) e
//      compara em tempo constante. Sem segredo no Vault → 503, recusa tudo
//      (falha fechada).
//   2. a chave SECRETA do projeto (sb_secret_…) no apikey ou em
//      Authorization: Bearer. Quem manda: o motor do chatbot
//      (supabase.functions.invoke com o cliente de serviço). Quem tem essa
//      chave já tem o banco inteiro; aceitá-la não abre nada.
//
// A publishable NÃO passa. As legadas (JWT anon/service_role) também não: só
// entram chaves com prefixo sb_secret_.
//
// Sem Deno e sem import por URL: o Vitest importa este arquivo
// (src/lib/security/backendCaller.test.ts). Quem chama injeta o ambiente e o
// cliente.

import { matchVerifyToken } from './cryptoSignature.ts';

export const CRON_SECRET_HEADER = 'x-cron-secret';
export const CRON_SECRET_RPC = 'cron_worker_secret';
const MIN_SECRET_LENGTH = 32;
const CACHE_TTL_MS = 60_000;

export function parseKeyDictionary(raw: string | undefined | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
    return Object.values(parsed).filter(
      (v): v is string => typeof v === 'string' && v.length > 0,
    );
  } catch {
    return [];
  }
}

/** Chaves secretas do projeto: o dicionário novo + a que o cliente de serviço usa. */
export function secretKeys(getEnv: (name: string) => string | undefined): Set<string> {
  const keys = [
    ...parseKeyDictionary(getEnv('SUPABASE_SECRET_KEYS')),
    getEnv('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  ];
  return new Set(keys.filter((k) => k.startsWith('sb_secret_')));
}

export function carriesSecretKey(headers: Headers, keys: Set<string>): boolean {
  if (keys.size === 0) return false;
  const apikey = headers.get('apikey')?.trim();
  if (apikey && keys.has(apikey)) return true;
  const bearer = headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim();
  return !!bearer && keys.has(bearer);
}

export type CallerDecision =
  | { ok: true; via: 'cron-secret' | 'secret-key' }
  | { ok: false; status: 401 | 503; reason: string };

export async function decideBackendCaller(
  headers: Headers,
  deps: { secretKeys: Set<string>; loadCronSecret: () => Promise<string | null> },
): Promise<CallerDecision> {
  if (carriesSecretKey(headers, deps.secretKeys)) return { ok: true, via: 'secret-key' };

  // Sem o cabeçalho, recusa sem ir ao banco: chamada anônima não custa RPC.
  const provided = headers.get(CRON_SECRET_HEADER);
  if (!provided) return { ok: false, status: 401, reason: 'sem credencial de backend' };

  let expected: string | null = null;
  try {
    expected = await deps.loadCronSecret();
  } catch {
    expected = null;
  }
  if (typeof expected !== 'string' || expected.length < MIN_SECRET_LENGTH) {
    return { ok: false, status: 503, reason: 'segredo do cron ausente no Vault' };
  }
  if (matchVerifyToken(provided, [expected]) !== 0) {
    return { ok: false, status: 401, reason: 'x-cron-secret não confere' };
  }
  return { ok: true, via: 'cron-secret' };
}

interface RpcClient {
  rpc(fn: string): PromiseLike<{ data: unknown; error: unknown }>;
}

let cached: { value: string; at: number } | null = null;

/** Para testes. */
export function resetCronSecretCache(): void {
  cached = null;
}

/**
 * Lê o segredo pela RPC (só service_role) e guarda por 60 s no isolate: um
 * worker por minuto não vira uma leitura do Vault por chamada. Só guarda valor
 * válido — Vault vazio é relido na próxima chamada.
 */
export function cronSecretLoader(client: RpcClient, now: () => number = Date.now) {
  return async (): Promise<string | null> => {
    if (cached && now() - cached.at < CACHE_TTL_MS) return cached.value;
    const { data, error } = await client.rpc(CRON_SECRET_RPC);
    if (error || typeof data !== 'string' || data.length < MIN_SECRET_LENGTH) return null;
    cached = { value: data, at: now() };
    return data;
  };
}

/**
 * Atalho para o começo de cada função: devolve null quando a chamada pode
 * seguir, ou a Response de recusa. `client` é o cliente de serviço.
 */
export async function rejectUnlessBackendCaller(
  req: Request,
  client: RpcClient,
  getEnv: (name: string) => string | undefined,
  logger: { warn: (m: string, c?: Record<string, unknown>) => void; error: (m: string, c?: Record<string, unknown>) => void },
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  const decision = await decideBackendCaller(req.headers, {
    secretKeys: secretKeys(getEnv),
    loadCronSecret: cronSecretLoader(client),
  });
  if (decision.ok) return null;
  if (decision.status === 503) logger.error('backend-caller: recusando tudo', { motivo: decision.reason });
  else logger.warn('backend-caller: chamada recusada', { motivo: decision.reason });
  return new Response(
    JSON.stringify({ error: decision.status === 503 ? 'Not configured' : 'Unauthorized' }),
    { status: decision.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}
