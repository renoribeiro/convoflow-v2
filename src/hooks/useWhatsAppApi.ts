import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { adapterForInstance, providerLabel, type IWhatsAppProvider, type ProviderType } from '@/services/whatsapp';
import type { Tables } from '@/integrations/supabase/types';
import { logger } from '@/lib/logger';

export interface ActiveInstanceWithAdapter {
  row: Tables<'whatsapp_instances'>;
  adapter: IWhatsAppProvider;
  providerLabel: string;
}

/**
 * Carrega TODAS as instâncias da tenant e devolve o adapter de cada uma.
 *
 * Substitui consumos diretos de `useEvolutionApi` na aba Conversas — qualquer
 * componente que precise enviar uma mensagem deve passar por aqui para
 * respeitar o `provider` configurado em `whatsapp_instances`.
 */
export function useWhatsAppInstancesWithAdapter() {
  const { tenant } = useTenant();

  const query = useQuery({
    queryKey: ['whatsapp-instances', 'with-adapter', tenant?.id],
    enabled: !!tenant?.id,
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 30,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('tenant_id', tenant!.id);
      if (error) throw error;
      return (data ?? []) as Tables<'whatsapp_instances'>[];
    },
  });

  const items = useMemo<ActiveInstanceWithAdapter[]>(() => {
    if (!query.data) return [];
    return query.data
      .map((row) => {
        try {
          const adapter = adapterForInstance(row);
          return {
            row,
            adapter,
            providerLabel: providerLabel((row.provider as ProviderType | null) ?? 'evolution'),
          };
        } catch (e) {
          logger.warn('[useWhatsAppApi] adapter ausente para instância', {
            instanceKey: row.instance_key,
            provider: row.provider,
            error: e instanceof Error ? e.message : String(e),
          });
          return null;
        }
      })
      .filter((x): x is ActiveInstanceWithAdapter => x !== null);
  }, [query.data]);

  return {
    instances: items,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Seleciona, dentre as instâncias disponíveis, aquela que está pronta para
 * enviar — preferindo a que casar com `preferredInstanceId`. Se nenhuma
 * estiver pronta mas existir alguma cadastrada, retorna a primeira (a UI
 * deve avisar que está desconectada).
 */
export function pickActiveInstance(
  list: ActiveInstanceWithAdapter[],
  preferredInstanceId?: string | null,
): ActiveInstanceWithAdapter | null {
  if (!list.length) return null;
  if (preferredInstanceId) {
    const match = list.find((x) => x.row.id === preferredInstanceId);
    if (match) return match;
  }
  const ready = list.find((x) => x.adapter.isReadyToSend());
  return ready ?? list[0] ?? null;
}
