/**
 * useChatHistorySync
 * 
 * Simplified React hook for WhatsApp message synchronization.
 * 
 * Strategy: Webhook-first approach
 * - New messages arrive via webhook (evolution-webhook Edge Function)
 * - Supabase Realtime pushes them to the UI instantly
 * - NO massive sync on connect — this avoids overloading the database
 * - Only provides a lightweight manual sync for individual conversations
 *   (on-demand, when the user opens a chat that might have gaps)
 */

import { useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTenant } from '@/contexts/TenantContext';
import { useWhatsAppInstances } from './useWhatsAppInstances';
import { useEvolutionApi } from './useEvolutionApi';
import { syncSingleChat, syncChatHistory } from '@/services/chatHistorySyncService';

interface UseChatHistorySyncReturn {
  /** Whether a sync is currently in progress */
  isSyncing: boolean;
  /** Sync a single conversation on-demand */
  syncConversation: (contactPhone: string, contactId: string) => Promise<{ newMessages: number }>;
  /**
   * Manually sync all recent chats. Aceita `targetInstanceId` opcional para
   * sincronizar uma instância específica (a selecionada na UI). Quando omitido,
   * usa a primeira Evolution conectada.
   */
  syncAllChats: (targetInstanceId?: string | null) => Promise<void>;
}

export const useChatHistorySync = (): UseChatHistorySyncReturn => {
  const { tenant } = useTenant();
  const { instances } = useWhatsAppInstances();
  const { service } = useEvolutionApi();
  const queryClient = useQueryClient();

  const [isSyncing, setIsSyncing] = useState(false);

  // Sync histórico só roda em provider Evolution (service é EvolutionApiService).
  // Pra Meta/WAHA a sincronização vem via webhook do próprio provedor — não há
  // endpoint REST de histórico equivalente.
  const evolutionInstances = (instances || []).filter(i => (i.provider ?? 'evolution') === 'evolution');
  const activeInstance =
    evolutionInstances.find(i => i.status === 'connected' || i.status === 'open') ||
    evolutionInstances[0];
  const instanceName = activeInstance?.instanceKey || '';
  const instanceId = activeInstance?.id || '';

  /**
   * On-demand sync for a single conversation (when the user opens a chat).
   * This is a lightweight operation that only fetches the latest messages
   * for one specific chat, filling any gaps the webhook might have missed.
   */
  const syncConversation = useCallback(async (
    contactPhone: string,
    contactId: string
  ): Promise<{ newMessages: number }> => {
    if (!service || !tenant?.id || !instanceName || !instanceId) {
      return { newMessages: 0 };
    }

    setIsSyncing(true);

    try {
      const result = await syncSingleChat(
        service,
        instanceName,
        tenant.id,
        instanceId,
        contactPhone,
        contactId
      );

      if (result.newMessages > 0) {
        // Invalidate messages query for this contact
        queryClient.invalidateQueries({ queryKey: ['messages', contactId] });
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      }

      return { newMessages: result.newMessages };
    } catch (err) {
      console.warn('Single conversation sync failed:', err);
      return { newMessages: 0 };
    } finally {
      setIsSyncing(false);
    }
  }, [service, tenant?.id, instanceName, instanceId, queryClient]);

  /**
   * Manual sync for all recent chats.
   * Restored to allow users to pull history for newly connected instances
   * without relying on automatic mass-syncs.
   */
  const syncAllChats = useCallback(async (targetInstanceId?: string | null) => {
    if (!service || !tenant?.id || isSyncing) {
      console.warn('[syncAllChats] Pré-requisitos faltando', {
        hasService: !!service,
        hasTenant: !!tenant?.id,
        isSyncing,
      });
      return;
    }

    // Resolver instância alvo: usa a passada (selecionada na UI) ou cai pra
    // primeira Evolution conectada. Pra ser Evolution-only — Meta/WAHA não
    // expõem histórico via REST e tem seu próprio caminho.
    const target = targetInstanceId
      ? evolutionInstances.find(i => i.id === targetInstanceId)
      : activeInstance;

    if (!target) {
      console.warn('[syncAllChats] Nenhuma instância Evolution disponível pra sincronizar', {
        targetInstanceId,
        evolutionInstances: evolutionInstances.map(i => ({ id: i.id, name: i.name, status: i.status })),
      });
      return;
    }

    setIsSyncing(true);
    try {
      console.log('[syncAllChats] Iniciando sync', {
        instanceName: target.instanceKey,
        instanceId: target.id,
      });
      const result = await syncChatHistory(
        service,
        target.instanceKey,
        tenant.id,
        target.id
      );

      console.log('[syncAllChats] Resultado:', result);

      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
        queryClient.invalidateQueries({ queryKey: ['recent-conversations'] });
      }
    } catch (err) {
      console.error('Manual sync failed:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [service, tenant?.id, isSyncing, queryClient, evolutionInstances, activeInstance]);

  return {
    isSyncing,
    syncConversation,
    syncAllChats,
  };
};
