/**
 * policy-watch
 *
 * Vigia das políticas de uso aceitável do WhatsApp/Meta. Baixa as URLs oficiais
 * registradas em `whatsapp_policy_documents`, calcula um hash do conteúdo e,
 * quando algo muda, grava em `whatsapp_policy_change_log` e notifica os
 * super_admins (tabela `notifications`) para revisar
 * `.agent/skills/whatsapp-policies/SKILL.md`.
 *
 * verify_jwt = false — chamado pelo pg_cron com anon bearer; autentica
 * internamente via SUPABASE_SERVICE_ROLE_KEY (mesmo padrão de
 * process-campaign-dispatch / job-worker). Também aceita invocação manual.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createLogger } from '../_shared/logger.ts'
import { guardBackendCaller } from '../_shared/backend-gate.ts'
import { corsHeaders } from '../_shared/validation.ts'

interface PolicyDoc {
  key: string
  label: string
  url: string
  is_active: boolean
  last_hash: string | null
}

// Normaliza o HTML para reduzir falsos positivos: remove <script>/<style>,
// tags, e colapsa espaços. Mudança real de texto da política ainda altera o hash.
function normalize(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

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

  const { data: docs, error } = await supabase
    .from('whatsapp_policy_documents')
    .select('key,label,url,is_active,last_hash')
    .eq('is_active', true)

  if (error) {
    logger.error('Falha ao carregar watchlist', { error: error.message })
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const results: Array<{ key: string; status: string }> = []

  for (const doc of (docs ?? []) as PolicyDoc[]) {
    const checkedAt = new Date().toISOString()
    try {
      const res = await fetch(doc.url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'ConvoFlow-PolicyWatch/1.0 (+compliance)' },
      })
      const body = await res.text()
      const content = normalize(body)
      const hash = await sha256(content)
      const changed = doc.last_hash !== null && doc.last_hash !== hash

      await supabase
        .from('whatsapp_policy_documents')
        .update({
          last_hash: hash,
          last_status_code: res.status,
          last_checked_at: checkedAt,
          last_error: null,
          ...(changed ? { last_changed_at: checkedAt } : {}),
          updated_at: checkedAt,
        })
        .eq('key', doc.key)

      if (changed) {
        logger.warn('Política mudou', { key: doc.key, url: doc.url })
        await supabase.from('whatsapp_policy_change_log').insert({
          document_key: doc.key,
          old_hash: doc.last_hash,
          new_hash: hash,
          http_status: res.status,
          excerpt: content.slice(0, 500),
        })

        // Notifica todos os super_admins. notifications.user_id referencia
        // auth.users(id) == profiles.user_id (NÃO profiles.id).
        const { data: admins } = await supabase
          .from('profiles')
          .select('user_id')
          .eq('role', 'superadmin')

        for (const admin of admins ?? []) {
          const uid = (admin as { user_id: string | null }).user_id
          if (!uid) continue
          await supabase.from('notifications').insert({
            user_id: uid,
            title: 'Política do WhatsApp foi atualizada',
            message: `O documento "${doc.label}" mudou. Reveja .agent/skills/whatsapp-policies/SKILL.md e verifique conformidade.`,
            type: 'warning',
            action_url: doc.url,
            action_label: 'Ver política',
            metadata: { source: 'policy-watch', document_key: doc.key },
          })
        }
      }

      results.push({ key: doc.key, status: doc.last_hash === null ? 'baseline' : changed ? 'changed' : 'unchanged' })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logger.error('Falha ao checar política', { key: doc.key, error: msg })
      await supabase
        .from('whatsapp_policy_documents')
        .update({ last_checked_at: checkedAt, last_error: msg, updated_at: checkedAt })
        .eq('key', doc.key)
      results.push({ key: doc.key, status: 'error' })
    }
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
