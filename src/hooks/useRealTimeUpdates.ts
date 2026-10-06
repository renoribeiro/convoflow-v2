import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTenant } from '@/contexts/TenantContext';
import { useEvolutionStore } from '@/stores/evolutionStore';

interface RealTimeUpdateOptions {
  enabled?: boolean;
  interval?: number; // Intervalo em ms para polling (fallback)
  tables?: string[]; // Tabelas para monitorar
}

export const useRealTimeUpdates = (options: RealTimeUpdateOptions = {}) => {
  const {
    enabled = true,
    interval = 30000, // 30 segundos por padrão
    tables = ['messages', 'contacts', 'mass_message_campaigns', 'chatbots', 'whatsapp_instances'],
  } = options;

  const queryClient = useQueryClient();
  const { tenant } = useTenant();
  const [isConnected, setIsConnected] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Usar Evolution Store para monitorar mudanças
  const { instances, messages, contacts, chats } = useEvolutionStore();
  const [lastUpdateTime, setLastUpdateTime] = useState(Date.now());

  // Função para invalidar queries relacionadas ao dashboard
  const invalidateDashboardQueries = () => {
    if (!tenant) return;

    // Métricas / gráficos / atividade do dashboard
    queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-charts'] });
    // Números da Loja inteira (loja_* RPCs, migração 20260914000001)
    queryClient.invalidateQueries({ queryKey: ['loja-stats'] });
    // Por pessoa (loja_attendant_metrics, migração 20260921000002)
    queryClient.invalidateQueries({ queryKey: ['attendant-metrics'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-attention'] });
    queryClient.invalidateQueries({ queryKey: ['recent-activity'] });
    queryClient.invalidateQueries({ queryKey: ['recent-messages'] });
    queryClient.invalidateQueries({ queryKey: ['recent-contacts'] });
    queryClient.invalidateQueries({ queryKey: ['recent-conversations'] });
    queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });
    queryClient.invalidateQueries({ queryKey: ['whatsapp-instances-summary'] });

    // Contadores (todos — cobre conversations/contacts/messages/automation_flows…)
    queryClient.invalidateQueries({ queryKey: ['count'] });
  };

  // Monitorar mudanças no Evolution Store
  useEffect(() => {
    const currentTime = Date.now();
    if (currentTime - lastUpdateTime > 1000) {
      // Throttle para evitar muitas atualizações
      invalidateDashboardQueries();
      setLastUpdateTime(currentTime);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instances, messages, contacts, chats]);

  // Fallback para polling se WebSocket não estiver disponível
  useEffect(() => {
    if (!enabled || !tenant) return;

    // Se há dados no Evolution Store, considerar conectado via realtime
    if (instances.length > 0) {
      setIsConnected(true);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Usar polling como fallback
    intervalRef.current = setInterval(() => {
      invalidateDashboardQueries();
    }, interval);

    setIsConnected(true);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, tenant, instances.length, interval]);

  // Função manual para forçar atualização
  const forceUpdate = () => {
    invalidateDashboardQueries();
  };

  // Função para pausar/retomar atualizações
  const pause = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsConnected(false);
  };

  const resume = () => {
    if (!enabled || !tenant || instances.length > 0) return;

    intervalRef.current = setInterval(() => {
      invalidateDashboardQueries();
    }, interval);
    setIsConnected(true);
  };

  return {
    isConnected: instances.length > 0 || isConnected,
    isWebSocketConnected: instances.length > 0,
    isPolling: instances.length === 0 && isConnected,
    forceUpdate,
    pause,
    resume,
  };
};
