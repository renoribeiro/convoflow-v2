import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/validation.ts';
import { can, CAPABILITY_DENIAL_MESSAGES, statusDenialMessage } from '../_shared/capabilities.ts';

// Graph API version used by the entire codebase (meta.ts, meta-oauth-exchange, whatsapp-meta-setup).
const DEFAULT_GRAPH_VERSION = 'v20.0';

// Meta error codes observed when the number is already registered or already
// has a two-step PIN set. Both cases are idempotent from our perspective unless
// the caller must provide the existing PIN.
//
// Error 133015: "Phone number already registered" — treat as success.
// Error 136024: "Two-step verification PIN already set" — the number was
//   previously registered with a different PIN. The caller must supply that
//   PIN via body.pin; we return a 409 with a clear explanation.
const META_ERR_ALREADY_REGISTERED = 133015;
const META_ERR_PIN_ALREADY_SET = 136024;

interface RegisterRequest {
  /** ID of the whatsapp_instances row to register. */
  instanceId: string;
  /**
   * 6-digit numeric PIN for WhatsApp's two-step verification.
   * If omitted, a random PIN is generated and returned in the response.
   * If the number already has a PIN set (Meta error 136024), this field
   * is required and must match the existing PIN.
   */
  pin?: string;
}

interface MetaGraphError {
  message: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

interface MetaRegisterResponse {
  success?: boolean;
  error?: MetaGraphError;
}

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
    return jsonResponse({ success: false, error: 'Método não permitido' }, 405);
  }

  // --- Environment validation ---
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    logger.error('Missing Supabase configuration');
    return jsonResponse({ success: false, error: 'Servidor mal configurado' }, 500);
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  // --- Auth check (JWT verified at gateway; belt-and-suspenders via getUser) ---
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ success: false, error: 'Cabeçalho de autorização ausente' }, 401);
  }
  const jwtToken = authHeader.replace('Bearer ', '');
  const { data: { user: callerUser }, error: authError } = await supabaseAdmin.auth.getUser(jwtToken);
  if (authError || !callerUser) {
    return jsonResponse({ success: false, error: 'Token inválido' }, 401);
  }

  // --- Resolve caller's tenant (same pattern as meta-oauth-exchange) ---
  const { data: callerProfile } = await supabaseAdmin
    .from('profiles')
    .select('tenant_id, role, status, capabilities')
    .eq('user_id', callerUser.id)
    .single();

  if (!callerProfile?.tenant_id) {
    return jsonResponse({ success: false, error: 'Conta do usuário não encontrada' }, 403);
  }

  // Conta parada não registra número.
  if (callerProfile.status !== 'active') {
    return jsonResponse({ success: false, error: statusDenialMessage(callerProfile.status) }, 403);
  }

  // Registrar número na Cloud API é whatsapp.configure — atendente não faz.
  if (!can(callerProfile.role, 'whatsapp.configure', callerProfile.capabilities)) {
    return jsonResponse(
      { success: false, error: CAPABILITY_DENIAL_MESSAGES['whatsapp.configure'] },
      403,
    );
  }

  // --- Parse and validate request body ---
  let body: RegisterRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false, error: 'JSON inválido no corpo da requisição' }, 400);
  }

  const { instanceId, pin: bodyPin } = body ?? {};

  if (!instanceId || typeof instanceId !== 'string') {
    return jsonResponse({ success: false, error: 'O campo "instanceId" é obrigatório' }, 400);
  }

  // Validate body.pin if provided: must be exactly 6 numeric digits.
  if (bodyPin !== undefined) {
    if (typeof bodyPin !== 'string' || !/^\d{6}$/.test(bodyPin)) {
      return jsonResponse(
        { success: false, error: 'O campo "pin" deve conter exatamente 6 dígitos numéricos' },
        400,
      );
    }
  }

  // --- Load instance row, scoped to caller's tenant ---
  const { data: instance, error: instanceError } = await supabaseAdmin
    .from('whatsapp_instances')
    .select('id, tenant_id, provider, connection_config, status')
    .eq('id', instanceId)
    .single();

  if (instanceError || !instance) {
    logger.warn('Instance not found', { instance_id: instanceId });
    return jsonResponse({ success: false, error: 'Instância não encontrada' }, 404);
  }

  // Super admins can operate across tenants; regular users are restricted to their own.
  // Enum user_role usa 'superadmin'; 'super_admin' é legado aceito por compat.
  const isSuperAdmin = callerProfile.role === 'superadmin' || callerProfile.role === 'super_admin';
  if (!isSuperAdmin && instance.tenant_id !== callerProfile.tenant_id) {
    return jsonResponse({ success: false, error: 'Acesso negado a esta instância' }, 403);
  }

  if (instance.provider !== 'official') {
    return jsonResponse(
      { success: false, error: 'Esta instância não usa a API oficial da Meta' },
      400,
    );
  }

  // --- Read connection_config fields ---
  const cfg = (instance.connection_config as Record<string, any>) ?? {};
  const phoneNumberId: string | undefined = cfg.phoneNumberId;
  const graphVersion: string = cfg.graphApiVersion || DEFAULT_GRAPH_VERSION;

  if (!phoneNumberId) {
    return jsonResponse(
      { success: false, error: 'connection_config está incompleto: phoneNumberId ausente' },
      400,
    );
  }

  // --- Read access token from Vault via RPC (SECURITY DEFINER, service_role only) ---
  // SKILL.md §10 rule 1: token must never leave the server; we fetch it per-call.
  const { data: accessToken, error: tokenError } = await supabaseAdmin.rpc(
    'get_instance_meta_token',
    { p_instance_id: instanceId },
  );

  if (tokenError || !accessToken) {
    logger.error('Failed to retrieve Meta access token from Vault', {
      instance_id: instanceId,
      rpc_error: tokenError?.message,
    });
    return jsonResponse(
      { success: false, error: 'Token de acesso Meta ausente. Reconfigure a instância' },
      400,
    );
  }

  // --- Determine PIN ---
  // Use body.pin if provided; otherwise generate a random 6-digit PIN.
  // crypto.getRandomValues is available in the Deno edge runtime.
  let chosenPin: string;
  if (bodyPin) {
    chosenPin = bodyPin;
  } else {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    // Modulo 1_000_000 gives a value in [0, 999999]; pad to 6 digits.
    chosenPin = String(buf[0] % 1_000_000).padStart(6, '0');
  }

  // --- Call Meta Graph API §6.3: Register phone number ---
  // Endpoint (SKILL.md §6.3):
  //   POST https://graph.facebook.com/{GRAPH_API_VERSION}/{phoneNumberId}/register
  // Body (SKILL.md §6.3):
  //   { "messaging_product": "whatsapp", "pin": "<6-digit-numeric-string>" }
  // Headers: Authorization: Bearer {token}, Content-Type: application/json
  const registerUrl =
    `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(phoneNumberId)}/register`;

  logger.info('Calling Meta register endpoint', {
    instance_id: instanceId,
    phone_number_id: phoneNumberId,
    graph_version: graphVersion,
    // Never log chosenPin or accessToken in plain context fields.
    pin_source: bodyPin ? 'caller' : 'auto_generated',
  });

  let registerData: MetaRegisterResponse;
  let registerHttpStatus: number;

  try {
    const registerRes = await fetch(registerUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        pin: chosenPin,
      }),
    });

    registerHttpStatus = registerRes.status;
    registerData = await registerRes.json();
  } catch (fetchErr: any) {
    logger.error('Network error calling Meta register endpoint', { error: fetchErr?.message });
    return jsonResponse(
      { success: false, error: 'Erro de rede ao chamar a API da Meta: ' + (fetchErr?.message ?? '') },
      502,
    );
  }

  // --- Interpret the Meta response ---
  const metaError = registerData.error;

  if (metaError) {
    const errCode = metaError.code;
    const errMsg = metaError.message;

    logger.warn('Meta register returned an error', {
      instance_id: instanceId,
      meta_code: errCode,
      meta_type: metaError.type,
      http_status: registerHttpStatus,
      // fbtrace_id is useful for Meta support cases and contains no secrets.
      fbtrace_id: metaError.fbtrace_id,
    });

    // 133015 — "Phone number already registered"
    // The number is already active on WhatsApp. Treat as idempotent success
    // and fall through to the DB persistence block below.
    if (errCode === META_ERR_ALREADY_REGISTERED) {
      logger.info('Number already registered — treating as idempotent success', {
        instance_id: instanceId,
      });
      // Fall through to DB update.
    }
    // 136024 — "Two-step verification PIN already set"
    // The number was previously registered with a different PIN. The caller
    // must provide the correct existing PIN in body.pin and retry.
    else if (errCode === META_ERR_PIN_ALREADY_SET) {
      return jsonResponse(
        {
          success: false,
          error:
            'Este número já possui um PIN de verificação em duas etapas configurado. ' +
            'Forneça o PIN existente no campo "pin" e repita a requisição.',
          meta_error_code: errCode,
          pin_required: true,
        },
        409,
      );
    }
    // All other Meta errors are returned as-is to the caller.
    else {
      return jsonResponse(
        {
          success: false,
          error: `Erro da API da Meta ao registrar o número: ${errMsg}`,
          meta_error_code: errCode,
          meta_fbtrace_id: metaError.fbtrace_id,
        },
        registerHttpStatus >= 500 ? 502 : 400,
      );
    }
  } else if (!registerData.success) {
    // Unexpected: no error field but success !== true.
    logger.error('Meta register returned unexpected response shape', {
      instance_id: instanceId,
      http_status: registerHttpStatus,
    });
    return jsonResponse(
      { success: false, error: 'Resposta inesperada da API da Meta' },
      502,
    );
  }

  // --- Persist results to whatsapp_instances ---
  // Store the chosen PIN in connection_config.registerPin so future
  // re-registration (e.g. migration) can reuse it.
  // Set status to 'open' — matching what meta-oauth-exchange and
  // whatsapp-meta-setup set on a successfully connected official instance.
  // registered_at is stamped only if still null so the warm-up baseline always
  // reflects the first successful registration and is not reset on re-registration.
  const updatedConfig: Record<string, any> = {
    ...cfg,
    registerPin: chosenPin,
  };

  const now = new Date().toISOString();

  // Step 1: update everything except registered_at on all rows (idempotent fields).
  const { error: updateError } = await supabaseAdmin
    .from('whatsapp_instances')
    .update({
      // @ts-ignore connection_config may not yet be in generated types
      connection_config: updatedConfig,
      status: 'open',
      last_connected_at: now,
      updated_at: now,
    })
    .eq('id', instanceId);

  // Step 2: stamp registered_at only if it is still null.
  if (!updateError) {
    const { error: regAtError } = await supabaseAdmin
      .from('whatsapp_instances')
      .update({
        // @ts-ignore registered_at may not yet be in generated types
        registered_at: now,
      })
      .eq('id', instanceId)
      .is('registered_at', null);

    if (regAtError) {
      // Non-fatal: registered_at is used for warm-up tracking only.
      logger.warn('Failed to stamp registered_at (non-fatal)', {
        instance_id: instanceId,
        error: regAtError.message,
      });
    }
  }

  if (updateError) {
    // Registration succeeded on Meta's side — log and report the DB failure
    // without rolling back (the number IS registered).
    logger.error('Failed to update instance record after registration', {
      instance_id: instanceId,
      error: updateError.message,
    });
    return jsonResponse(
      {
        success: true,
        registered: true,
        // Still return the PIN so the user can record it manually.
        pin: chosenPin,
        warning:
          'Número registrado com sucesso na Meta, mas houve um erro ao atualizar o banco de dados. ' +
          'Anote o PIN retornado.',
        db_error: updateError.message,
      },
      200,
    );
  }

  logger.info('Phone number registered successfully', {
    instance_id: instanceId,
    phone_number_id: phoneNumberId,
    // Do not log chosenPin.
  });

  return jsonResponse(
    {
      success: true,
      registered: true,
      pin: chosenPin,
    },
    200,
  );
});
