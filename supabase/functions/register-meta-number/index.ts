import { corpoDaRecusa, decidirAcessoDoChamador } from '../_shared/conta-acesso.ts';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/validation.ts';
import { can, CAPABILITY_DENIAL_MESSAGES, statusDenialMessage } from '../_shared/capabilities.ts';
import { META_GRAPH_VERSION } from '../_shared/meta-versoes.ts';
import {
  desfechoDoRegistro,
  escolherPinDoRegistro,
  MENSAGEM_PIN_DESCONHECIDO,
  META_ERRO_JA_REGISTRADO,
  META_ERRO_PIN_JA_DEFINIDO,
  type OrigemDoPin,
} from '../_shared/meta-numero-existente.ts';

// Erros da Meta tratados aqui (constantes em _shared/meta-numero-existente.ts):
//   133015 "número já registrado": segue, e o desfecho decide o que guardar.
//   136024 "PIN já definido": o número tem outro PIN; 409 com pin_required e
//     a frase que a tela mostra na caixa "Informe o PIN do número".
// Número que já funcionava em outra empresa (registered_elsewhere) e sem PIN
// guardado: nem chama a Meta; 409 com pin_required e pin_desconhecido.

interface RegisterRequest {
  /** ID of the whatsapp_instances row to register. */
  instanceId: string;
  /**
   * PIN de 6 dígitos da verificação em duas etapas, digitado na tela.
   * Sem ele: usa o PIN guardado; sem guardado, número novo sorteia (e o PIN
   * volta na resposta para a janela "Guarde o PIN"), e número que veio de
   * outra empresa recebe 409 pedindo o PIN.
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

  // Conta sem acesso não registra número.
  const acesso = await decidirAcessoDoChamador(supabaseAdmin, callerProfile);
  if (!acesso.ok) return jsonResponse(corpoDaRecusa(acesso), acesso.status);

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
    .select('id, tenant_id, provider, connection_config, status, registered_elsewhere')
    .eq('id', instanceId)
    .single();

  if (instanceError || !instance) {
    logger.warn('Instance not found', { instance_id: instanceId });
    return jsonResponse({ success: false, error: 'Número não encontrado. Recarregue a página.' }, 404);
  }

  // Super admins can operate across tenants; regular users are restricted to their own.
  // Enum user_role usa 'superadmin'; 'super_admin' é legado aceito por compat.
  const isSuperAdmin = callerProfile.role === 'superadmin' || callerProfile.role === 'super_admin';
  if (!isSuperAdmin && instance.tenant_id !== callerProfile.tenant_id) {
    return jsonResponse({ success: false, error: 'Você não tem acesso a este número. Peça ao Gestor da Loja.' }, 403);
  }

  if (instance.provider !== 'official') {
    return jsonResponse(
      { success: false, error: 'Este número não é da API Oficial: o registro só vale para ela.' },
      400,
    );
  }

  // --- Read connection_config fields ---
  const cfg = (instance.connection_config as Record<string, any>) ?? {};
  const phoneNumberId: string | undefined = cfg.phoneNumberId;
  // Versão única do ConvoFlow (src/lib/meta/versoes.ts); a gravada na linha é só histórico.
  const graphVersion: string = META_GRAPH_VERSION;

  if (!phoneNumberId) {
    return jsonResponse(
      { success: false, error: 'Falta o código do número na Meta. Conecte o número de novo pelo botão "Conectar com a Meta".' },
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
      { success: false, error: 'A chave de acesso da Meta deste número sumiu. Conecte o número de novo pelo botão "Conectar com a Meta".' },
      400,
    );
  }

  // --- Determine PIN (regra em _shared/meta-numero-existente.ts) ---
  // O que a pessoa digitou vale primeiro; depois o PIN guardado (o verdadeiro,
  // em whatsapp_instance_register_pins; connection_config é reserva de linha
  // antiga). Sem nenhum: número novo sorteia, como sempre; número que já
  // funcionava em outra empresa NÃO sorteia: a tela pede o PIN e explica.
  const { data: pinRow } = await supabaseAdmin
    .from('whatsapp_instance_register_pins')
    .select('pin')
    .eq('instance_id', instanceId)
    .maybeSingle();
  const pinGuardado = pinRow?.pin ?? cfg.registerPin ?? null;
  const deOutraEmpresa = instance.registered_elsewhere === true;

  const escolha = escolherPinDoRegistro({
    pinDigitado: bodyPin ?? null,
    pinGuardado: typeof pinGuardado === 'string' ? pinGuardado : null,
    deOutraEmpresa,
  });
  if (!('origem' in escolha)) {
    logger.info('Registro: PIN desconhecido de número que veio de outra empresa; a tela pede o PIN', {
      instance_id: instanceId,
    });
    return jsonResponse(
      { success: false, error: MENSAGEM_PIN_DESCONHECIDO, pin_required: true, pin_desconhecido: true },
      409,
    );
  }
  const origem: OrigemDoPin = escolha.origem;
  let chosenPin: string;
  if (origem === 'digitado') {
    chosenPin = bodyPin as string;
  } else if (origem === 'guardado') {
    chosenPin = pinGuardado as string;
  } else {
    // crypto.getRandomValues is available in the Deno edge runtime.
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    // Modulo 1_000_000 gives a value in [0, 999999]; pad to 6 digits.
    chosenPin = String(buf[0] % 1_000_000).padStart(6, '0');
  }

  // --- Call Meta Graph API: Register phone number ---
  //   POST https://graph.facebook.com/{versão}/{phoneNumberId}/register
  //   Body: { "messaging_product": "whatsapp", "pin": "<6 dígitos>" }
  //   Headers: Authorization: Bearer {token}, Content-Type: application/json
  const registerUrl =
    `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(phoneNumberId)}/register`;

  logger.info('Calling Meta register endpoint', {
    instance_id: instanceId,
    phone_number_id: phoneNumberId,
    graph_version: graphVersion,
    // Never log chosenPin or accessToken in plain context fields.
    pin_origem: origem,
    de_outra_empresa: deOutraEmpresa,
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
      { success: false, error: 'A Meta não respondeu. Tente de novo em instantes.' },
      502,
    );
  }

  // --- Interpret the Meta response ---
  const metaError = registerData.error;
  // A Meta diz que a resposta deixa claro quando o PIN não foi trocado, sem
  // documentar o nome do campo: o log guarda os NOMES das chaves, nunca valores.
  logger.info('Meta register: resposta', {
    instance_id: instanceId,
    http_status: registerHttpStatus,
    chaves: Object.keys(registerData ?? {}),
    meta_code: metaError?.code ?? null,
  });

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

    if (errCode === META_ERRO_JA_REGISTRADO) {
      // 133015: o número já está registrado. Segue para a gravação, que decide
      // pelo desfecho se o PIN mandado é o verdadeiro.
      logger.info('Number already registered (133015)', { instance_id: instanceId });
    } else if (errCode === META_ERRO_PIN_JA_DEFINIDO) {
      // 136024: o número tem um PIN que não é o mandado. A tela pede o PIN.
      return jsonResponse(
        {
          success: false,
          error: deOutraEmpresa
            ? MENSAGEM_PIN_DESCONHECIDO
            : origem === 'digitado'
              ? 'A Meta não aceitou esse PIN. Confira os 6 números com quem cuida do número e tente de novo.'
              : 'Este número já tem um PIN de verificação em duas etapas. Digite os 6 números do PIN para registrar.',
          meta_error_code: errCode,
          pin_required: true,
          ...(deOutraEmpresa ? { pin_desconhecido: true } : {}),
        },
        409,
      );
    } else {
      // All other Meta errors are returned to the caller.
      return jsonResponse(
        {
          success: false,
          error: 'A Meta recusou o registro do número. Tente de novo em instantes; se continuar, fale com o suporte do ConvoFlow.',
          meta_message: errMsg,
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
      { success: false, error: 'A Meta respondeu de um jeito que o ConvoFlow não esperava. Tente de novo em instantes.' },
      502,
    );
  }

  // --- O que gravar (regra em _shared/meta-numero-existente.ts) ---
  //   PIN: só o verdadeiro (digitado, guardado, ou sorteado e aceito num
  //     número novo). O sorteado num número que já estava registrado a Meta não
  //     aplicou: não é guardado nem mostrado.
  //   registered_at (início do aquecimento): só no primeiro registro de número
  //     novo, e só se ainda estiver vazio.
  //   registered_elsewhere: o número veio pronto de outra empresa.
  const desfecho = desfechoDoRegistro(
    { origem, numeroJaEmUso: deOutraEmpresa },
    { ok: !metaError && registerData.success === true, codigoDeErro: metaError?.code ?? null },
  );

  const now = new Date().toISOString();
  const atualizar: Record<string, unknown> = {
    status: 'open',
    last_connected_at: now,
    updated_at: now,
  };
  if (desfecho.guardarPin) {
    // O gatilho aa_whatsapp_instances_stash_register_pin tira o registerPin da
    // config e o guarda em whatsapp_instance_register_pins.
    atualizar.connection_config = { ...cfg, registerPin: chosenPin };
  }
  if (desfecho.marcarDeOutraEmpresa && !deOutraEmpresa) atualizar.registered_elsewhere = true;

  const { error: updateError } = await supabaseAdmin
    .from('whatsapp_instances')
    // @ts-ignore colunas fora dos tipos gerados (registered_elsewhere)
    .update(atualizar)
    .eq('id', instanceId);

  if (!updateError && desfecho.carimbarRegistradoEm) {
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

  // Só o PIN que o ConvoFlow criou agora volta para a tela ("Guarde o PIN").
  const pinParaMostrar = origem === 'sorteado' && desfecho.guardarPin ? chosenPin : undefined;

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
        ...(pinParaMostrar ? { pin: pinParaMostrar } : {}),
        warning: pinParaMostrar
          ? 'O número foi registrado na Meta, mas o ConvoFlow não conseguiu guardar o resultado. Anote o PIN que aparece agora.'
          : 'O número foi registrado na Meta, mas o ConvoFlow não conseguiu guardar o resultado. Tente registrar de novo em instantes.',
      },
      200,
    );
  }

  logger.info('Phone number registered successfully', {
    instance_id: instanceId,
    phone_number_id: phoneNumberId,
    pin_guardado: desfecho.guardarPin,
    de_outra_empresa: desfecho.marcarDeOutraEmpresa,
    // Do not log chosenPin.
  });

  return jsonResponse(
    {
      success: true,
      registered: true,
      ...(pinParaMostrar ? { pin: pinParaMostrar } : {}),
    },
    200,
  );
});
