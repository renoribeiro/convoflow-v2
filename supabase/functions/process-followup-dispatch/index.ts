/**
 * process-followup-dispatch
 *
 * Worker dirigido por cron (e invocável manualmente) que move o motor de
 * follow-up. Espelha o padrão de `process-campaign-dispatch`:
 *   verify_jwt = false — chamado pelo pg_cron com bearer anon; autentica
 *   internamente via SUPABASE_SERVICE_ROLE_KEY.
 *
 * A cada tick (orçamento ~50s) ele:
 *   1. Reclama locks de envios agendados travados (crash recovery).
 *   2. Marca tarefas vencidas como 'overdue' no banco (flip_overdue_followups).
 *   3. Dispara follow-ups AGENDADOS vencidos (mode='scheduled').
 *   4. Avança SEQUÊNCIAS: retoma cadências pausadas em tarefa manual concluída e
 *      executa os passos vencidos (whatsapp automático / cria tarefa manual).
 *   5. Gera as próximas instâncias de follow-ups RECORRENTES concluídos.
 *
 * Todo envio passa pela ProviderFactory (Evolution/WAHA/Meta) e respeita a
 * janela de 24h da Meta para instâncias oficiais.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createLogger } from '../_shared/logger.ts'
import { guardBackendCaller } from '../_shared/backend-gate.ts'
import { corsHeaders, DataSanitizer } from '../_shared/validation.ts'
import { ProviderFactory } from '../_shared/provider-factory.ts'
import {
  addDelay,
  buildFollowupVariables,
  extractMessageId,
  isFreeFormBlocked,
  recurrenceChild,
  substituteVariables,
  type DelayUnit,
} from '../_shared/followup-logic.ts'

const BUDGET_MS = 50_000
const SCHEDULED_BATCH = 40
const ENROLLMENT_BATCH = 40
const RECURRENCE_BATCH = 50
const MAX_ATTEMPTS = 3

/** Erro de conformidade (janela de 24h) — terminal, não deve ser repetido. */
class ComplianceError extends Error {}

// ── Resolução de instância ────────────────────────────────────────────────────
// Usa a instância explícita do follow-up/enrollment; senão a primeira instância
// ativa da conta. Retorna a row crua (com provider/connection_config) ou null.
async function resolveInstance(
  supabase: SupabaseClient,
  tenantId: string,
  preferredId: string | null,
): Promise<any | null> {
  if (preferredId) {
    const { data } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('id', preferredId)
      .maybeSingle()
    if (data) return data
  }
  const { data } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data ?? null
}

interface SendSpec {
  messageBody: string | null
  templateName: string | null
  templateLanguage: string | null
  templateParams: string[] | null
}

interface SendResult {
  msgId: string | null
  mirrorContent: string
}

// ── Envio unificado (agendado + passo whatsapp de sequência) ──────────────────
async function sendWhatsApp(
  supabase: SupabaseClient,
  instanceRow: any,
  phone: string,
  spec: SendSpec,
  variables: Record<string, string>,
): Promise<SendResult> {
  const isOfficial = (instanceRow.provider ?? 'evolution') === 'official'
  const isTemplate = isOfficial && !!spec.templateName

  // Gate de conformidade: free-form fora da janela de 24h em número oficial.
  if (isOfficial && !isTemplate) {
    const { data: inWindow, error: winErr } = await supabase.rpc('is_within_service_window', {
      p_instance_id: instanceRow.id,
      p_phone: phone,
    })
    // Em caso de erro do RPC, bloqueamos por precaução (fail-safe).
    if (isFreeFormBlocked({ isOfficial, isTemplate, inWindow: !winErr && inWindow === true })) {
      throw new ComplianceError(
        'Bloqueado por conformidade: fora da janela de 24h. Número oficial (Meta) só pode ' +
          'enviar template aprovado para contatos frios. Configure um template no follow-up.',
      )
    }
  }

  const provider = await ProviderFactory.getProvider(instanceRow, supabase)

  if (isTemplate) {
    if (typeof (provider as any).sendTemplate !== 'function') {
      throw new Error(`Provider '${instanceRow.provider}' não suporta sendTemplate.`)
    }
    const rawParams = Array.isArray(spec.templateParams) ? spec.templateParams : []
    const bodyParams = rawParams.map((p) => substituteVariables(p, variables))
    const result = await (provider as any).sendTemplate(
      phone,
      spec.templateName,
      spec.templateLanguage || 'pt_BR',
      bodyParams,
    )
    return {
      msgId: extractMessageId(result),
      mirrorContent: `[Template: ${spec.templateName}] ${bodyParams.join(' | ')}`,
    }
  }

  const text = substituteVariables(spec.messageBody || '', variables)
  if (!text.trim()) throw new Error('Mensagem vazia, nada a enviar.')
  const result = await provider.sendMessage(phone, text)
  return { msgId: extractMessageId(result), mirrorContent: text }
}

// Espelha o envio na thread de Conversas (não-fatal).
async function mirrorMessage(
  supabase: SupabaseClient,
  opts: { contactId: string; tenantId: string; instanceId: string; content: string; msgId: string | null },
  logger: any,
): Promise<void> {
  const { error } = await supabase.from('messages').insert({
    contact_id: opts.contactId,
    tenant_id: opts.tenantId,
    whatsapp_instance_id: opts.instanceId,
    direction: 'outbound',
    message_type: 'text',
    content: opts.content,
    evolution_message_id: opts.msgId,
    status: 'sent',
    source: 'followup',
  })
  if (error) logger.warn('Follow-up message mirror failed', { error: error.message })
}

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

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const startTime = Date.now()
    const nowIso = new Date().toISOString()
    const overBudget = () => Date.now() - startTime > BUDGET_MS - 3000

    const stats = { sent: 0, failed: 0, blocked: 0, tasksCreated: 0, advanced: 0, recurred: 0 }

    // ── 1. Reclama envios agendados travados em 'in_progress' por >5min ────────
    await supabase
      .from('individual_followups')
      .update({ status: 'scheduled', updated_at: nowIso })
      .eq('mode', 'scheduled')
      .eq('status', 'in_progress')
      .lt('updated_at', new Date(Date.now() - 5 * 60_000).toISOString())

    // ── 2. Overdue ─────────────────────────────────────────────────────────────
    // NÃO flipamos fisicamente pending→overdue neste MVP de backend: a UI atual
    // ainda filtra a aba "Pendentes" por status='pending' e perderia esses itens.
    // O "em atraso" é exposto sem mutação via a view public.v_followups
    // (effective_status). Quando a UI passar a consumir effective_status / Smart
    // Views (fase de frontend), basta chamar a RPC public.flip_overdue_followups()
    // aqui para materializar o status.

    // ── 3. Envios AGENDADOS vencidos ───────────────────────────────────────────
    const { data: dueScheduled } = await supabase
      .from('individual_followups')
      .select('*')
      .eq('mode', 'scheduled')
      .eq('status', 'scheduled')
      .lte('scheduled_at', nowIso)
      .order('scheduled_at', { ascending: true })
      .limit(SCHEDULED_BATCH)

    for (const fu of dueScheduled ?? []) {
      if (overBudget()) break

      // Lock otimista: só processa quem conseguir mudar scheduled→in_progress.
      const { data: claimed } = await supabase
        .from('individual_followups')
        .update({ status: 'in_progress', updated_at: new Date().toISOString() })
        .eq('id', fu.id)
        .eq('status', 'scheduled')
        .select('id')
      if (!claimed || claimed.length === 0) continue

      const { data: contact } = await supabase
        .from('contacts')
        .select('phone, name, email, whatsapp_instance_id')
        .eq('id', fu.contact_id)
        .maybeSingle()

      const phone = (contact?.phone || '').replace(/\D/g, '')
      if (!phone) {
        await supabase.from('individual_followups').update({
          status: 'cancelled', cancelled_at: new Date().toISOString(),
          error_message: 'Contato sem telefone válido.', attempts: (fu.attempts ?? 0) + 1,
        }).eq('id', fu.id)
        stats.failed++
        continue
      }

      const instanceRow = await resolveInstance(
        supabase, fu.tenant_id, fu.whatsapp_instance_id || contact?.whatsapp_instance_id || null,
      )
      if (!instanceRow) {
        await supabase.from('individual_followups').update({
          status: 'cancelled', cancelled_at: new Date().toISOString(),
          error_message: 'Nenhuma instância de WhatsApp ativa na conta.', attempts: (fu.attempts ?? 0) + 1,
        }).eq('id', fu.id)
        stats.failed++
        continue
      }

      const variables = buildFollowupVariables({
        contactName: contact?.name, phone, email: contact?.email,
      })

      try {
        const { msgId, mirrorContent } = await sendWhatsApp(supabase, instanceRow, phone, {
          messageBody: fu.message_body,
          templateName: fu.template_name,
          templateLanguage: fu.template_language,
          templateParams: fu.template_params,
        }, variables)

        await supabase.from('individual_followups').update({
          status: 'completed', completed_at: new Date().toISOString(),
          last_sent_at: new Date().toISOString(), provider_message_id: msgId,
          error_message: null, attempts: (fu.attempts ?? 0) + 1,
        }).eq('id', fu.id)
        stats.sent++

        await mirrorMessage(supabase, {
          contactId: fu.contact_id, tenantId: fu.tenant_id, instanceId: instanceRow.id,
          content: mirrorContent, msgId,
        }, logger)

        logger.info('Scheduled follow-up sent', {
          id: fu.id, phone: DataSanitizer.sanitizePhoneNumber(phone), msgId,
        })
      } catch (err: any) {
        const attempts = (fu.attempts ?? 0) + 1
        if (err instanceof ComplianceError) {
          await supabase.from('individual_followups').update({
            status: 'cancelled', cancelled_at: new Date().toISOString(),
            error_message: err.message, attempts,
          }).eq('id', fu.id)
          stats.blocked++
        } else if (attempts >= MAX_ATTEMPTS) {
          await supabase.from('individual_followups').update({
            status: 'cancelled', cancelled_at: new Date().toISOString(),
            error_message: err.message, attempts,
          }).eq('id', fu.id)
          stats.failed++
        } else {
          // Volta para 'scheduled' para nova tentativa no próximo tick.
          await supabase.from('individual_followups').update({
            status: 'scheduled', error_message: err.message, attempts,
          }).eq('id', fu.id)
        }
        logger.warn('Scheduled follow-up send failed', { id: fu.id, attempts, error: err.message })
      }
    }

    // ── 4a. Retoma sequências pausadas em tarefa manual concluída ──────────────
    if (!overBudget()) {
      const { data: paused } = await supabase
        .from('followup_sequence_enrollments')
        .select('*')
        .eq('status', 'active')
        .not('waiting_on_followup_id', 'is', null)
        .limit(ENROLLMENT_BATCH)

      for (const enr of paused ?? []) {
        if (overBudget()) break
        const { data: task } = await supabase
          .from('individual_followups')
          .select('status')
          .eq('id', enr.waiting_on_followup_id)
          .maybeSingle()
        // Só retoma quando a tarefa manual foi resolvida (concluída/cancelada).
        if (!task || !['completed', 'cancelled'].includes(task.status)) continue

        const { data: steps } = await supabase
          .from('followup_sequence_steps')
          .select('*')
          .eq('sequence_id', enr.sequence_id)
          .order('step_order', { ascending: true })

        await advanceEnrollment(supabase, enr, steps ?? [], new Date(), logger)
        stats.advanced++
      }
    }

    // ── 4b. Executa passos de sequência vencidos ───────────────────────────────
    if (!overBudget()) {
      const { data: dueEnr } = await supabase
        .from('followup_sequence_enrollments')
        .select('*')
        .eq('status', 'active')
        .is('waiting_on_followup_id', null)
        .lte('next_run_at', nowIso)
        .order('next_run_at', { ascending: true })
        .limit(ENROLLMENT_BATCH)

      // Cache de passos por sequência e de stop_on_reply.
      const stepsCache = new Map<string, any[]>()
      const seqCache = new Map<string, any>()

      for (const enr of dueEnr ?? []) {
        if (overBudget()) break

        if (!stepsCache.has(enr.sequence_id)) {
          const { data: steps } = await supabase
            .from('followup_sequence_steps')
            .select('*')
            .eq('sequence_id', enr.sequence_id)
            .order('step_order', { ascending: true })
          stepsCache.set(enr.sequence_id, steps ?? [])
          const { data: seq } = await supabase
            .from('followup_sequences')
            .select('*')
            .eq('id', enr.sequence_id)
            .maybeSingle()
          seqCache.set(enr.sequence_id, seq)
        }
        const steps = stepsCache.get(enr.sequence_id) ?? []
        const seq = seqCache.get(enr.sequence_id)

        // Sequência inativa/excluída → encerra a inscrição.
        if (!seq || seq.is_active === false) {
          await supabase.from('followup_sequence_enrollments').update({
            status: 'stopped_manual', stopped_at: new Date().toISOString(),
            stopped_reason: 'Sequência inativa', next_run_at: null,
          }).eq('id', enr.id)
          continue
        }

        const step = steps.find((s) => s.step_order === enr.current_step)
        if (!step) {
          // Sem passo neste índice → cadência concluída.
          await supabase.from('followup_sequence_enrollments').update({
            status: 'completed', next_run_at: null, updated_at: new Date().toISOString(),
          }).eq('id', enr.id)
          continue
        }

        const { data: contact } = await supabase
          .from('contacts')
          .select('phone, name, email, whatsapp_instance_id')
          .eq('id', enr.contact_id)
          .maybeSingle()

        if (step.action_type === 'manual_task') {
          // Cria a tarefa para o operador e PAUSA a cadência até a conclusão.
          const { data: created } = await supabase.from('individual_followups').insert({
            tenant_id: enr.tenant_id,
            contact_id: enr.contact_id,
            whatsapp_instance_id: enr.whatsapp_instance_id ?? contact?.whatsapp_instance_id ?? null,
            task: step.task_title || 'Tarefa de follow-up',
            due_date: new Date().toISOString(),
            priority: step.task_priority || 'medium',
            type: 'task',
            mode: 'sequence',
            status: 'pending',
            assigned_to: enr.assigned_to ?? null,
            source: 'sequence',
            sequence_enrollment_id: enr.id,
            sequence_step_order: step.step_order,
          }).select('id').maybeSingle()

          await supabase.from('followup_sequence_enrollments').update({
            waiting_on_followup_id: created?.id ?? null, next_run_at: null,
            updated_at: new Date().toISOString(),
          }).eq('id', enr.id)
          stats.tasksCreated++
          continue
        }

        // action_type === 'whatsapp'
        const phone = (contact?.phone || '').replace(/\D/g, '')
        if (!phone) {
          // Sem telefone — pula o passo e avança para não travar a cadência.
          await advanceEnrollment(supabase, enr, steps, new Date(), logger)
          continue
        }
        const instanceRow = await resolveInstance(
          supabase, enr.tenant_id, enr.whatsapp_instance_id || contact?.whatsapp_instance_id || null,
        )
        if (!instanceRow) {
          await supabase.from('followup_sequence_enrollments').update({
            status: 'stopped_manual', stopped_at: new Date().toISOString(),
            stopped_reason: 'Sem instância de WhatsApp ativa', next_run_at: null,
          }).eq('id', enr.id)
          continue
        }

        const variables = buildFollowupVariables({ contactName: contact?.name, phone, email: contact?.email })
        try {
          const { msgId, mirrorContent } = await sendWhatsApp(supabase, instanceRow, phone, {
            messageBody: step.message_body,
            templateName: step.template_name,
            templateLanguage: step.template_language,
            templateParams: step.template_params,
          }, variables)

          await mirrorMessage(supabase, {
            contactId: enr.contact_id, tenantId: enr.tenant_id, instanceId: instanceRow.id,
            content: mirrorContent, msgId,
          }, logger)
          stats.sent++

          // Registra o passo na timeline como follow-up concluído.
          await supabase.from('individual_followups').insert({
            tenant_id: enr.tenant_id,
            contact_id: enr.contact_id,
            whatsapp_instance_id: instanceRow.id,
            task: `Passo ${step.step_order} da sequência (WhatsApp)`,
            due_date: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            last_sent_at: new Date().toISOString(),
            provider_message_id: msgId,
            priority: 'medium',
            type: 'whatsapp',
            mode: 'sequence',
            status: 'completed',
            source: 'sequence',
            sequence_enrollment_id: enr.id,
            sequence_step_order: step.step_order,
          })

          await advanceEnrollment(supabase, enr, steps, new Date(), logger)
          stats.advanced++
        } catch (err: any) {
          if (err instanceof ComplianceError) {
            // Fora da janela: pausa a cadência (não há como enviar agora).
            await supabase.from('followup_sequence_enrollments').update({
              status: 'stopped_manual', stopped_at: new Date().toISOString(),
              stopped_reason: err.message, next_run_at: null,
            }).eq('id', enr.id)
            stats.blocked++
          } else {
            // Falha técnica: tenta de novo em 30min.
            await supabase.from('followup_sequence_enrollments').update({
              next_run_at: addDelay(new Date(), 30, 'minutes').toISOString(),
              updated_at: new Date().toISOString(),
            }).eq('id', enr.id)
            stats.failed++
          }
          logger.warn('Sequence step failed', { enrollment: enr.id, error: err.message })
        }
      }
    }

    // ── 5. Geração de recorrências ─────────────────────────────────────────────
    if (!overBudget()) {
      const since = new Date(Date.now() - 2 * 86_400_000).toISOString()
      const { data: completedRecurring } = await supabase
        .from('individual_followups')
        .select('*')
        .eq('recurring', true)
        .eq('status', 'completed')
        .gte('completed_at', since)
        .limit(RECURRENCE_BATCH)

      for (const parent of completedRecurring ?? []) {
        if (overBudget()) break
        // Evita duplicar: só gera se ainda não houver filho.
        const { data: child } = await supabase
          .from('individual_followups')
          .select('id')
          .eq('parent_followup_id', parent.id)
          .limit(1)
        if (child && child.length > 0) continue

        const plan = recurrenceChild({
          recurring: parent.recurring,
          recurring_type: parent.recurring_type,
          recurring_interval: parent.recurring_interval,
          recurring_count: parent.recurring_count,
          recurring_end_date: parent.recurring_end_date,
          due_date: parent.due_date,
        })
        if (!plan.generate || !plan.nextDue) continue

        await supabase.from('individual_followups').insert({
          tenant_id: parent.tenant_id,
          contact_id: parent.contact_id,
          whatsapp_instance_id: parent.whatsapp_instance_id,
          task: parent.task,
          due_date: plan.nextDue.toISOString(),
          priority: parent.priority,
          type: parent.type,
          mode: parent.mode,
          status: parent.mode === 'scheduled' ? 'scheduled' : 'pending',
          scheduled_at: parent.mode === 'scheduled' ? plan.nextDue.toISOString() : null,
          message_body: parent.message_body,
          template_name: parent.template_name,
          template_language: parent.template_language,
          template_params: parent.template_params,
          notes: parent.notes,
          assigned_to: parent.assigned_to,
          tags: parent.tags,
          source: parent.source,
          recurring: plan.childRecurring,
          recurring_type: plan.childRecurring ? parent.recurring_type : null,
          recurring_interval: parent.recurring_interval,
          recurring_count: plan.childCount,
          recurring_end_date: parent.recurring_end_date,
          parent_followup_id: parent.id,
        })
        stats.recurred++
      }
    }

    const duration = Date.now() - startTime
    logger.info('Follow-up dispatch finished', { ...stats, duration_ms: duration })
    return new Response(JSON.stringify({ ...stats, duration_ms: duration }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error: any) {
    logger.error('Follow-up dispatch worker error', { error: error.message })
    return new Response(JSON.stringify({ error: error.message, success: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})

// Avança a inscrição para o próximo passo (ou conclui a cadência).
async function advanceEnrollment(
  supabase: SupabaseClient,
  enr: any,
  steps: any[],
  fromTime: Date,
  _logger: any,
): Promise<void> {
  const nextOrder = (enr.current_step ?? 1) + 1
  const nextStep = steps.find((s) => s.step_order === nextOrder)
  if (!nextStep) {
    await supabase.from('followup_sequence_enrollments').update({
      status: 'completed', current_step: nextOrder, next_run_at: null,
      waiting_on_followup_id: null, updated_at: new Date().toISOString(),
    }).eq('id', enr.id)
    return
  }
  const nextRun = addDelay(
    fromTime,
    nextStep.delay_amount ?? 0,
    (nextStep.delay_unit as DelayUnit) ?? 'days',
  )
  await supabase.from('followup_sequence_enrollments').update({
    current_step: nextOrder, next_run_at: nextRun.toISOString(),
    waiting_on_followup_id: null, updated_at: new Date().toISOString(),
  }).eq('id', enr.id)
}
