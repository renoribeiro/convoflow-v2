import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { adapterForInstance, providerLabel, type IWhatsAppProvider, type ProviderType } from '@/services/whatsapp';
import { ServerKeyPendingAdapter } from '@/services/whatsapp/serverKeyPending.adapter';
import type { Tables } from '@/integrations/supabase/types';
import { logger } from '@/lib/logger';
import {
  SAFE_INSTANCE_SELECT,
  rebuildSafeInstanceRow,
  type SafeInstanceRow,
} from '@/lib/whatsapp/safeInstanceColumns';

export interface ActiveInstanceWithAdapter {
  row: Tables<'whatsapp_instances'>;
  adapter: IWhatsAppProvider;
  providerLabel: string;
}

/** Instância para LISTAR (seletor, filtro de canal): sem adapter e sem segredo. */
export interface InstanceListItem {
  row: SafeInstanceRow;
  providerLabel: string;
}

/**
 * As instâncias da Loja só com as colunas seguras (`SAFE_INSTANCE_SELECT`).
 *
 * Para quem só mostra ou filtra: lista de conversas, Contatos, vínculo de
 * contato. Quem ENVIA continua em `useWhatsAppInstancesWithAdapter` até o envio
 * de Evolution e WAHA ir para o servidor (sessão 2 do
 * docs/RUNBOOK_segredos_das_instancias.md).
 */
export function useWhatsAppInstancesSafe() {
  const { tenant } = useTenant();

  const query = useQuery({
    queryKey: ['whatsapp-instances', 'safe', tenant?.id],
    enabled: !!tenant?.id,
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 30,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select(SAFE_INSTANCE_SELECT)
        .eq('tenant_id', tenant!.id);
      if (error) throw error;
      return ((data ?? []) as unknown as Record<string, unknown>[]).map(rebuildSafeInstanceRow);
    },
  });

  const items = useMemo<InstanceListItem[]>(
    () =>
      (query.data ?? []).map((row) => ({
        row,
        providerLabel: providerLabel((row.provider as ProviderType | null) ?? 'evolution'),
      })),
    [query.data],
  );

  return {
    instances: items,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * O item da lista para uma linha: adapter do provider, ou o de espera para
 * Evolution/WAHA sem chave no navegador, ou null (instância que não monta).
 */
export function instanceWithAdapter(row: Tables<'whatsapp_instances'>): ActiveInstanceWithAdapter | null {
  try {
    const adapter = adapterForInstance(row);
    return {
      row,
      adapter,
      providerLabel: providerLabel((row.provider as ProviderType | null) ?? 'evolution'),
    };
  } catch (e) {
    const provider = ((row.provider as ProviderType | null) ?? 'evolution') as ProviderType;
    // Evolution/WAHA sem chave no navegador: a chave mora no servidor
    // desde 2026-10-26. A instância FICA na lista, não pronta, para a
    // conversa dela não cair noutro número (pickActiveInstance).
    if (provider === 'evolution' || provider === 'waha') {
      return {
        row,
        adapter: new ServerKeyPendingAdapter({
          id: row.id,
          tenantId: row.tenant_id,
          name: row.name,
          instanceKey: row.instance_key,
          provider,
          status: row.status ?? 'disconnected',
          phoneNumber: row.phone_number,
          profileName: row.profile_name,
          profilePictureUrl: row.profile_picture_url,
          connectionConfig: {},
        }),
        providerLabel: providerLabel(provider),
      };
    }
    logger.warn('[useWhatsAppApi] adapter ausente para instância', {
      instanceKey: row.instance_key,
      provider: row.provider,
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
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
      .map(instanceWithAdapter)
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
