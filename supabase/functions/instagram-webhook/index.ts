import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createLogger } from '../_shared/logger.ts';
import { corsHeaders } from '../_shared/validation.ts';
import { matchVerifyToken } from '../_shared/cryptoSignature.ts';
import {
  isWellFormedSignatureHeader,
  parseInstagramDelivery,
  summarizeForLog,
  toRpcArgs,
  verifyInstagramSignature,
} from './delivery.ts';

/**
 * instagram-webhook — entrada de mensagens do Instagram (fatia 2/5).
 *
 * ============================================================================
 * O QUE FAZ
 * ============================================================================
 *
 * Recebe a entrega da Meta ("Instagram API with Instagram login"), confere a
 * assinatura com o INSTAGRAM_APP_SECRET e, para cada mensagem de TEXTO, chama
 * `process_instagram_message` — que resolve a instância pelo id da conta
 * (entry[].id), o contato pelo IGSID, e grava a mensagem com o mid onde o wamid
 * vai hoje. A RPC faz tudo numa transação e é idempotente pelo mid.
 *
 * Eco (resposta dada pelo app do Instagram no celular) é GRAVADO como outbound,
 * para o atendente ver que alguém já respondeu. Nunca conta como não lida,
 * nunca cria contato, nunca aciona nada.
 *
 * Desde a migração 20260925000004 o horário da Meta de cada item
 * (messaging[].timestamp) vai junto (p_meta_ts), e TODO eco — do celular ou da
 * resposta do próprio inbox — zera as não lidas da conversa, desde que nenhuma
 * mensagem do cliente tenha horário da Meta igual ou posterior ao do eco. A
 * decisão é da RPC (instagram_echo_mark_read); o resultado sai no log como
 * `unread` (cleared, later_inbound, nothing_unread, customer_spoke_last,
 * no_meta_time...). Eco sem horário utilizável nunca zera.
 *
 * NÃO aciona bot, automações, rodízio, regra de tempo de resposta nem webhooks
 * de saída — decisão do dono para esta fatia. Esta função não chama o bot; as
 * triggers do banco têm `WHEN (channel = 'whatsapp')` (migração 20260923000001).
 *
 * Anexo, reação, leitura, resposta a story, edição, mensagem apagada: fora do
 * escopo. Registra o tipo no log e devolve 200. Nada é gravado pela metade.
 *
 * ============================================================================
 * CÓDIGOS DE RESPOSTA
 * ============================================================================
 *
 *   GET  200  handshake com INSTAGRAM_VERIFY_TOKEN
 *        403  token errado (handshake que aceita tudo deixaria o painel verde
 *             sem entrega nenhuma)
 *        500  INSTAGRAM_VERIFY_TOKEN não configurado
 *   POST 401  assinatura inválida — o mesmo do meta-webhook; nada é gravado
 *        500  INSTAGRAM_APP_SECRET ausente, ou a RPC falhou. A Meta reentrega;
 *             é seguro porque a RPC é idempotente pelo mid. Perder a mensagem
 *             de um cliente é pior que uma reentrega.
 *        200  todo o resto — inclusive conta desconhecida, instância inativa,
 *             tipo fora do escopo e corpo que não é JSON.
 *
 * ============================================================================
 * POR QUE NÃO MEXER NO meta-webhook
 * ============================================================================
 *
 * `meta-webhook` é o único caminho de entrada do WhatsApp oficial em produção
 * e fica intocado (v54). Os slots `_SECONDARY` dele têm significado reservado
 * (rotação de app do WhatsApp), e o limitador de taxa dele roda antes da
 * assinatura, chaveado por IP: entrega de Instagram consumiria a cota do
 * WhatsApp.
 *
 * ============================================================================
 * O QUE NÃO VAI PARA O LOG
 * ============================================================================
 *
 * Texto da mensagem, IGSID do cliente, mid, segredo. Sai: tipo do evento,
 * contagens, o id da conta do NEGÓCIO (explica um unknown_account), o outcome
 * da RPC e os ids internos das linhas gravadas.
 */
Deno.serve(async (req: Request) => {
  const logger = createLogger(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // ---------------------------------------------------------------------------
  // GET — handshake de verificação da Meta
  // ---------------------------------------------------------------------------
  if (req.method === 'GET') {
    const igVerifyToken = Deno.env.get('INSTAGRAM_VERIFY_TOKEN');
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const provided = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (!igVerifyToken) {
      logger.error('instagram-webhook: INSTAGRAM_VERIFY_TOKEN nao esta configurado');
      return new Response('Server misconfigured', { status: 500 });
    }

    const matched = matchVerifyToken(provided, [igVerifyToken]) === 0;

    if (mode === 'subscribe' && matched && challenge) {
      logger.info('instagram-webhook: handshake OK', { mode, hasChallenge: true });
      return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }

    logger.warn('instagram-webhook: handshake recusado', {
      mode,
      matched,
      hasChallenge: !!challenge,
      // Não pode se chamar *Token: o logger censuraria a chave.
      parametroPresente: typeof provided === 'string' && provided.length > 0,
    });
    return new Response('Forbidden', { status: 403 });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // ---------------------------------------------------------------------------
  // POST — a entrega
  // ---------------------------------------------------------------------------
  const igAppSecret = Deno.env.get('INSTAGRAM_APP_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!igAppSecret || !supabaseUrl || !serviceRoleKey) {
    // 500 (e não 401): o problema é nosso. A Meta reentrega quando voltar.
    logger.error('instagram-webhook: ambiente incompleto', {
      appSecretPresente: !!igAppSecret,
      urlPresente: !!supabaseUrl,
      serviceRolePresente: !!serviceRoleKey,
    });
    return json({ error: 'Server misconfigured' }, 500);
  }

  // Corpo CRU antes de qualquer parse: a Meta assina exatamente estes bytes.
  const rawBody = await req.text();
  const signatureHeader = req.headers.get('x-hub-signature-256');

  if (!(await verifyInstagramSignature(rawBody, signatureHeader, igAppSecret))) {
    logger.warn('instagram-webhook: assinatura invalida', {
      hasHeader: !!signatureHeader,
      headerWellFormed: isWellFormedSignatureHeader(signatureHeader),
      bodyLength: rawBody.length,
      userAgent: req.headers.get('user-agent'),
    });
    return json({ error: 'Invalid signature' }, 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Assinado e ilegível: reentregar não conserta. 200 para a Meta não insistir.
    logger.warn('instagram-webhook: corpo assinado mas nao e JSON', { bodyLength: rawBody.length });
    return json({ ok: true }, 200);
  }

  const parsed = parseInstagramDelivery(payload);
  logger.info('instagram-webhook: entrega', summarizeForLog(parsed));

  if (!parsed.isInstagram) {
    logger.warn('instagram-webhook: object inesperado, nada processado', { object: parsed.object });
    return json({ ok: true }, 200);
  }

  for (const s of parsed.skipped) {
    logger.info('instagram-webhook: evento fora do escopo, ignorado', {
      kind: s.kind,
      isEcho: s.isEcho,
      account: s.accountId,
    });
  }

  if (parsed.texts.length === 0) {
    return json({ ok: true }, 200);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  let failed = 0;

  // Em ordem, uma por vez: a ordem de chegada é a ordem da conversa.
  for (const ev of parsed.texts) {
    const { data, error } = await supabase.rpc('process_instagram_message', toRpcArgs(ev));

    if (error) {
      failed++;
      logger.error('instagram-webhook: process_instagram_message falhou', {
        account: ev.accountId,
        isEcho: ev.isEcho,
        code: error.code,
        message: error.message,
      });
      continue;
    }

    const r = (data ?? {}) as Record<string, unknown>;
    const outcome = typeof r.outcome === 'string' ? r.outcome : 'unknown';
    const line = {
      outcome,
      isEcho: ev.isEcho,
      account: ev.accountId,
      direction: r.direction ?? null,
      messageId: r.message_id ?? null,
      conversationId: r.conversation_id ?? null,
      instanceId: r.instance_id ?? null,
      // Só vem em eco: o que a guarda decidiu sobre as não lidas.
      unread: r.unread ?? null,
      horarioMeta: ev.metaTimestamp !== null,
    };

    if (outcome === 'stored' || outcome === 'duplicate') {
      logger.info('instagram-webhook: mensagem', line);
    } else {
      // unknown_account, inactive_instance, own_account, echo_without_contact,
      // invalid: nada foi gravado, e alguém pode precisar saber por quê.
      logger.warn('instagram-webhook: mensagem nao gravada', line);
    }
  }

  if (failed > 0) {
    return json({ error: 'processing failed', failed }, 500);
  }
  return json({ ok: true }, 200);
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
