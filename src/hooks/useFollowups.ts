import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
import { chaveFollowups, entrarNoCanalDeFollowups } from '@/lib/followups/canalAoVivo'

export interface UseFollowupMutationsReturn {
  createFollowup: (data: CreateFollowupData) => Promise<IndividualFollowup | null>
  updateFollowup: (id: string, data: UpdateFollowupData) => Promise<boolean>
  deleteFollowup: (id: string) => Promise<boolean>
  completeFollowup: (id: string) => Promise<boolean>
  cancelFollowup: (id: string) => Promise<boolean>
  refreshFollowups: () => Promise<void>
}

export interface UseFollowupsReturn extends UseFollowupMutationsReturn {
  followups: IndividualFollowup[]
  stats: FollowupStats
  loading: boolean
  error: string | null
  getFollowupsByStatus: (status: string) => IndividualFollowup[]
  getOverdueFollowups: () => IndividualFollowup[]
}

/** Anexa effective_status (espelho de v_followups) a cada follow-up. */
function withEffectiveStatus(rows: IndividualFollowup[]): IndividualFollowup[] {
  return rows.map((f) => ({ ...f, effective_status: effectiveStatus(f) }))
}

/**
 * Só as ações (criar, editar, concluir, cancelar, excluir), sem ler a lista
 * nem abrir canal. É o que as janelas "Novo Follow up" e "Agendar follow up"
 * usam: antes cada uma lia TODOS os follow ups da Loja e abria um canal, e no
 * Funil havia uma por cartão de lead (lote 6b, B15). Depois de gravar, a
 * consulta compartilhada é marcada como velha e quem a mostra relê uma vez.
 */
export function useFollowupMutations(): UseFollowupMutationsReturn {
  const { tenant } = useTenant()
  const queryClient = useQueryClient()

  const refreshFollowups = async () => {
    await queryClient.invalidateQueries({ queryKey: chaveFollowups(tenant?.id) })
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
      toast.success('Follow up criado com sucesso!')
      return newFollowup as IndividualFollowup
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao criar follow up'
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
      toast.success('Follow up atualizado com sucesso!')
      return true
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao atualizar follow up'
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
      toast.success('Follow up excluído com sucesso!')
      return true
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao excluir follow up'
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

  return { createFollowup, updateFollowup, deleteFollowup, completeFollowup, cancelFollowup, refreshFollowups }
}

async function lerFollowups(tenantId: string): Promise<IndividualFollowup[]> {
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
    .eq('tenant_id', tenantId)
    .order('due_date', { ascending: true })

  if (fetchError) {
    // Aqui, e não num efeito de cada parte: a leitura é uma só, o aviso também.
    toast.error(fetchError.message || 'Erro ao carregar follow ups')
    throw fetchError
  }
  return withEffectiveStatus((data as IndividualFollowup[]) || [])
}

/**
 * Os follow ups da Loja, com contadores e ações.
 *
 * Lote 6b (B15): a tela de Follow ups monta este hook em várias partes ao
 * mesmo tempo (contadores, lista da aba aberta, calendário, "Novo Follow
 * up"). Antes cada uma lia a lista inteira e abria o próprio canal ao vivo;
 * ao abrir a tela eram três leituras iguais e três canais com o mesmo nome, e
 * fechar uma parte derrubava o canal das outras. Agora a leitura é uma
 * consulta do TanStack Query, compartilhada por chave (uma leitura para
 * todas), e o canal é um só por Loja, com contador
 * (src/lib/followups/canalAoVivo.ts).
 */
export function useFollowups(): UseFollowupsReturn {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? null
  const queryClient = useQueryClient()
  const mutations = useFollowupMutations()

  const query = useQuery({
    queryKey: chaveFollowups(tenantId),
    queryFn: () => lerFollowups(tenantId as string),
    enabled: !!tenantId,
  })

  useEffect(() => {
    if (!tenantId) return
    return entrarNoCanalDeFollowups(tenantId, queryClient)
  }, [tenantId, queryClient])

  const followups = query.data ?? []

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

  // Filtra pelo status efetivo (assim "overdue" funciona mesmo sem flip no banco).
  const getFollowupsByStatus = (status: string): IndividualFollowup[] => {
    return followups.filter((f) => eff(f) === status)
  }

  const getOverdueFollowups = (): IndividualFollowup[] => {
    return followups.filter((f) => eff(f) === 'overdue')
  }

  const error = query.error
    ? query.error instanceof Error
      ? query.error.message
      : 'Erro ao carregar follow ups'
    : null

  return {
    followups,
    stats,
    // Sem Loja ainda, "carregando" (era assim antes: o estado nascia true).
    loading: !tenantId || query.isLoading,
    error,
    ...mutations,
    getFollowupsByStatus,
    getOverdueFollowups,
  }
}
