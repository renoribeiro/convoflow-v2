/**
 * process-chatbot-message — Visual-flow chatbot execution engine.
 *
 * Handles builder_version = 2 chatbots. Legacy (v1) bots continue to be
 * served by the process_incoming_message RPC → job-worker path.
 *
 * Auth: called server-to-server (from webhook functions via
 * supabase.functions.invoke or a direct fetch with service role key).
 * verify_jwt = false in config.toml; callers must pass
 * `x-internal-secret: <CHATBOT_ENGINE_SECRET>` for origin validation. Without
 * the secret in the environment every call is refused (503).
 *
 * SKILL references:
 *   Evolution v2 : .agent/skills/evolution-v2/SKILL.md §3 (send text)
 *   WAHA         : .agent/skills/waha/SKILL.md §3.1 (sendText)
 *   Meta         : .agent/skills/meta-cloud-api/SKILL.md §2.1 (text)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createLogger } from '../_shared/logger.ts';
import { SecureError, corsHeaders } from '../_shared/validation.ts';
import { matchVerifyToken } from '../_shared/cryptoSignature.ts';
import {
  processChatbotMessage,
  EngineInput,
  WhatsAppInstanceLike,
} from '../_shared/chatbot-engine.ts';

serve(async (req) => {
  const logger = createLogger(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 405,
    });
  }

  // ------------------------------------------------------------------
  // Origin validation via shared internal secret.
  // This function is called only by other Edge Functions (webhooks).
  // verify_jwt is false (callers don't have user JWTs), so we protect
  // with a shared secret — same pattern as waha-webhook.
  // ------------------------------------------------------------------
  // Item 14, lote 2: falha fechada. Sem CHATBOT_ENGINE_SECRET a função recusa
  // tudo (503) em vez de pular a checagem; a comparação é em tempo constante.
  const engineSecret = Deno.env.get('CHATBOT_ENGINE_SECRET');
  if (!engineSecret) {
    logger.error('process-chatbot-message: CHATBOT_ENGINE_SECRET ausente, recusando tudo');
    return new Response(JSON.stringify({ error: 'Not configured' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 503,
    });
  }
  if (matchVerifyToken(req.headers.get('x-internal-secret'), [engineSecret]) !== 0) {
    logger.warn('process-chatbot-message: rejected — invalid internal secret');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 401,
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    logger.error('Missing Supabase configuration');
    return new Response(JSON.stringify({ error: 'Configuration Error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }

  const {
    tenant_id,
    whatsapp_instance_id,
    contact_id,
    phone,
    message,
  } = body as Record<string, string>;

  if (!tenant_id || !whatsapp_instance_id || !contact_id || !phone || !message) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: tenant_id, whatsapp_instance_id, contact_id, phone, message' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    );
  }

  try {
    // Load WhatsApp instance for provider routing.
    const { data: instance, error: instanceErr } = await supabase
      .from('whatsapp_instances')
      .select('id, tenant_id, instance_key, provider, connection_config, evolution_api_url, evolution_api_key')
      .eq('id', whatsapp_instance_id)
      .eq('tenant_id', tenant_id)
      .single();

    if (instanceErr || !instance) {
      logger.warn('Instance not found', { whatsapp_instance_id, tenant_id });
      return new Response(JSON.stringify({ error: 'Instance not found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      });
    }

    const input: EngineInput = {
      tenant_id,
      whatsapp_instance_id,
      contact_id,
      phone,
      message,
    };

    const result = await processChatbotMessage(input, {
      supabase: supabase as any,
      logger,
      instance: instance as WhatsAppInstanceLike,
    });

    logger.info('Chatbot engine result', result);

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error('process-chatbot-message unhandled error', { error: errMsg });

    if (err instanceof SecureError) {
      return new Response(JSON.stringify({ error: errMsg }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: err.statusCode,
      });
    }

    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
