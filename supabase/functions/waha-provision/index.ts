import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/validation.ts';
import { provisionWaha } from '../_shared/waha-provision.ts';
import { credentialsForVault } from '../_shared/instance-credentials.ts';
import { callProvider } from '../_shared/provider-call.ts';
import { assertPublicUrl, OutboundUrlError } from '../_shared/safe-outbound-url.ts';
import { newWebhookSecret } from '../_shared/waha-webhook-auth.ts';

/**
 * Cadastra um número WAHA (servidor do cliente). Regra, ordem e por quê:
 * `_shared/waha-provision.ts`.
 *
 * Corpo: { name, server_url, api_key?, session_name, engine?, tenant_id? }
 * `tenant_id` é a Loja aberta no topo; o número nasce nela (connect-target.ts).
 * A resposta NUNCA devolve endereço, chave nem a senha de entrega.
 */

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

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const { data: caller } = await admin
    .from('profiles')
    .select('tenant_id, role, status, capabilities')
    .eq('user_id', user.id)
    .maybeSingle();

  const result = await provisionWaha(body, {
    caller,
    loadTenant: async (tenantId) => {
      const { data } = await admin.from('tenants').select('id, kind, parent_tenant_id').eq('id', tenantId).maybeSingle();
      return data ?? null;
    },
    supabaseUrl,
    newInstanceId: () => crypto.randomUUID(),
    newSecret: newWebhookSecret,
    checkUrl: async (raw) => {
      try {
        return { ok: true, url: (await assertPublicUrl(raw)).toString() };
      } catch (err) {
        if (err instanceof OutboundUrlError) return { ok: false, message: err.message };
        return { ok: false, message: 'O endereço do servidor não é válido.' };
      }
    },
    instanceKeyTaken: async (key) => {
      const { data } = await admin.from('whatsapp_instances').select('id').eq('instance_key', key).maybeSingle();
      return !!data;
    },
    callWaha: callProvider,
    insertInstance: async (row) => {
      const { error } = await admin.from('whatsapp_instances').insert(row);
      return { error: error?.message ?? null };
    },
    saveCredentials: async (instanceId, c) => {
      const { error } = await admin.rpc('set_instance_provider_credentials', {
        p_instance_id: instanceId,
        p_credentials: credentialsForVault(c),
      });
      return { error: error?.message ?? null };
    },
    deleteInstance: async (instanceId) => {
      await admin.from('whatsapp_instances').delete().eq('id', instanceId);
    },
  });

  logger.info('waha-provision', {
    userId: user.id,
    callerTenantId: caller?.tenant_id ?? null,
    requestedTenantId: typeof body.tenant_id === 'string' ? body.tenant_id : null,
    httpStatus: result.status,
    reason: result.body.reason ?? null,
  });
  return jsonResponse(result.body, result.status);
});
