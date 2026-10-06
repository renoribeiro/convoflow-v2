import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';

export interface WhatsAppInstance {
  id: string;
  name: string;
  instanceKey: string; // Chave da instância na Evolution API
  number: string;
  status: 'connected' | 'disconnected' | 'connecting' | 'open' | 'close' | 'qrcode';
  provider: 'evolution' | 'waha' | 'official' | null;
  lastSeen: string;
  messagesCount: number;
  evolutionApiUrl?: string;
  evolutionApiKey?: string;
}

export const useWhatsAppInstances = () => {
  const { tenant } = useTenant();

  const { data: instances = [], isLoading, error } = useQuery({
    queryKey: ['whatsapp-instances-summary', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];

      // Fetch instances with safe column selection (no last_seen — may not exist in all schemas)
      const { data: rawInstances, error: instancesError } = await supabase
        .from('whatsapp_instances')
        .select('id, name, instance_key, phone_number, status, provider, created_at, updated_at, evolution_api_url, evolution_api_key')
        .eq('tenant_id', tenant.id);

      if (instancesError) {
        console.error('Failed to fetch whatsapp_instances:', instancesError);
        throw instancesError;
      }

      if (!rawInstances || rawInstances.length === 0) return [];

      // "Mensagens hoje" por instância: contagem da Loja inteira via
      // loja_message_counts (migração 20260914000001) — só números, e o mesmo
      // número para todo mundo, inclusive para um atendente cuja visibilidade
      // de conversas foi restringida.
      const instanceIds = new Set(rawInstances.map((i: any) => i.id));
      const today = new Date().toISOString().split('T')[0] + 'T00:00:00.000Z';

      const messageCounts: Record<string, number> = {};
      try {
        const { data: rows, error: countsError } = await (supabase as any).rpc('loja_message_counts', {
          p_tenant_id: tenant.id,
          p_from: today,
          p_to: null,
          p_bucket: 'all',
          p_tz: 'UTC',
        });
        if (countsError) throw countsError;

        for (const row of (rows ?? []) as Array<{ whatsapp_instance_id: string | null; n: number | string }>) {
          const id = row.whatsapp_instance_id;
          if (!id || !instanceIds.has(id)) continue;
          messageCounts[id] = (messageCounts[id] || 0) + Number(row.n);
        }
      } catch (e) {
        // Non-critical, just means we can't show message counts
        console.warn('Failed to fetch message counts:', e);
      }

      return rawInstances.map((instance: any): WhatsAppInstance => ({
        id: instance.id,
        name: instance.name || `WhatsApp ${instance.phone_number || 'Sem número'}`,
        instanceKey: instance.instance_key,
        number: instance.phone_number || '',
        status: instance.status as WhatsAppInstance['status'],
        provider: (instance.provider as WhatsAppInstance['provider']) ?? null,
        lastSeen: instance.updated_at
          ? new Date(instance.updated_at).toLocaleString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit'
            })
          : 'Nunca',
        messagesCount: messageCounts[instance.id] || 0,
        evolutionApiUrl: instance.evolution_api_url,
        evolutionApiKey: instance.evolution_api_key,
      }));
    },
    enabled: !!tenant?.id,
    staleTime: 1000 * 30, // 30 seconds
    refetchInterval: 1000 * 30, // Refresh every 30s
  });

  return {
    instances,
    isLoading,
    error
  };
};