// =============================================================================
// webhook-dispatcher — consome a fila `webhook_deliveries` e faz o POST nos
// endpoints configurados em `webhooks`, com assinatura HMAC-SHA256 e retry.
//
// Acionada por pg_cron (a cada 5 minutos) via public.cron_worker_kick.
// verify_jwt = false no config.toml; autentica internamente via service_role.
//
// O POST mora em _shared/webhook-entrega.ts (o botão "Enviar aviso de teste",
// webhook-teste, usa o mesmo): endereço interno e redirecionamento são
// recusados antes de sair, e a falha grava o código (response_status) e um
// motivo que a tela e o alerta do sino explicam.
// =============================================================================
import { MOTIVO_CONTA_SEM_ACESSO, criarMemoDeAcesso } from '../_shared/conta-acesso.ts';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createLogger } from '../_shared/logger.ts'
import { guardBackendCaller } from '../_shared/backend-gate.ts'
import { corsHeaders } from '../_shared/validation.ts'
import { cabecalhosDoAviso, entregarAviso } from '../_shared/webhook-entrega.ts'

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

    const acesso = criarMemoDeAcesso(supabase, (id, erro) =>
      logger.error('webhook-dispatcher: não conferi o acesso', { tenant_id: id, erro }))

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

      // Conta sem acesso: a entrega é encerrada, sem nova tentativa. Sem certeza
      // da resposta, ela volta para a fila.
      const estado = await acesso.estado(d.tenant_id)
      if (estado !== 'liberada') {
        await supabase.from('webhook_deliveries').update(
          estado === 'sem_acesso'
            ? { status: 'failed', attempts, error_message: MOTIVO_CONTA_SEM_ACESSO }
            : { status: 'pending' },
        ).eq('id', d.id)
        if (estado === 'sem_acesso') failed++
        continue
      }

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
      const headers = await cabecalhosDoAviso({
        evento: d.event_type,
        entregaId: d.id,
        corpo: body,
        segredo: d.webhooks?.secret ?? null,
      })

      const r = await entregarAviso(url, body, headers)
      if (r.aceito) {
        await supabase.from('webhook_deliveries').update({
          status: 'delivered', attempts, response_status: r.status,
          delivered_at: new Date().toISOString(), error_message: null,
        }).eq('id', d.id)
        delivered++
      } else {
        // Na última tentativa vira 'failed', e o gatilho tg_aviso_falhou_alerta
        // avisa no sino o Gestor da Loja e o Gerente da Conta.
        const exhausted = attempts >= d.max_attempts
        await supabase.from('webhook_deliveries').update({
          status: exhausted ? 'failed' : 'pending',
          attempts,
          response_status: r.status,
          error_message: r.erro,
          scheduled_at: exhausted ? undefined : nextRetryAt(attempts),
        }).eq('id', d.id)
        if (exhausted) failed++
        else retried++
        logger.warn('Falha na entrega do webhook', { deliveryId: d.id, attempts, status: r.status, error: r.erro })
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
