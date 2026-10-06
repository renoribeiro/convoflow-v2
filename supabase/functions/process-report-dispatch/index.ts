/**
 * process-report-dispatch
 *
 * Worker dirigido por cron (e invocável manualmente) que envia os relatórios
 * agendados em public.report_schedules. Espelha o padrão de
 * `process-campaign-dispatch` e `process-followup-dispatch`:
 *   verify_jwt = false — chamado pelo pg_cron com bearer anon; autentica
 *   internamente via SUPABASE_SERVICE_ROLE_KEY.
 *
 * A cada tick (a cada 5 minutos) ele:
 *   1. Lê as agendas ativas de TODAS as Contas.
 *   2. Descobre quais venceram, comparando a expressão cron com o last_run.
 *   3. Reclama cada agenda vencida com UPDATE condicional (execução única).
 *   4. Monta o relatório da Conta da agenda e envia por e-mail (Resend).
 *   5. Grava o resultado em report_executions — sucesso E falha.
 *
 * A decisão de vencimento sai de cron + last_run, não de um next_run gravado:
 * se este worker ficar fora do ar, na volta ele ainda enxerga o horário perdido
 * dentro da janela de catch-up. O next_run é gravado só para a tela exibir.
 *
 * Secrets necessários (os mesmos de send-report, já configurados):
 *   RESEND_API_KEY     — API key do Resend (re_...)
 *   REPORT_FROM_EMAIL  — remetente verificado
 *
 * A regra de negócio mora em ../_shared/report-scheduler.ts, que é testado por
 * src/lib/reports/reportScheduler.test.ts. Esta função é só a casca.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createLogger } from '../_shared/logger.ts'
import { guardBackendCaller } from '../_shared/backend-gate.ts'
import { corsHeaders } from '../_shared/validation.ts'
import { resendTransport } from '../_shared/report-core.ts'
import { runDueSchedules } from '../_shared/report-scheduler.ts'

/** Teto por tick — bem acima do volume real, só para o laço não ser infinito. */
const MAX_SCHEDULES = 200

/**
 * Janela de recuperação. Maior que o intervalo do cron (5 min) de propósito:
 * um tick perdido não faz o relatório do dia sumir.
 */
const LOOKBACK_MINUTES = 60

serve(async (req) => {
  const logger = createLogger(req)
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  // Item 14, lote 2: só o cron (x-cron-secret) ou a chave secreta do projeto.
  const denied = await guardBackendCaller(req, logger)
  if (denied) return denied

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !supabaseServiceKey) throw new Error('Missing Supabase configuration')

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const fromEmail = Deno.env.get('REPORT_FROM_EMAIL')
    if (!resendApiKey || !fromEmail) {
      // Sem secret de e-mail nada pode ser entregue. Falha alto em vez de rodar
      // marcando tudo como falha e queimando as janelas das agendas.
      logger.error('RESEND_API_KEY ou REPORT_FROM_EMAIL não configuradas')
      return new Response(
        JSON.stringify({ success: false, error: 'E-mail não configurado no servidor' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const startedAt = Date.now()

    const result = await runDueSchedules({
      db: supabase,
      sendEmail: resendTransport(resendApiKey, fromEmail),
      now: new Date(),
      lookbackMinutes: LOOKBACK_MINUTES,
      maxSchedules: MAX_SCHEDULES,
      logger,
    })

    logger.info('process-report-dispatch concluído', {
      considered: result.considered,
      due: result.due,
      sent: result.sent,
      failed: result.failed,
      skipped: result.skipped,
      elapsedMs: Date.now() - startedAt,
    })

    return new Response(
      JSON.stringify({ success: true, ...result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error('process-report-dispatch falhou', { error: message })
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    )
  }
})
