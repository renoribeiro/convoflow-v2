// =============================================================================
// webhook-dispatcher — consome a fila `webhook_deliveries` e faz o POST nos
// endpoints configurados em `webhooks`, com assinatura HMAC-SHA256 e retry.
//
// Acionada por pg_cron (a cada minuto) via net.http_post (anon bearer).
// verify_jwt = false no config.toml; autentica internamente via service_role.
// =============================================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createLogger } from '../_shared/logger.ts'
import { guardBackendCaller } from '../_shared/backend-gate.ts'
import { corsHeaders } from '../_shared/validation.ts'

interface DeliveryRow {
  id: string
  tenant_id: string
  webhook_id: string
  event_type: string
  payload: Record<string, unknown>
  attempts: number
  max_attempts: number
  webhooks: { url: string; secret: string | null; is_active: boolean } | null
}

const BUDGET_MS = 50_000
const BATCH = 50

// Assinatura HMAC-SHA256 (hex) do corpo bruto. O consumidor valida com o mesmo
// secret no header X-ConvoFlow-Signature: sha256=<hex>.
async function hmacHex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body))
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Backoff: 1ª falha → +1min, depois cresce (2,4,8...) limitado a 60min.
function nextRetryAt(attempts: number): string {
  const minutes = Math.min(60, Math.pow(2, Math.max(0, attempts - 1)))
  return new Date(Date.now() + minutes * 60_000).toISOString()
}

serve(async (req) => {
  const logger = createLogger(req)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Item 14, lote 2: só o cron (x-cron-secret) ou a chave secreta do projeto.
  const denied = await guardBackendCaller(req, logger)
  if (denied) return denied

  const startTime = Date.now()

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) {
      throw new Error('Missing Supabase configuration')
    }
    const supabase = createClient(supabaseUrl, serviceKey)

    const nowIso = new Date().toISOString()
    const { data: pending, error: fetchError } = await supabase
      .from('webhook_deliveries')
      .select('id, tenant_id, webhook_id, event_type, payload, attempts, max_attempts, webhooks(url, secret, is_active)')
      .eq('status', 'pending')
      .lte('scheduled_at', nowIso)
      .order('scheduled_at', { ascending: true })
      .limit(BATCH)

    if (fetchError) throw fetchError

    const rows = (pending ?? []) as unknown as DeliveryRow[]
    let processed = 0
    let delivered = 0
    let failed = 0
    let retried = 0

    for (const d of rows) {
      if (Date.now() - startTime > BUDGET_MS - 3000) {
        logger.info('Budget atingido, parando', { processed })
        break
      }

      // Claim atômico: só processa quem ainda está 'pending'.
      const { data: claimed } = await supabase
        .from('webhook_deliveries')
        .update({ status: 'processing' })
        .eq('id', d.id)
        .eq('status', 'pending')
        .select('id')
      if (!claimed || claimed.length === 0) continue

      processed++
      const attempts = d.attempts + 1
      const url = d.webhooks?.url
      const active = d.webhooks?.is_active

      // Webhook removido/desativado: encerra como failed sem tentar.
      if (!url || !active) {
        await supabase.from('webhook_deliveries').update({
          status: 'failed', attempts, error_message: 'Webhook inativo ou inexistente',
        }).eq('id', d.id)
        failed++
        continue
      }

      const body = JSON.stringify(d.payload ?? {})
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-ConvoFlow-Event': d.event_type,
        'X-ConvoFlow-Delivery': d.id,
      }
      if (d.webhooks?.secret) {
        headers['X-ConvoFlow-Signature'] = `sha256=${await hmacHex(d.webhooks.secret, body)}`
      }

      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 10_000)
        const res = await fetch(url, { method: 'POST', headers, body, signal: controller.signal })
        clearTimeout(timeout)

        if (res.ok) {
          await supabase.from('webhook_deliveries').update({
            status: 'delivered', attempts, response_status: res.status,
            delivered_at: new Date().toISOString(), error_message: null,
          }).eq('id', d.id)
          delivered++
        } else {
          throw new Error(`HTTP ${res.status}`)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        const exhausted = attempts >= d.max_attempts
        await supabase.from('webhook_deliveries').update({
          status: exhausted ? 'failed' : 'pending',
          attempts,
          error_message: msg,
          scheduled_at: exhausted ? undefined : nextRetryAt(attempts),
        }).eq('id', d.id)
        if (exhausted) failed++
        else retried++
        logger.warn('Falha na entrega do webhook', { deliveryId: d.id, attempts, error: msg })
      }
    }

    const duration_ms = Date.now() - startTime
    logger.info('webhook-dispatcher finalizado', { processed, delivered, failed, retried, duration_ms })
    return new Response(JSON.stringify({ processed, delivered, failed, retried, duration_ms }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    logger.error('webhook-dispatcher erro', { error: msg })
    return new Response(JSON.stringify({ error: msg, success: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
