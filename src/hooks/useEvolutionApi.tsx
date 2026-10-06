import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { createEvolutionApiService, EvolutionApiService } from '@/services/evolutionApi';
import { EvolutionInstance, DetailedEvolutionInstance } from '@/types/evolution.types';
import { useToast } from '@/hooks/use-toast';
import { env } from '@/lib/env';
import { mensagemDaEdgeFunction } from '@/lib/edgeFunctionError';

export interface CreateInstanceOptions {
  enableWebhookAutomation?: boolean;
  retryAttempts?: number;
  retryDelay?: number;
  /** Nome legível digitado pelo usuário. Sem ele, a linha nasce com a chave técnica no lugar do nome. */
  displayName?: string;
}

interface UseEvolutionApiReturn {
  service: EvolutionApiService | null;
  instances: EvolutionInstance[];
  loading: boolean;
  error: string | null;
  createInstance: (
    name: string,
    webhookUrl?: string,
    options?: CreateInstanceOptions,
  ) => Promise<any>;
  connectInstance: (instanceName: string) => Promise<{ pairingCode: string; code: string; count: number; base64?: string }>;
  disconnectInstance: (instanceName: string) => Promise<void>;
  getQRCode: (instanceName: string) => Promise<string | null>;
  getDetailedInstanceInfo: (instanceName: string) => Promise<DetailedEvolutionInstance | null>;
  sendMessage: (instanceName: string, phone: string, message: string) => Promise<void>;
  refreshInstances: () => Promise<void>;
  refreshInstanceStatus: (instanceName: string) => Promise<string | null | undefined>;
  getWebhookStatus: (instanceName: string) => Promise<any>;
  configureWebhook: (instanceName: string, webhookUrl?: string, events?: string[]) => Promise<boolean>;
  getWebhookLogs: (instanceName: string, limit?: number) => Promise<any[]>;
  getDefaultWebhookUrl: () => string | null;
}

export const useEvolutionApi = (): UseEvolutionApiReturn => {
  const [service, setService] = useState<EvolutionApiService | null>(null);
  const [instances, setInstances] = useState<EvolutionInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    const initializeServiceWithLogs = async () => {
      console.log('🔄 [useEvolutionApi] Iniciando inicialização do serviço...');

      try {
        setLoading(true);
        setError(null);
        console.log('🔍 [useEvolutionApi] Obtendo usuário autenticado...');

        // Get current user's tenant
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          throw new Error('Usuário não autenticado');
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('tenant_id')
          .eq('user_id', user.id)
          .single();

        if (!profile) {
          throw new Error('Perfil não encontrado');
        }

        // Get tenant's Evolution API settings
        const { data: tenant } = await supabase
          .from('tenants')
          .select('settings')
          .eq('id', profile.tenant_id)
          .single();

        const settings = tenant?.settings as { evolutionApi?: { serverUrl: string; apiKey: string } } | null;

        let serverUrl = settings?.evolutionApi?.serverUrl;
        let apiKey = settings?.evolutionApi?.apiKey;

        if (!serverUrl || !apiKey) {
          // Fallback seguro apenas para variáveis de ambiente, sem hardcoded localhost inseguro
          serverUrl = env.get('EVOLUTION_API_URL');
          apiKey = env.get('EVOLUTION_API_KEY');
        }

        // Se ainda assim não tiver configuração, logamos um aviso discreto mas permitimos carregar instâncias do banco
        if (serverUrl && apiKey) {
          const evolutionService = createEvolutionApiService(serverUrl, apiKey);
          setService(evolutionService);
        } else {
          console.warn('[useEvolutionApi] API URL ou Key não configuradas. Operações de API estarão indisponíveis.');
        }

        // Load instances from SUPABASE (not API) to avoid blocking if API is down
        await loadInstances();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Erro ao inicializar Evolution API';
        console.error('Error initializing Evolution API:', errorMessage);
        setError(errorMessage);
        // Even on error, try to load instances from DB
        await loadInstances();
      } finally {
        setLoading(false);
      }
    };

    initializeServiceWithLogs();
  }, []);

  const loadInstances = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('user_id', user.id)
        .single();

      if (!profile) return;

      // Superadmin / account_manager sem tenant não têm instâncias próprias.
      // Em vez de rodar .eq('tenant_id', null) (que estoura erro no PostgREST),
      // saímos limpos com lista vazia.
      if (!profile.tenant_id) {
        setInstances([]);
        return;
      }

      const { data: dbInstances, error } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('tenant_id', profile.tenant_id);

      if (error) throw error;

      // Map DB instances to EvolutionInstance type
      const mappedInstances: EvolutionInstance[] = (dbInstances || []).map(inst => {
        const config = inst.connection_config as any || {};
        return {
          instanceName: inst.instance_key,
          status: (inst.status as 'open' | 'close' | 'connecting' | 'qrcode') || 'close',
          serverUrl: config.baseUrl || inst.evolution_api_url || '',
          apiKey: config.apiKey || inst.evolution_api_key || '',
          qrcode: inst.qr_code || undefined,
          webhookUrl: inst.webhook_url || undefined,
          profilePicUrl: inst.profile_picture_url || undefined,
          profileName: inst.profile_name || undefined,
          settings: {
            // Default settings or fetch from DB JSON if available
            rejectCall: false,
            msgCall: "",
            groupsIgnore: false,
            alwaysOnline: true,
            readMessages: true,
            readStatus: true
          },
          createdAt: new Date(inst.created_at),
          lastActivity: inst.last_connected_at ? new Date(inst.last_connected_at) : undefined
        };
      });

      setInstances(mappedInstances);
    } catch (err) {
      console.error('Error loading instances from DB:', err);
      toast({
        title: "Erro",
        description: "Falha ao carregar instâncias do WhatsApp do banco de dados",
        variant: "destructive",
      });
    }
  };

  const createInstance = async (name: string, webhookUrl?: string, options?: CreateInstanceOptions) => {
    try {
      setLoading(true);

      // A criação mora no servidor (edge function `evolution-provision`).
      //
      // O caminho antigo montava o EvolutionApiService AQUI, no navegador, com a
      // chave global do servidor Evolution. Isso não fecha num produto
      // multi-cliente: medido em 2026-09-10, a chave global enxerga as 14
      // instâncias de todos os clientes, enquanto a chave de uma instância
      // enxerga 1 e leva 401 em qualquer outra. A global agora é secret da edge
      // function; o que volta para cá é só a chave da instância criada, já
      // gravada em connection_config.
      const { data, error } = await supabase.functions.invoke('evolution-provision', {
        body: {
          instance_key: name,
          name: options?.displayName?.trim() || name,
          enableWebhookAutomation: options?.enableWebhookAutomation ?? true,
          retryAttempts: options?.retryAttempts,
          retryDelay: options?.retryDelay,
        },
      });

      // `functions.invoke` devolve a frase genérica "non-2xx status code" e
      // esconde o texto real no corpo da resposta. O helper da casa abre esse
      // corpo — sem ele o usuário volta a ver erro que não explica nada.
      if (error) {
        throw new Error(
          await mensagemDaEdgeFunction(error, 'Não foi possível criar a instância.'),
        );
      }
      if (data && data.ok === false) {
        throw new Error(data.error || 'Não foi possível criar a instância.');
      }

      await refreshInstances();
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });

      toast({
        title: 'Sucesso',
        description: data?.webhook_configured
          ? 'Instância criada com webhook configurado automaticamente!'
          : 'Instância criada. Configure o webhook para receber mensagens em tempo real.',
      });

      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao criar instância';
      console.error('❌ [useEvolutionApi] Erro ao criar instância:', err);

      toast({
        title: "Erro",
        description: errorMessage,
        variant: "destructive",
      });
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // A exclusão de instância NÃO mora mais aqui. O laço antigo (apagar
  // messages/campanhas/conversas do navegador, cada erro ignorado, e a linha
  // por último) deixava um atendente apagar 2.622 mensagens sem conseguir
  // apagar a instância — e ver "sucesso". Hoje é a RPC delete_whatsapp_instance
  // (recusa com histórico, uma transação) via edge function
  // delete-whatsapp-instance. Ver DeleteInstanceModal.

  const connectInstance = async (instanceName: string): Promise<{ pairingCode: string; code: string; count: number }> => {
    if (!service) throw new Error('Serviço Evolution API não inicializado');

    try {
      const connectionData = await service.connectInstance(instanceName);
      await refreshInstances();

      toast({
        title: "Conectando",
        description: "Iniciando conexão da instância...",
      });

      return connectionData;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao conectar instância';
      toast({
        title: "Erro",
        description: errorMessage,
        variant: "destructive",
      });
      throw err;
    }
  };

  const disconnectInstance = async (instanceName: string) => {
    if (!service) throw new Error('Serviço Evolution API não inicializado');

    try {
      await service.disconnectInstance(instanceName);
      await refreshInstances();

      toast({
        title: "Sucesso",
        description: "Instância desconectada",
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao desconectar instância';
      toast({
        title: "Erro",
        description: errorMessage,
        variant: "destructive",
      });
      throw err;
    }
  };

  const getQRCode = async (instanceName: string): Promise<string | null> => {
    // Return DB cached QR first if available, else try API
    const instance = instances.find(i => i.instanceName === instanceName);
    if (instance?.qrcode) return instance.qrcode;

    if (!service) return null;

    try {
      const result = await service.getQRCode(instanceName);
      return result.qrcode;
    } catch (err) {
      console.error('Error getting QR code:', err);
      return null;
    }
  };

  const getDetailedInstanceInfo = async (instanceName: string): Promise<DetailedEvolutionInstance | null> => {
    if (!service) throw new Error('Serviço Evolution API não inicializado');

    try {
      const result = await service.getDetailedInstanceInfo(instanceName);
      return result;
    } catch (err) {
      console.error('Error getting detailed instance info:', err);
      return null;
    }
  };

  const sendMessage = async (instanceName: string, phone: string, message: string) => {
    if (!service) throw new Error('Serviço Evolution API não inicializado');

    try {
      await service.sendMessage(instanceName, phone, message);

      toast({
        title: "Sucesso",
        description: "Mensagem enviada",
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao enviar mensagem';
      toast({
        title: "Erro",
        description: errorMessage,
        variant: "destructive",
      });
      throw err;
    }
  };

  const refreshInstances = async () => {
    await loadInstances();
  };

  // Webhook monitoring methods
  const getWebhookStatus = async (instanceName: string) => {
    try {
      if (!service) throw new Error('Serviço Evolution API não inicializado');

      const webhookConfig = await service.getWebhookConfig(instanceName);

      return {
        configured: !!webhookConfig?.url,
        url: webhookConfig?.url || null,
        events: webhookConfig?.events || [],
        lastUpdate: null
      };
    } catch (error) {
      console.error('❌ [useEvolutionApi] Erro ao verificar status do webhook:', error);
      return {
        configured: false,
        url: null,
        events: [],
        lastUpdate: null,
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  };

  const configureWebhook = async (instanceName: string, webhookUrl?: string, events?: string[]) => {
    try {
      if (!service) throw new Error('Serviço Evolution API não inicializado');

      const defaultEvents = [
        'QRCODE_UPDATED', 'CONNECTION_UPDATE', 'MESSAGES_UPSERT', 'MESSAGES_UPDATE',
        'MESSAGES_DELETE', 'SEND_MESSAGE', 'CONTACTS_UPSERT', 'CONTACTS_UPDATE',
        'CHATS_UPSERT', 'CHATS_UPDATE', 'CHATS_DELETE', 'GROUPS_UPSERT',
        'GROUPS_UPDATE', 'GROUP_PARTICIPANTS_UPDATE', 'PRESENCE_UPDATE'
      ];
      const webhookEvents = events || defaultEvents;

      const finalWebhookUrl = webhookUrl || await getDefaultWebhookUrl();

      if (!finalWebhookUrl) {
        throw new Error('URL do webhook não fornecida e URL padrão não disponível');
      }

      await service.setWebhook(instanceName, finalWebhookUrl, webhookEvents);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('user_id', user.id)
        .single();

      await supabase
        .from('whatsapp_instances')
        .update({
          webhook_url: finalWebhookUrl,
          webhook_configured: true,
          webhook_events: webhookEvents,
          updated_at: new Date().toISOString()
        })
        .eq('instance_key', instanceName)
        .eq('tenant_id', profile!.tenant_id);

      await refreshInstances();

      toast({
        title: "Sucesso",
        description: "Webhook configurado com sucesso",
      });

      return true;
    } catch (error) {
      console.error('❌ [useEvolutionApi] Erro ao configurar webhook:', error);
      toast({
        title: "Erro",
        description: `Erro ao configurar webhook: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
        variant: "destructive",
      });
      return false;
    }
  };

  const getDefaultWebhookUrl = (): string | null => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (supabaseUrl) {
        return `${supabaseUrl}/functions/v1/evolution-webhook`;
      }
      return null;
    } catch (error) {
      console.warn('Failed to get default webhook URL:', error);
      return null;
    }
  };

  const getWebhookLogs = async (instanceName: string, limit: number = 50) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single();

      const { data, error } = await supabase
        .from('webhook_logs')
        .select('*')
        .eq('instance_name', instanceName)
        // webhook_logs não tem tenant_id — o filtro por Conta é feito pela RLS
        // (webhook_logs_tenant_isolation, via whatsapp_instance_id).
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('❌ [useEvolutionApi] Erro ao buscar logs do webhook:', error);
      return [];
    }
  };

  return {
    service,
    instances,
    loading,
    error,
    createInstance,
    connectInstance,
    disconnectInstance,
    getQRCode,
    getDetailedInstanceInfo,
    sendMessage,
    refreshInstances,
    refreshInstanceStatus: async (instanceName: string) => {
      if (!service) return null;
      try {
        const { instance } = await service.getInstanceStatus(instanceName);
        return instance?.state;
      } catch (error) {
        console.error('Error refreshing instance status:', error);
        return null;
      }
    },
    getWebhookStatus,
    configureWebhook,
    getWebhookLogs,
    getDefaultWebhookUrl,
  };
};
