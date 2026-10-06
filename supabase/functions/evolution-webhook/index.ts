import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createLogger } from '../_shared/logger.ts'
import { applyReplyCancellations } from '../_shared/followup-reply.ts'
import {
  validatePhoneNumber,
  validateInstanceName,
  validateMessageContent,
  DataSanitizer,
  SecureError,
  corsHeaders
} from '../_shared/validation.ts'
import {
  WebhookEvent,
  MessageData,
  ConnectionUpdateData,
  QrCodeUpdateData,
  ContactData,
  ChatData,
  GroupData,
  PresenceData,
  EvolutionWebhookPayload
} from '../_shared/types.ts'
import {
  checkRateLimitDb,
  getRateLimitIdentifier,
  getRateLimitHeaders,
  createRateLimitResponse,
  RATE_LIMIT_PRESETS
} from '../_shared/rateLimit.ts'
import {
  authenticateEvolutionWebhook,
  EVOLUTION_WEBHOOK_SECRET_HEADER
} from '../_shared/evolution-webhook-auth.ts'

serve(async (req) => {
  const logger = createLogger(req);
  const startTime = Date.now();

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      logger.error('Missing Supabase configuration');
      throw new SecureError('Configuration Error', 'CONFIG_ERROR', 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Apply rate limiting
    const clientId = getRateLimitIdentifier(req);
    const rateLimitResult = await checkRateLimitDb(supabase, clientId, {
      ...RATE_LIMIT_PRESETS.webhook,
      keyPrefix: 'evolution-webhook'
    });

    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded', { clientId, retryAfter: rateLimitResult.retryAfter });
      return createRateLimitResponse(
        rateLimitResult.retryAfter!,
        { ...corsHeaders, ...getRateLimitHeaders(rateLimitResult.remaining, rateLimitResult.resetAt, RATE_LIMIT_PRESETS.webhook.maxRequests) }
      );
    }

    if (req.method !== 'POST') {
      throw new SecureError('Method not allowed', 'METHOD_NOT_ALLOWED', 405)
    }

    const contentType = req.headers.get('content-type')
    if (!contentType || !contentType.includes('application/json')) {
      throw new SecureError('Invalid content type', 'INVALID_CONTENT_TYPE', 400)
    }

    let webhookEvent: EvolutionWebhookPayload
    try {
      webhookEvent = await req.json()
    } catch (error) {
      logger.error('Failed to parse webhook JSON', {}, error as Error)
      throw new SecureError('Invalid JSON payload', 'INVALID_JSON', 400)
    }

    if (!webhookEvent.event || !webhookEvent.instance) {
      throw new SecureError('Missing required fields: event, instance', 'MISSING_FIELDS', 400)
    }

    const { event: eventType, instance: instanceName, data: eventData, sender, apikey: webhookApiKey } = webhookEvent

    // Security Check: Verify the instance exists in our DB
    const { data: instance, error: instanceError } = await supabase
      .from('whatsapp_instances')
      .select('id, tenant_id, instance_key, connection_config, evolution_api_key')
      .eq('instance_key', instanceName)
      .single()

    if (instanceError || !instance) {
      logger.warn(`Webhook received for unknown instance: ${instanceName}`)
      return new Response(JSON.stringify({ success: false, error: 'Instance not found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // Security Check (item 14, lote 5 / H2): the instance's own token in the
    // body `apikey`, or EVOLUTION_WEBHOOK_SECRET in the x-webhook-secret header.
    // The instance name is NOT a credential — it used to be, and anyone who
    // knew it could forge events. Rules and why: _shared/evolution-webhook-auth.ts
    const auth = await authenticateEvolutionWebhook({
      instance,
      payloadApiKey: webhookApiKey,
      headerSecret: req.headers.get(EVOLUTION_WEBHOOK_SECRET_HEADER),
      webhookSecret: Deno.env.get('EVOLUTION_WEBHOOK_SECRET'),
    })
    if (!auth.ok) {
      logger.warn('Webhook rejected', { instance: instanceName, reason: auth.reason })
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    logger.info('Processing webhook event', {
      event: eventType,
      instance: instanceName,
      authVia: auth.via,
      tenantId: instance.tenant_id,
      hasSender: !!sender,
      hasData: !!eventData
    })

    // Handle all Evolution API V2 event types
    switch (eventType) {
      case 'messages.upsert':
        await processIncomingMessage(supabase, instance, instanceName, eventData as MessageData, sender, logger)
        break

      case 'messages.update':
        await processMessageUpdate(supabase, instanceName, eventData, logger)
        break

      case 'messages.delete':
        await processMessageDelete(supabase, instanceName, eventData, logger)
        break

      case 'send.message':
        await processSentMessage(supabase, instance, instanceName, eventData as MessageData, logger)
        break

      case 'connection.update':
        await processConnectionUpdate(supabase, instanceName, eventData as ConnectionUpdateData, logger)
        break

      case 'qrcode.updated':
        await processQRCodeUpdate(supabase, instanceName, eventData as QrCodeUpdateData, logger)
        break

      case 'contacts.set':
      case 'contacts.upsert':
      case 'contacts.update':
        await processContactEvent(supabase, instance, instanceName, eventType, eventData, logger)
        break

      case 'chats.set':
      case 'chats.upsert':
      case 'chats.update':
      case 'chats.delete':
        await processChatEvent(supabase, instance, instanceName, eventType, eventData, logger)
        break

      case 'groups.upsert':
      case 'groups.update':
        await processGroupEvent(supabase, instance, instanceName, eventType, eventData, logger)
        break

      case 'group.participants.update':
        await processGroupParticipantsUpdate(supabase, instance, instanceName, eventData, logger)
        break

      case 'presence.update':
        await processPresenceUpdate(supabase, instanceName, eventData, logger)
        break

      case 'call':
        logger.info('Call event received', { instanceName, data: eventData })
        break

      case 'application.startup':
        logger.info('Application startup event', { instanceName })
        break

      default:
        logger.info(`Received event: ${eventType}`, { instanceName })
    }

    // Forward event to RPC for custom business logic (only if exists)
    try {
      await supabase.rpc('handle_evolution_webhook', {
        instance_name: instanceName,
        event_type: eventType,
        event_data: eventData
      })
    } catch (rpcError: any) {
      // Don't fail the webhook if RPC doesn't exist or fails
      logger.warn('RPC handle_evolution_webhook failed (might not exist)', { error: rpcError.message })
    }

    const processingTime = Date.now() - startTime;
    const responseBody = {
      success: true,
      processed_at: new Date().toISOString(),
      processing_time_ms: processingTime,
      event: eventType
    }

    return new Response(JSON.stringify(responseBody), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    logger.error('Error processing webhook', { error: error.message });
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})

// ============================================
// Message Handlers
// ============================================

async function processIncomingMessage(
  supabase: SupabaseClient,
  instance: { id: string; tenant_id: string; instance_key: string },
  instanceName: string,
  messageData: MessageData,
  sender: string | undefined,
  logger: any
) {
  const { key, message, messageTimestamp, pushName } = messageData

  if (key.fromMe) return

  if (!key?.id) return

  // Determine message content and type
  const { content: rawMessageContent, messageType } = extractMessageContent(message)

  // Handle LID resolution: Evolution V2/Baileys novo manda remoteJid em
  // formato LID (`12345@lid`). Tentamos em ordem:
  //   1. sender field (já vem resolvido em alguns eventos)
  //   2. key.remoteJidAlt (Baileys V2 traz o phone real aqui quando JID é LID)
  //   3. key.remoteJid (fallback — só serve se não for LID)
  let rawPhone: string;
  if (sender && !sender.includes('@lid')) {
    rawPhone = sender.replace('@s.whatsapp.net', '').replace('@c.us', '');
  } else if ((key as any).remoteJidAlt && !(key as any).remoteJidAlt.includes('@lid')) {
    rawPhone = (key as any).remoteJidAlt.replace('@s.whatsapp.net', '').replace('@c.us', '');
  } else if (!key.remoteJid.includes('@lid')) {
    rawPhone = key.remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', '');
  } else {
    logger.warn('Cannot resolve phone from LID — sender/remoteJidAlt/remoteJid all LID', {
      sender, remoteJid: key.remoteJid, remoteJidAlt: (key as any).remoteJidAlt,
    });
    return;
  }

  const phone = DataSanitizer.sanitizePhoneNumber(rawPhone)
  if (!phone) return;

  // Check if it's a group message
  const isGroup = key.remoteJid.includes('@g.us');
  if (isGroup) {
    // For group messages, we can log but skip contact creation for now
    logger.info('Group message received', { group: key.remoteJid, messageType })
    return;
  }

  // Find or Create Contact — escopo por instância (mesma pessoa em duas
  // instâncias = dois contatos separados, conforme decisão do usuário).
  let { data: contact } = await supabase
    .from('contacts')
    .select('id, name')
    .eq('phone', phone)
    .eq('tenant_id', instance.tenant_id)
    .eq('whatsapp_instance_id', instance.id)
    .maybeSingle()

  if (!contact) {
    const { data: newContact } = await supabase.from('contacts').insert({
      phone,
      name: pushName || phone,
      tenant_id: instance.tenant_id,
      whatsapp_instance_id: instance.id
    }).select('id, name').single();
    contact = newContact;
  } else if (pushName && (!contact.name || contact.name === phone)) {
    // Contato existia com nome placeholder (igual ao phone) — promover ao pushName recebido.
    await supabase
      .from('contacts')
      .update({ name: pushName, updated_at: new Date().toISOString() })
      .eq('id', contact.id);
  }

  if (!contact) return;

  // V4: opt-out por palavra-chave — apenas mensagens de texto puro.
  // Verifica antes do processamento normal; é idempotente e best-effort.
  // Evolution API: texto está em message.conversation ou message.extendedTextMessage.text.
  if (messageType === 'text') {
    const rawText: string =
      messageData.message?.conversation ||
      messageData.message?.extendedTextMessage?.text ||
      '';
    if (rawText) {
      await checkOptOutKeyword(supabase, instance.tenant_id, phone, rawText, logger);
    }
  }

  // O trigger BEFORE INSERT handle_message_conversation agora busca conversa
  // por (contact, tenant) — sem filtrar por instância — então não há mais
  // risco de violar a UNIQUE constraint. Conversas mantêm o whatsapp_instance_id
  // da instância que as criou, em vez de migrar a cada mensagem nova.

  // Save message to database
  await supabase.from('messages').insert({
    contact_id: contact.id,
    tenant_id: instance.tenant_id,
    whatsapp_instance_id: instance.id,
    direction: 'inbound',
    message_type: messageType,
    content: rawMessageContent,
    evolution_message_id: key.id,
    status: 'received',
  })

  // Campaign reply tracking — isolated so it never disrupts message processing.
  try {
    await markCampaignExecutionReplied(supabase, phone, logger);
  } catch (replyErr: any) {
    logger.warn('Campaign reply tracking failed (non-fatal)', { error: replyErr.message });
  }

  // Follow-up: aplica o que a resposta do contato cancela (não-fatal).
  await applyReplyCancellations(supabase, instance.tenant_id, contact.id, logger);

  // Trigger automation via RPC (v1 bots only — patched RPC ignores v2 bots).
  try {
    await supabase.rpc('process_incoming_message', {
      p_phone: phone,
      p_message_content: rawMessageContent,
      p_whatsapp_instance_id: instance.id,
      p_evolution_message_id: key.id
    });
  } catch (error: any) {
    logger.warn('RPC process_incoming_message not available', { error: error.message });
  }

  // Fire-and-forget: invoke visual-flow chatbot engine (v2 bots).
  // We do NOT await the result so the webhook returns quickly.
  // The inbound message row was already persisted above — the engine must NOT
  // re-insert it (it only inserts its own outbound bot-reply rows).
  invokeChatbotEngine({
    tenant_id: instance.tenant_id,
    whatsapp_instance_id: instance.id,
    contact_id: contact!.id,
    phone,
    message: rawMessageContent,
  }, logger);
}

/**
 * V4: Opt-out automático por palavra-chave (Evolution API).
 * Normaliza o texto (trim, lowercase, remove acentos e pontuação) e verifica
 * se é exatamente uma das palavras/expressões de descadastro.
 * Se sim, chama set_contact_opt_out_by_phone — idempotente e best-effort.
 * Cf. whatsapp-policies/SKILL.md §1.4 e evolution-v2/SKILL.md §9 (regras de uso).
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
    logger.info('Opt-out registrado por palavra-chave (Evolution)', {
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

/**
 * Extract text content and determine type from various message formats
 */
function extractMessageContent(message: any): { content: string; messageType: string } {
  if (message.conversation) {
    return { content: message.conversation, messageType: 'text' };
  }
  if (message.extendedTextMessage?.text) {
    return { content: message.extendedTextMessage.text, messageType: 'text' };
  }
  if (message.imageMessage) {
    return { content: message.imageMessage.caption || '[Imagem]', messageType: 'image' };
  }
  if (message.videoMessage) {
    return { content: message.videoMessage.caption || '[Vídeo]', messageType: 'video' };
  }
  if (message.audioMessage) {
    return { content: message.audioMessage.ptt ? '[Áudio]' : '[Arquivo de Áudio]', messageType: 'audio' };
  }
  if (message.documentMessage) {
    return { content: message.documentMessage.fileName || message.documentMessage.title || '[Documento]', messageType: 'document' };
  }
  if (message.locationMessage) {
    const loc = message.locationMessage;
    return { content: loc.name || `Lat: ${loc.degreesLatitude}, Lng: ${loc.degreesLongitude}`, messageType: 'location' };
  }
  if (message.contactMessage) {
    return { content: message.contactMessage.displayName || '[Contato]', messageType: 'contact' };
  }
  if (message.stickerMessage) {
    return { content: '[Figurinha]', messageType: 'sticker' };
  }
  if (message.reactionMessage) {
    return { content: message.reactionMessage.text || '', messageType: 'reaction' };
  }
  if (message.buttonsResponseMessage) {
    return { content: message.buttonsResponseMessage.selectedDisplayText || '', messageType: 'buttons_response' };
  }
  if (message.listResponseMessage) {
    return { content: message.listResponseMessage.title || '', messageType: 'list_response' };
  }
  if (message.protocolMessage) {
    return { content: '', messageType: 'protocol' };
  }
  return { content: '[Mensagem não suportada]', messageType: 'unknown' };
}

async function processMessageUpdate(supabase: SupabaseClient, instanceName: string, updateData: any, logger: any) {
  const updates = Array.isArray(updateData) ? updateData : [updateData];

  for (const updateItem of updates) {
    const { key, update } = updateItem;
    if (!key?.id) continue;

    let status = 'sent';
    if (update?.status) {
      switch (update.status) {
        case 'SERVER_ACK': status = 'sent'; break;
        case 'DELIVERY_ACK': status = 'delivered'; break;
        case 'READ': status = 'read'; break;
        case 'PLAYED': status = 'read'; break;
        case 'ERROR': status = 'failed'; break;
        default: status = 'sent';
      }
    }

    await supabase.from('messages')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('evolution_message_id', key.id);

    logger.info('Updated message status', { id: key.id, status });

    // Campaign execution ACK — isolated so any failure never disrupts the above.
    // Evolution MESSAGES_UPDATE: update.status = DELIVERY_ACK → delivered, READ/PLAYED → read.
    // We match campaign_executions by provider_message_id = key.id.
    try {
      if (status === 'delivered' || status === 'read') {
        await updateCampaignExecutionAck(supabase, key.id, status, logger);
      }
    } catch (ackErr: any) {
      logger.warn('Campaign ACK update failed (non-fatal)', { id: key.id, error: ackErr.message });
    }
  }
}

/**
 * Find a campaign_execution by provider_message_id and set delivered/read status.
 * Then recompute metrics for the affected campaign.
 * Entirely isolated — caller must wrap in try/catch.
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

  // Only advance status forward (sent → delivered → read)
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

  logger.info('Campaign execution ACK updated', {
    executionId: exec.id,
    campaignId: exec.campaign_id,
    ackStatus,
    providerMessageId,
  });
}

/**
 * When an inbound message arrives, check if this phone has a recent campaign
 * execution in (sent|delivered|read) within the last 7 days and mark it replied.
 * Isolated — caller wraps in try/catch.
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

  logger.info('Campaign execution marked replied', {
    executionId: exec.id,
    campaignId: exec.campaign_id,
    phone: DataSanitizer.sanitizePhoneNumber(phone),
  });
}

async function processMessageDelete(supabase: SupabaseClient, instanceName: string, deleteData: any, logger: any) {
  const key = deleteData?.key || deleteData;
  if (!key?.id) {
    logger.warn('messages.delete event missing key.id', { instanceName });
    return;
  }

  await supabase.from('messages')
    .update({
      status: 'deleted',
      content: '[Mensagem apagada]',
      updated_at: new Date().toISOString()
    })
    .eq('evolution_message_id', key.id);

  logger.info('Message marked as deleted', { id: key.id, instanceName });
}

async function processSentMessage(
  supabase: SupabaseClient,
  instance: { id: string; tenant_id: string; instance_key: string },
  instanceName: string,
  messageData: MessageData,
  logger: any
) {
  const { key, message, messageTimestamp } = messageData;

  if (!key?.id || !key.fromMe) return;

  const { content, messageType } = extractMessageContent(message);

  // Resolução de LID (idem processIncomingMessage): tenta remoteJidAlt primeiro.
  let rawPhone: string;
  if ((key as any).remoteJidAlt && !(key as any).remoteJidAlt.includes('@lid')) {
    rawPhone = (key as any).remoteJidAlt.replace('@s.whatsapp.net', '').replace('@c.us', '');
  } else if (!key.remoteJid.includes('@lid')) {
    rawPhone = key.remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', '');
  } else {
    logger.warn('Sent message has LID remoteJid without alt — skip', { remoteJid: key.remoteJid });
    return;
  }
  const phone = DataSanitizer.sanitizePhoneNumber(rawPhone);

  if (!phone) return;

  // Find the contact — escopo por instância
  const { data: contact } = await supabase
    .from('contacts')
    .select('id')
    .eq('phone', phone)
    .eq('tenant_id', instance.tenant_id)
    .eq('whatsapp_instance_id', instance.id)
    .maybeSingle();

  if (!contact) return;

  // Check if message already exists (avoid duplicates)
  const { data: existingMsg } = await supabase
    .from('messages')
    .select('id')
    .eq('evolution_message_id', key.id)
    .maybeSingle();

  if (existingMsg) return;

  // Trigger BEFORE INSERT já gerencia a conversa por (contact, tenant).
  // Como contatos agora são per-instance, a conversa naturalmente também fica per-instance.

  await supabase.from('messages').insert({
    contact_id: contact.id,
    tenant_id: instance.tenant_id,
    whatsapp_instance_id: instance.id,
    direction: 'outbound',
    message_type: messageType,
    content,
    evolution_message_id: key.id,
    status: 'sent',
  });

  logger.info('Sent message recorded', { id: key.id, messageType });
}

// ============================================
// Connection & QR Code Handlers
// ============================================

async function processConnectionUpdate(supabase: SupabaseClient, instanceName: string, connectionData: ConnectionUpdateData, logger: any) {
  const { state, statusReason } = connectionData

  logger.info('Processing connection update', { instance: instanceName, state, statusReason });

  const updatePayload: Record<string, any> = {
    status: state,
    updated_at: new Date().toISOString(),
  };

  if (state === 'open') {
    updatePayload.last_connected_at = new Date().toISOString();
    updatePayload.qr_code = null; // Clear QR code when connected
  } else if (state === 'close') {
    updatePayload.qr_code = null;
  }

  await supabase
    .from('whatsapp_instances')
    .update(updatePayload)
    .eq('instance_key', instanceName)
}

async function processQRCodeUpdate(supabase: SupabaseClient, instanceName: string, qrData: QrCodeUpdateData, logger: any) {
  // V2 sends QR code in different formats
  const qrCode = qrData?.qrcode?.base64 || qrData?.qrcode?.code || qrData?.qr || null;

  await supabase
    .from('whatsapp_instances')
    .update({ qr_code: qrCode, status: 'qrcode', updated_at: new Date().toISOString() })
    .eq('instance_key', instanceName)

  logger.info('QR Code updated', { instanceName, hasQr: !!qrCode });
}

// ============================================
// Contact & Chat & Group Handlers
// ============================================

async function processContactEvent(
  supabase: SupabaseClient,
  instance: { id: string; tenant_id: string },
  instanceName: string,
  eventType: string,
  contactData: any,
  logger: any
) {
  const contacts = Array.isArray(contactData) ? contactData : [contactData];

  for (const contact of contacts) {
    if (!contact?.id) continue;

    const phone = contact.id.replace('@s.whatsapp.net', '').replace('@c.us', '');
    if (!phone || phone.includes('@g.us')) continue;

    const sanitizedPhone = DataSanitizer.sanitizePhoneNumber(phone);
    if (!sanitizedPhone) continue;

    const pushName: string | undefined = contact.name || contact.pushName || contact.notify;
    const profilePicUrl: string | undefined = contact.profilePicUrl || contact.profilePictureUrl;

    // Buscar contato existente pra decidir entre INSERT e UPDATE seletivo.
    // Lookup é por (phone, tenant, instance) — contatos são per-instance.
    const { data: existing } = await supabase
      .from('contacts')
      .select('id, name')
      .eq('phone', sanitizedPhone)
      .eq('tenant_id', instance.tenant_id)
      .eq('whatsapp_instance_id', instance.id)
      .maybeSingle();

    if (existing) {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      // Só sobrescrever name se ainda for placeholder (igual ao phone ou vazio) E tivermos algo melhor.
      const isPlaceholder = !existing.name || existing.name === sanitizedPhone;
      if (pushName && isPlaceholder) updates.name = pushName;
      if (profilePicUrl) updates.avatar_url = profilePicUrl;
      if (Object.keys(updates).length > 1) {
        const { error } = await supabase.from('contacts').update(updates).eq('id', existing.id);
        if (error) logger.warn('Failed to update contact', { phone: sanitizedPhone, error: error.message });
      }
    } else {
      const { error } = await supabase.from('contacts').insert({
        phone: sanitizedPhone,
        name: pushName || sanitizedPhone,
        avatar_url: profilePicUrl || null,
        tenant_id: instance.tenant_id,
        whatsapp_instance_id: instance.id,
      });
      if (error) logger.warn('Failed to insert contact', { phone: sanitizedPhone, error: error.message });
    }
  }

  logger.info(`Processed ${eventType}`, { instanceName, count: contacts.length });
}

async function processChatEvent(
  supabase: SupabaseClient,
  instance: { id: string; tenant_id: string },
  instanceName: string,
  eventType: string,
  chatData: any,
  logger: any
) {
  // Chat events are informational - log for monitoring
  const chats = Array.isArray(chatData) ? chatData : [chatData];
  logger.info(`Chat event ${eventType}`, { instanceName, count: chats.length });
}

async function processGroupEvent(
  supabase: SupabaseClient,
  instance: { id: string; tenant_id: string },
  instanceName: string,
  eventType: string,
  groupData: any,
  logger: any
) {
  if (!groupData?.id) {
    logger.warn('Group event missing group ID', { instanceName, eventType });
    return;
  }

  logger.info(`Group event ${eventType}`, {
    instanceName,
    groupId: groupData.id,
    subject: groupData.subject
  });
}

async function processGroupParticipantsUpdate(
  supabase: SupabaseClient,
  instance: { id: string; tenant_id: string },
  instanceName: string,
  eventData: any,
  logger: any
) {
  logger.info('Group participants updated', {
    instanceName,
    action: eventData?.action,
    participants: eventData?.participants?.length || 0
  });
}

async function processPresenceUpdate(
  supabase: SupabaseClient,
  instanceName: string,
  presenceData: any,
  logger: any
) {
  // Presence updates are frequent - only log at debug level
  logger.info('Presence update received', {
    instanceName,
    id: presenceData?.id,
    presences: presenceData?.presences ? Object.keys(presenceData.presences) : []
  });
}