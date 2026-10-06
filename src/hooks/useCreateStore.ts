import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { QUERY_KEYS } from '@/lib/queryClient';
import { mensagemDaEdgeFunction } from '@/lib/edgeFunctionError';

export interface CreatedStore {
  id: string;
  name: string;
  slug: string;
}

/**
 * Cria uma Loja na Conta do gerente logado.
 *
 * O INSERT acontece na edge function `create-store` porque `public.tenants` não
 * tem policy de INSERT para gerente — do navegador a escrita é sempre negada.
 *
 * Depois de criar, invalida as duas consultas que mostram Loja. As duas ficam
 * na faixa estática do cache (30 minutos, ver queryClient.ts): sem invalidar, a
 * Loja recém-criada só apareceria na próxima meia hora.
 */
export function useCreateStore() {
  const queryClient = useQueryClient();
  const { profile } = useTenant();
  const accountId = profile?.tenant_id ?? null;

  return useMutation({
    mutationFn: async (name: string): Promise<CreatedStore> => {
      const { data, error } = await supabase.functions.invoke('create-store', {
        body: { name },
      });

      if (error) {
        throw new Error(
          await mensagemDaEdgeFunction(
            error,
            'Não foi possível criar a loja. Tente novamente.',
          ),
        );
      }

      // Resposta 200 carregando erro no corpo (padrão de algumas funções).
      if (data && typeof data === 'object' && 'error' in data) {
        const payload = (data as { error: { message?: string } | string }).error;
        throw new Error(
          typeof payload === 'string'
            ? payload
            : payload?.message ?? 'Não foi possível criar a loja.',
        );
      }

      const store = (data as { store?: CreatedStore } | null)?.store;
      if (!store?.id) {
        throw new Error('A loja foi criada, mas o servidor não devolveu os dados dela.');
      }
      return store;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.TENANT, 'my-stores', accountId],
      });
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.TENANT, 'store-slots', accountId],
      });
    },
  });
}
