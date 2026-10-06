import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createLogger } from '../_shared/logger.ts'
import { applyReplyCancellations } from '../_shared/followup-reply.ts'
import { corsHeaders, DataSanitizer } from '../_shared/validation.ts'
import { matchVerifyToken } from '../_shared/cryptoSignature.ts'
import {
  checkRateLimitDb,
  getRateLimitIdentifier,
  getRateLimitHeaders,
  createRateLimitResponse,
  RATE_LIMIT_PRESETS
} from '../_shared/rateLimit.ts'

serve(async (req) => {
  const logger = createLogger(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Need Supabase client early for DB rate limiting
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    logger.error('Missing Supabase configuration');
    return new Response(JSON.stringify({ error: 'Configuration Error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Apply rate limiting
  const clientId = getRateLimitIdentifier(req);
  const rateLimitResult = await checkRateLimitDb(supabase, clientId, {
    ...RATE_LIMIT_PRESETS.webhook,
    keyPrefix: 'waha-webhook'
  });

  if (!rateLimitResult.allowed) {
    logger.warn('Rate limit exceeded', { clientId, retryAfter: rateLimitResult.retryAfter });
    return createRateLimitResponse(
      rateLimitResult.retryAfter!,
      { ...corsHeaders, ...getRateLimitHeaders(rateLimitResult.remaining, rateLimitResult.resetAt, RATE_LIMIT_PRESETS.webhook.maxRequests) }
    );
  }

  try {

    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    // Origin authentication: WAHA does not send a JWT, so the gateway is
    // configured with verify_jwt=false. Use a shared secret instead, sent
    // by WAHA via the Authorization: Bearer <secret> header (configured on
    // the WAHA side via WHATSAPP_HOOK_HEADERS).
    const wahaSecret = Deno.env.get('WAHA_WEBHOOK_SECRET');
    if (!wahaSecret) {
      logger.error('WAHA_WEBHOOK_SECRET is not configured; refusing webhook to avoid forged events');
      return new Response(JSON.stringify({ error: 'Webhook authentication not configured' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }
    const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization') ?? '';
    const providedSecret = authHeader.replace(/^Bearer\s+/i, '').trim();
    // Comparação em tempo constante (item 14 lote 6): `!==` para no primeiro
    // caractere diferente e o tempo de resposta vaza o prefixo certo.
    if (matchVerifyToken(providedSecret, [wahaSecret]) < 0) {
      logger.warn('WAHA webhook rejected: invalid or missing shared secret');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const payload = await req.json();
    const sessionName = payload.session || payload.sessionId;

    if (!sessionName) {
      return new Response('Missing session', { status: 400 });
    }

    // Identify Instance
    const { data: instance } = await supabase
      .from('whatsapp_instances')
      .select('id, tenant_id')
      .eq('instance_key', sessionName)
      .single();

    if (!instance) {
      logger.error(`Instance not found: ${sessionName}`);
      return new Response('Instance not found', { status: 404 });
    }

    logger.info('Waha webhook received', { event: payload.event, session: sessionName });

    // Map WAHA session status → our `whatsapp_instances.status` vocabulary.
    // Ref: .agent/skills/waha/SKILL.md §2.1
    const mapWahaStatus = (raw?: string): string | null => {
      if (!raw) return null;
      const s = raw.toUpperCase();
      if (s === 'WORKING') return 'connected';
      if (s === 'SCAN_QR_CODE') return 'qrcode';
      if (s === 'STARTING') return 'connecting';
      if (s === 'STOPPED' || s === 'FAILED') return 'disconnected';
      return null;
    };

    if (payload.event === 'session.status' || payload.event === 'status') {
      const mapped = mapWahaStatus(
        payload.payload?.status || payload.status || payload.payload?.state,
      );
      if (mapped) {
        await supabase
          .from('whatsapp_instances')
          .update({ status: mapped, updated_at: new Date().toISOString() })
          .eq('id', instance.id);
        logger.info('Instance status synced from WAHA', { id: instance.id, status: mapped });
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    if (payload.event === 'message') {
      const msg = payload.payload || {};
      if (msg.fromMe) return new Response('Skipped fromMe', { status: 200 });

      const fromRaw: string = typeof msg.from === 'string' ? msg.from : '';
      if (!fromRaw) {
        logger.warn('WAHA message without "from"', { id: msg.id });
        return new Response('Missing from', { status: 200 });
      }
      // WAHA usa "<numero>@c.us" para contatos e "<id>@g.us" para grupos.
      // Por enquanto ignoramos grupos para evitar inserir mensagens órfãs.
      if (fromRaw.endsWith('@g.us')) {
        return new Response('Skipped group message', { status: 200 });
      }
      const rawPhone = fromRaw.replace('@c.us', '');
      const phone = DataSanitizer.sanitizePhoneNumber(rawPhone);
      const content = msg.body || '';

      // V4: opt-out por palavra-chave — apenas mensagens de texto puro.
      // WAHA SKILL.md §4.2: type='chat' indica texto simples.
      if (phone && content && (msg.type === 'chat' || !msg.type)) {
        await checkOptOutKeyword(supabase, instance.tenant_id, phone, content, logger);
      }

      if (phone && content) {
        // v1 bots (patched RPC ignores v2 bots). The RPC resolves/creates the
        // contact by (phone, tenant) and RETURNS its id — use that directly.
        const { data: rpcResult } = await supabase.rpc('process_incoming_message', {
          p_phone: phone,
          p_message_content: content,
          p_whatsapp_instance_id: instance.id,
          p_evolution_message_id: msg.id
        });
        logger.info('Message processed', { id: msg.id });

        // Resolve contact_id: prefer the RPC result; fall back to phone+tenant.
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
          // Fire-and-forget: visual-flow chatbot engine (v2 bots).
          invokeChatbotEngine({
            tenant_id: instance.tenant_id,
            whatsapp_instance_id: instance.id,
            contact_id: contactId,
            phone,
            message: content,
          }, logger);

          // Follow-up: aplica o que a resposta do contato cancela (não-fatal).
          await applyReplyCancellations(supabase, instance.tenant_id, contactId, logger);
        }

        // Campaign reply tracking — isolated so it never disrupts message handling.
        // WAHA SKILL.md §4.2: inbound "message" event, payload.from = "<phone>@c.us".
        try {
          await markCampaignExecutionReplied(supabase, phone, logger);
        } catch (replyErr: any) {
          logger.warn('WAHA campaign reply tracking failed (non-fatal)', { error: replyErr.message });
        }
      }
    } else if (payload.event === 'message.ack' || payload.event === 'message.status') {
      const ackData = payload.payload;
      // WAHA SKILL.md §4.1: message.ack event.
      // ack numeric values: 1=server, 2=device/received, 3=read, 4=played
      // Some WAHA versions also send ackName: 'DEVICE' | 'READ' | 'PLAYED'
      // or a string status field.

      let status = 'sent';
      let id = ackData.id;

      // Normalize WAHA message ID — can be string or object with _serialized.
      // SKILL.md §4.2: payload.id = "false_5511...@c.us_3EB0XXXX"
      if (typeof id === 'object' && id._serialized) id = id._serialized;

      if (ackData.ack) {
        if (ackData.ack >= 3) status = 'read';
        else if (ackData.ack === 2) status = 'delivered';
      } else if (ackData.status) {
        status = ackData.status.toLowerCase(); // 'read', 'delivered'
      }

      await supabase.from('messages')
        .update({ status: status, updated_at: new Date().toISOString() })
        .eq('evolution_message_id', id); // We store WAHA ID in this column

      logger.info('Message status updated', { id, status });

      // Campaign execution ACK tracking — isolated.
      // Map ack numeric/status to our campaign execution status.
      try {
        if (status === 'delivered' || status === 'read') {
          await updateCampaignExecutionAck(supabase, String(id), status as 'delivered' | 'read', logger);
        }
      } catch (ackErr: any) {
        logger.warn('WAHA campaign ACK update failed (non-fatal)', { id, error: ackErr.message });
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    logger.error('Error processing Waha webhook', { error: error.message });
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})

/**
 * V4: Opt-out automático por palavra-chave (WAHA).
 * Normaliza o texto (trim, lowercase, remove acentos e pontuação) e verifica
 * se é exatamente uma das palavras/expressões de descadastro.
 * Se sim, chama set_contact_opt_out_by_phone — idempotente e best-effort.
 * Cf. whatsapp-policies/SKILL.md §1.4 e waha/SKILL.md §10 (regras de uso).
 */
async function checkOptOutKeyword(
  supabase: SupabaseClient,
  tenantId: string,
  phone: string,
  rawText: string,
  logger: any,
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
    logger.info('Opt-out registrado por palavra-chave (WAHA)', {
      tenantId,
      phone: DataSanitizer.sanitizePhoneNumber(phone),
      keyword: normalized,
    });
  } catch (err: any) {
    logger.warn('set_contact_opt_out_by_phone falhou (best-effort)', { error: err.message });
  }
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
  logger: any,
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

// ─── Campaign helpers (isolated) ─────────────────────────────────────────────

/**
 * Find a campaign_execution by provider_message_id and advance to
 * delivered or read. Then recompute metrics for the campaign.
 * Caller must wrap in try/catch — any DB error must not surface to the caller.
 *
 * WAHA SKILL.md §4.1: message.ack event — ack=2 → delivered, ack>=3 → read.
 */
async function updateCampaignExecutionAck(
  supabase: SupabaseClient,
  providerMessageId: string,
  ackStatus: 'delivered' | 'read',
  logger: any,
) {
  const { data: exec } = await supabase
    .from('campaign_executions')
    .select('id, campaign_id, status')
    .eq('provider_message_id', providerMessageId)
    .maybeSingle();

  if (!exec) return;

  // Only advance forward
  const statusOrder: Record<string, number> = { sent: 1, delivered: 2, read: 3 };
  if ((statusOrder[exec.status] ?? 0) >= (statusOrder[ackStatus] ?? 0)) return;

  const updatePayload: Record<string, any> = {
    status: ackStatus,
    updated_at: new Date().toISOString(),
  };
  if (ackStatus === 'delivered') updatePayload.delivered_at = new Date().toISOString();
  if (ackStatus === 'read') updatePayload.read_at = new Date().toISOString();

  await supabase.from('campaign_executions').update(updatePayload).eq('id', exec.id);
  await supabase.rpc('recompute_campaign_metrics', { p_campaign_id: exec.campaign_id });

  logger.info('Campaign execution ACK updated (WAHA)', {
    executionId: exec.id,
    campaignId: exec.campaign_id,
    ackStatus,
    providerMessageId,
  });
}

/**
 * When an inbound message arrives, find the most recent campaign_execution
 * for this phone in status (sent|delivered|read) within the last 7 days and
 * mark it replied.
 * Caller must wrap in try/catch.
 *
 * WAHA SKILL.md §4.2: inbound "message" event, payload.from = "<phone>@c.us".
 */
async function markCampaignExecutionReplied(
  supabase: SupabaseClient,
  phone: string,
  logger: any,
) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: exec } = await supabase
    .from('campaign_executions')
    .select('id, campaign_id, status')
    .eq('contact_identifier', phone)
    .in('status', ['sent', 'delivered', 'read'])
    .gte('sent_at', sevenDaysAgo)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!exec) return;

  await supabase.from('campaign_executions').update({
    status: 'replied',
    replied_at: new Date().toISOString(),
  }).eq('id', exec.id);

  await supabase.rpc('recompute_campaign_metrics', { p_campaign_id: exec.campaign_id });

  logger.info('Campaign execution marked replied (WAHA)', {
    executionId: exec.id,
    campaignId: exec.campaign_id,
    phone: DataSanitizer.sanitizePhoneNumber(phone),
  });
}