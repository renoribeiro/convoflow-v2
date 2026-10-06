import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { QUERY_KEYS } from '@/lib/queryClient';
import { UserRole, UserStatus } from '@/types/userHierarchy';

export interface UserRow {
  id: string;
  user_id: string;
  tenant_id: string | null;
  parent_id: string | null;
  affiliate_id: string | null;
  role: UserRole;
  status: UserStatus;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  last_login_at: string | null;
  login_count: number;
  last_ip: string | null;
  created_at: string;
}

export interface UsersFilters {
  search?: string;
  role?: UserRole;
  status?: UserStatus;
  parentId?: string;
  tenantId?: string;
}

/**
 * Lista profiles respeitando RLS hierárquica. O Supabase aplica as policies
 * automaticamente, então cada caller só recebe os profiles que pode enxergar.
 */
export function useUsers(filters: UsersFilters = {}) {
  return useQuery({
    queryKey: [QUERY_KEYS.USERS, filters],
    queryFn: async (): Promise<UserRow[]> => {
      // cast `any` enquanto types.ts ainda reflete o schema antigo (antes de
      // rodar `supabase gen types` após aplicar as migrations da Fase 1/2).
      const builder = (supabase as any).from('profiles');
      let query = builder
        .select(
          'id, user_id, tenant_id, parent_id, affiliate_id, role, status, first_name, last_name, phone, avatar_url, last_login_at, login_count, last_ip, created_at',
        )
        .order('created_at', { ascending: false });

      if (filters.role) query = query.eq('role', filters.role);
      if (filters.status) query = query.eq('status', filters.status);
      if (filters.parentId) query = query.eq('parent_id', filters.parentId);
      if (filters.tenantId) query = query.eq('tenant_id', filters.tenantId);

      const { data, error } = await query;
      if (error) throw error;

      const list = (data ?? []) as unknown as UserRow[];
      if (!filters.search) return list;

      const q = filters.search.toLowerCase();
      return list.filter((u) =>
        [u.first_name, u.last_name, u.phone]
          .filter(Boolean)
          .some((v) => (v as string).toLowerCase().includes(q)),
      );
    },
  });
}
