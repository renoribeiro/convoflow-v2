import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { QUERY_KEYS } from '@/lib/queryClient';
import { normalizeRole, AnyUserRole } from '@/types/userHierarchy';

export interface AccountStoreSlots {
  /** Lojas incluídas no plano da Conta. */
  included: number;
  /** Lojas extras contratadas. */
  extra: number;
  /** Capacidade total = incluídas + extras. */
  capacity: number;
}

/**
 * Vagas de Loja da CONTA do gerente logado.
 *
 * Lê a linha da Conta por `profile.tenant_id`, e não pelo `tenant` do
 * TenantContext, de propósito: quando o gerente entra numa Loja pelo seletor, o
 * `tenant` ativo passa a ser a Loja — e a Loja também tem colunas
 * `store_slots_*` (default 5/0 herdado da tabela), que ali não querem dizer
 * nada. `profile.tenant_id` aponta para a Conta em qualquer situação.
 *
 * Vazio para qualquer cargo que não seja gerente: só a Conta tem vaga de Loja.
 */
export const useAccountStoreSlots = () => {
  const { profile } = useTenant();
  const role = normalizeRole(profile?.role as AnyUserRole | undefined);
  const accountId = profile?.tenant_id ?? null;
  const enabled = role === 'gerente' && !!accountId;

  const query = useQuery({
    // Primeiro segmento 'tenant' → cache estático (ver queryClient.ts). Quem
    // cria Loja invalida esta chave junto com a lista.
    queryKey: [QUERY_KEYS.TENANT, 'store-slots', accountId],
    enabled,
    queryFn: async (): Promise<AccountStoreSlots> => {
      const { data, error } = await supabase
        .from('tenants')
        .select('store_slots_included, store_slots_extra')
        .eq('id', accountId as string)
        .maybeSingle();
      if (error) throw error;

      const included = data?.store_slots_included ?? 0;
      const extra = data?.store_slots_extra ?? 0;
      return { included, extra, capacity: included + extra };
    },
  });

  return {
    included: query.data?.included ?? 0,
    extra: query.data?.extra ?? 0,
    capacity: query.data?.capacity ?? 0,
    /** True enquanto a consulta roda. Falso quando ela nem chega a rodar. */
    isLoading: enabled && query.isLoading,
    error: query.error,
  };
};
