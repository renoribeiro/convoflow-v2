import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { QUERY_KEYS } from '@/lib/queryClient';
import type { Database } from '@/integrations/supabase/types';

/** Uma linha de public.admin_users_list() (20261111000001). */
export type AdminUserRow = Database['public']['Functions']['admin_users_list']['Returns'][number];

/**
 * Todos os logins com o perfil, para a aba Usuários da Administração. SÓ para
 * o superadmin: a função recusa (42501) qualquer outro cargo, então não chame
 * de outra tela. Substitui a antiga admin_users_view, que o verificador de
 * segurança do Supabase acusava por ler auth.users.
 *
 * Chave dentro de QUERY_KEYS.USERS: o que já invalida [USERS] recarrega esta
 * lista também.
 */
export function useAdminUsersList(enabled: boolean) {
  return useQuery({
    queryKey: [QUERY_KEYS.USERS, 'admin-list'],
    enabled,
    queryFn: async (): Promise<AdminUserRow[]> => {
      const { data, error } = await supabase.rpc('admin_users_list');
      if (error) throw error;
      return data ?? [];
    },
  });
}
