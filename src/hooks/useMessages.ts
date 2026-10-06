import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useTenant } from '@/contexts/TenantContext';

interface Message {
  id: string;
  content: string;
  created_at: string;
  direction: 'inbound' | 'outbound';
  status: 'sent' | 'delivered' | 'read' | 'failed';
  message_type: 'text' | 'image' | 'audio' | 'video' | 'document';
  media_url?: string;
  contact_id: string;
  tenant_id: string;
  whatsapp_instance_id?: string;
  /** ID da mensagem no provider (wamid.* na Meta) — necessário para o webhook
   *  correlacionar os updates de status (delivered/read) e avançar os ticks. */
  evolution_message_id?: string | null;
  is_from_bot: boolean;
  source: string | null;
  campaign_id: string | null;
  /**
   * Quem enviou (profiles.id), preenchido SÓ pelo banco (trigger
   * trg_set_message_sender, migração 20260921000004) a partir da sessão de
   * quem inseriu; o que o cliente mandar é sobrescrito. NULL em bot, campanha,
   * follow-up, webhook, histórico importado e em tudo anterior a 2026-09-21.
   */
  sender_profile_id?: string | null;
  /** CTWA ad referral (Meta) on the first inbound message from a Click-to-WhatsApp ad. */
  ad_referral?: Record<string, unknown> | null;
}

interface MessagesPage {
  data: Message[];
  nextCursor?: string;
  hasMore: boolean;
}

interface UseMessagesOptions {
  contactId: string;
  pageSize?: number;
  enabled?: boolean;
}

// Hook para buscar mensagens com paginação infinita
export const useMessages = ({ contactId, pageSize = 50, enabled = true }: UseMessagesOptions) => {
  const { tenant } = useTenant();

  return useInfiniteQuery({
    queryKey: ['messages', contactId, tenant?.id],
    queryFn: async ({ pageParam = null }) => {
      if (!tenant?.id || !contactId) {
        throw new Error('Tenant ID and Contact ID are required');
      }

      let query = supabase
        .from('messages')
        .select(`
          id,
          content,
          created_at,
          direction,
          status,
          message_type,
          media_url,
          contact_id,
          tenant_id,
          whatsapp_instance_id,
          is_from_bot,
          source,
          campaign_id,
          ad_referral
        `)
        .eq('tenant_id', tenant.id)
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(pageSize);

      // Aplicar cursor para paginação
      if (pageParam) {
        query = query.lt('created_at', pageParam);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      const messages = data || [];
      const hasMore = messages.length === pageSize;
      const nextCursor = hasMore && messages.length > 0 
        ? messages[messages.length - 1].created_at 
        : undefined;

      return {
        data: messages.reverse(), // Reverter para ordem cronológica
        nextCursor,
        hasMore
      } as MessagesPage;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: enabled && !!tenant?.id && !!contactId,
    staleTime: 1000 * 30, // 30 segundos
    gcTime: 1000 * 60 * 30, // 30 minutos
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchInterval: 1000 * 10, // Polling a cada 10s como fallback do Realtime
    initialPageParam: null
  });
};

// Hook para buscar mensagens recentes (sem paginação)
export const useRecentMessages = (contactId: string, limit: number = 20) => {
  const { tenant } = useTenant();

  return useInfiniteQuery({
    queryKey: ['recent-messages', contactId, tenant?.id, limit],
    queryFn: async () => {
      if (!tenant?.id || !contactId) {
        throw new Error('Tenant ID and Contact ID are required');
      }

      const { data, error } = await supabase
        .from('messages')
        .select(`
          id,
          content,
          created_at,
          direction,
          status,
          message_type,
          media_url,
          contact_id,
          tenant_id,
          whatsapp_instance_id,
          is_from_bot,
          source,
          campaign_id,
          ad_referral
        `)
        .eq('tenant_id', tenant.id)
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        throw error;
      }

      return {
        data: (data || []).reverse(),
        nextCursor: undefined,
        hasMore: false
      } as MessagesPage;
    },
    getNextPageParam: () => undefined,
    enabled: !!tenant?.id && !!contactId,
    staleTime: 1000 * 60 * 2, // 2 minutos
    gcTime: 1000 * 60 * 10, // 10 minutos
    refetchOnWindowFocus: true,
    initialPageParam: null
  });
};

// Hook para enviar mensagem
export const useSendMessage = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { tenant } = useTenant();

  return useMutation({
    mutationFn: async (messageData: Omit<Message, 'id' | 'created_at'>) => {
      if (!tenant?.id) {
        throw new Error('Tenant ID is required');
      }

      const { data, error } = await supabase
        .from('messages')
        .insert({
          ...messageData,
          tenant_id: tenant.id,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    },
    onSuccess: (data) => {
      // Invalidar queries relacionadas
      queryClient.invalidateQueries({ 
        queryKey: ['messages', data.contact_id, tenant?.id] 
      });
      queryClient.invalidateQueries({ 
        queryKey: ['recent-messages', data.contact_id, tenant?.id] 
      });
      queryClient.invalidateQueries({
        queryKey: ['conversations', tenant?.id]
      });
      // Sem toast de sucesso: a mensagem aparecendo na thread já é a confirmação.
      // O toast a cada envio era ruído desnecessário.
    },
    onError: (error) => {
      console.error('Error sending message:', error);
      toast({
        title: 'Erro ao enviar mensagem',
        description: 'Ocorreu um erro ao enviar a mensagem. Tente novamente.',
        variant: 'destructive',
      });
    },
  });
};

// Hook para marcar mensagens como lidas
export const useMarkMessagesAsRead = () => {
  const queryClient = useQueryClient();
  const { tenant } = useTenant();

  return useMutation({
    mutationFn: async ({ contactId, messageIds }: { contactId: string; messageIds: string[] }) => {
      if (!tenant?.id) {
        throw new Error('Tenant ID is required');
      }

      const { error } = await supabase
        .from('messages')
        .update({ status: 'read' })
        .eq('tenant_id', tenant.id)
        .eq('contact_id', contactId)
        .in('id', messageIds)
        .eq('direction', 'inbound');

      if (error) {
        throw error;
      }

      return { contactId, messageIds };
    },
    onSuccess: ({ contactId }) => {
      // Invalidar queries relacionadas
      queryClient.invalidateQueries({ 
        queryKey: ['messages', contactId, tenant?.id] 
      });
      queryClient.invalidateQueries({ 
        queryKey: ['conversations', tenant?.id] 
      });
    },
    onError: (error) => {
      console.error('Error marking messages as read:', error);
    },
  });
};

// Hook para deletar mensagem
export const useDeleteMessage = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { tenant } = useTenant();

  return useMutation({
    mutationFn: async (messageId: string) => {
      if (!tenant?.id) {
        throw new Error('Tenant ID is required');
      }

      const { error } = await supabase
        .from('messages')
        .delete()
        .eq('id', messageId)
        .eq('tenant_id', tenant.id);

      if (error) {
        throw error;
      }

      return messageId;
    },
    onSuccess: (messageId) => {
      // Invalidar todas as queries de mensagens
      queryClient.invalidateQueries({ 
        queryKey: ['messages'] 
      });
      queryClient.invalidateQueries({ 
        queryKey: ['conversations'] 
      });
      
      toast({
        title: 'Mensagem deletada',
        description: 'A mensagem foi removida com sucesso.',
      });
    },
    onError: (error) => {
      console.error('Error deleting message:', error);
      toast({
        title: 'Erro ao deletar mensagem',
        description: 'Ocorreu um erro ao deletar a mensagem. Tente novamente.',
        variant: 'destructive',
      });
    },
  });
};

/**
 * Junta todas as páginas em uma única lista em ordem cronológica crescente.
 *
 * Cada página nasce da query em ordem DECRESCENTE e é revertida no `queryFn`,
 * então dentro dela as mensagens já estão da mais antiga para a mais nova. Mas
 * as páginas em si chegam do mais novo para o mais antigo: a página 0 é o
 * fim da conversa e cada `fetchNextPage` traz um trecho ANTERIOR a ela.
 *
 * Concatenar na ordem de chegada colocava o trecho antigo DEPOIS do recente, e
 * a conversa aparecia embaralhada exatamente na emenda entre páginas — 14 de
 * julho surgindo abaixo de ontem. Invertendo a ordem das páginas, cada trecho
 * carregado entra ACIMA do que já estava na tela, que é como conversa funciona.
 */
export const getAllMessages = (messagesQuery: ReturnType<typeof useMessages>) => {
  const pages = messagesQuery.data?.pages;
  if (!pages) return [];
  // `[...pages]` porque `reverse()` altera o array no lugar — mexer no array do
  // cache do React Query embaralharia o estado de onde o bug saiu.
  return [...pages].reverse().flatMap(page => page.data);
};

// Função utilitária para verificar se há mensagens não lidas
export const getUnreadMessages = (messages: Message[]) => {
  return messages.filter(msg => 
    msg.direction === 'inbound' && 
    msg.status !== 'read'
  );
};

// Função utilitária para agrupar mensagens por data
export const groupMessagesByDate = (messages: Message[]) => {
  const groups: { [key: string]: Message[] } = {};
  
  messages.forEach(message => {
    const date = new Date(message.created_at).toDateString();
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(message);
  });
  
  return groups;
};

export type { Message, MessagesPage, UseMessagesOptions };