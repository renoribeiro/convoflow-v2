import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { QUERY_KEYS } from '@/lib/queryClient';
import { logger } from '@/lib/logger';

/**
 * Diretório do time — quem pode ser responsável por uma conversa.
 *
 * Por que não ler `profiles` direto: o RLS de `profiles` é hierárquico de
 * propósito. Um atendente lê SÓ o próprio perfil; um gestor lê só os
 * atendentes da Loja. Nenhum dos dois conseguiria montar o nome de quem está
 * com a conversa a partir de `assigned_profile_id`, nem a lista do
 * "Transferir". A RPC `tenant_team_directory` (SECURITY DEFINER, migração
 * 20260913000001) devolve o MÍNIMO para isso — id, nome, sobrenome, avatar — de
 * perfis ativos da Loja/Conta ativa. Nada de e-mail, telefone ou cargo.
 *
 * Passa `tenant.id` (a Conta/Loja ATIVA, não a do perfil) de propósito: o
 * gerente que entrou numa Loja pelo seletor precisa do time daquela Loja.
 *
 * Falha (por exemplo, a migração ainda não aplicada) vira lista vazia: a tela
 * mostra o chip sem nome em vez de quebrar. É cosmético, não vale insistir.
 */
export interface TeamMember {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

/** "Maria Souza"; sem nome nenhum, "Sem nome". */
export const memberDisplayName = (member: Pick<TeamMember, 'first_name' | 'last_name'>): string => {
  const full = [member.first_name, member.last_name]
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join(' ');
  return full || 'Sem nome';
};

/** Só o primeiro nome — é o que cabe no chip da lista. */
export const memberFirstName = (member: Pick<TeamMember, 'first_name' | 'last_name'>): string => {
  const first = (member.first_name ?? '').trim();
  if (first) return first.split(/\s+/)[0] ?? first;
  return memberDisplayName(member);
};

/** Iniciais para o avatar sem foto: "MS". Sem nome, "?". */
export const memberInitials = (member: Pick<TeamMember, 'first_name' | 'last_name'>): string => {
  const initials = [member.first_name, member.last_name]
    .map((part) => (part ?? '').trim()[0] ?? '')
    .filter(Boolean)
    .join('')
    .toUpperCase();
  return initials || '?';
};

export const useTeamDirectory = () => {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: [QUERY_KEYS.TEAM_DIRECTORY, tenant?.id],
    queryFn: async (): Promise<TeamMember[]> => {
      if (!tenant?.id) return [];

      const { data, error } = await supabase.rpc('tenant_team_directory', {
        p_tenant_id: tenant.id,
      });

      if (error) {
        logger.warn('Diretório do time indisponível; chips de responsável saem sem nome.', {
          code: error.code,
        });
        return [];
      }

      return (data ?? []) as TeamMember[];
    },
    enabled: !!tenant?.id,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    retry: 1,
  });
};

/**
 * Resolve um `profiles.id` para o membro, ou `undefined` quando a pessoa não
 * está no diretório (perfil suspenso, de outra Loja, ou diretório ainda não
 * carregado). Quem chama decide o que mostrar nesse caso.
 */
export const useTeamMemberLookup = () => {
  const { data } = useTeamDirectory();

  const byId = useMemo(() => {
    const map = new Map<string, TeamMember>();
    for (const member of data ?? []) map.set(member.id, member);
    return map;
  }, [data]);

  return useCallback((profileId: string | null | undefined) => {
    if (!profileId) return undefined;
    return byId.get(profileId);
  }, [byId]);
};
