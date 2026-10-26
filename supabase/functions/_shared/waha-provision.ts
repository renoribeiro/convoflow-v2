// =============================================================================
// waha-provision.ts — cadastrar um número WAHA pelo SERVIDOR (edge function
// `waha-provision`)
// =============================================================================
// Até 2026-10-26 o navegador falava direto com o servidor WAHA do cliente e
// gravava endereço e chave na linha de whatsapp_instances (que todo membro da
// Loja lê). E o webhook não levava senha nenhuma que o waha-webhook aceitasse:
// o único jeito de receber eventos era entregar ao cliente a senha GLOBAL, com
// a qual ele forjaria eventos para os números WAHA de todas as Lojas.
//
// Agora, nesta ordem:
//   1. quem chama tem `whatsapp.configure` e perfil ativo; o número nasce na
//      Conta/Loja do perfil (a mesma regra do evolution-provision);
//   2. o endereço do servidor passa pelo bloqueio de rede interna
//      (`safe-outbound-url.ts`) ANTES de qualquer chamada;
//   3. o servidor responde em /api/health;
//   4. o ConvoFlow cria a sessão com o webhook apontando para
//      waha-webhook?instance=<id> e uma senha SÓ deste número (`hmac.key`,
//      SKILL.md §2.3 e §4.3);
//   5. a linha nasce sem endereço, sem chave e sem senha; os três vão para o
//      cofre (set_instance_provider_credentials).
// Se o passo 5 falhar, a linha sai e, se fomos nós que criamos a sessão, ela
// sai do servidor WAHA também. Sessão que já existia no servidor do cliente
// nunca é apagada por aqui.
//
// Regra pura com dependências injetadas: o Vitest roda sem Deno.
// =============================================================================

import { can, CAPABILITY_DENIAL_MESSAGES, statusDenialMessage } from './capabilities.ts';
import type { ProviderRequest, ProviderResponse, ControlResult } from './instance-control.ts';

export interface WahaProvisionCaller {
  tenant_id: string | null;
  role: string | null;
  status: string | null;
  capabilities?: unknown;
}

export interface WahaProvisionDeps {
  caller: WahaProvisionCaller | null;
  supabaseUrl: string;
  newInstanceId: () => string;
  newSecret: () => string;
  /** assertPublicUrl: devolve o endereço normalizado ou a mensagem de recusa. */
  checkUrl: (raw: string) => Promise<{ ok: true; url: string } | { ok: false; message: string }>;
  instanceKeyTaken: (key: string) => Promise<boolean>;
  callWaha: (req: ProviderRequest) => Promise<ProviderResponse>;
  insertInstance: (row: Record<string, unknown>) => Promise<{ error: string | null }>;
  saveCredentials: (instanceId: string, c: { baseUrl: string; apiKey?: string; webhookSecret: string }) => Promise<{ error: string | null }>;
  deleteInstance: (instanceId: string) => Promise<void>;
}

export const WAHA_WEBHOOK_EVENTS = ['message', 'message.ack', 'session.status'];

const SESSION_PATTERN = /^[A-Za-z0-9_-]{1,50}$/;
const KEY_PATTERN = /^\S{1,512}$/;

const fail = (status: number, reason: string, error: string): ControlResult => ({
  status,
  body: { ok: false, reason, error },
});

const ok2xx = (r: ProviderResponse) => !r.blocked && !r.networkError && r.status >= 200 && r.status < 300;

function headers(apiKey: string): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (apiKey) h['X-Api-Key'] = apiKey;
  return h;
}

export async function provisionWaha(
  input: { name?: unknown; server_url?: unknown; api_key?: unknown; session_name?: unknown; engine?: unknown },
  deps: WahaProvisionDeps,
): Promise<ControlResult> {
  const caller = deps.caller;
  if (!caller?.tenant_id) return fail(403, 'no_profile', 'Perfil sem Conta vinculada.');
  if (caller.status !== 'active') return fail(403, 'inactive', statusDenialMessage(caller.status ?? ''));
  if (!can(caller.role, 'whatsapp.configure', caller.capabilities as Record<string, unknown> | null)) {
    return fail(403, 'forbidden', CAPABILITY_DENIAL_MESSAGES['whatsapp.configure']);
  }

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (name.length < 3 || name.length > 50) return fail(400, 'invalid_name', 'O nome precisa ter de 3 a 50 caracteres.');
  const session = typeof input.session_name === 'string' ? input.session_name.trim() : '';
  if (!SESSION_PATTERN.test(session)) {
    return fail(400, 'invalid_session', 'Nome da sessão: até 50 caracteres, só letras, números, _ e -.');
  }
  const apiKey = typeof input.api_key === 'string' ? input.api_key.trim() : '';
  if (apiKey && !KEY_PATTERN.test(apiKey)) return fail(400, 'invalid_key', 'A API Key não pode ter espaços.');
  const engine = input.engine === 'core' || input.engine === 'plus' ? input.engine : undefined;

  const checked = await deps.checkUrl(typeof input.server_url === 'string' ? input.server_url : '');
  if (!checked.ok) return fail(400, 'blocked_address', checked.message);
  const base = checked.url.replace(/\/+$/, '');

  if (await deps.instanceKeyTaken(session)) {
    return fail(409, 'session_taken', 'Já existe um número no ConvoFlow com esse nome de sessão. Escolha outro nome.');
  }

  const health = await deps.callWaha({ method: 'GET', url: `${base}/api/health`, headers: headers(apiKey), customerServer: true });
  if (health.blocked) return fail(400, 'blocked_address', health.blocked);
  if (health.networkError) return fail(502, 'unreachable', 'Não foi possível alcançar o servidor WAHA. Confira o endereço e se ele está no ar.');
  if (!ok2xx(health)) return fail(502, 'health_failed', `O servidor WAHA respondeu ${health.status} em /api/health.`);

  const instanceId = deps.newInstanceId();
  const secret = deps.newSecret();
  const webhookUrl = `${deps.supabaseUrl.replace(/\/+$/, '')}/functions/v1/waha-webhook?instance=${instanceId}`;
  const webhooks = [
    { url: webhookUrl, events: WAHA_WEBHOOK_EVENTS, hmac: { key: secret }, retries: { delaySeconds: 2, attempts: 5 } },
  ];

  let createdHere = false;
  const created = await deps.callWaha({
    method: 'POST',
    url: `${base}/api/sessions`,
    headers: headers(apiKey),
    body: { name: session, start: true, config: { webhooks } },
    customerServer: true,
  });
  if (ok2xx(created)) {
    createdHere = true;
  } else if (created.status === 409 || created.status === 422) {
    // A sessão já existe no servidor do cliente: só troca o webhook dela.
    const updated = await deps.callWaha({
      method: 'PUT',
      url: `${base}/api/sessions/${encodeURIComponent(session)}`,
      headers: headers(apiKey),
      body: { config: { webhooks } },
      customerServer: true,
    });
    if (!ok2xx(updated)) return sessionFailure(updated);
  } else {
    return sessionFailure(created);
  }

  const dropRemote = async () => {
    if (!createdHere) return;
    await deps.callWaha({
      method: 'DELETE',
      url: `${base}/api/sessions/${encodeURIComponent(session)}`,
      headers: headers(apiKey),
      customerServer: true,
    });
  };

  const { error: insertError } = await deps.insertInstance({
    id: instanceId,
    tenant_id: caller.tenant_id,
    name,
    instance_key: session,
    provider: 'waha',
    status: 'disconnected',
    // Sem endereço, chave e senha: os três vão para o cofre logo abaixo.
    connection_config: { sessionName: session, ...(engine ? { engine } : {}) },
    webhook_url: webhookUrl,
    webhook_configured: true,
    webhook_events: WAHA_WEBHOOK_EVENTS,
  });
  if (insertError) {
    await dropRemote();
    return fail(500, 'insert_failed', 'Não foi possível salvar o número. Nada foi criado.');
  }

  const { error: vaultError } = await deps.saveCredentials(instanceId, {
    baseUrl: base,
    ...(apiKey ? { apiKey } : {}),
    webhookSecret: secret,
  });
  if (vaultError) {
    await deps.deleteInstance(instanceId);
    await dropRemote();
    return fail(500, 'vault_error', 'Não foi possível guardar a chave do servidor. Nada foi criado. Tente de novo.');
  }

  return { status: 200, body: { ok: true, instance_id: instanceId, instance_key: session, name } };
}

function sessionFailure(res: ProviderResponse): ControlResult {
  if (res.blocked) return fail(400, 'blocked_address', res.blocked);
  if (res.networkError) return fail(502, 'unreachable', 'Não foi possível alcançar o servidor WAHA.');
  if (res.status === 401 || res.status === 403) return fail(400, 'key_rejected', 'O servidor WAHA recusou a API Key. Confira a chave.');
  return fail(502, 'session_failed', `O servidor WAHA não criou a sessão (resposta ${res.status}). Nada foi salvo.`);
}
