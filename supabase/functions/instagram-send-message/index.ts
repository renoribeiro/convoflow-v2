import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createLogger } from '../_shared/logger.ts';
import { decideInstanceAccess } from '../_shared/instance-access.ts';
import { buildCorsHeaders } from '../_shared/validation.ts';
import {
  buildGraphRequest,
  isTokenExpired,
  mapMetaError,
  REASON_MESSAGES,
  reasonMessage,
  validateSendRequest,
  type InstagramSendReason,
} from './logic.ts';

/**
 * instagram-send-message — responder um cliente do Instagram pelo inbox
 * (fatia 3/5).
 *
 * ============================================================================
 * O QUE FAZ
 * ============================================================================
 *
 * Recebe { instance_id, to (IGSID), text } de uma sessão autenticada e manda
 * UMA mensagem de texto pela "Instagram API with Instagram login":
 *
 *   1. quem chama pode usar a instância (decideInstanceAccess — a mesma regra
 *      do whatsapp-send-message e das policies de escrita);
 *   2. a instância é provider='instagram' e está ativa;
 *   3. `to` é um contato do Instagram da MESMA Conta da instância;
 *   4. a janela de 24 h está aberta (instagram_reply_window, por contato);
 *   5. o token não venceu (connection_config.tokenExpiresAt);
 *   6. token do Vault (get_instance_meta_token — o mesmo cofre do WhatsApp);
 *   7. POST graph.instagram.com; erro da Meta traduzido por código.
 *
 * NÃO grava a mensagem. A linha é do navegador, com a sessão do usuário: é o
 * que registra o autor (tg_set_message_sender usa auth.uid()) e o
 * participante. Esta função só devolve o message_id para o navegador guardar.
 *
 * ============================================================================
 * POR QUE NÃO É UM RAMO DO whatsapp-send-message
 * ============================================================================
 *
 * Aquele é o único caminho de envio do WhatsApp oficial em produção. Ele
 * recusa provider≠official, confere a janela por TELEFONE, reescreve `to` para
 * "+dígitos" (estragaria um IGSID) e fala com graph.facebook.com pelo
 * phoneNumberId. Nada disso serve aqui, e mexer nele arrisca o WhatsApp.
 *
 * ============================================================================
 * RESPOSTAS
 * ============================================================================
 *
 *   200 { ok: true, messageId, recipientId }
 *   200 { ok: false, reason, error }   recusa de negócio — `error` é o texto
 *                                      pt-BR que a tela mostra; `reason` é
 *                                      estável (ver logic.ts)
 *   400 corpo inválido · 401 sem sessão · 403 sem acesso · 404 instância
 *
 * Recusa vem em 200 de propósito: `supabase.functions.invoke` esconde o corpo
 * das respostas não-2xx, e a mensagem é o que o atendente precisa ler.
 *
 * NÃO VAI PARA O LOG: texto, IGSID, token. Sai: instância, motivo, código da
 * Meta, o message_id devolvido.
 */
Deno.serve(async (req: Request) => {
  const logger = createLogger(req);
  const corsHeaders = buildCorsHeaders(req.headers.get('origin'));

  const json = (body: Record<string, unknown>, status: number): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  const refuse = (reason: InstagramSendReason, extra: Record<string, unknown> = {}): Response =>
    json({ ok: false, reason, error: REASON_MESSAGES[reason], ...extra }, 200);

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRole) {
    logger.error('instagram-send-message: ambiente incompleto');
    return json({ ok: false, error: 'Server misconfigured' }, 500);
  }
  const admin = createClient(supabaseUrl, serviceRole);

  // ---- quem chama ----------------------------------------------------------
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ ok: false, error: 'Missing authorization header' }, 401);
  const { data: { user }, error: authError } = await admin.auth.getUser(authHeader.replace('Bearer ', ''));
  if (authError || !user) return json({ ok: false, error: 'Invalid session' }, 401);

  const { data: profile } = await admin
    .from('profiles')
    .select('tenant_id, role, status')
    .eq('user_id', user.id)
    .single();
  if (!profile?.tenant_id) return json({ ok: false, error: 'Profile not found' }, 403);

  // ---- corpo ---------------------------------------------------------------
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ ok: false, reason: 'bad_request', error: REASON_MESSAGES.bad_request }, 400);
  }
  const parsed = validateSendRequest(raw);
  if (!parsed.ok) {
    if (parsed.reason === 'bad_request') {
      return json({ ok: false, reason: 'bad_request', error: REASON_MESSAGES.bad_request }, 400);
    }
    return refuse(parsed.reason);
  }
  const { instance_id, to, text } = parsed.value;

  // ---- instância e acesso --------------------------------------------------
  const { data: instance } = await admin
    .from('whatsapp_instances')
    .select('id, tenant_id, provider, status, is_active, connection_config')
    .eq('id', instance_id)
    .maybeSingle();
  if (!instance) return json({ ok: false, error: 'Instance not found' }, 404);

  const { data: instanceTenant } = await admin
    .from('tenants')
    .select('id, kind, parent_tenant_id')
    .eq('id', instance.tenant_id)
    .maybeSingle();
  const access = decideInstanceAccess(profile, instance, instanceTenant);
  if (!access.allowed) {
    logger.warn('instagram-send-message: acesso negado', { instance_id, reason: access.reason });
    return json({ ok: false, reason: 'forbidden', error: REASON_MESSAGES.forbidden }, 403);
  }

  if (instance.provider !== 'instagram') return refuse('not_instagram');
  if (instance.is_active === false) return refuse('instance_inactive');

  const cfg = (instance.connection_config ?? {}) as Record<string, unknown>;
  const igAccountId = typeof cfg.igAccountId === 'string' ? cfg.igAccountId : '';
  if (!igAccountId) return refuse('token_missing');

  // ---- o contato é desta Conta ---------------------------------------------
  const { data: contact } = await admin
    .from('contacts')
    .select('id')
    .eq('tenant_id', instance.tenant_id)
    .eq('channel', 'instagram')
    .eq('external_id', to)
    .maybeSingle();
  if (!contact) return refuse('contact_not_found');

  // ---- janela de 24 h (antes de gastar chamada na Meta) --------------------
  const { data: janela, error: janelaErr } = await admin.rpc('instagram_reply_window', {
    p_contact_id: contact.id,
  });
  if (janelaErr) {
    logger.error('instagram-send-message: janela indisponível', { instance_id, code: janelaErr.code });
    return refuse('window_unavailable');
  }
  if (!(janela as { open?: boolean } | null)?.open) {
    logger.info('instagram-send-message: fora da janela, recusado antes da Meta', { instance_id });
    return refuse('outside_window');
  }

  // ---- validade da conexão -------------------------------------------------
  if (isTokenExpired(cfg.tokenExpiresAt, new Date())) {
    logger.warn('instagram-send-message: conexão vencida, recusado antes da Meta', { instance_id });
    return refuse('token_expired');
  }

  const { data: accessToken, error: vaultErr } = await admin.rpc('get_instance_meta_token', {
    p_instance_id: instance.id,
  });
  if (vaultErr || typeof accessToken !== 'string' || accessToken.length === 0) {
    logger.error('instagram-send-message: credencial ausente no Vault', { instance_id });
    return refuse('token_missing');
  }

  // ---- a Meta --------------------------------------------------------------
  const { url, body } = buildGraphRequest(igAccountId, to, text);
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    logger.error('instagram-send-message: falha de rede', {
      instance_id,
      detail: e instanceof Error ? e.message : String(e),
    });
    return refuse('network_error');
  }

  let metaJson: unknown = null;
  try {
    metaJson = await resp.json();
  } catch {
    /* corpo não-JSON: tratado como erro genérico abaixo */
  }

  if (!resp.ok) {
    const info = mapMetaError(resp.status, metaJson);
    logger.warn('instagram-send-message: Meta recusou', {
      instance_id,
      status: resp.status,
      reason: info.reason,
      code: info.code,
      subcode: info.subcode,
    });
    return json(
      { ok: false, reason: info.reason, error: reasonMessage(info), meta_code: info.code, meta_subcode: info.subcode },
      200,
    );
  }

  const r = (metaJson ?? {}) as Record<string, unknown>;
  const messageId = typeof r.message_id === 'string' ? r.message_id : null;
  if (!messageId) {
    // Documentado que sempre vem. Sem ele o eco não é casado pelo id — o
    // navegador ainda casa pelo texto enquanto a linha estiver 'pending'.
    logger.warn('instagram-send-message: Meta aceitou sem message_id', { instance_id });
  } else {
    logger.info('instagram-send-message: enviado', { instance_id, messageId });
  }

  return json({ ok: true, messageId, recipientId: typeof r.recipient_id === 'string' ? r.recipient_id : null }, 200);
});
