import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useTenant } from '@/contexts/TenantContext'
import type {
  FollowupSequence,
  FollowupSequenceStep,
  SequenceDelayUnit,
} from '@/lib/followups/types'
import type { SequenceFormValues } from '@/lib/validations/followup'
import { toast } from 'sonner'

export interface SequenceWithSteps extends FollowupSequence {
  steps: FollowupSequenceStep[]
}

function delayToMs(unit: SequenceDelayUnit, amount: number): number {
  if (unit === 'minutes') return amount * 60_000
  if (unit === 'hours') return amount * 3_600_000
  return amount * 86_400_000
}

export function useFollowupSequences() {
  const { tenant } = useTenant()
  const [sequences, setSequences] = useState<SequenceWithSteps[]>([])
  const [loading, setLoading] = useState(true)

  const fetchSequences = useCallback(async () => {
    if (!tenant?.id) return
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('followup_sequences')
        .select('*, followup_sequence_steps(*)')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      const mapped: SequenceWithSteps[] = (data || []).map((s: any) => ({
        ...s,
        steps: ((s.followup_sequence_steps as FollowupSequenceStep[]) || []).sort(
          (a, b) => a.step_order - b.step_order,
        ),
      }))
      setSequences(mapped)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao carregar sequências')
    } finally {
      setLoading(false)
    }
  }, [tenant?.id])

  useEffect(() => {
    if (tenant?.id) fetchSequences()
  }, [tenant?.id, fetchSequences])

  const createSequence = async (values: SequenceFormValues): Promise<FollowupSequence | null> => {
    if (!tenant?.id) {
      toast.error('Conta não encontrada')
      return null
    }
    try {
      const { data: seq, error } = await supabase
        .from('followup_sequences')
        .insert({
          tenant_id: tenant.id,
          name: values.name,
          description: values.description ?? null,
          is_active: values.is_active,
          stop_on_reply: values.stop_on_reply,
        })
        .select()
        .single()
      if (error || !seq) throw error ?? new Error('Falha ao criar sequência')

      const stepsPayload = values.steps.map((st, i) => ({
        tenant_id: tenant.id,
        sequence_id: seq.id,
        step_order: i + 1,
        action_type: st.action_type,
        delay_amount: st.delay_amount,
        delay_unit: st.delay_unit,
        message_body: st.message_body ?? null,
        template_name: st.template_name ?? null,
        template_language: st.template_language ?? null,
        template_params: st.template_params ?? null,
        task_title: st.task_title ?? null,
        task_priority: st.task_priority ?? 'medium',
      }))
      const { error: stepsErr } = await supabase
        .from('followup_sequence_steps')
        .insert(stepsPayload)
      if (stepsErr) throw stepsErr

      await fetchSequences()
      toast.success('Sequência criada com sucesso!')
      return seq as FollowupSequence
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar sequência')
      return null
    }
  }

  const deleteSequence = async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('followup_sequences')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenant?.id)
      if (error) throw error
      await fetchSequences()
      toast.success('Sequência excluída')
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao excluir sequência')
      return false
    }
  }

  const toggleActive = async (id: string, isActive: boolean): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('followup_sequences')
        .update({ is_active: isActive })
        .eq('id', id)
        .eq('tenant_id', tenant?.id)
      if (error) throw error
      await fetchSequences()
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar sequência')
      return false
    }
  }

  /**
   * Inscreve um contato numa sequência. Calcula next_run_at a partir do atraso
   * do primeiro passo (o followup-processor assume daqui).
   */
  const enrollContact = async (opts: {
    sequenceId: string
    contactId: string
    whatsappInstanceId?: string | null
    assignedTo?: string | null
  }): Promise<boolean> => {
    if (!tenant?.id) return false
    try {
      const seq = sequences.find((s) => s.id === opts.sequenceId)
      const first = seq?.steps?.[0]
      const delayMs = first
        ? delayToMs((first.delay_unit as SequenceDelayUnit) ?? 'days', first.delay_amount ?? 0)
        : 0
      const nextRun = new Date(Date.now() + delayMs).toISOString()

      const { error } = await supabase.from('followup_sequence_enrollments').insert({
        tenant_id: tenant.id,
        sequence_id: opts.sequenceId,
        contact_id: opts.contactId,
        whatsapp_instance_id: opts.whatsappInstanceId ?? null,
        assigned_to: opts.assignedTo ?? null,
        status: 'active',
        current_step: 1,
        next_run_at: nextRun,
      })
      if (error) throw error
      toast.success('Contato inscrito na sequência!')
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao inscrever na sequência')
      return false
    }
  }

  return {
    sequences,
    loading,
    createSequence,
    deleteSequence,
    toggleActive,
    enrollContact,
    refresh: fetchSequences,
  }
}
