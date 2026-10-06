import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createLogger } from '../_shared/logger.ts';
import { applyReplyCancellations } from '../_shared/followup-reply.ts';
import { corsHeaders, DataSanitizer } from '../_shared/validation.ts';
import { verifyMetaSignatureAny, matchVerifyToken } from '../_shared/cryptoSignature.ts';
import { appSlotName, isDuplicateInsertError, summarizeDelivery, type MetaAppSlot } from '../_shared/meta-webhook-delivery.ts';
import { ProviderFactory } from '../_shared/provider-factory.ts';
import { MetaProvider } from '../_shared/whatsapp-providers/meta.ts';
import {
  checkRateLimitDb,
  getRateLimitIdentifier,
  getRateLimitHeaders,
  createRateLimitResponse,
  RATE_LIMIT_PRESETS,
} from '../_shared/rateLimit.ts';

/**
 * Meta Cloud API webhook receiver.
 *
 * - GET  /functions/v1/meta-webhook   -> verification handshake
 * - POST /functions/v1/meta-webhook   -> incoming messages and delivery statuses
 *
 * The verify_token used for the GET handshake is global (per Supabase project) and
 * configured via the META_GLOBAL_VERIFY_TOKEN secret. The same token must be set
 * on the Meta App Webhook configuration in the Developer Console.
 *
 * Dois Meta Apps podem apontar para este endpoint ao mesmo tempo. O segundo usa
 * META_APP_SECRET_SECONDARY / META_GLOBAL_VERIFY_TOKEN_SECONDARY, ambos
 * opcionais. A ordem de tentativa é primário, depois secundário; sem match,
 * rejeita (401 no POST, 403 no GET) — não existe bypass.
 *
 * ⚠️ O suporte ao secundário é PERMANENTE, não um remendo de migração. Ele
 * existe para toda troca de app da Meta, presente ou futura: sem ele não há
 * como configurar o webhook do app novo sem derrubar o atual. Terminada uma
 * migração, o procedimento é LIMPAR O VALOR dos dois secrets `_SECONDARY` no
 * Supabase (ou apagá-los) — nunca remover este código. Com o secundário vazio
 * ou ausente, a função se comporta exatamente como com um secret só: o slot
 * vazio nunca casa com nada, nem com token vazio. Isso é coberto por
 * `src/lib/metaWebhookSignature.test.ts` ("secundário ausente se comporta
 * exatamente como só o primário"); quem mexer aqui tem que manter esse teste
 * verde.
 */
serve(async (req) => {
  const logger = createLogger(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const verifyTokenEnv = Deno.env.get('META_GLOBAL_VERIFY_TOKEN');
  const verifyTokenSecondary = Deno.env.get('META_GLOBAL_VERIFY_TOKEN_SECONDARY');
  const appSecret = Deno.env.get('META_APP_SECRET');
  const appSecretSecondary = Deno.env.get('META_APP_SECRET_SECONDARY');
  // Índice 0 = app atual, 1 = app novo. Só o índice entra no log — nunca o valor.
  const APP_SLOT = ['primary', 'secondary'] as const;

  if (!supabaseUrl || !supabaseServiceKey) {
    logger.error('Missing Supabase configuration');
    return new Response(JSON.stringify({ error: 'Configuration Error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // GET = verification handshake
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (!verifyTokenEnv) {
      logger.error('META_GLOBAL_VERIFY_TOKEN is not configured');
      return new Response('Server misconfigured', { status: 500 });
    }

    const tokenSlot = matchVerifyToken(token, [verifyTokenEnv, verifyTokenSecondary]);
    if (mode === 'subscribe' && tokenSlot >= 0 && challenge) {
      logger.info('Meta webhook verified', { app: APP_SLOT[tokenSlot] });
      return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }

    logger.warn('Meta webhook verification failed');
    return new Response('Forbidden', { status: 403 });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Rate limiting (only on POST events)
  const clientId = getRateLimitIdentifier(req);
  const rateLimitResult = await checkRateLimitDb(supabase, clientId, {
    ...RATE_LIMIT_PRESETS.webhook,
    keyPrefix: 'meta-webhook',
  });
  if (!rateLimitResult.allowed) {
    logger.warn('Rate limit exceeded', { clientId, retryAfter: rateLimitResult.retryAfter });
    return createRateLimitResponse(
      rateLimitResult.retryAfter!,
      { ...corsHeaders, ...getRateLimitHeaders(rateLimitResult.remaining, rateLimitResult.resetAt, RATE_LIMIT_PRESETS.webhook.maxRequests) },
    );
  }

  try {
    // Read the raw body BEFORE parsing so we can verify the HMAC against the
    // exact bytes Meta signed. JSON.parse must run on the same string.
    const rawBody = await req.text();

    if (!appSecret) {
      logger.error('META_APP_SECRET is not configured');
      return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    const signatureHeader = req.headers.get('x-hub-signature-256');
    const signedBy = await verifyMetaSignatureAny(rawBody, signatureHeader, [appSecret, appSecretSecondary]);
    if (signedBy < 0) {
      // Logging detalhado para diagnóstico — quando aparecem 401s recorrentes,
      // estes campos identificam a fonte:
      // - userAgent: distingue Meta (facebookplatform/...) de bots/scanners
      // - sourceIp: identifica origem (Meta vs. outro lugar)
      // - bodyAppId: identifica QUAL Meta App está enviando (apps diferentes
      //   têm secrets diferentes — útil quando há mais de um app apontando
      //   pra esta URL)
      let bodyAppId: string | undefined;
      try {
        const peek = JSON.parse(rawBody);
        bodyAppId = peek?.entry?.[0]?.id;
      } catch {
        // body não é JSON válido — provavelmente scanner ou request malformado
      }
      logger.warn('Invalid Meta webhook signature', {
        hasHeader: !!signatureHeader,
        secondaryConfigured: !!appSecretSecondary,
        userAgent: req.headers.get('user-agent'),
        sourceIp:
          req.headers.get('cf-connecting-ip') ||
          req.headers.get('x-real-ip') ||
          req.headers.get('x-forwarded-for'),
        bodyAppId,
        bodyLength: rawBody.length,
      });
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      logger.warn('Meta webhook body is not valid JSON');
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    if (payload.object !== 'whatsapp_business_account') {
      logger.warn('Unexpected webhook object', { object: payload.object });
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // UM log por entrega dizendo QUAL app assinou. É o que responde "o app
    // antigo já parou de entregar?" durante uma troca de app (ver o cabeçalho
    // e _shared/meta-webhook-delivery.ts). Nunca o conteúdo, só contagens.
    const app = appSlotName(signedBy);
    const summary = summarizeDelivery(payload);
    logger.info('Meta webhook delivery', { app, ...summary });

    const entries: any[] = Array.isArray(payload.entry) ? payload.entry : [];

    for (const entry of entries) {
      const changes: any[] = Array.isArray(entry.changes) ? entry.changes : [];
      for (const change of changes) {
        // V7: reaja a sinais de saúde/restrição da conta — antes o app os ignorava
        // e só descobria a restrição pelo e-mail da Meta.
        if (change.field === 'account_update') {
          await handleAccountUpdate(supabase, entry, change.value || {}, logger);
          continue;
        }
        if (change.field === 'phone_number_quality_update') {
          await handlePhoneQualityUpdate(supabase, change.value || {}, logger);
          continue;
        }
        if (change.field !== 'messages') continue;

        const value = change.value || {};
        const phoneNumberId: string | undefined = value.metadata?.phone_number_id;
        if (!phoneNumberId) {
          logger.warn('Missing phone_number_id in webhook payload');
          continue;
        }

        // Resolve instance via provider + connection_config.phoneNumberId.
        // We also fetch provider/instance_key/connection_config so the
        // ProviderFactory can build a MetaProvider to download inbound media.
        const { data: instance, error: instanceError } = await supabase
          .from('whatsapp_instances')
          .select('id, tenant_id, provider, instance_key, connection_config')
          .eq('provider', 'official')
          .filter('connection_config->>phoneNumberId', 'eq', phoneNumberId)
          .single();

        if (instanceError || !instance) {
          logger.warn('Meta instance not found', { phoneNumberId });
          continue;
        }

        // Incoming messages
        const messages: any[] = Array.isArray(value.messages) ? value.messages : [];
        for (const msg of messages) {
          await handleIncomingMessage(supabase, instance, msg, logger, app);
        }

        // Delivery / read statuses
        const statuses: any[] = Array.isArray(value.statuses) ? value.statuses : [];
        for (const status of statuses) {
          await handleStatusUpdate(supabase, status, logger, app);
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    logger.error('Error processing Meta webhook', { error: error.message });
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

/**
 * V4: Opt-out automático por palavra-chave.
 * Normaliza o texto (trim, lowercase, remove acentos e pontuação) e verifica
 * se é exatamente uma das palavras/expressões de descadastro.
 * Se sim, chama set_contact_opt_out_by_phone — idempotente e best-effort.
 * Cf. whatsapp-policies/SKILL.md §1.4.
 */
async function checkOptOutKeyword(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  phone: string,
  rawText: string,
  logger: ReturnType<typeof createLogger>,
): Promise<void> {
  const OPT_OUT_KEYWORDS = new Set([
    'parar', 'pare', 'sair', 'cancelar', 'cancelar inscricao',
    'descadastrar', 'stop', 'unsubscribe', 'nao quero receber',
    'nao quero receber', 'remover',
  ]);

  // Normaliza: lowercase, trim, remove acentos, remove pontuação.
  const normalized = rawText
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove diacríticos
    .replace(/[^\w\s]/g, '')         // remove pontuação
    .trim();

  if (!OPT_OUT_KEYWORDS.has(normalized)) return;

  try {
    await supabase.rpc('set_contact_opt_out_by_phone', {
      p_tenant: tenantId,
      p_phone: phone,
      p_source: 'keyword',
    });
    logger.info('Opt-out registrado por palavra-chave (Meta)', {
      tenantId,
      phone: DataSanitizer.sanitizePhoneNumber(phone),
      keyword: normalized,
    });
  } catch (err: any) {
    logger.warn('set_contact_opt_out_by_phone falhou (best-effort)', { error: err.message });
  }
}

async function handleIncomingMessage(
  supabase: ReturnType<typeof createClient>,
  instance: {
    id: string;
    tenant_id: string;
    provider?: string;
    instance_key?: string;
    connection_config?: Record<string, any>;
  },
  msg: any,
  logger: ReturnType<typeof createLogger>,
  app: MetaAppSlot | 'unknown' = 'unknown',
) {
  const rawPhone: string = msg.from || '';
  const phone = DataSanitizer.sanitizePhoneNumber(rawPhone);
  if (!phone) return;

  const content = extractMessageContent(msg);
  const messageId: string | undefined = msg.id;

  if (!content || !messageId) {
    logger.info('Skipping Meta message without text content', { type: msg.type });
    return;
  }

  // V4: checagem de opt-out por palavra-chave — apenas mensagens de texto puro.
  if (msg.type === 'text' && msg.text?.body) {
    await checkOptOutKeyword(supabase, instance.tenant_id, rawPhone, msg.text.body, logger);
  }

  // Webhooks are at-least-once. Drop duplicates before invoking the RPC so we
  // don't double-fire downstream automations on the same wamid.
  const { data: existing, error: dedupError } = await supabase
    .from('messages')
    .select('id')
    .eq('evolution_message_id', messageId)
    .limit(1)
    .maybeSingle();

  if (dedupError) {
    logger.warn('Meta dedup lookup failed, proceeding anyway', { error: dedupError.message });
  } else if (existing) {
    logger.info('Meta message already processed, skipping', { id: messageId, app });
    return;
  }

  // v1 bots (patched RPC ignores v2 bots). The RPC resolves/creates the contact
  // by (phone, tenant) and RETURNS its id — use that directly. Re-querying with
  // an instance filter missed contacts whose whatsapp_instance_id is null or set
  // to another instance (e.g. created before this instance existed), which
  // silently prevented the v2 engine from ever being invoked.
  const { data: rpcResult, error: rpcError } = await supabase.rpc('process_incoming_message', {
    p_phone: phone,
    p_message_content: content,
    p_whatsapp_instance_id: instance.id,
    p_evolution_message_id: messageId,
  });

  if (isDuplicateInsertError(rpcError)) {
    // Duas entregas do mesmo wamid (dois apps inscritos na mesma WABA, ou
    // retry da Meta) passaram pelo SELECT acima ao mesmo tempo; esta perdeu
    // a corrida no índice único. A linha já existe — e o bot já foi chamado
    // pela entrega que ganhou. Parar aqui é o que evita a resposta em dobro.
    logger.info('Meta message duplicate delivery lost the race, skipping side effects', {
      id: messageId,
      app,
      phoneNumberId: instance.connection_config?.phoneNumberId ?? null,
    });
    return;
  }
  if (rpcError) {
    // Comportamento de sempre para qualquer outro erro: segue para o bot pelo
    // fallback de contato. Só ganhou um log, que antes não existia.
    logger.warn('process_incoming_message failed (continuing)', { id: messageId, app, error: rpcError.message });
  }

  logger.info('Meta message processed', {
    id: messageId,
    type: msg.type,
    app,
    phoneNumberId: instance.connection_config?.phoneNumberId ?? null,
  });

  // CTWA ad referral: Meta anexa `referral` à PRIMEIRA mensagem quando o lead chega
  // clicando num anúncio Click-to-WhatsApp (Face/Insta). O insert da mensagem é feito
  // pela RPC acima; aqui gravamos o referral na linha recém-criada (identificada pelo
  // wamid) para a aba Conversas mostrar de qual anúncio o lead veio. Best-effort —
  // uma falha aqui nunca deve interromper o processamento do webhook.
  if (msg.referral && typeof msg.referral === 'object') {
    const { error: refError } = await supabase
      .from('messages')
      .update({ ad_referral: msg.referral })
      .eq('evolution_message_id', messageId)
      .eq('direction', 'inbound');
    if (refError) {
      logger.warn('Failed to persist CTWA ad referral', { error: refError.message, id: messageId });
    } else {
      logger.info('CTWA ad referral stored', { id: messageId, sourceType: msg.referral.source_type });
    }
  }

  // Inbound media (audio/image/video/document/sticker): Meta only sends a
  // media_id in the webhook, not a public URL. The RPC above inserts the row as
  // a text placeholder (e.g. "[Áudio]"); here we download the actual file and
  // backfill message_type + media_url so the inbox can render/play it. Run in
  // the background (EdgeRuntime.waitUntil) so the webhook still returns 200 fast
  // even for large files — useMessages refetches and picks up the URL.
  const MEDIA_TYPES = ['audio', 'image', 'video', 'document', 'sticker'];
  if (MEDIA_TYPES.includes(msg.type)) {
    const mediaPromise = persistIncomingMedia(supabase, instance, msg, messageId, logger)
      .catch((err: any) => {
        // Best-effort: on failure the row keeps its placeholder content and no
        // media_url. Never let a media failure break the webhook.
        logger.warn('Failed to persist Meta inbound media', {
          error: err?.message,
          id: messageId,
          type: msg.type,
        });
      });
    try {
      // @ts-ignore EdgeRuntime is a Supabase Edge runtime global
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(mediaPromise);
      } else {
        await mediaPromise;
      }
    } catch (_e) {
      // best-effort; ignore
    }
  }

  // Resolve contact_id: prefer the RPC result; fall back to a phone+tenant lookup.
  let contactId: string | undefined = (rpcResult as any)?.contact_id;
  if (!contactId) {
    const { data: contactRow } = await supabase
      .from('contacts')
      .select('id')
      .eq('phone', phone)
      .eq('tenant_id', instance.tenant_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    contactId = contactRow?.id as string | undefined;
  }

  if (contactId) {
    invokeChatbotEngine({
      tenant_id: instance.tenant_id,
      whatsapp_instance_id: instance.id,
      contact_id: contactId,
      phone,
      message: content,
    }, logger);

    // Follow-up: aplica o que a resposta do contato cancela (não-fatal).
    await applyReplyCancellations(supabase, instance.tenant_id, contactId, logger);

    // Campaign reply tracking (additive, isolated). If this contact has a recently-sent
    // campaign message, an inbound reply marks that execution as 'replied'.
    try {
      const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      const { data: rexecs } = await supabase
        .from('campaign_executions')
        .select('id, campaign_id')
        .eq('contact_id', contactId)
        .in('status', ['sent', 'delivered', 'read'])
        .gte('sent_at', since)
        .order('sent_at', { ascending: false })
        .limit(1);
      const rex = rexecs?.[0] as { id: string; campaign_id: string } | undefined;
      if (rex) {
        await supabase
          .from('campaign_executions')
          .update({ status: 'replied', replied_at: new Date().toISOString() })
          .eq('id', rex.id);
        await supabase.rpc('recompute_campaign_metrics', { p_campaign_id: rex.campaign_id });
        logger.info('Campaign execution marked replied', { execution: rex.id });
      }
    } catch (e) {
      logger.warn('Campaign reply mapping failed', { error: (e as Error).message });
    }
  } else {
    logger.warn('Meta: could not resolve contact_id for chatbot engine', { phone });
  }
}

async function handleStatusUpdate(
  supabase: ReturnType<typeof createClient>,
  status: any,
  logger: ReturnType<typeof createLogger>,
  app: MetaAppSlot | 'unknown' = 'unknown',
) {
  const messageId: string | undefined = status.id;
  const metaStatus: string | undefined = status.status;
  if (!messageId || !metaStatus) return;

  // Meta status values: sent, delivered, read, failed
  const normalized = metaStatus.toLowerCase();

  await supabase
    .from('messages')
    .update({ status: normalized })
    .eq('evolution_message_id', messageId);

  logger.info('Meta message status updated', { id: messageId, status: normalized, app });

  // Campaign delivery/read tracking (additive, isolated — never disrupt status handling).
  // The wamid we stored as campaign_executions.provider_message_id on send equals status.id.
  try {
    if (normalized === 'delivered' || normalized === 'read') {
      const { data: execs } = await supabase
        .from('campaign_executions')
        .select('id, campaign_id, status')
        .eq('provider_message_id', messageId)
        .limit(1);
      const exec = execs?.[0] as { id: string; campaign_id: string; status: string } | undefined;
      if (exec) {
        // Never downgrade (read -> delivered) on out-of-order acks.
        const rank: Record<string, number> = {
          pending: 0, processing: 0, skipped: 0, failed: 1, sent: 1, delivered: 2, read: 3, replied: 4,
        };
        if ((rank[normalized] ?? 0) > (rank[exec.status] ?? 0)) {
          const patch: Record<string, unknown> = { status: normalized };
          const nowIso = new Date().toISOString();
          if (normalized === 'delivered') patch.delivered_at = nowIso;
          if (normalized === 'read') { patch.read_at = nowIso; patch.delivered_at = nowIso; }
          await supabase.from('campaign_executions').update(patch).eq('id', exec.id);
          await supabase.rpc('recompute_campaign_metrics', { p_campaign_id: exec.campaign_id });
          logger.info('Campaign execution ack mapped', { execution: exec.id, status: normalized });
        }
      }
    }
  } catch (e) {
    logger.warn('Campaign ack mapping failed', { error: (e as Error).message });
  }
}

/**
 * V7: account_update — banimento/restrição/review da WABA inteira.
 * `entry.id` é o WABA id; resolvemos todas as instâncias daquele WABA.
 * Eventos típicos: ACCOUNT_RESTRICTION, ACCOUNT_VIOLATION, DISABLED_UPDATE,
 * ACCOUNT_REVIEW_UPDATE, ACCOUNT_UPDATE_BAN. Não confiamos numa lista fixa —
 * tratamos como restrição qualquer evento que cite ban/restrict/violat/disable.
 */
async function handleAccountUpdate(
  supabase: ReturnType<typeof createClient>,
  entry: any,
  value: any,
  logger: ReturnType<typeof createLogger>,
) {
  const wabaId: string | undefined = entry?.id;
  if (!wabaId) return;

  const event: string = String(value?.event || value?.decision || 'ACCOUNT_UPDATE');
  const lowered = event.toLowerCase();
  const restricted =
    /(ban|restrict|violat|disable|reject)/.test(lowered) ||
    !!value?.ban_info || (Array.isArray(value?.restriction_info) && value.restriction_info.length > 0);

  const { data: instances } = await supabase
    .from('whatsapp_instances')
    .select('id, tenant_id, name')
    .eq('provider', 'official')
    .filter('connection_config->>wabaId', 'eq', wabaId);

  if (!instances || instances.length === 0) {
    logger.warn('account_update: nenhuma instância para o WABA', { wabaId, event });
    return;
  }

  for (const inst of instances as Array<{ id: string; tenant_id: string; name: string }>) {
    await supabase
      .from('whatsapp_instances')
      .update({
        account_review_status: event,
        is_restricted: restricted,
        restriction_info: value,
        health_updated_at: new Date().toISOString(),
        ...(restricted ? { status: 'restricted' } : {}),
      })
      .eq('id', inst.id);

    logger.warn('account_update aplicado', { instance: inst.id, event, restricted });

    await notifyInstanceAdmins(
      supabase,
      inst,
      restricted ? 'Conta WhatsApp restrita pela Meta' : 'Atualização da conta WhatsApp (Meta)',
      restricted
        ? `O número "${inst.name}" foi RESTRITO pela Meta (${event}). Pare os envios e revise a conformidade (.agent/skills/whatsapp-policies/SKILL.md).`
        : `A conta do número "${inst.name}" mudou de estado na Meta (${event}).`,
      restricted ? 'error' : 'warning',
      { source: 'meta-webhook', kind: 'account_update', event },
    );
  }
}

/**
 * V7: phone_number_quality_update — green/yellow/red e mudança de tier.
 * `value.display_phone_number`, `value.event` (ex. ONBOARDING/UPGRADE/DOWNGRADE/
 * FLAGGED/UNFLAGGED), `value.current_limit`.
 */
async function handlePhoneQualityUpdate(
  supabase: ReturnType<typeof createClient>,
  value: any,
  logger: ReturnType<typeof createLogger>,
) {
  const phoneNumberId: string | undefined = value?.metadata?.phone_number_id;
  const display: string | undefined = value?.display_phone_number;
  const event: string = String(value?.event || '');
  const limit: string | undefined = value?.current_limit;
  const quality: string | undefined = value?.quality_rating || value?.current_quality_rating;

  let query = supabase
    .from('whatsapp_instances')
    .select('id, tenant_id, name')
    .eq('provider', 'official');
  query = phoneNumberId
    ? query.filter('connection_config->>phoneNumberId', 'eq', phoneNumberId)
    : query.eq('phone_number', display ?? '__none__');

  const { data: instance } = await query.maybeSingle();
  if (!instance) {
    logger.warn('phone_number_quality_update: instância não encontrada', { phoneNumberId, display });
    return;
  }

  const inst = instance as { id: string; tenant_id: string; name: string };
  const flagged = /(flag|downgrade)/i.test(event) || quality === 'RED';

  await supabase
    .from('whatsapp_instances')
    .update({
      ...(quality ? { quality_rating: quality } : {}),
      ...(limit ? { messaging_limit_tier: limit } : {}),
      health_updated_at: new Date().toISOString(),
    })
    .eq('id', inst.id);

  logger.info('phone_number_quality_update aplicado', { instance: inst.id, event, quality, limit });

  if (flagged) {
    await notifyInstanceAdmins(
      supabase,
      inst,
      'Qualidade do número WhatsApp caiu',
      `O número "${inst.name}" teve queda de qualidade na Meta (${event}${quality ? `, rating ${quality}` : ''}). Reduza envios e melhore a conformidade para não ser restrito.`,
      'warning',
      { source: 'meta-webhook', kind: 'phone_number_quality_update', event, quality },
    );
  }
}

/**
 * Notifica super_admins (global) + usuários do tenant dono da instância.
 */
async function notifyInstanceAdmins(
  supabase: ReturnType<typeof createClient>,
  inst: { tenant_id: string },
  title: string,
  message: string,
  type: 'info' | 'success' | 'warning' | 'error',
  metadata: Record<string, unknown>,
) {
  try {
    const { data: supers } = await supabase.from('profiles').select('user_id').eq('role', 'superadmin');
    const { data: tenantUsers } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('tenant_id', inst.tenant_id);

    const userIds = new Set<string>();
    for (const p of [...(supers ?? []), ...(tenantUsers ?? [])]) {
      const uid = (p as { user_id: string | null }).user_id;
      if (uid) userIds.add(uid);
    }

    if (userIds.size === 0) return;
    const rows = [...userIds].map((uid) => ({ user_id: uid, title, message, type, metadata }));
    await supabase.from('notifications').insert(rows);
  } catch (e) {
    // Notificação é best-effort — nunca derrube o processamento do webhook.
  }
}

function extractMessageContent(msg: any): string {
  switch (msg.type) {
    case 'text':
      return msg.text?.body || '';
    case 'button':
      return msg.button?.text || '';
    case 'interactive': {
      const i = msg.interactive || {};
      return i.button_reply?.title || i.list_reply?.title || '';
    }
    case 'image':
      return `[Imagem]${msg.image?.caption ? ` ${msg.image.caption}` : ''}`;
    case 'video':
      return `[Vídeo]${msg.video?.caption ? ` ${msg.video.caption}` : ''}`;
    case 'audio':
      return '[Áudio]';
    case 'document':
      return `[Documento]${msg.document?.filename ? ` ${msg.document.filename}` : ''}`;
    case 'location':
      return '[Localização]';
    case 'sticker':
      return '[Sticker]';
    case 'reaction':
      return msg.reaction?.emoji || '';
    default:
      return '';
  }
}

/**
 * Best-guess file extension from a MIME type. Meta strips the codec suffix
 * (e.g. "audio/ogg; codecs=opus") on some payloads, so we split on ';' first.
 */
function extFromMime(mimeType: string | undefined): string {
  const base = (mimeType || '').split(';')[0].trim().toLowerCase();
  const map: Record<string, string> = {
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/aac': 'aac',
    'audio/amr': 'amr',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/3gpp': '3gp',
    'application/pdf': 'pdf',
  };
  if (map[base]) return map[base];
  // Fallback: take the sub-type after the slash, else "bin".
  const sub = base.split('/')[1];
  return sub && /^[a-z0-9]+$/.test(sub) ? sub : 'bin';
}

/**
 * Download an inbound media file from Meta and backfill the message row.
 *
 * Flow (SKILL.md §4.1/§4.2 + §10.6): resolve media_id -> signed URL -> bytes
 * (Bearer required on both calls), upload to the public `whatsapp-media` bucket,
 * then UPDATE the message (matched by wamid) with message_type + media_url. The
 * row was already inserted by process_incoming_message as a text placeholder;
 * we mirror the ad_referral follow-up pattern instead of touching the RPC.
 */
async function persistIncomingMedia(
  supabase: ReturnType<typeof createClient>,
  instance: {
    id: string;
    tenant_id: string;
    provider?: string;
    instance_key?: string;
    connection_config?: Record<string, any>;
  },
  msg: any,
  wamid: string,
  logger: ReturnType<typeof createLogger>,
): Promise<void> {
  const descriptor = msg[msg.type] || {};
  const mediaId: string | undefined = descriptor.id;
  if (!mediaId) {
    logger.warn('Meta media message without media_id', { type: msg.type, id: wamid });
    return;
  }

  const provider = await ProviderFactory.getProvider(instance, supabase) as MetaProvider;

  // 1) media_id -> signed URL, 2) signed URL -> bytes (both need the Bearer).
  const { url: signedUrl, mimeType } = await provider.getMediaUrl(mediaId);
  const { bytes, contentType } = await provider.downloadMedia(signedUrl);
  // Strip codec params (e.g. "audio/ogg; codecs=opus") — the bucket's
  // allowed_mime_types check matches the base type exactly, even for service role.
  const effectiveMime = (mimeType || contentType || '').split(';')[0].trim() || 'application/octet-stream';

  // Store under <tenant_id>/inbound/<wamid>.<ext> in the existing public bucket.
  const ext = extFromMime(effectiveMime);
  const path = `${instance.tenant_id}/inbound/${wamid}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('whatsapp-media')
    .upload(path, bytes, { contentType: effectiveMime, upsert: true });
  if (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError.message}`);
  }

  const { data: pub } = supabase.storage.from('whatsapp-media').getPublicUrl(path);
  const publicUrl = pub?.publicUrl;
  if (!publicUrl) {
    throw new Error('Could not resolve public URL for uploaded media');
  }

  const { error: updateError } = await supabase
    .from('messages')
    .update({ message_type: msg.type, media_url: publicUrl })
    .eq('evolution_message_id', wamid)
    .eq('direction', 'inbound');
  if (updateError) {
    throw new Error(`Message media_url update failed: ${updateError.message}`);
  }

  logger.info('Meta inbound media stored', { id: wamid, type: msg.type, mime: effectiveMime });
}

/**
 * Fire-and-forget invocation of the process-chatbot-message Edge Function.
 * Errors are caught and logged; they must never propagate to the webhook caller.
 */
function invokeChatbotEngine(
  payload: {
    tenant_id: string;
    whatsapp_instance_id: string;
    contact_id: string;
    phone: string;
    message: string;
  },
  logger: ReturnType<typeof createLogger>,
): void {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const engineSecret = Deno.env.get('CHATBOT_ENGINE_SECRET');

  if (!supabaseUrl || !serviceKey) return;

  const url = `${supabaseUrl}/functions/v1/process-chatbot-message`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${serviceKey}`,
  };
  if (engineSecret) {
    headers['x-internal-secret'] = engineSecret;
  }

  const enginePromise = fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })
    .then((res) => {
      if (!res.ok) logger.warn('process-chatbot-message returned non-OK', { status: res.status });
    })
    .catch((err: any) => {
      logger.warn('process-chatbot-message invocation failed', { error: err?.message });
    });

  // Keep the isolate alive until the background request completes. Without this,
  // Deno tears the isolate down when the webhook response returns and cancels
  // the in-flight fetch — so the engine would never be invoked.
  try {
    // @ts-ignore EdgeRuntime is a Supabase Edge runtime global
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(enginePromise);
    }
  } catch (_e) {
    // best-effort; ignore
  }
}
