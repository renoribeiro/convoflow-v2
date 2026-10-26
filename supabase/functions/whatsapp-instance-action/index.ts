import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/validation.ts';
import { runInstanceAction } from '../_shared/instance-control.ts';
import { credentialsForVault, loadProviderCredentials } from '../_shared/instance-credentials.ts';
import { callProvider } from '../_shared/provider-call.ts';

/**
 * Estado, QR, desconectar, "tem chave?" e trocar a chave de um número
 * Evolution ou WAHA. Quem decide e como: `_shared/instance-control.ts`.
 *
 * Corpo: { instance_id: uuid, action: 'status' | 'connect' | 'disconnect' |
 *          'credential' | 'replace_key', api_key?: string (só replace_key) }
 *
 * A resposta NUNCA leva a chave nem o endereço do servidor. O que volta é o
 * estado, o QR (imagem) ou o código de pareamento, e se há chave salva.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  const logger = createLogger(req);
  const corsHeaders = buildCorsHeaders(req.headers.get('origin'));
  const jsonResponse = (body: Record<string, unknown>, status: number): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    logger.error('Missing Supabase configuration');
    return jsonResponse({ ok: false, error: 'Server misconfigured' }, 500);
  }
  const admin = createClient(supabaseUrl, serviceKey);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ ok: false, error: 'Missing authorization header' }, 401);
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return jsonResponse({ ok: false, error: 'Invalid token' }, 401);

  let body: { instance_id?: unknown; action?: unknown; api_key?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400);
  }
  const instanceId = String(body?.instance_id ?? '').trim();
  if (!UUID_PATTERN.test(instanceId)) return jsonResponse({ ok: false, error: 'instance_id inválido.' }, 400);

  const { data: caller } = await admin
    .from('profiles')
    .select('tenant_id, role, status, capabilities')
    .eq('user_id', user.id)
    .maybeSingle();

  const { data: instance } = await admin
    .from('whatsapp_instances')
    .select('id, tenant_id, instance_key, provider, status, connection_config, evolution_api_key, evolution_api_url')
    .eq('id', instanceId)
    .maybeSingle();

  const { data: instanceTenant } = instance
    ? await admin.from('tenants').select('id, kind, parent_tenant_id').eq('id', instance.tenant_id).maybeSingle()
    : { data: null };

  const env = {
    evolutionBaseUrl: Deno.env.get('EVOLUTION_API_URL'),
    evolutionGlobalKey: Deno.env.get('EVOLUTION_GLOBAL_KEY'),
  };

  const result = await runInstanceAction(body.action, { api_key: body.api_key }, {
    caller,
    instance,
    instanceTenant,
    env,
    loadCredentials: () => loadProviderCredentials(admin, instance!, env),
    saveCredentials: async (c) => {
      const { error } = await admin.rpc('set_instance_provider_credentials', {
        p_instance_id: instanceId,
        p_credentials: credentialsForVault(c),
      });
      return { error: error?.message ?? null };
    },
    clearLegacyRowSecrets: async () => {
      const cfg = (instance?.connection_config && typeof instance.connection_config === 'object'
        ? { ...(instance.connection_config as Record<string, unknown>) }
        : {}) as Record<string, unknown>;
      delete cfg.apiKey;
      delete cfg.baseUrl;
      await admin
        .from('whatsapp_instances')
        .update({ connection_config: cfg, evolution_api_key: null, evolution_api_url: null })
        .eq('id', instanceId);
    },
    updateStatus: async (patch) => {
      await admin
        .from('whatsapp_instances')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', instanceId);
    },
    callProvider,
  });

  logger.info('whatsapp-instance-action', {
    instanceId,
    userId: user.id,
    action: typeof body.action === 'string' ? body.action : null,
    httpStatus: result.status,
    reason: result.body.reason ?? null,
  });
  return jsonResponse(result.body, result.status);
});
