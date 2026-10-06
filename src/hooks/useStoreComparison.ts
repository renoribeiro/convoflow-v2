import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { QUERY_KEYS } from '@/lib/queryClient';
import { useMyStores } from '@/hooks/useMyStores';

export interface StoreMetrics {
  id: string;
  name: string;
  contacts: number;
  conversations: number;
  messages: number;
}

type CountableTable = 'contacts' | 'conversations' | 'messages';

const countFor = async (table: CountableTable, tenantId: string): Promise<number> => {
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);
  if (error) throw error;
  return count ?? 0;
};

/**
 * Métricas comparativas das lojas do Gerente (contatos, conversas, mensagens
 * por loja). RLS já libera o gerente a ler os dados das próprias lojas. Faz uma
 * contagem por loja — o nº de lojas é pequeno (5 + extras).
 */
export const useStoreComparison = () => {
  const { stores, isLoading: storesLoading } = useMyStores();
  const ids = stores.map((s) => s.id);

  const query = useQuery({
    queryKey: [QUERY_KEYS.TENANT, 'store-comparison', ids],
    enabled: ids.length > 0,
    queryFn: async (): Promise<StoreMetrics[]> =>
      Promise.all(
        stores.map(async (s) => {
          const [contacts, conversations, messages] = await Promise.all([
            countFor('contacts', s.id),
            countFor('conversations', s.id),
            countFor('messages', s.id),
          ]);
          return { id: s.id, name: s.name, contacts, conversations, messages };
        }),
      ),
  });

  return {
    metrics: query.data ?? [],
    isLoading: storesLoading || query.isLoading,
    error: query.error,
  };
};
