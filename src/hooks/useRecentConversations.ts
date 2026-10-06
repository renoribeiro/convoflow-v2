import { useSupabaseQuery } from './useSupabaseQuery';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export interface RecentConversation {
  id: string;
  contactName: string;
  lastMessage: string;
  timestamp: string;
  status: 'new' | 'in_progress' | 'waiting' | 'closed';
  assignedTo?: string;
  whatsappNumber: string;
  created_at: string;
}

export const useRecentConversations = (limit: number = 5) => {
  const { data: conversations = [], isLoading } = useSupabaseQuery({
    table: 'messages',
    queryKey: ['recent-conversations', limit],
    select: `
      id,
      content,
      created_at,
      direction,
      status,
      contacts!inner(
        id,
        name,
        phone
      ),
      whatsapp_instances(
        phone_number
      )
    `,
    orderBy: [{ column: 'created_at', ascending: false }],
    limit,
  });

  // Agrupar mensagens por contato para obter a conversa mais recente
  const groupedConversations = conversations.reduce((acc: any, message: any) => {
    const contactId = message.contacts?.id;
    if (!contactId) return acc;

    if (!acc[contactId] || new Date(message.created_at) > new Date(acc[contactId].created_at)) {
      acc[contactId] = message;
    }
    return acc;
  }, {});

  const recentConversations: RecentConversation[] = Object.values(groupedConversations)
    .map((message: any) => {
      // Determinar status baseado na direção e tempo da última mensagem
      let status: 'new' | 'in_progress' | 'waiting' | 'closed' = 'new';
      const messageAge = Date.now() - new Date(message.created_at).getTime();
      const hoursAgo = messageAge / (1000 * 60 * 60);

      if (message.direction === 'incoming') {
        if (hoursAgo < 1) {
          status = 'new';
        } else if (hoursAgo < 24) {
          status = 'waiting';
        } else {
          status = 'closed';
        }
      } else {
        status = 'in_progress';
      }

      return {
        id: message.id,
        contactName: message.contacts?.name || 'Contato sem nome',
        lastMessage: message.content || 'Mensagem sem conteúdo',
        timestamp: formatDistanceToNow(new Date(message.created_at), {
          locale: ptBR,
          addSuffix: true
        }),
        status,
        whatsappNumber: message.contacts?.phone || 'Número não disponível',
        created_at: message.created_at,
      };
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);

  return {
    conversations: recentConversations,
    isLoading,
  };
};