import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useTenant } from '@/contexts/TenantContext';
import type { Chatbot, ChatbotSettings } from '@/types/chatbot.types';
import { logger } from '@/lib/logger';

// Transform database chatbot to frontend format
const transformChatbot = (dbChatbot: any): Chatbot => {
  return {
    id: dbChatbot.id,
    name: dbChatbot.name,
    description: dbChatbot.description || '',
    type: 'keyword', // Default type, can be extended
    isActive: dbChatbot.is_active,
    triggers: {
      keywords: dbChatbot.trigger_phrases || [],
      conditions: dbChatbot.conditions || {}
    },
    responses: {
      messages: [{
        type: dbChatbot.response_type || 'text',
        content: dbChatbot.response_message,
        mediaUrl: dbChatbot.media_url
      }]
    },
    flow: {
      steps: [],
      conditions: []
    },
    whatsappInstanceId: dbChatbot.whatsapp_instance_id,
    createdAt: new Date(dbChatbot.created_at),
    updatedAt: new Date(dbChatbot.updated_at),
    version: 1,
    analytics: {
      totalInteractions: 0,
      successRate: 0,
      averageResponseTime: 0,
      lastInteraction: null
    }
  };
};

// Transform frontend chatbot to database format
const transformToDatabase = (chatbot: Partial<Chatbot>) => {
  return {
    name: chatbot.name,
    description: chatbot.description,
    trigger_type: 'keyword',
    trigger_phrases: chatbot.triggers?.keywords || [],
    response_message: chatbot.responses?.messages?.[0]?.content || '',
    response_type: chatbot.responses?.messages?.[0]?.type || 'text',
    media_url: chatbot.responses?.messages?.[0]?.mediaUrl,
    variables: {},
    conditions: chatbot.triggers?.conditions || {},
    is_active: chatbot.isActive ?? true,
    priority: 0,
    whatsapp_instance_id: chatbot.whatsappInstanceId
  };
};

export const useChatbots = () => {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Query to fetch all chatbots
  const {
    data: chatbots = [],
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['chatbots', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) {
        throw new Error('Tenant ID is required');
      }

      const { data, error } = await supabase
        .from('chatbots')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Error fetching chatbots:', error);
        throw error;
      }

      return data.map(transformChatbot);
    },
    enabled: !!tenant?.id
  });

  // Mutation to create a new chatbot
  const createChatbot = useMutation({
    mutationFn: async (chatbotData: Partial<Chatbot>) => {
      if (!tenant?.id) {
        throw new Error('Tenant ID is required');
      }

      const dbData = {
        ...transformToDatabase(chatbotData),
        tenant_id: tenant.id
      };

      const { data, error } = await supabase
        .from('chatbots')
        .insert(dbData)
        .select()
        .single();

      if (error) {
        logger.error('Error creating chatbot:', error);
        throw error;
      }

      return transformChatbot(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatbots'] });
      toast({
        title: 'Sucesso',
        description: 'Chatbot criado com sucesso!'
      });
    },
    onError: (error) => {
      logger.error('Failed to create chatbot:', error);
      toast({
        title: 'Erro',
        description: 'Falha ao criar chatbot. Tente novamente.',
        variant: 'destructive'
      });
    }
  });

  // Mutation to update a chatbot
  const updateChatbot = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Chatbot> & { id: string }) => {
      const dbData = transformToDatabase(updates);

      const { data, error } = await supabase
        .from('chatbots')
        .update(dbData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('Error updating chatbot:', error);
        throw error;
      }

      return transformChatbot(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatbots'] });
      toast({
        title: 'Sucesso',
        description: 'Chatbot atualizado com sucesso!'
      });
    },
    onError: (error) => {
      logger.error('Failed to update chatbot:', error);
      toast({
        title: 'Erro',
        description: 'Falha ao atualizar chatbot. Tente novamente.',
        variant: 'destructive'
      });
    }
  });

  // Mutation to delete a chatbot
  const deleteChatbot = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('chatbots')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('Error deleting chatbot:', error);
        throw error;
      }

      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatbots'] });
      toast({
        title: 'Sucesso',
        description: 'Chatbot excluído com sucesso!'
      });
    },
    onError: (error) => {
      logger.error('Failed to delete chatbot:', error);
      toast({
        title: 'Erro',
        description: 'Falha ao excluir chatbot. Tente novamente.',
        variant: 'destructive'
      });
    }
  });

  // Mutation to toggle chatbot status
  const toggleChatbotStatus = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { data, error } = await supabase
        .from('chatbots')
        .update({ is_active: isActive })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('Error toggling chatbot status:', error);
        throw error;
      }

      return transformChatbot(data);
    },
    onSuccess: (_, { isActive }) => {
      queryClient.invalidateQueries({ queryKey: ['chatbots'] });
      toast({
        title: 'Sucesso',
        description: `Chatbot ${isActive ? 'ativado' : 'desativado'} com sucesso!`
      });
    },
    onError: (error) => {
      logger.error('Failed to toggle chatbot status:', error);
      toast({
        title: 'Erro',
        description: 'Falha ao alterar status do chatbot. Tente novamente.',
        variant: 'destructive'
      });
    }
  });

  // Mutation to duplicate a chatbot
  const duplicateChatbot = useMutation({
    mutationFn: async (originalChatbot: Chatbot) => {
      if (!tenant?.id) {
        throw new Error('Tenant ID is required');
      }

      const duplicatedData = {
        ...transformToDatabase(originalChatbot),
        name: `${originalChatbot.name} (Cópia)`,
        tenant_id: tenant.id,
        is_active: false // Start duplicated chatbot as inactive
      };

      const { data, error } = await supabase
        .from('chatbots')
        .insert(duplicatedData)
        .select()
        .single();

      if (error) {
        logger.error('Error duplicating chatbot:', error);
        throw error;
      }

      return transformChatbot(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatbots'] });
      toast({
        title: 'Sucesso',
        description: 'Chatbot duplicado com sucesso!'
      });
    },
    onError: (error) => {
      logger.error('Failed to duplicate chatbot:', error);
      toast({
        title: 'Erro',
        description: 'Falha ao duplicar chatbot. Tente novamente.',
        variant: 'destructive'
      });
    }
  });

  return {
    chatbots,
    isLoading,
    error,
    refetch,
    createChatbot: createChatbot.mutate,
    updateChatbot: updateChatbot.mutate,
    deleteChatbot: deleteChatbot.mutate,
    toggleChatbotStatus: toggleChatbotStatus.mutate,
    duplicateChatbot: duplicateChatbot.mutate,
    isCreating: createChatbot.isPending,
    isUpdating: updateChatbot.isPending,
    isDeleting: deleteChatbot.isPending,
    isToggling: toggleChatbotStatus.isPending,
    isDuplicating: duplicateChatbot.isPending
  };
};

// Hook for chatbot analytics
export const useChatbotAnalytics = (chatbotId: string) => {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ['chatbot-analytics', chatbotId, tenant?.id],
    queryFn: async () => {
      if (!tenant?.id || !chatbotId) {
        throw new Error('Tenant ID and Chatbot ID are required');
      }

      // Contagem e último instante das mensagens de bot da Loja inteira
      // (loja_message_counts, migração 20260914000001): só números, e os mesmos
      // para todo mundo — inclusive atendente com visibilidade restringida.
      // Antes vinha das 100 mensagens de bot mais recentes de `messages`, que
      // (a) travava o total em 100 e (b) passaria a variar por pessoa.
      const { data: rows, error } = await (supabase as any).rpc('loja_message_counts', {
        p_tenant_id: tenant.id,
        p_from: null,
        p_to: null,
        p_bucket: 'all',
        p_tz: 'UTC',
      });

      if (error) {
        logger.error('Error fetching chatbot analytics:', error);
        throw error;
      }

      const botRows = ((rows ?? []) as Array<{ is_from_bot: boolean; n: number | string; last_at: string | null }>)
        .filter((r) => r.is_from_bot);
      const totalInteractions = botRows.reduce((acc, r) => acc + Number(r.n), 0);
      const lastAt = botRows
        .map((r) => (r.last_at ? new Date(r.last_at).getTime() : 0))
        .reduce((a, b) => Math.max(a, b), 0);
      const lastInteraction = lastAt > 0 ? new Date(lastAt) : null;

      return {
        totalInteractions,
        successRate: totalInteractions > 0 ? 85 : 0, // Mock success rate
        averageResponseTime: 1.2, // Mock response time in seconds
        lastInteraction
      };
    },
    enabled: !!tenant?.id && !!chatbotId
  });
};

// Hook for chatbot settings
export const useChatbotSettings = () => {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    data: settings,
    isLoading,
    error
  } = useQuery({
    queryKey: ['chatbot-settings', tenant?.id],
    queryFn: async (): Promise<ChatbotSettings> => {
      if (!tenant?.id) {
        throw new Error('Tenant ID is required');
      }

      // Get settings from tenant table
      const { data, error } = await supabase
        .from('tenants')
        .select('settings')
        .eq('id', tenant.id)
        .single();

      if (error) {
        logger.error('Error fetching chatbot settings:', error);
        throw error;
      }

      const tenantSettings = (data.settings as any) || {};
      const chatbotSettings = tenantSettings.chatbot || {};

      return {
        autoResponse: chatbotSettings.autoResponse ?? true,
        responseDelay: chatbotSettings.responseDelay ?? 1000,
        maxInteractionsPerDay: chatbotSettings.maxInteractionsPerDay ?? 100,
        enableAnalytics: chatbotSettings.enableAnalytics ?? true,
        fallbackMessage: chatbotSettings.fallbackMessage ?? 'Desculpe, não entendi sua mensagem. Pode reformular?'
      };
    },
    enabled: !!tenant?.id
  });

  const updateSettings = useMutation({
    mutationFn: async (newSettings: Partial<ChatbotSettings>) => {
      if (!tenant?.id) {
        throw new Error('Tenant ID is required');
      }

      // Get current settings
      const { data: currentData, error: fetchError } = await supabase
        .from('tenants')
        .select('settings')
        .eq('id', tenant.id)
        .single();

      if (fetchError) {
        logger.error('Error fetching current settings:', fetchError);
        throw fetchError;
      }

      const currentSettings = (currentData.settings as any) || {};
      const updatedSettings = {
        ...currentSettings,
        chatbot: {
          ...currentSettings.chatbot,
          ...newSettings
        }
      };

      const { error } = await supabase
        .from('tenants')
        .update({ settings: updatedSettings })
        .eq('id', tenant.id);

      if (error) {
        logger.error('Error updating chatbot settings:', error);
        throw error;
      }

      return updatedSettings.chatbot;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatbot-settings'] });
      toast({
        title: 'Sucesso',
        description: 'Configurações atualizadas com sucesso!'
      });
    },
    onError: (error) => {
      logger.error('Failed to update chatbot settings:', error);
      toast({
        title: 'Erro',
        description: 'Falha ao atualizar configurações. Tente novamente.',
        variant: 'destructive'
      });
    }
  });

  return {
    settings: settings || {
      autoResponse: true,
      responseDelay: 1000,
      maxInteractionsPerDay: 100,
      enableAnalytics: true,
      fallbackMessage: 'Desculpe, não entendi sua mensagem. Pode reformular?'
    },
    isLoading,
    error,
    updateSettings: updateSettings.mutate,
    isUpdating: updateSettings.isPending
  };
};