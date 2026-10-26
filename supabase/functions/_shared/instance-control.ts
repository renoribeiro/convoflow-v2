// =============================================================================
// instance-control.ts — estado, QR, desconectar e chave de um número Evolution
// ou WAHA, feitos pelo SERVIDOR (edge function `whatsapp-instance-action`)
// =============================================================================
// Até 2026-10-26 o navegador fazia isso sozinho, com a chave da instância lida
// da linha de whatsapp_instances, que todo membro da Loja lê. Agora a chave
// fica no cofre e só o servidor a usa; o navegador recebe o resultado (estado,
// QR, "tem chave: sim/não") e nunca a chave nem o endereço do servidor.
// Plano e estado: docs/RUNBOOK_segredos_das_instancias.md.
//
// QUEM PODE: quem tem `whatsapp.configure` (Gerente, Gestor; o Atendente não),
// com perfil ativo, na própria Conta/Loja ou, para o Gerente, numa Loja filha
// direta (`decideInstanceAccess`, a mesma regra do inbox). Instância de outra
// Conta responde "não encontrada", sem dizer que existe.
//
// QUAL CHAVE: a DA INSTÂNCIA, nunca a global do Evolution. A SKILL do Evolution
// (§2.2, §2.3, §2.7) documenta essas rotas com a GLOBAL_KEY, mas a global abre
// a instância de qualquer nome, e o navegador consegue criar uma linha com o
// nome que quiser: o nome não prova dono. A chave da instância só abre a
// própria instância (medido em 2026-09-10: 401 em qualquer outra) e só existe
// no cofre se o nosso servidor a gravou. A tela usava essa mesma chave para
// essas três rotas desde 2026-09.
//
// Endpoints:
//   evolution  .agent/skills/evolution-v2/SKILL.md §2.2 connectionState,
//              §2.3 connect (QR), §2.7 logout. Header `apikey`.
//   waha       .agent/skills/waha/SKILL.md §2.2 detalhes da sessão, §2.4 start,
//              §2.6 logout, §2.8 QR (format=image). Header `X-Api-Key`.
//              Servidor do cliente: quem executa a chamada usa safeFetch.
//
// Regra pura com as dependências injetadas: o Vitest roda sem Deno.
// =============================================================================

import { can, CAPABILITY_DENIAL_MESSAGES, statusDenialMessage } from './capabilities.ts';
import { decideInstanceAccess, type InstanceAccessTenant } from './instance-access.ts';
import type { ProviderCredentials, ResolvedCredentials } from './instance-credentials.ts';

export const INSTANCE_ACTIONS = ['status', 'connect', 'disconnect', 'credential', 'replace_key'] as const;
export type InstanceAction = (typeof INSTANCE_ACTIONS)[number];

export interface ControlCaller {
  tenant_id: string | null;
  role: string | null;
  status: string | null;
  capabilities?: unknown;
}

export interface ControlInstance {
  id: string;
  tenant_id: string;
  instance_key: string;
  provider: string | null;
  status: string | null;
  connection_config?: unknown;
}

export interface ProviderRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  headers: Record<string, string>;
  body?: unknown;
  /** true = servidor do cliente (WAHA): quem executa passa por safeFetch. */
  customerServer: boolean;
}

export interface ProviderResponse {
  status: number;
  json?: unknown;
  /** Para a imagem do QR do WAHA. */
  base64?: string;
  contentType?: string;
  /** Endereço recusado pelo safeFetch (mensagem para a tela). */
  blocked?: string;
  /** Falha de rede (sem resposta). */
  networkError?: boolean;
}

export interface ControlDeps {
  caller: ControlCaller | null;
  instance: ControlInstance | null;
  instanceTenant: InstanceAccessTenant | null;
  env: { evolutionBaseUrl?: string | null; evolutionGlobalKey?: string | null };
  loadCredentials: () => Promise<ResolvedCredentials>;
  saveCredentials: (c: ProviderCredentials) => Promise<{ error: string | null }>;
  /** Tira da linha a chave/endereço antigos depois de gravar no cofre. */
  clearLegacyRowSecrets: () => Promise<void>;
  updateStatus: (patch: { status: string; last_connected_at?: string }) => Promise<void>;
  callProvider: (req: ProviderRequest) => Promise<ProviderResponse>;
  now?: () => Date;
}

export interface ControlResult {
  status: number;
  body: Record<string, unknown>;
}

export const SEM_CREDENCIAL_SERVIDOR =
  'Este número não tem chave salva no ConvoFlow. Abra os detalhes do número e use "Substituir chave", ' +
  'ou exclua e crie de novo para o ConvoFlow guardar a chave dele.';

const fail = (status: number, reason: string, error: string, extra: Record<string, unknown> = {}): ControlResult => ({
  status,
  body: { ok: false, reason, error, ...extra },
});

const trimSlash = (u: string) => u.replace(/\/+$/, '');

/** WAHA → vocabulário de whatsapp_instances.status (o mesmo do waha-webhook). */
export function mapWahaStatus(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  const s = raw.toUpperCase();
  if (s === 'WORKING') return 'connected';
  if (s === 'SCAN_QR_CODE') return 'qrcode';
  if (s === 'STARTING') return 'connecting';
  if (s === 'STOPPED' || s === 'FAILED') return 'disconnected';
  return null;
}

/** Evolution → vocabulário de whatsapp_instances.status. */
export function mapEvolutionState(raw: unknown): string | null {
  if (raw === 'open' || raw === 'close' || raw === 'connecting') return raw;
  return null;
}

const isConnected = (s: string | null | undefined) => s === 'open' || s === 'connected';

function sessionOf(instance: ControlInstance): string {
  const cfg = instance.connection_config;
  const name =
    cfg && typeof cfg === 'object' && !Array.isArray(cfg)
      ? (cfg as Record<string, unknown>).sessionName
      : undefined;
  return typeof name === 'string' && name ? name : instance.instance_key;
}

function evolutionHeaders(apiKey: string): Record<string, string> {
  return { 'Content-Type': 'application/json', apikey: apiKey };
}

function wahaHeaders(apiKey: string, accept = 'application/json'): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json', Accept: accept };
  if (apiKey) h['X-Api-Key'] = apiKey;
  return h;
}

/** Erro do provedor em pt-BR. Nunca repete o corpo cru (pode ter de tudo). */
function providerFailure(provider: string, res: ProviderResponse): ControlResult {
  if (res.blocked) return fail(400, 'blocked_address', res.blocked);
  if (res.networkError) {
    return fail(502, 'provider_unreachable',
      provider === 'waha'
        ? 'Não foi possível falar com o seu servidor WAHA. Confira se ele está no ar.'
        : 'Não foi possível falar com o servidor Evolution. Tente de novo em instantes.');
  }
  if (res.status === 401 || res.status === 403) {
    return fail(502, 'provider_auth',
      'O servidor do WhatsApp recusou a chave salva deste número. Abra os detalhes do número e use "Substituir chave".');
  }
  if (res.status === 404) {
    return fail(502, 'provider_not_found',
      provider === 'waha'
        ? 'A sessão deste número não existe no seu servidor WAHA.'
        : 'Esta instância não existe no servidor Evolution.');
  }
  return fail(502, 'provider_error', `O servidor do WhatsApp respondeu ${res.status}. Tente de novo em instantes.`);
}

const ok2xx = (r: ProviderResponse) => !r.blocked && !r.networkError && r.status >= 200 && r.status < 300;

// ---------------------------------------------------------------- portão

/** Quem pode, sobre qual instância. Devolve o erro ou null. */
export function gate(deps: Pick<ControlDeps, 'caller' | 'instance' | 'instanceTenant'>): ControlResult | null {
  const { caller, instance, instanceTenant } = deps;
  if (!caller || !caller.tenant_id) return fail(403, 'no_profile', 'Perfil sem Conta vinculada.');
  if (!instance) return fail(404, 'not_found', 'Instância não encontrada.');

  const access = decideInstanceAccess(caller, instance, instanceTenant);
  if (!access.allowed) {
    if (access.reason === 'inactive') return fail(403, 'inactive', statusDenialMessage(caller.status ?? ''));
    // Outra Conta: a mesma resposta de "não existe".
    return fail(404, 'not_found', 'Instância não encontrada.');
  }
  if (!can(caller.role, 'whatsapp.configure', caller.capabilities as Record<string, unknown> | null)) {
    return fail(403, 'forbidden', CAPABILITY_DENIAL_MESSAGES['whatsapp.configure']);
  }
  const provider = instance.provider || 'evolution';
  if (provider !== 'evolution' && provider !== 'waha') {
    return fail(400, 'unsupported_provider', 'Esta ação vale só para números Evolution e WAHA.');
  }
  return null;
}

// ---------------------------------------------------------------- ações

async function doStatus(deps: ControlDeps, instance: ControlInstance, creds: ProviderCredentials): Promise<ControlResult> {
  const provider = instance.provider || 'evolution';
  let next: string | null;
  if (provider === 'evolution') {
    const res = await deps.callProvider({
      method: 'GET',
      url: `${trimSlash(creds.baseUrl)}/instance/connectionState/${encodeURIComponent(instance.instance_key)}`,
      headers: evolutionHeaders(creds.apiKey),
      customerServer: false,
    });
    if (!ok2xx(res)) return providerFailure(provider, res);
    const j = (res.json ?? {}) as { instance?: { state?: unknown }; state?: unknown };
    next = mapEvolutionState(j.instance?.state ?? j.state);
  } else {
    const res = await deps.callProvider({
      method: 'GET',
      url: `${trimSlash(creds.baseUrl)}/api/sessions/${encodeURIComponent(sessionOf(instance))}`,
      headers: wahaHeaders(creds.apiKey),
      customerServer: true,
    });
    if (!ok2xx(res)) return providerFailure(provider, res);
    next = mapWahaStatus((res.json as { status?: unknown } | undefined)?.status);
  }
  if (!next) return fail(502, 'provider_error', 'O servidor do WhatsApp não informou o estado do número.');
  const changed = next !== instance.status;
  if (changed) await recordStatus(deps, next);
  return { status: 200, body: { ok: true, status: next, changed, credential_configured: true } };
}

async function recordStatus(deps: ControlDeps, next: string): Promise<void> {
  const now = (deps.now ?? (() => new Date()))();
  await deps.updateStatus(isConnected(next) ? { status: next, last_connected_at: now.toISOString() } : { status: next });
}

async function doConnect(deps: ControlDeps, instance: ControlInstance, creds: ProviderCredentials): Promise<ControlResult> {
  const provider = instance.provider || 'evolution';
  if (provider === 'evolution') {
    const res = await deps.callProvider({
      method: 'GET',
      url: `${trimSlash(creds.baseUrl)}/instance/connect/${encodeURIComponent(instance.instance_key)}`,
      headers: evolutionHeaders(creds.apiKey),
      customerServer: false,
    });
    if (!ok2xx(res)) return providerFailure(provider, res);
    const j = (res.json ?? {}) as { base64?: unknown; pairingCode?: unknown; instance?: { state?: unknown } };
    if (j.instance?.state === 'open') {
      if (instance.status !== 'open') await recordStatus(deps, 'open');
      return { status: 200, body: { ok: true, state: 'open', qr: null, pairing_code: null } };
    }
    // `base64` é a imagem pronta; `code` é o QR cru e NÃO é imagem.
    const qr = typeof j.base64 === 'string' && j.base64.startsWith('data:image') ? j.base64 : null;
    const pairing = typeof j.pairingCode === 'string' && j.pairingCode ? j.pairingCode : null;
    return { status: 200, body: { ok: true, state: qr || pairing ? 'qrcode' : 'connecting', qr, pairing_code: pairing } };
  }

  // WAHA: a sessão precisa estar em SCAN_QR_CODE para ter QR.
  const base = trimSlash(creds.baseUrl);
  const session = encodeURIComponent(sessionOf(instance));
  const info = await deps.callProvider({
    method: 'GET',
    url: `${base}/api/sessions/${session}`,
    headers: wahaHeaders(creds.apiKey),
    customerServer: true,
  });
  if (!ok2xx(info)) return providerFailure(provider, info);
  const state = mapWahaStatus((info.json as { status?: unknown } | undefined)?.status);
  if (state === 'connected') {
    if (instance.status !== 'connected') await recordStatus(deps, 'connected');
    return { status: 200, body: { ok: true, state: 'connected', qr: null, pairing_code: null } };
  }
  if (state === 'disconnected') {
    const started = await deps.callProvider({
      method: 'POST',
      url: `${base}/api/sessions/${session}/start`,
      headers: wahaHeaders(creds.apiKey),
      customerServer: true,
    });
    if (!ok2xx(started)) return providerFailure(provider, started);
    return { status: 200, body: { ok: true, state: 'connecting', qr: null, pairing_code: null } };
  }
  if (state === 'qrcode') {
    const img = await deps.callProvider({
      method: 'GET',
      url: `${base}/api/${session}/auth/qr?format=image`,
      headers: wahaHeaders(creds.apiKey, 'image/png'),
      customerServer: true,
    });
    if (!ok2xx(img)) return providerFailure(provider, img);
    const qr = img.base64 ? `data:${img.contentType || 'image/png'};base64,${img.base64}` : null;
    return { status: 200, body: { ok: true, state: 'qrcode', qr, pairing_code: null } };
  }
  return { status: 200, body: { ok: true, state: 'connecting', qr: null, pairing_code: null } };
}

async function doDisconnect(deps: ControlDeps, instance: ControlInstance, creds: ProviderCredentials): Promise<ControlResult> {
  const provider = instance.provider || 'evolution';
  const res =
    provider === 'evolution'
      ? await deps.callProvider({
          method: 'DELETE',
          url: `${trimSlash(creds.baseUrl)}/instance/logout/${encodeURIComponent(instance.instance_key)}`,
          headers: evolutionHeaders(creds.apiKey),
          customerServer: false,
        })
      : await deps.callProvider({
          method: 'POST',
          url: `${trimSlash(creds.baseUrl)}/api/sessions/${encodeURIComponent(sessionOf(instance))}/logout`,
          headers: wahaHeaders(creds.apiKey),
          customerServer: true,
        });
  if (!ok2xx(res)) return providerFailure(provider, res);
  const next = provider === 'evolution' ? 'close' : 'disconnected';
  await recordStatus(deps, next);
  return { status: 200, body: { ok: true, status: next } };
}

const KEY_PATTERN = /^\S{8,512}$/;

async function doReplaceKey(
  deps: ControlDeps,
  instance: ControlInstance,
  current: ProviderCredentials | null,
  rawKey: unknown,
): Promise<ControlResult> {
  const provider = instance.provider || 'evolution';
  const newKey = typeof rawKey === 'string' ? rawKey.trim() : '';
  if (!KEY_PATTERN.test(newKey)) {
    return fail(400, 'invalid_key', 'Cole a chave inteira, sem espaços (de 8 a 512 caracteres).');
  }

  let baseUrl: string;
  let probe: ProviderRequest;
  if (provider === 'evolution') {
    const global = (deps.env.evolutionGlobalKey || '').trim();
    if (global && newKey === global) {
      return fail(400, 'global_key', 'Essa é a chave do servidor inteiro, não a deste número. Use a chave da instância.');
    }
    baseUrl = trimSlash(current?.baseUrl || deps.env.evolutionBaseUrl || '');
    if (!baseUrl) return fail(503, 'server_misconfigured', 'O servidor Evolution da plataforma não está configurado.');
    probe = {
      method: 'GET',
      url: `${baseUrl}/instance/connectionState/${encodeURIComponent(instance.instance_key)}`,
      headers: evolutionHeaders(newKey),
      customerServer: false,
    };
  } else {
    if (!current?.baseUrl) {
      return fail(409, 'no_server', 'Este número não tem o endereço do servidor WAHA salvo. Exclua e cadastre de novo.');
    }
    baseUrl = trimSlash(current.baseUrl);
    probe = {
      method: 'GET',
      url: `${baseUrl}/api/sessions/${encodeURIComponent(sessionOf(instance))}`,
      headers: wahaHeaders(newKey),
      customerServer: true,
    };
  }

  // Só guarda chave que abre ESTE número: quem tem uma chave que funciona já
  // manda nele, então guardá-la não dá a ninguém nada que ele não tinha.
  const res = await deps.callProvider(probe);
  if (!ok2xx(res)) {
    if (res.status === 401 || res.status === 403) {
      return fail(400, 'key_rejected', 'O servidor recusou essa chave para este número. Nada foi trocado.');
    }
    return providerFailure(provider, res);
  }

  const { error } = await deps.saveCredentials({
    baseUrl,
    apiKey: newKey,
    ...(current?.webhookSecret ? { webhookSecret: current.webhookSecret } : {}),
  });
  if (error) return fail(500, 'vault_error', 'Não foi possível guardar a chave. Nada foi trocado. Tente de novo.');
  await deps.clearLegacyRowSecrets();
  return { status: 200, body: { ok: true, credential_configured: true } };
}

// ------------------------------------------------------------- entrada

export async function runInstanceAction(
  action: unknown,
  body: { api_key?: unknown },
  deps: ControlDeps,
): Promise<ControlResult> {
  if (typeof action !== 'string' || !(INSTANCE_ACTIONS as readonly string[]).includes(action)) {
    return fail(400, 'invalid_action', 'Ação desconhecida.');
  }
  const denied = gate(deps);
  if (denied) return denied;
  const instance = deps.instance as ControlInstance;

  const { credentials } = await deps.loadCredentials();

  if (action === 'credential') {
    return { status: 200, body: { ok: true, credential_configured: !!credentials } };
  }
  if (action === 'replace_key') {
    return doReplaceKey(deps, instance, credentials, body.api_key);
  }
  if (!credentials) {
    return fail(409, 'no_credentials', SEM_CREDENCIAL_SERVIDOR, { credential_configured: false });
  }
  if (action === 'status') return doStatus(deps, instance, credentials);
  if (action === 'connect') return doConnect(deps, instance, credentials);
  return doDisconnect(deps, instance, credentials);
}
