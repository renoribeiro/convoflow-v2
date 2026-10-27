import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from '../_shared/logger.ts';
import { decideInstanceAccess } from '../_shared/instance-access.ts';
import { buildCorsHeaders } from '../_shared/validation.ts';
import { camposDaFalhaMeta } from '../_shared/meta-error-fields.ts';
import { montarCorpoMeta } from './meta-body.ts';
import { caminhoDeEnvioValido, MEDIA_LINK_TTL_S, WHATSAPP_MEDIA_BUCKET } from '../_shared/media-links.ts';
import { rotaDoEnvio, runProviderSend, type ProviderSendBody } from '../_shared/message-send.ts';
import { loadProviderCredentials } from '../_shared/instance-credentials.ts';
import { bytesToBase64, callProvider } from '../_shared/provider-call.ts';

/**
 * whatsapp-send-message
 *
 * Edge function que envia as mensagens das Conversas. Número Evolution ou WAHA
 * (desde a sessão 2 do docs/RUNBOOK_segredos_das_instancias.md) vai por
 * `_shared/message-send.ts`, com a chave do cofre; o resto deste arquivo é o
 * caminho da Meta, que segue igual.
 *
 * Meta: envia para a Meta Cloud API a partir do frontend.
 * O token Meta vive no Vault (criado por whatsapp-meta-setup) e é recuperado
 * via RPC `get_instance_meta_token` (SECURITY DEFINER).
 *
 * Consumida pelo `MetaAdapter` em src/services/whatsapp/meta.adapter.ts.
 *
 * Tipos suportados (campo `type` do body):
 *   text, image, video, audio, document, location, reaction
 *
 * Antes de alterar endpoints da Meta, consulte .agent/skills/meta-cloud-api/SKILL.md.
 */

interface SendRequest {
  instance_id: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'location' | 'reaction' | 'template';
  to: string;
  // text
  text?: string;
  preview_url?: boolean;
  // media (image/video/audio/document)
  media_url?: string;
  /**
   * Anexo do chat (bucket privado whatsapp-media): o caminho do arquivo. Quando
   * vem, o link que vai para a Meta é assinado AQUI, com o token de quem envia,
   * e `media_url` é ignorado.
   */
  media_path?: string;
  mime_type?: string;
  file_name?: string;
  caption?: string;
  ptt?: boolean;
  // location
  latitude?: number;
  longitude?: number;
  name?: string;
  address?: string;
  // reaction
  message_id?: string;
  emoji?: string;
  // reply
  quoted_message_id?: string;
  // template (Meta Cloud API §2.12 — bypass 24h window)
  template_name?: string;
  template_language?: string;
  /** Pass the full components array directly (header, body, buttons, etc.). */
  template_components?: Record<string, any>[];
  /** Shorthand: ordered body-only param strings (filled into {{1}}, {{2}}, …). */
  template_body_params?: string[];
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

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !supabaseServiceKey) {
    logger.error('Missing Supabase configuration');
    return jsonResponse({ ok: false, error: 'Server misconfigured' }, 500);
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  // Auth: extrair JWT e identificar caller
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ ok: false, error: 'Missing authorization header' }, 401);
  const token = authHeader.replace('Bearer ', '');
  const { data: { user: callerUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !callerUser) return jsonResponse({ ok: false, error: 'Invalid token' }, 401);

  const { data: callerProfile } = await supabaseAdmin
    .from('profiles')
    .select('tenant_id, role, status')
    .eq('user_id', callerUser.id)
    .single();
  if (!callerProfile?.tenant_id) return jsonResponse({ ok: false, error: 'Profile not found' }, 403);
  // Item 14, lote 4 (H5): suspenso, excluído ou convite pendente não envia. O
  // token dele continua válido até expirar (até 1 h); é aqui que para.
  if (callerProfile.status !== 'active') {
    return jsonResponse({ ok: false, error: 'Sua conta não está ativa.' }, 403);
  }

  // Parse body
  let body: SendRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400);
  }
  if (!body?.instance_id || !body?.type || !body?.to) {
    return jsonResponse({ ok: false, error: 'instance_id, type and to are required' }, 400);
  }

  // Resolve instância e checa tenant + provider=official
  const { data: instance, error: instanceError } = await supabaseAdmin
    .from('whatsapp_instances')
    .select('id, tenant_id, provider, connection_config, status, instance_key, evolution_api_key')
    .eq('id', body.instance_id)
    .single();
  if (instanceError || !instance) return jsonResponse({ ok: false, error: 'Instance not found' }, 404);

  // Quem pode usar a instância: superadmin, a própria Conta/Loja, ou o gerente
  // da Conta-mãe numa Loja filha (espelho de `gerente_child_store_ids()` — a
  // mesma regra que já deixa o inbox GRAVAR em `messages`; ver
  // `_shared/instance-access.ts`).
  const { data: instanceTenant } = await supabaseAdmin
    .from('tenants')
    .select('id, kind, parent_tenant_id')
    .eq('id', instance.tenant_id)
    .maybeSingle();

  // Evolution e WAHA (sessão 2 do docs/RUNBOOK_segredos_das_instancias.md):
  // a chave e o endereço vêm do cofre, o anexo é lido com a chave do servidor
  // depois de a regra do Storage liberar quem envia. Quem decide e como:
  // `_shared/message-send.ts`. Daqui para baixo o caminho é só o da Meta.
  if (rotaDoEnvio(instance.provider) === 'provider') {
    const comoUsuario = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const env = { evolutionBaseUrl: Deno.env.get('EVOLUTION_API_URL') };
    const result = await runProviderSend(body as ProviderSendBody, {
      caller: callerProfile,
      instance,
      instanceTenant,
      loadCredentials: () => loadProviderCredentials(supabaseAdmin, instance, env),
      canReadMedia: async (caminho) => {
        // Só a permissão: o link sai e é descartado, nunca vai ao provedor.
        const { data, error } = await comoUsuario.storage.from(WHATSAPP_MEDIA_BUCKET).createSignedUrl(caminho, 60);
        return !error && !!data?.signedUrl;
      },
      readMedia: async (caminho, maxBytes) => {
        const { data, error } = await supabaseAdmin.storage.from(WHATSAPP_MEDIA_BUCKET).download(caminho);
        if (error || !data) return null;
        if (data.size > maxBytes) return 'too_large';
        return { base64: bytesToBase64(new Uint8Array(await data.arrayBuffer())), contentType: data.type, size: data.size };
      },
      callProvider,
    });
    // Nunca o texto nem a mídia: só o tipo e o desfecho.
    logger.info('whatsapp-send-message (provider)', {
      instance_id: instance.id,
      provider: instance.provider || 'evolution',
      type: typeof body.type === 'string' ? body.type : null,
      httpStatus: result.status,
      reason: result.body.reason ?? null,
    });
    return jsonResponse(result.body, result.status);
  }

  const access = decideInstanceAccess(callerProfile, instance, instanceTenant);
  if (!access.allowed) {
    return jsonResponse({ ok: false, error: 'Forbidden' }, 403);
  }
  if (instance.provider !== 'official') {
    return jsonResponse(
      { ok: false, error: 'Este envio só vale para números da API Oficial.' },
      400,
    );
  }

  const cfg = (instance.connection_config as Record<string, any>) || {};
  const phoneNumberId: string | undefined = cfg.phoneNumberId;
  const graphVersion: string = cfg.graphApiVersion || DEFAULT_GRAPH_VERSION;
  if (!phoneNumberId) {
    return jsonResponse({ ok: false, error: 'connection_config.phoneNumberId ausente' }, 500);
  }

  // Compliance (SKILL meta-cloud-api §10.2): fora da janela de 24h, número oficial
  // só pode enviar TEMPLATE aprovado. Bloqueia free-form proativamente em vez de
  // deixar a Meta rejeitar com 131047 — cada rejeição é sinal negativo de qualidade.
  // Reações e templates ficam isentos: reações são respostas a mensagens recebidas;
  // templates são o mecanismo explícito da Meta para contato fora da janela.
  // Em erro de RPC, deixamos passar (o mapeamento reativo de 131047 abaixo é a rede de segurança).
  if (body.type !== 'reaction' && body.type !== 'template') {
    const { data: inWindow, error: windowErr } = await supabaseAdmin.rpc(
      'is_within_service_window',
      { p_instance_id: instance.id, p_phone: body.to },
    );
    if (windowErr) {
      logger.warn('is_within_service_window indisponível — seguindo sem bloqueio', {
        instance_id: instance.id, error: windowErr.message,
      });
    } else if (!inWindow) {
      logger.info('Envio bloqueado: fora da janela de 24h', { instance_id: instance.id, type: body.type });
      return jsonResponse(
        {
          ok: false,
          code: 131047,
          error: 'Fora da janela de 24h: este contato não te enviou mensagem nas últimas 24h. Envie um template aprovado para reabrir a conversa.',
        },
        400,
      );
    }
  }

  // Anexo do chat: a Meta baixa por `link`, e o bucket é privado. O link de 1 h
  // sai daqui, assinado COM O TOKEN de quem envia: a regra do Storage decide
  // (pasta da Loja e arquivo que a própria pessoa subiu). Caminho de outra Loja,
  // de inbound/ ou torto nem chega a ser assinado. O audio.ts e os casos abaixo
  // seguem lendo `media_url`, que passa a ser este link.
  if (body.media_path !== undefined && ['image', 'video', 'audio', 'document'].includes(body.type)) {
    const caminho = caminhoDeEnvioValido(body.media_path, instance.tenant_id);
    if (!caminho) return jsonResponse({ ok: false, error: 'Arquivo inválido para este número.' }, 400);
    const comoUsuario = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const { data: assinado, error: signError } = await comoUsuario.storage
      .from(WHATSAPP_MEDIA_BUCKET)
      .createSignedUrl(caminho, MEDIA_LINK_TTL_S);
    if (signError || !assinado?.signedUrl) {
      logger.warn('Anexo sem link para envio', { instance_id: instance.id, error: signError?.message });
      return jsonResponse({ ok: false, error: 'Arquivo não encontrado. Anexe de novo e envie.' }, 403);
    }
    body.media_url = assinado.signedUrl;
  }

  // Token do Vault
  const { data: accessToken, error: tokenError } = await supabaseAdmin.rpc(
    'get_instance_meta_token',
    { p_instance_id: instance.id },
  );
  if (tokenError || !accessToken) {
    logger.error('No Meta token in Vault', { instance_id: instance.id, error: tokenError?.message });
    return jsonResponse({ ok: false, error: 'Token Meta não encontrado no Vault.' }, 500);
  }

  // Monta payload da Graph API conforme o tipo (meta-body.ts)
  const corpo = montarCorpoMeta(body);
  if (!corpo.ok) return jsonResponse(corpo.resposta, corpo.status);
  const metaBody = corpo.metaBody;

  // Chama a Graph API
  const url = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`;
  let metaResp: Response;
  try {
    metaResp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(metaBody),
    });
  } catch (e: any) {
    logger.error('Network error talking to Meta', { error: e?.message });
    return jsonResponse({ ok: false, error: `Falha de rede ao chamar Meta: ${e?.message}` }, 502);
  }

  let metaJson: any = null;
  try {
    metaJson = await metaResp.json();
  } catch {
    /* algumas respostas de erro vêm como texto */
  }

  if (!metaResp.ok) {
    const err = metaJson?.error;
    const errMsg = err?.message || metaJson?.message || `HTTP ${metaResp.status}`;
    const errCode = err?.code;
    logger.warn('Meta API rejected message', {
      instance_id: instance.id,
      status: metaResp.status,
      code: errCode,
      type: body.type,
    });
    // Erros comuns mapeados para mensagens em PT-BR
    let friendly = errMsg;
    if (errCode === 131047) friendly = 'Fora da janela de 24h: envie um template aprovado antes.';
    else if (errCode === 131026) friendly = 'Número não existe no WhatsApp.';
    else if (errCode === 133010) friendly = 'Número Meta ainda não está registrado (chame /register).';
    else if (errCode === 131051) friendly = 'Tipo de mensagem não suportado pela Cloud API.';
    // `meta_message` é a frase crua da Meta (com error_data.details): é ela
    // que o front grava em messages.error_message quando a linha vira failed.
    const { error_message: metaMessage } = camposDaFalhaMeta(err ?? metaJson);
    return jsonResponse(
      { ok: false, error: friendly, code: errCode, status: metaResp.status, meta_message: metaMessage },
      400,
    );
  }

  const messageId = metaJson?.messages?.[0]?.id;
  logger.info('Meta message sent', { instance_id: instance.id, type: body.type, messageId });

  return jsonResponse({ ok: true, messageId, raw: metaJson }, 200);
});
