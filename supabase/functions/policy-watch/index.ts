/**
 * policy-watch
 *
 * Vigia das políticas de uso aceitável do WhatsApp/Meta. Toda segunda, 09:00
 * UTC (cron `whatsapp-policy-watch-weekly` → public.cron_worker_kick), lê o
 * TEXTO de cada página ativa em `whatsapp_policy_documents` e compara com o
 * texto guardado da semana anterior:
 *   • texto igual            → nada acontece;
 *   • texto mudou            → histórico em `whatsapp_policy_change_log`, aviso
 *                              no sino dos superadmins com o resumo do que mudou
 *                              e e-mail para POLICY_WATCH_EMAIL_TO;
 *   • texto vazio ou encolheu → aviso "Monitor de política com problema" no
 *                              sino, e o texto guardado NÃO é trocado.
 * Primeira leitura de uma página (clean_text vazio) só guarda o texto.
 *
 * A regra mora em ../_shared/policy-watch-core.ts, testada por
 * src/lib/compliance/policyWatch.test.ts. Esta função é só a casca.
 * Runbook: docs/RUNBOOK_vigia_politicas_whatsapp.md.
 *
 * Secrets: RESEND_API_KEY e REPORT_FROM_EMAIL (os mesmos dos relatórios) e
 * POLICY_WATCH_EMAIL_TO (para quem vai o e-mail; vírgula separa vários). Sem
 * eles o sino continua funcionando e o e-mail fica desligado.
 *
 * Corpo {"trigger":"email-test"} manda só um e-mail de teste e não lê página.
 *
 * verify_jwt = false — chamado pelo pg_cron; a porta (x-cron-secret ou chave
 * secreta do projeto) é o guardBackendCaller logo abaixo.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createLogger } from '../_shared/logger.ts'
import { guardBackendCaller } from '../_shared/backend-gate.ts'
import { corsHeaders } from '../_shared/validation.ts'
import { resendTransport } from '../_shared/report-core.ts'
import {
  POLICY_WATCH_USER_AGENT,
  parseRecipients,
  runPolicyWatch,
  testEmail,
  type FetchedPage,
} from '../_shared/policy-watch-core.ts'

async function fetchPage(url: string): Promise<FetchedPage> {
  const res = await fetch(url, {
    redirect: 'follow',
    // Inglês fixo: sem isto a m.facebook.com escolhe o idioma pela região, e
    // uma troca de idioma pareceria a política inteira mudando.
    headers: { 'User-Agent': POLICY_WATCH_USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9' },
    signal: AbortSignal.timeout(30_000),
  })
  return { status: res.status, url: res.url || url, body: await res.text() }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

serve(async (req: Request) => {
  // O logger nasce da requisição. Até 2026-09-29 ele era criado no nível do
  // módulo passando o nome da função (uma string) no lugar do Request, e o
  // createLogger quebrava no boot: a função devolvia 500 desde que nasceu e
  // nenhum documento jamais foi conferido.
  const logger = createLogger(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Item 14, lote 2: só o cron (x-cron-secret) ou a chave secreta do projeto.
  const denied = await guardBackendCaller(req, logger)
  if (denied) return denied

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceKey)

  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('REPORT_FROM_EMAIL')
  const emailTo = parseRecipients(Deno.env.get('POLICY_WATCH_EMAIL_TO'))
  const sendEmail = resendApiKey && fromEmail ? resendTransport(resendApiKey, fromEmail) : null
  if (!sendEmail || !emailTo.length) {
    logger.warn('policy-watch: e-mail desligado (falta RESEND_API_KEY, REPORT_FROM_EMAIL ou POLICY_WATCH_EMAIL_TO)')
  }

  let trigger: unknown = null
  try {
    trigger = ((await req.json()) as { trigger?: unknown } | null)?.trigger ?? null
  } catch {
    // corpo vazio: invocação manual sem corpo vale como cron
  }

  if (trigger === 'email-test') {
    if (!sendEmail || !emailTo.length) return json({ ok: false, error: 'E-mail não configurado' }, 500)
    try {
      await sendEmail({ to: emailTo, ...testEmail() })
      return json({ ok: true, emailed: emailTo.length })
    } catch (e) {
      logger.error('policy-watch: falha no e-mail de teste', { error: e instanceof Error ? e.message : String(e) })
      return json({ ok: false, error: 'Falha no envio' }, 502)
    }
  }

  try {
    const { results } = await runPolicyWatch({ db: supabase, fetchPage, sendEmail, emailTo, logger })
    return json({ ok: true, results })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    logger.error('policy-watch: falhou', { error: msg })
    return json({ error: msg }, 500)
  }
})
