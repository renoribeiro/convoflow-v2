import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { QUERY_KEYS } from '@/lib/queryClient';

export interface RenamedStore {
  id: string;
  name: string;
  /** false quando o nome digitado já era o atual: nada foi gravado. */
  changed: boolean;
}

const FALHA_GENERICA = 'Não foi possível renomear a loja. Tente novamente.';

/**
 * Renomeia uma Loja. Só o nome: slug, Conta e cobrança não mudam.
 *
 * Vai pela RPC `rename_store` (migração 20261009000002) porque `public.tenants`
 * não tem policy de UPDATE para gerente/gestor — um UPDATE direto do navegador
 * seria filtrado em silêncio. A RPC confere quem pode e as regras do nome, e
 * devolve a mensagem em pt-BR quando recusa.
 *
 * Depois de gravar:
 *  - invalida a lista de Lojas (faixa estática do cache, 30 minutos: sem isso o
 *    nome antigo ficaria na lista e no seletor por até meia hora). O prefixo
 *    pega a lista de qualquer Conta — a do gerente e a que o superadmin abriu;
 *  - se a Loja renomeada é a que está aberta, relê a linha dela, para o nome
 *    no topo da tela trocar na hora.
 */
export function useRenameStore() {
  const queryClient = useQueryClient();
  const { tenant, refreshTenant } = useTenant();

  return useMutation({
    mutationFn: async ({ storeId, name }: { storeId: string; name: string }): Promise<RenamedStore> => {
      // Cast local: função nova, fora dos tipos gerados.
      const { data, error } = await (supabase as any).rpc('rename_store', {
        p_store_id: storeId,
        p_name: name,
      });

      if (error) {
        // PGRST* é erro do PostgREST (função ausente, rede, cache de schema),
        // em inglês e sem nada que a pessoa possa fazer. O resto é a recusa
        // da própria função, já escrita para o usuário.
        const code = typeof error.code === 'string' ? error.code : '';
        const mensagem = typeof error.message === 'string' ? error.message : '';
        throw new Error(!mensagem || code.startsWith('PGRST') ? FALHA_GENERICA : mensagem);
      }

      const store = data as Partial<RenamedStore> | null;
      if (!store?.id || typeof store.name !== 'string') {
        throw new Error(FALHA_GENERICA);
      }
      return { id: store.id, name: store.name, changed: store.changed !== false };
    },
    onSuccess: async (store) => {
      await queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TENANT, 'my-stores'] });
      if (store.changed && store.id === tenant?.id) {
        await refreshTenant({ silent: true });
      }
    },
  });
}
