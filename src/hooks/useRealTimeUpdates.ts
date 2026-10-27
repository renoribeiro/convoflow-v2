import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTenant } from '@/contexts/TenantContext';

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

  // Releitura periódica do Dashboard. (Até 2026-10-26 havia também um store
  // do Evolution alimentado pelo navegador; ele nunca era preenchido e saiu
  // na sessão 3 do docs/RUNBOOK_segredos_das_instancias.md.)
  useEffect(() => {
    if (!enabled || !tenant) return;

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
  }, [enabled, tenant, interval]);

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
    if (!enabled || !tenant) return;

    intervalRef.current = setInterval(() => {
      invalidateDashboardQueries();
    }, interval);
    setIsConnected(true);
  };

  return {
    isConnected,
    isWebSocketConnected: false,
    isPolling: isConnected,
    forceUpdate,
    pause,
    resume,
  };
};
