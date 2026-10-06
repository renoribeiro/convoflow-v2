import { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useTenant } from '@/contexts/TenantContext'
import {
  effectiveStatus,
  type IndividualFollowup,
  type FollowupStats,
  type FollowupStatus,
  type CreateFollowupData,
  type UpdateFollowupData,
} from '@/lib/followups/types'
import { toast } from 'sonner'

export interface UseFollowupsReturn {
  followups: IndividualFollowup[]
  stats: FollowupStats
  loading: boolean
  error: string | null
  createFollowup: (data: CreateFollowupData) => Promise<IndividualFollowup | null>
  updateFollowup: (id: string, data: UpdateFollowupData) => Promise<boolean>
  deleteFollowup: (id: string) => Promise<boolean>
  completeFollowup: (id: string) => Promise<boolean>
  cancelFollowup: (id: string) => Promise<boolean>
  getFollowupsByStatus: (status: string) => IndividualFollowup[]
  getOverdueFollowups: () => IndividualFollowup[]
  refreshFollowups: () => Promise<void>
}

/** Anexa effective_status (espelho de v_followups) a cada follow-up. */
function withEffectiveStatus(rows: IndividualFollowup[]): IndividualFollowup[] {
  return rows.map((f) => ({ ...f, effective_status: effectiveStatus(f) }))
}

export function useFollowups(): UseFollowupsReturn {
  const { tenant } = useTenant()
  const [followups, setFollowups] = useState<IndividualFollowup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Estatísticas usam o status EFETIVO (overdue calculado), consistente com o banco.
  const eff = (f: IndividualFollowup): FollowupStatus =>
    f.effective_status ?? effectiveStatus(f)
  const stats: FollowupStats = {
    total: followups.length,
    pending: followups.filter((f) => eff(f) === 'pending').length,
    scheduled: followups.filter((f) => eff(f) === 'scheduled').length,
    in_progress: followups.filter((f) => eff(f) === 'in_progress').length,
    completed: followups.filter((f) => eff(f) === 'completed').length,
    cancelled: followups.filter((f) => eff(f) === 'cancelled').length,
    overdue: followups.filter((f) => eff(f) === 'overdue').length,
  }

  const fetchFollowups = async () => {
    if (!tenant?.id) return
    try {
      setLoading(true)
      setError(null)

      const { data, error: fetchError } = await supabase
        .from('individual_followups')
        .select(`
          *,
          contacts (
            id,
            name,
            phone
          )
        `)
        .eq('tenant_id', tenant.id)
        .order('due_date', { ascending: true })

      if (fetchError) throw fetchError
      setFollowups(withEffectiveStatus((data as IndividualFollowup[]) || []))
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao carregar follow-ups'
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const createFollowup = async (data: CreateFollowupData): Promise<IndividualFollowup | null> => {
    if (!tenant?.id) {
      toast.error('Conta não encontrada')
      return null
    }
    try {
      // Status inicial coerente com o modo: agendado entra como 'scheduled'
      // (para o followup-processor disparar); demais como 'pending'.
      const derivedStatus =
        (data as { status?: string }).status ??
        (data.mode === 'scheduled' ? 'scheduled' : 'pending')

      const { data: newFollowup, error: createError } = await supabase
        .from('individual_followups')
        .insert({
          ...data,
          tenant_id: tenant.id,
          status: derivedStatus,
        })
        .select()
        .single()

      if (createError) throw createError
      await refreshFollowups()
      toast.success('Follow-up criado com sucesso!')
      return newFollowup as IndividualFollowup
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao criar follow-up'
      toast.error(errorMessage)
      return null
    }
  }

  const updateFollowup = async (id: string, data: UpdateFollowupData): Promise<boolean> => {
    try {
      const { error: updateError } = await supabase
        .from('individual_followups')
        .update(data)
        .eq('id', id)
        .eq('tenant_id', tenant?.id)

      if (updateError) throw updateError
      await refreshFollowups()
      toast.success('Follow-up atualizado com sucesso!')
      return true
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao atualizar follow-up'
      toast.error(errorMessage)
      return false
    }
  }

  const deleteFollowup = async (id: string): Promise<boolean> => {
    try {
      const { error: deleteError } = await supabase
        .from('individual_followups')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenant?.id)

      if (deleteError) throw deleteError
      await refreshFollowups()
      toast.success('Follow-up excluído com sucesso!')
      return true
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao excluir follow-up'
      toast.error(errorMessage)
      return false
    }
  }

  // Conclui marcando completed_at (usado por métricas/relatórios).
  const completeFollowup = async (id: string): Promise<boolean> => {
    return updateFollowup(id, {
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
  }

  const cancelFollowup = async (id: string): Promise<boolean> => {
    return updateFollowup(id, {
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
    })
  }

  // Filtra pelo status efetivo (assim "overdue" funciona mesmo sem flip no banco).
  const getFollowupsByStatus = (status: string): IndividualFollowup[] => {
    return followups.filter((f) => eff(f) === status)
  }

  const getOverdueFollowups = (): IndividualFollowup[] => {
    return followups.filter((f) => eff(f) === 'overdue')
  }

  const refreshFollowups = async () => {
    await fetchFollowups()
  }

  useEffect(() => {
    if (tenant?.id) fetchFollowups()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id])

  useEffect(() => {
    if (!tenant?.id) return
    const subscription = supabase
      .channel('individual_followups_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'individual_followups',
          filter: `tenant_id=eq.${tenant.id}`,
        },
        () => {
          fetchFollowups()
        },
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id])

  return {
    followups,
    stats,
    loading,
    error,
    createFollowup,
    updateFollowup,
    deleteFollowup,
    completeFollowup,
    cancelFollowup,
    getFollowupsByStatus,
    getOverdueFollowups,
    refreshFollowups,
  }
}
