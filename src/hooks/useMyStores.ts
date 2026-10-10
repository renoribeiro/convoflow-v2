import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { QUERY_KEYS } from '@/lib/queryClient';
import { normalizeRole, AnyUserRole } from '@/types/userHierarchy';

export interface MyStore {
  id: string;
  name: string;
  parent_tenant_id: string | null;
}

/**
 * Lojas (stores) pertencentes à Conta do Gerente logado — os tenants cujo
 * `parent_tenant_id` é a Conta (account) do gerente. Vazio para qualquer outra
 * role. Usado pelo seletor de loja e pela comparação de métricas entre lojas.
 *
 * `superadminAccountId`: o superadmin não tem Conta própria; a tela de Equipe
 * passa a Conta em foco para listar as Lojas dela. Ignorado para os demais
 * cargos, e sem ele o superadmin continua sem consulta, como sempre foi.
 */
export const useMyStores = (options?: { superadminAccountId?: string | null }) => {
  const { profile } = useTenant();
  const role = normalizeRole(profile?.role as AnyUserRole | undefined);
  const accountId =
    role === 'gerente'
      ? profile?.tenant_id ?? null
      : role === 'superadmin'
        ? options?.superadminAccountId ?? null
        : null;
  const enabled = !!accountId;

  const query = useQuery({
    // Primeiro segmento 'tenant' → cache estático (ver queryClient.ts).
    queryKey: [QUERY_KEYS.TENANT, 'my-stores', accountId],
    enabled,
    queryFn: async (): Promise<MyStore[]> => {
      const { data, error } = await supabase
        .from('tenants')
        .select('id, name, parent_tenant_id')
        .eq('parent_tenant_id', accountId as string)
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as MyStore[];
    },
  });

  return {
    stores: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
};
