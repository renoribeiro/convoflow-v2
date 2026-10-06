import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/validation.ts';
import { can, CAPABILITY_DENIAL_MESSAGES, statusDenialMessage } from '../_shared/capabilities.ts';
import {
  decideMetaSignup,
  metaSignupLookupFilter,
  META_PHONE_NUMBER_ID_PATTERN,
  type MetaSignupExistingInstance,
} from '../_shared/meta-signup.ts';

/**
 * Embedded Signup da Meta: troca o código de autorização por token, inscreve o
 * app na WABA e grava a instância.
 *
 * ORDEM, E POR QUE ELA IMPORTA
 *   1. Auth, capability, corpo.
 *   2. LOOKUP por phoneNumberId (instance_key OU connection_config) e a
 *      DECISÃO (decideMetaSignup): é reconexão ou primeira conexão, e este
 *      chamador pode? Tudo isso ANTES de falar com a Meta — o código é de uso
 *      único e o subscribed_apps muda estado lá. Recusa aqui não gasta nada.
 *   3. Meta: token, subscribed_apps, detalhes do número (este último não fatal).
 *   4. GRAVAÇÃO pela RPC meta_signup_commit (migração 20260919000002), COMO O
 *      USUÁRIO: linha + token no Vault numa transação só. Reconexão = UPDATE no
 *      lugar, id preservado; primeira conexão = INSERT. O banco repete a
 *      checagem do passo 2 antes de escrever (espelho em SQL).
 *   5. Registro do número (best-effort). PULADO na reconexão quando
 *      registered_at já existe: re-registrar com PIN aleatório num número já
 *      registrado só serve para trocar o PIN (ou errá-lo), e zerar
 *      registered_at devolveria o número ao teto de 50/dia da primeira semana.
 *
 * ROLLBACK (só o que este processo criou)
 *   primeira conexão: se algo explodir DEPOIS do commit, a linha nova é
 *                     apagada pela RPC delete_whatsapp_instance (como o
 *                     usuário; ela recusa se já entrou histórico).
 *   reconexão:        nada é desfeito localmente. A linha é do cliente; o
 *                     commit é uma transação, então ou ela foi atualizada
 *                     inteira ou não foi tocada.
 *   Na prática o único passo depois do commit é o registro, que engole os
 *   próprios erros — o rollback da primeira conexão é rede para bug, não
 *   caminho esperado.
 */

// Graph API version — matches the default used in whatsapp-meta-setup and
// the MetaProvider class (meta.ts). Update only when Meta confirms v20.0 is
// deprecated; SKILL.md lists v19.0 as the safe minimum, but the codebase
// standardised on v20.0.
const DEFAULT_GRAPH_VERSION = 'v20.0';

interface ExchangeRequest {
  /** Authorization code received from the Embedded Signup dialog (LaunchParams). */
  code: string;
  /** WhatsApp Business Account ID selected during Embedded Signup. */
  wabaId: string;
  /** Phone Number ID selected during Embedded Signup. */
  phoneNumberId: string;
  /** Optional human-readable name for the instance. On reconnect, only applied when given. */
  name?: string;
  /** Conta/Loja ativa no seletor. Só vale na primeira conexão; na reconexão a Conta é a da linha. */
  tenantId?: string;
}

interface GraphTokenResponse {
  access_token?: string;
  error?: {
    message: string;
    type: string;
    code: number;
    fbtrace_id?: string;
  };
}

interface PhoneDetailsResponse {
  display_phone_number?: string;
  verified_name?: string;
  error?: {
    message: string;
    code: number;
  };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** HTTP por motivo de recusa da RPC (mesmos nomes de meta_signup_check). */
const STATUS_BY_RPC_REASON: Record<string, number> = {
  unauthenticated: 401,
  forbidden: 403,
  invalid: 400,
  ambiguous: 409,
  provider_mismatch: 409,
  foreign_instance: 403,
  tenant_required: 400,
  forbidden_tenant: 403,
};

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
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const metaAppId = Deno.env.get('META_APP_ID');
  // META_APP_SECRET already exists (also used by meta-webhook for signature validation).
  const metaAppSecret = Deno.env.get('META_APP_SECRET');

  if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
    logger.error('Missing Supabase configuration');
    return jsonResponse({ success: false, error: 'Servidor mal configurado' }, 500);
  }
  if (!metaAppId) {
    logger.error('META_APP_ID env var is not set');
    return jsonResponse({ success: false, error: 'META_APP_ID não configurado no servidor' }, 500);
  }
  if (!metaAppSecret) {
    logger.error('META_APP_SECRET env var is not set');
    return jsonResponse({ success: false, error: 'META_APP_SECRET não configurado no servidor' }, 500);
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  // --- Auth check (JWT verified by Supabase gateway; this is a belt-and-suspenders check) ---
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ success: false, error: 'Cabeçalho de autorização ausente' }, 401);
  }
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const { data: { user: callerUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !callerUser) {
    return jsonResponse({ success: false, error: 'Token inválido' }, 401);
  }

  // --- Caller profile. tenant_id pode ser NULL (superadmin): a decisão trata. ---
  const { data: callerProfile } = await supabaseAdmin
    .from('profiles')
    .select('tenant_id, role, status, capabilities')
    .eq('user_id', callerUser.id)
    .single();

  if (!callerProfile) {
    return jsonResponse({ success: false, error: 'Perfil do usuário não encontrado' }, 403);
  }

  // Conta parada não conecta número.
  if (callerProfile.status !== 'active') {
    return jsonResponse({ success: false, error: statusDenialMessage(callerProfile.status) }, 403);
  }

  // Embedded Signup conecta (ou reconecta) um número: whatsapp.configure.
  if (!can(callerProfile.role, 'whatsapp.configure', callerProfile.capabilities)) {
    return jsonResponse(
      { success: false, error: CAPABILITY_DENIAL_MESSAGES['whatsapp.configure'] },
      403,
    );
  }

  // --- Parse and validate request body ---
  let body: ExchangeRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false, error: 'JSON inválido no corpo da requisição' }, 400);
  }

  const { code, wabaId, phoneNumberId, name, tenantId } = body ?? {};

  if (!code || typeof code !== 'string') {
    return jsonResponse({ success: false, error: 'O campo "code" é obrigatório' }, 400);
  }
  if (!wabaId || typeof wabaId !== 'string') {
    return jsonResponse({ success: false, error: 'O campo "wabaId" é obrigatório' }, 400);
  }
  if (!phoneNumberId || typeof phoneNumberId !== 'string' || !META_PHONE_NUMBER_ID_PATTERN.test(phoneNumberId)) {
    return jsonResponse({ success: false, error: 'O campo "phoneNumberId" é obrigatório e numérico' }, 400);
  }
  if (tenantId !== undefined && tenantId !== null && (typeof tenantId !== 'string' || !UUID_PATTERN.test(tenantId))) {
    return jsonResponse({ success: false, error: 'O campo "tenantId" é inválido' }, 400);
  }
  const requestedTenantId: string | null =
    typeof tenantId === 'string' && tenantId ? tenantId : (callerProfile.tenant_id ?? null);

  const graphVersion = DEFAULT_GRAPH_VERSION;

  // ---------------------------------------------------------------------------
  // Step 0: LOOKUP + DECISÃO — antes de qualquer chamada à Meta.
  //
  // Service role: a linha pode estar numa Conta que o chamador não lê (é
  // exatamente o caso que precisa ser recusado sem revelar de quem é).
  // ---------------------------------------------------------------------------
  const { data: candidateRows, error: lookupError } = await supabaseAdmin
    .from('whatsapp_instances')
    .select('id, tenant_id, provider, instance_key, registered_at, connection_config')
    .or(metaSignupLookupFilter(phoneNumberId));

  if (lookupError) {
    logger.error('Instance lookup failed', { error: lookupError.message });
    return jsonResponse({ success: false, error: 'Falha ao consultar instâncias existentes' }, 500);
  }
  const candidates = (candidateRows ?? []) as MetaSignupExistingInstance[];

  const tenantIdsToLoad = new Set<string>();
  if (candidates.length === 1) tenantIdsToLoad.add(candidates[0].tenant_id);
  if (requestedTenantId) tenantIdsToLoad.add(requestedTenantId);
  const { data: tenantRows } = tenantIdsToLoad.size
    ? await supabaseAdmin
        .from('tenants')
        .select('id, kind, parent_tenant_id')
        .in('id', [...tenantIdsToLoad])
    : { data: [] as { id: string; kind: string | null; parent_tenant_id: string | null }[] };
  const tenantById = new Map((tenantRows ?? []).map((t) => [t.id, t]));

  const decision = decideMetaSignup({
    caller: { tenant_id: callerProfile.tenant_id, role: callerProfile.role, status: callerProfile.status },
    phoneNumberId,
    candidates,
    candidateTenant: candidates.length === 1 ? (tenantById.get(candidates[0].tenant_id) ?? null) : null,
    requestedTenantId,
    requestedTenant: requestedTenantId ? (tenantById.get(requestedTenantId) ?? null) : null,
  });

  if (!decision.ok) {
    logger.warn('Embedded Signup recusado antes da Meta', {
      reason: decision.reason,
      phoneNumberId,
      candidates: candidates.length,
      userId: callerUser.id,
    });
    return jsonResponse({ success: false, reason: decision.reason, error: decision.message }, decision.status);
  }

  if (decision.mode === 'reconnect' && decision.keyMismatch) {
    // As duas colunas discordam nesta linha. Uma casou, então é ela; a
    // reconexão regrava connection_config.phoneNumberId e deixa instance_key.
    logger.warn('Reconexão: instance_key e connection_config.phoneNumberId discordam', {
      instance_id: decision.existing.id,
      instance_key: decision.existing.instance_key,
      config_phone_number_id: decision.existing.connection_config?.phoneNumberId ?? null,
      dialog_phone_number_id: phoneNumberId,
    });
  }

  logger.info('Embedded Signup: decisão', {
    mode: decision.mode,
    access: decision.access,
    tenant_id: decision.tenantId,
    instance_id: decision.existing?.id ?? null,
    skipRegister: decision.skipRegister,
  });

  // Como o usuário: é o JWT dele que vira auth.uid() dentro das RPCs.
  const asUser = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  // Rollback só na primeira conexão, e só depois de a linha nova existir.
  let insertedInstanceId: string | undefined;

  try {
    // -------------------------------------------------------------------------
    // Step 1: Exchange authorization code for an access token.
    //
    // SKILL.md §10 rule 1: token exchange must happen server-side only.
    // Endpoint documented in SKILL.md §1 (Graph API base).
    // -------------------------------------------------------------------------
    logger.info('Exchanging Meta authorization code for access token', {
      wabaId,
      phoneNumberId,
    });

    const tokenUrl =
      `https://graph.facebook.com/${graphVersion}/oauth/access_token` +
      `?client_id=${encodeURIComponent(metaAppId)}` +
      `&client_secret=${encodeURIComponent(metaAppSecret)}` +
      `&code=${encodeURIComponent(code)}`;

    const tokenRes = await fetch(tokenUrl, { method: 'GET' });
    const tokenData: GraphTokenResponse = await tokenRes.json();

    if (!tokenRes.ok || tokenData.error) {
      const errMsg = tokenData.error?.message ?? `HTTP ${tokenRes.status}`;
      const errCode = tokenData.error?.code;
      // Never log the code or the full tokenData — it may contain partial tokens.
      logger.error('Meta token exchange failed', { errCode, httpStatus: tokenRes.status });
      return jsonResponse(
        {
          success: false,
          error: `Falha na troca do código Meta: ${errMsg}`,
          meta_error_code: errCode,
        },
        tokenRes.ok ? 400 : tokenRes.status >= 500 ? 502 : 400,
      );
    }

    if (!tokenData.access_token) {
      logger.error('Meta token exchange returned no access_token');
      return jsonResponse(
        { success: false, error: 'Resposta da Meta não contém access_token' },
        502,
      );
    }

    const accessToken = tokenData.access_token;
    // Never log accessToken — store reference only in Vault.

    // -------------------------------------------------------------------------
    // Step 2: Subscribe the app to this WABA so webhooks start flowing.
    //
    // SKILL.md §3.2: POST /{WABA_ID}/subscribed_apps (bearer token required).
    // Treat an already-subscribed 200/true response as idempotent success.
    // -------------------------------------------------------------------------
    logger.info('Subscribing app to WABA', { wabaId });

    const subscribeUrl =
      `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(wabaId)}/subscribed_apps`;

    const subscribeRes = await fetch(subscribeUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!subscribeRes.ok) {
      const subscribeText = await subscribeRes.text();
      logger.error('Meta subscribed_apps failed', {
        httpStatus: subscribeRes.status,
        body: truncate(subscribeText, 300),
      });
      return jsonResponse(
        {
          success: false,
          error: `Falha ao inscrever app no WABA: ${truncate(subscribeText, 200)}`,
        },
        subscribeRes.status >= 500 ? 502 : 400,
      );
    }

    logger.info('App subscribed to WABA successfully', { wabaId });

    // -------------------------------------------------------------------------
    // Step 3: Fetch phone number display details for the instance record.
    //
    // SKILL.md §1.1: GET /{PHONE_NUMBER_ID}?fields=display_phone_number,verified_name
    // Non-fatal: if this call fails we log and continue with nulls — and, na
    // reconexão, phone_number/profile_name da linha ficam como estavam.
    // -------------------------------------------------------------------------
    let phoneNumberDisplay: string | null = null;
    let verifiedName: string | null = null;

    try {
      const phoneUrl =
        `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(phoneNumberId)}` +
        `?fields=display_phone_number,verified_name`;

      const phoneRes = await fetch(phoneUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });

      if (phoneRes.ok) {
        const phoneData: PhoneDetailsResponse = await phoneRes.json();
        phoneNumberDisplay = phoneData.display_phone_number ?? null;
        verifiedName = phoneData.verified_name ?? null;
        logger.info('Fetched phone number details', {
          display: phoneNumberDisplay,
          verified: verifiedName,
        });
      } else {
        const phoneText = await phoneRes.text();
        logger.warn('Could not fetch phone number details (non-fatal)', {
          httpStatus: phoneRes.status,
          body: truncate(phoneText, 200),
        });
      }
    } catch (phoneErr: any) {
      logger.warn('Phone number details fetch threw (non-fatal)', {
        error: phoneErr?.message,
      });
    }

    // -------------------------------------------------------------------------
    // Step 4: Gravar — linha + token, UMA transação, decidida pelo banco.
    //
    // Reconexão: UPDATE no lugar; a lista do que muda está no cabeçalho da
    // migração 20260919000002. Primeira conexão: INSERT.
    // -------------------------------------------------------------------------
    const { data: commitRaw, error: commitError } = await asUser.rpc('meta_signup_commit', {
      p_phone_number_id: phoneNumberId,
      p_tenant_id: decision.mode === 'connect' ? decision.tenantId : null,
      p_waba_id: wabaId,
      p_graph_api_version: graphVersion,
      p_name: name?.trim() || null,
      p_phone_number: phoneNumberDisplay,
      p_profile_name: verifiedName,
      p_token: accessToken,
    });

    if (commitError) {
      logger.error('meta_signup_commit falhou', { mode: decision.mode, error: commitError.message });
      return jsonResponse(
        { success: false, error: 'Falha ao salvar instância: ' + commitError.message },
        500,
      );
    }

    const commit = (commitRaw ?? {}) as Record<string, any>;
    if (commit.ok !== true) {
      // O banco discordou da decisão do passo 0 (regra mudou entre um e outro,
      // ou os espelhos divergiram). Nada foi gravado.
      const reason = String(commit.reason || 'unknown');
      logger.warn('meta_signup_commit recusou', { mode: decision.mode, reason });
      return jsonResponse(
        { success: false, reason, error: String(commit.message || 'Gravação recusada.') },
        STATUS_BY_RPC_REASON[reason] ?? 400,
      );
    }

    const instance = commit.instance as {
      id: string;
      tenant_id: string;
      name: string;
      instance_key: string;
      status: string;
      provider: string;
      phone_number: string | null;
      profile_name: string | null;
      registered_at: string | null;
      connection_config: Record<string, any> | null;
    };
    const mode = String(commit.mode) as 'connect' | 'reconnect';
    if (mode === 'connect') insertedInstanceId = instance.id;

    logger.info(mode === 'reconnect' ? 'whatsapp_instance reconectada no lugar' : 'whatsapp_instance row created', {
      instance_id: instance.id,
      tenant_id: instance.tenant_id,
      access: commit.access,
    });

    // -------------------------------------------------------------------------
    // Step 5: Register the phone number on the Cloud API (best-effort).
    //
    // PULADO quando a reconexão encontra registered_at já preenchido (ver
    // cabeçalho). Caso contrário — primeira conexão, ou reconexão de linha que
    // nunca registrou — usa o registerPin que a linha já tinha, se tiver, ou
    // gera um.
    //
    // SKILL.md §6.3: POST /{phoneNumberId}/register
    //   Body: { messaging_product: "whatsapp", pin: "<6-digit>" }
    //   Authorization: Bearer {accessToken}  ← in-memory token, NOT re-read from Vault.
    //
    // Error handling mirrors register-meta-number/index.ts:
    //   133015 (already registered) → idempotent success, store PIN in config.
    //   136024 (PIN already set)    → non-fatal warn, leave fallback button enabled.
    //   Any other error             → non-fatal warn, leave fallback button enabled.
    //
    // A failure here NEVER rolls back or fails the onboarding. This inner
    // try/catch is self-contained and only logs.
    // -------------------------------------------------------------------------
    let autoRegistered = false;

    // Meta error codes — same constants as register-meta-number.
    const META_ERR_ALREADY_REGISTERED = 133015;
    const META_ERR_PIN_ALREADY_SET = 136024;

    const alreadyRegistered = mode === 'reconnect' && !!instance.registered_at;

    if (alreadyRegistered) {
      autoRegistered = true;
      logger.info('Registro pulado: número já registrado nesta instância (registered_at preservado)', {
        instance_id: instance.id,
        registered_at: instance.registered_at,
      });
    } else {
      try {
        // O PIN mora em whatsapp_instance_register_pins (item 14 lote 6: em
        // connection_config qualquer membro da Loja o lia). connection_config
        // fica como reserva para uma linha ainda não migrada. Falha de leitura
        // não é fatal: cai no PIN novo, como sem PIN.
        const { data: pinRow } = await supabaseAdmin
          .from('whatsapp_instance_register_pins')
          .select('pin')
          .eq('instance_id', instance.id)
          .maybeSingle();
        const existingPin = pinRow?.pin ?? instance.connection_config?.registerPin;
        let pin: string;
        if (typeof existingPin === 'string' && /^[0-9]{6}$/.test(existingPin)) {
          pin = existingPin;
        } else {
          // Generate a random 6-digit numeric PIN using the Deno crypto API.
          const pinBuf = new Uint32Array(1);
          crypto.getRandomValues(pinBuf);
          pin = String(pinBuf[0] % 1_000_000).padStart(6, '0');
        }

        const registerUrl =
          `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(phoneNumberId)}/register`;

        logger.info('Auto-registering phone number (best-effort)', {
          instance_id: instance.id,
          phone_number_id: phoneNumberId,
          reused_pin: pin === existingPin,
          // Never log the pin or accessToken in plain log fields.
        });

        const registerRes = await fetch(registerUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            pin,
          }),
        });

        const registerData: { success?: boolean; error?: { message: string; code?: number; type?: string; fbtrace_id?: string } } =
          await registerRes.json();

        const metaErr = registerData.error;

        if (metaErr) {
          const errCode = metaErr.code;

          if (errCode === META_ERR_ALREADY_REGISTERED) {
            // 133015 — number is already active on WhatsApp; treat as success.
            logger.info('Auto-register: number already registered (133015) — idempotent success', {
              instance_id: instance.id,
            });
            autoRegistered = true;
          } else if (errCode === META_ERR_PIN_ALREADY_SET) {
            // 136024 — number has an existing PIN we don't know. Non-fatal; user
            // must click the manual "Registrar número" button and supply the PIN.
            logger.warn('Auto-register: PIN already set on number (136024) — manual registration required', {
              instance_id: instance.id,
              meta_code: errCode,
              fbtrace_id: metaErr.fbtrace_id,
            });
          } else {
            // Any other Meta error — log details (no secrets) and continue.
            logger.warn('Auto-register: Meta returned error (non-fatal)', {
              instance_id: instance.id,
              meta_code: errCode,
              meta_type: metaErr.type,
              http_status: registerRes.status,
              fbtrace_id: metaErr.fbtrace_id,
            });
          }
        } else if (registerData.success) {
          // Clean success from Meta.
          logger.info('Auto-register: phone number registered successfully', {
            instance_id: instance.id,
            phone_number_id: phoneNumberId,
          });
          autoRegistered = true;
        } else {
          // Unexpected shape (no error, no success flag).
          logger.warn('Auto-register: unexpected Meta response shape (non-fatal)', {
            instance_id: instance.id,
            http_status: registerRes.status,
          });
        }

        // If registration succeeded (or was already done), persist the PIN in
        // connection_config (MERGE sobre a config que o commit devolveu — nunca
        // reconstruída do zero) and stamp registered_at (warm-up baseline) so
        // that process-campaign-dispatch can calculate the warm-up cap.
        // registered_at is only set if still null — it must not be overwritten
        // so the warm-up window is always relative to the first registration.
        if (autoRegistered) {
          // O trigger aa_whatsapp_instances_stash_register_pin tira o
          // registerPin da config e o guarda em whatsapp_instance_register_pins.
          const updatedConfig = {
            ...(instance.connection_config ?? {}),
            registerPin: pin,
          };

          const { error: configUpdateError } = await supabaseAdmin
            .from('whatsapp_instances')
            .update({
              // @ts-ignore connection_config may not yet be in generated types
              connection_config: updatedConfig,
              // @ts-ignore registered_at may not yet be in generated types
              registered_at: new Date().toISOString(),
            })
            .eq('id', instance.id)
            // Only stamp registered_at on the very first registration
            .is('registered_at', null);

          if (configUpdateError) {
            // DB update failure is also non-fatal — registration already succeeded on Meta's side.
            logger.warn('Auto-register: failed to persist registerPin/registered_at (non-fatal)', {
              instance_id: instance.id,
              error: configUpdateError.message,
            });
          } else {
            logger.info('Auto-register: registerPin and registered_at persisted', {
              instance_id: instance.id,
            });
          }
        }
      } catch (autoRegErr: any) {
        // Network or parse error — entirely non-fatal.
        logger.warn('Auto-register: unexpected error during registration step (non-fatal)', {
          instance_id: instance.id,
          error: autoRegErr?.message,
        });
      }
    }

    // Success. connection_config (registerPin) e o PIN NÃO voltam ao navegador.
    return jsonResponse(
      {
        success: true,
        mode,
        instance: {
          id: instance.id,
          tenant_id: instance.tenant_id,
          name: instance.name,
          status: instance.status,
          phone_number: instance.phone_number,
          profile_name: instance.profile_name,
          provider: instance.provider,
        },
        registered: autoRegistered,
      },
      200,
    );
  } catch (err: any) {
    // -------------------------------------------------------------------------
    // Rollback — SÓ na primeira conexão, e só se a linha nova já existe.
    // delete_whatsapp_instance (como o usuário) apaga linha + segredo do Vault
    // numa transação e RECUSA se já entrou histórico (webhook no meio) — nesse
    // caso a linha fica, e o usuário a vê na lista.
    //
    // Na reconexão nada é desfeito: a linha é do cliente e o commit foi
    // atômico (ou atualizou inteira, ou não tocou).
    // -------------------------------------------------------------------------
    if (insertedInstanceId) {
      logger.warn('Rolling back newly created whatsapp_instance due to error', {
        instance_id: insertedInstanceId,
      });
      const { data: rb, error: rbError } = await asUser.rpc('delete_whatsapp_instance', {
        p_instance_id: insertedInstanceId,
      });
      const rbOk = !rbError && (rb as Record<string, unknown> | null)?.ok === true;
      if (!rbOk) {
        logger.error('Rollback delete failed or refused', {
          instance_id: insertedInstanceId,
          error: rbError?.message ?? (rb as Record<string, unknown> | null)?.reason,
        });
      }
    }

    logger.error('meta-oauth-exchange failed', { error: err?.message });
    return jsonResponse(
      { success: false, error: err?.message ?? 'Erro interno desconhecido' },
      500,
    );
  }
});

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '…' : text;
}
