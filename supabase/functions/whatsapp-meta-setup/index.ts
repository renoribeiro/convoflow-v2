import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/validation.ts';
import { can, CAPABILITY_DENIAL_MESSAGES, statusDenialMessage } from '../_shared/capabilities.ts';
import { decideInstanceAccess } from '../_shared/instance-access.ts';
import { decideConnectTarget, targetTenantIdFor } from '../_shared/connect-target.ts';

/**
 * API Oficial do WhatsApp pelos campos (app próprio da empresa na Meta).
 *
 *   create_manual  O formulário manual. Desde o lote 6b (B2, 2026-10-29) a
 *                  linha nasce AQUI, no servidor, na Loja aberta no topo
 *                  (`tenant_id`), conferida por connect-target.ts. Antes o
 *                  navegador inseria a linha em `profiles.tenant_id` (para o
 *                  Gerente, a Conta) e só depois chamava `create`.
 *                  Ordem: Loja → número ainda não existe → Meta valida a
 *                  chave → app inscrito na WABA → linha → chave no cofre. Se o
 *                  cofre recusar, a linha sai: nada fica pela metade.
 *   create         Legado (navegador antigo em cache): grava a chave numa
 *                  linha que já existe.
 *   verify         Confere a chave guardada. Alcance pela regra de
 *                  instance-access.ts (o Gerente confere número da Loja filha).
 */
interface SetupRequest {
  instance_id?: string;
  access_token?: string;
  mode: 'create' | 'verify' | 'create_manual';
  graph_api_version?: string;
  // create_manual
  tenant_id?: string;
  name?: string;
  phone_number_id?: string;
  waba_id?: string;
}

const META_ID_PATTERN = /^\d{6,30}$/;
const GRAPH_VERSION_PATTERN = /^v\d{1,2}\.\d{1,2}$/;

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

  if (!callerProfile) {
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

  if (body?.mode === 'create_manual') {
    return await createManual(body);
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

  // Mesma regra do envio (instance-access.ts): superadmin, a própria Loja, ou o
  // Gerente numa Loja filha. Antes era só "mesmo tenant_id do perfil", e o
  // Gerente não conseguia conferir número das Lojas dele.
  const { data: instanceTenant } = await supabaseAdmin
    .from('tenants')
    .select('id, kind, parent_tenant_id')
    .eq('id', instance.tenant_id)
    .maybeSingle();
  if (!decideInstanceAccess(callerProfile, instance, instanceTenant ?? null).allowed) {
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

  async function createManual(req: SetupRequest): Promise<Response> {
    const targetId = targetTenantIdFor(callerProfile, req.tenant_id);
    const { data: targetTenant } = targetId
      ? await supabaseAdmin.from('tenants').select('id, kind, parent_tenant_id').eq('id', targetId).maybeSingle()
      : { data: null };
    const target = decideConnectTarget({
      caller: callerProfile,
      requestedTenantId: req.tenant_id,
      targetTenant: targetTenant ?? null,
    });
    if (!target.ok) {
      logger.warn('create_manual recusado', { reason: target.reason, userId: callerUser!.id });
      return jsonResponse({ ok: false, reason: target.reason, error: target.message }, target.status);
    }

    const name = typeof req.name === 'string' ? req.name.trim() : '';
    const phoneNumberId = typeof req.phone_number_id === 'string' ? req.phone_number_id.trim() : '';
    const wabaId = typeof req.waba_id === 'string' ? req.waba_id.trim() : '';
    const accessToken = typeof req.access_token === 'string' ? req.access_token.trim() : '';
    const graphVersion =
      typeof req.graph_api_version === 'string' && GRAPH_VERSION_PATTERN.test(req.graph_api_version)
        ? req.graph_api_version
        : DEFAULT_GRAPH_VERSION;
    if (name.length < 3 || name.length > 50) {
      return jsonResponse({ ok: false, reason: 'invalid', error: 'O nome precisa ter de 3 a 50 caracteres.' }, 400);
    }
    if (!META_ID_PATTERN.test(phoneNumberId)) {
      return jsonResponse({ ok: false, reason: 'invalid', error: 'O código do número na Meta tem só números.' }, 400);
    }
    if (!META_ID_PATTERN.test(wabaId)) {
      return jsonResponse({ ok: false, reason: 'invalid', error: 'O código da conta do WhatsApp Business tem só números.' }, 400);
    }
    if (accessToken.length < 40) {
      return jsonResponse({ ok: false, reason: 'invalid', error: 'A chave de acesso parece incompleta. Cole a chave inteira.' }, 400);
    }

    // Já existe? Pelas duas colunas, como no caminho do Facebook. Não diz de quem é.
    const { data: existing } = await supabaseAdmin
      .from('whatsapp_instances')
      .select('id')
      .or(`instance_key.eq.${phoneNumberId},connection_config->>phoneNumberId.eq.${phoneNumberId}`)
      .limit(1);
    if (existing && existing.length > 0) {
      return jsonResponse({
        ok: false,
        reason: 'already_exists',
        error: 'Este número já está no ConvoFlow. Para reconectar, use o botão "Conectar com a Meta". Se ele não é seu, escreva para contato@convoflow.com.br.',
      }, 409);
    }

    try {
      const validation = await validatePhoneNumber(phoneNumberId, accessToken, graphVersion);
      if (!validation.ok) {
        return jsonResponse({ ok: false, reason: 'meta_rejected', error: validation.error || 'Invalid access token' }, 400);
      }
      const subscribe = await subscribeWaba(wabaId, accessToken, graphVersion);
      if (!subscribe.ok) {
        return jsonResponse({ ok: false, reason: 'meta_rejected', error: subscribe.error || 'Failed to subscribe WABA' }, 400);
      }

      const { data: inserted, error: insertError } = await supabaseAdmin
        .from('whatsapp_instances')
        .insert({
          tenant_id: target.tenantId,
          name,
          instance_key: phoneNumberId,
          provider: 'official',
          status: 'open',
          phone_number: validation.phoneNumberDisplay || null,
          profile_name: validation.verifiedName || null,
          last_connected_at: new Date().toISOString(),
          connection_config: { phoneNumberId, wabaId, graphApiVersion: graphVersion },
        })
        .select('id')
        .single();
      if (insertError || !inserted) {
        logger.error('create_manual: insert falhou', { error: insertError?.message });
        return jsonResponse({ ok: false, reason: 'insert_failed', error: 'Não foi possível salvar o número. Tente de novo em instantes.' }, 500);
      }

      const { error: rpcError } = await supabaseAdmin.rpc('set_instance_meta_token', {
        p_instance_id: inserted.id,
        p_token: accessToken,
      });
      if (rpcError) {
        logger.error('create_manual: cofre recusou', { error: rpcError.message });
        await supabaseAdmin.from('whatsapp_instances').delete().eq('id', inserted.id);
        return jsonResponse({ ok: false, reason: 'vault_error', error: 'Não foi possível guardar a chave. Nada foi criado. Tente de novo.' }, 500);
      }

      logger.info('create_manual: número criado', { instance_id: inserted.id, tenant_id: target.tenantId, access: target.access });
      return jsonResponse({
        ok: true,
        instance_id: inserted.id,
        phoneNumberDisplay: validation.phoneNumberDisplay,
        verifiedName: validation.verifiedName,
      }, 200);
    } catch (error: any) {
      logger.error('create_manual falhou', { error: error?.message });
      return jsonResponse({ ok: false, error: 'Não foi possível falar com a Meta agora. Tente de novo em instantes.' }, 500);
    }
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

