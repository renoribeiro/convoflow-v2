import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/validation.ts';
import { can, CAPABILITY_DENIAL_MESSAGES, statusDenialMessage } from '../_shared/capabilities.ts';

interface SetupRequest {
  instance_id: string;
  access_token?: string;
  mode: 'create' | 'verify';
  graph_api_version?: string;
}

interface ValidationResult {
  ok: boolean;
  error?: string;
  phoneNumberDisplay?: string;
  verifiedName?: string;
}

const DEFAULT_GRAPH_VERSION = 'v20.0';

Deno.serve(async (req: Request) => {
  const logger = createLogger(req);
  const corsHeaders = buildCorsHeaders(req.headers.get('origin'));

  const jsonResponse = (body: Record<string, any>, status: number): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !supabaseServiceKey) {
    logger.error('Missing Supabase configuration');
    return jsonResponse({ ok: false, error: 'Server misconfigured' }, 500);
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  // Auth check
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ ok: false, error: 'Missing authorization header' }, 401);
  }
  const token = authHeader.replace('Bearer ', '');
  const { data: { user: callerUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !callerUser) {
    return jsonResponse({ ok: false, error: 'Invalid token' }, 401);
  }

  // Resolve caller's tenant
  const { data: callerProfile } = await supabaseAdmin
    .from('profiles')
    .select('tenant_id, role, status, capabilities')
    .eq('user_id', callerUser.id)
    .single();

  if (!callerProfile?.tenant_id) {
    return jsonResponse({ ok: false, error: 'Profile not found' }, 403);
  }

  // Conta parada não configura nada.
  if (callerProfile.status !== 'active') {
    return jsonResponse({ ok: false, error: statusDenialMessage(callerProfile.status) }, 403);
  }

  // Configurar número de WhatsApp é whatsapp.configure — atendente não faz.
  // O front já esconde a tela; aqui o servidor para de confiar nisso.
  if (!can(callerProfile.role, 'whatsapp.configure', callerProfile.capabilities)) {
    return jsonResponse(
      { ok: false, error: CAPABILITY_DENIAL_MESSAGES['whatsapp.configure'] },
      403,
    );
  }

  let body: SetupRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  if (!body?.instance_id || !body?.mode) {
    return jsonResponse({ ok: false, error: 'instance_id and mode are required' }, 400);
  }

  // Load the instance and confirm it belongs to caller's tenant + is provider=official
  const { data: instance, error: instanceError } = await supabaseAdmin
    .from('whatsapp_instances')
    .select('id, tenant_id, provider, connection_config, instance_key')
    .eq('id', body.instance_id)
    .single();

  if (instanceError || !instance) {
    logger.warn('Instance not found', { instance_id: body.instance_id });
    return jsonResponse({ ok: false, error: 'Instance not found' }, 404);
  }

  // Enum user_role usa 'superadmin'; 'super_admin' é legado aceito por compat.
  const isSuperAdmin = callerProfile.role === 'superadmin' || callerProfile.role === 'super_admin';
  if (!isSuperAdmin && instance.tenant_id !== callerProfile.tenant_id) {
    return jsonResponse({ ok: false, error: 'Forbidden' }, 403);
  }

  if (instance.provider !== 'official') {
    return jsonResponse({ ok: false, error: 'Instance is not configured as Meta provider' }, 400);
  }

  const cfg = (instance.connection_config as Record<string, any>) || {};
  const phoneNumberId: string | undefined = cfg.phoneNumberId;
  const wabaId: string | undefined = cfg.wabaId;
  const graphVersion: string =
    body.graph_api_version || cfg.graphApiVersion || DEFAULT_GRAPH_VERSION;

  if (!phoneNumberId || !wabaId) {
    return jsonResponse(
      { ok: false, error: 'connection_config is missing phoneNumberId or wabaId' },
      400,
    );
  }

  try {
    let accessToken: string | undefined = body.access_token;

    if (body.mode === 'create') {
      if (!accessToken) {
        return jsonResponse({ ok: false, error: 'access_token is required in create mode' }, 400);
      }

      // Validate the access token by hitting the phone number endpoint
      const validation = await validatePhoneNumber(phoneNumberId, accessToken, graphVersion);
      if (!validation.ok) {
        return jsonResponse({ ok: false, error: validation.error || 'Invalid access token' }, 400);
      }

      // Subscribe the App to the WABA so the webhook starts receiving events
      const subscribe = await subscribeWaba(wabaId, accessToken, graphVersion);
      if (!subscribe.ok) {
        return jsonResponse({ ok: false, error: subscribe.error || 'Failed to subscribe WABA' }, 400);
      }

      // Persist token in Vault via SECURITY DEFINER RPC
      const { error: rpcError } = await supabaseAdmin.rpc('set_instance_meta_token', {
        p_instance_id: instance.id,
        p_token: accessToken,
      });
      if (rpcError) {
        logger.error('Failed to store Meta token', { error: rpcError.message });
        return jsonResponse({ ok: false, error: 'Failed to store access token' }, 500);
      }

      // Mark instance as connected
      await supabaseAdmin
        .from('whatsapp_instances')
        .update({
          status: 'open',
          phone_number: validation.phoneNumberDisplay || null,
          profile_name: validation.verifiedName || null,
          last_connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', instance.id);

      logger.info('Meta instance configured', { instance_id: instance.id });

      return jsonResponse({
        ok: true,
        phoneNumberDisplay: validation.phoneNumberDisplay,
        verifiedName: validation.verifiedName,
      }, 200);
    }

    if (body.mode === 'verify') {
      // For verify, use the stored token unless one is provided in the request
      if (!accessToken) {
        const { data: storedToken, error: tokenError } = await supabaseAdmin.rpc(
          'get_instance_meta_token',
          { p_instance_id: instance.id },
        );
        if (tokenError || !storedToken) {
          return jsonResponse({ ok: false, error: 'No stored access token to verify' }, 400);
        }
        accessToken = storedToken as unknown as string;
      }

      const validation = await validatePhoneNumber(phoneNumberId, accessToken!, graphVersion);
      if (!validation.ok) {
        return jsonResponse({ ok: false, error: validation.error }, 400);
      }

      return jsonResponse({
        ok: true,
        phoneNumberDisplay: validation.phoneNumberDisplay,
        verifiedName: validation.verifiedName,
      }, 200);
    }

    return jsonResponse({ ok: false, error: 'Unknown mode' }, 400);
  } catch (error: any) {
    logger.error('whatsapp-meta-setup failed', { error: error.message });
    return jsonResponse({ ok: false, error: error.message || 'Unknown error' }, 500);
  }
});

async function validatePhoneNumber(
  phoneNumberId: string,
  accessToken: string,
  graphVersion: string,
): Promise<ValidationResult> {
  const url = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}?fields=display_phone_number,verified_name`;
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const text = await response.text();
    return { ok: false, error: `Meta API error (${response.status}): ${truncate(text, 300)}` };
  }

  const data = await response.json();
  return {
    ok: true,
    phoneNumberDisplay: data.display_phone_number,
    verifiedName: data.verified_name,
  };
}

async function subscribeWaba(
  wabaId: string,
  accessToken: string,
  graphVersion: string,
): Promise<ValidationResult> {
  const url = `https://graph.facebook.com/${graphVersion}/${wabaId}/subscribed_apps`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const text = await response.text();
    return { ok: false, error: `Meta subscribed_apps error (${response.status}): ${truncate(text, 300)}` };
  }

  return { ok: true };
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

