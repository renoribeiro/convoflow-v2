import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { QUERY_KEYS } from '@/lib/queryClient';
import { normalizeRole, type AnyUserRole } from '@/types/userHierarchy';
import {
  countIneligibleConversations,
  parseRotationSettings,
  type IneligibleOwner,
  type PercentMap,
  type RotationMember,
  type RotationSettings,
} from '@/lib/conversations/rotation';

/**
 * Rodízio de conversas novas (migração 20260915000001) — a leitura das três
 * preferências, a tabela de porcentagens e a lista de responsáveis
 * indisponíveis, sempre pela Loja ATIVA (`tenant.id`, não a do perfil: o
 * gerente que entrou numa Loja pelo seletor configura aquela Loja).
 *
 * Todas as RPCs são SECURITY DEFINER e decidem o alcance no banco (gestor da
 * Loja, gerente da Conta acima, superadmin). Fora do alcance devolvem vazio —
 * por isso os hooks só ligam a query para quem tem `store.admin`, para não
 * fazer pergunta que se sabe vazia.
 *
 * Casts `(supabase as any).rpc`: funções novas, fora dos tipos gerados — o
 * mesmo padrão de `useContactHasConversation` e `useLojaStats`.
 */

/** As três chaves de `tenants.settings`, com os defaults (nada gravado = tudo desligado). */
export const useRotationSettings = (): RotationSettings & { isLoading: boolean } => {
  const { tenant, loading } = useTenant();
  const parsed = useMemo(() => parseRotationSettings(tenant?.settings), [tenant?.settings]);
  return { ...parsed, isLoading: loading };
};

/** Gestor, gerente e superadmin administram o rodízio; atendente só vê a lista. */
export const useCanManageRotation = (): boolean => {
  const { profile } = useTenant();
  const role = normalizeRole(profile?.role as AnyUserRole | undefined);
  return role === 'gestor' || role === 'gerente' || role === 'superadmin';
};

/**
 * Quem está no rodízio da Loja ativa, com nome, cargo e porcentagem. A RPC
 * reconcilia com o conjunto elegível antes de devolver, então a lista é
 * sempre a de agora — mesmo que um reequilíbrio automático tenha falhado.
 */
export const useConversationRotation = () => {
  const { tenant } = useTenant();
  const canManage = useCanManageRotation();

  return useQuery<RotationMember[]>({
    queryKey: [QUERY_KEYS.CONVERSATION_ROTATION, tenant?.id],
    enabled: !!tenant?.id && canManage,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('conversation_rotation_get', {
        p_tenant_id: tenant!.id,
      });
      if (error) throw error;
      return ((data ?? []) as RotationMember[]).map((m) => ({ ...m, percent: Number(m.percent) }));
    },
    // A RPC escreve (reconcilia) — não queremos refetch em cada foco de janela.
    staleTime: 60 * 1000,
  });
};

/**
 * Grava as porcentagens — TUDO OU NADA. O objeto precisa cobrir exatamente o
 * conjunto elegível e somar 100; o banco recusa com 22023 e uma frase em pt-BR
 * (`error.message`), que a tela mostra como está.
 */
export const useSaveConversationRotation = () => {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (percents: PercentMap) => {
      if (!tenant?.id) throw new Error('Nenhuma Loja carregada');
      const { error } = await (supabase as any).rpc('set_conversation_rotation', {
        p_tenant_id: tenant.id,
        p_percents: percents,
      });
      if (error) throw error;
      return percents;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CONVERSATION_ROTATION, tenant?.id] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.INELIGIBLE_OWNERS, tenant?.id] });
    },
  });
};

/**
 * Responsáveis que NÃO estão elegíveis (suspenso, pendente, excluído, fora da
 * Loja, em 0 % com o rodízio ligado) e quantas conversas ativas cada um ainda
 * tem. É o que a pílula "Responsável indisponível" e o contador da aba Escala
 * leem. Só para quem administra a Loja.
 */
export const useIneligibleOwners = () => {
  const { tenant } = useTenant();
  const canManage = useCanManageRotation();

  const query = useQuery<IneligibleOwner[]>({
    queryKey: [QUERY_KEYS.INELIGIBLE_OWNERS, tenant?.id],
    enabled: !!tenant?.id && canManage,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('loja_ineligible_owners', {
        p_tenant_id: tenant!.id,
      });
      if (error) throw error;
      return ((data ?? []) as IneligibleOwner[]).map((o) => ({
        ...o,
        n_conversations: Number(o.n_conversations ?? 0),
      }));
    },
    staleTime: 60 * 1000,
  });

  const owners = query.data ?? [];
  const ownerIds = useMemo(() => new Set(owners.map((o) => o.profile_id)), [owners]);
  const total = useMemo(() => countIneligibleConversations(owners), [owners]);

  return { ...query, owners, ownerIds, total, canManage };
};
