import { useSupabaseQuery } from './useSupabaseQuery';
import { useTenant } from '@/contexts/TenantContext';
import { subDays } from 'date-fns';
import { contactChannel, contactLabel, instagramNameWithHandle } from '@/lib/contacts/identity';

interface RecentActivityItem {
  id: string;
  type: 'message' | 'contact' | 'campaign' | 'automation' | 'conversion';
  title: string;
  description: string;
  timestamp: string;
  status: 'success' | 'pending' | 'warning' | 'error';
  user?: {
    name: string;
    avatar?: string;
  };
  metadata?: {
    contactName?: string;
    campaignName?: string;
    automationName?: string;
    messageCount?: number;
    value?: number;
  };
}

interface RecentActivityData {
  activities: RecentActivityItem[];
  isLoading: boolean;
  error: any;
}

export const useRecentActivity = (limit: number = 10): RecentActivityData => {
  const { tenant } = useTenant();
  const last7Days = subDays(new Date(), 7);
  
  // Buscar mensagens recentes
  const { data: recentMessages = [], isLoading: messagesLoading } = useSupabaseQuery({
    table: 'messages',
    queryKey: ['recent-messages'],
    select: `
      id,
      content,
      created_at,
      direction,
      status,
      contacts!messages_contact_id_fkey(
        id,
        name,
        phone,
        channel,
        username
      )
    `,
    filters: [
      { column: 'created_at', operator: 'gte', value: last7Days.toISOString() }
    ],
    orderBy: [{ column: 'created_at', ascending: false }],
    limit: Math.ceil(limit * 0.4), // 40% das atividades
    enabled: !!tenant,
    silent: true
  });
  
  // Buscar contatos recentes
  const { data: recentContacts = [], isLoading: contactsLoading } = useSupabaseQuery({
    table: 'contacts',
    queryKey: ['recent-contacts'],
    select: `
      id,
      name,
      phone,
      channel,
      username,
      created_at,
      current_stage_id,
      funnel_stages!contacts_current_stage_id_fkey(
        name,
        color
      )
    `,
    filters: [
      { column: 'created_at', operator: 'gte', value: last7Days.toISOString() }
    ],
    orderBy: [{ column: 'created_at', ascending: false }],
    limit: Math.ceil(limit * 0.3), // 30% das atividades
    enabled: !!tenant,
    silent: true
  });
  
  // Buscar campanhas recentes
  const { data: recentCampaigns = [], isLoading: campaignsLoading } = useSupabaseQuery({
    table: 'mass_message_campaigns',
    queryKey: ['recent-campaigns'],
    select: `
      id,
      name,
      status,
      created_at,
      scheduled_at,
      sent_count,
      total_recipients
    `,
    filters: [
      { column: 'created_at', operator: 'gte', value: last7Days.toISOString() }
    ],
    orderBy: [{ column: 'created_at', ascending: false }],
    limit: Math.ceil(limit * 0.2), // 20% das atividades
    enabled: !!tenant,
    silent: true
  });
  
  // Buscar automações recentes
  const { data: recentAutomations = [], isLoading: automationsLoading } = useSupabaseQuery({
    table: 'chatbots',
    queryKey: ['recent-automations'],
    select: `
      id,
      name,
      is_active,
      created_at,
      updated_at
    `,
    filters: [
      { column: 'updated_at', operator: 'gte', value: last7Days.toISOString() }
    ],
    orderBy: [{ column: 'updated_at', ascending: false }],
    limit: Math.ceil(limit * 0.1), // 10% das atividades
    enabled: !!tenant,
    silent: true
  });
  
  // Processar e combinar todas as atividades
  const processActivities = (): RecentActivityItem[] => {
    const activities: RecentActivityItem[] = [];
    
    // Processar mensagens
    recentMessages?.forEach((message: any) => {
      // WhatsApp: o nome, ou "Contato" (como sempre). Instagram sem nome: o @.
      const who =
        message.contacts && contactChannel(message.contacts) === 'instagram'
          ? contactLabel(message.contacts)
          : message.contacts?.name || 'Contato';
      activities.push({
        id: `message-${message.id}`,
        type: 'message',
        title: message.direction === 'inbound' ? 'Nova mensagem recebida' : 'Mensagem enviada',
        description: `${message.direction === 'inbound' ? 'De' : 'Para'} ${who}: ${message.content?.substring(0, 50)}${message.content?.length > 50 ? '...' : ''}`,
        timestamp: message.created_at,
        status: message.status === 'sent' ? 'success' :
                message.status === 'pending' ? 'pending' :
                message.status === 'failed' ? 'error' : 'warning',
        metadata: {
          contactName: message.contacts?.name,
        }
      });
    });
    
    // Processar contatos
    recentContacts?.forEach((contact: any) => {
      activities.push({
        id: `contact-${contact.id}`,
        type: 'contact',
        title: 'Novo contato adicionado',
        // WhatsApp: "Nome (telefone)", como sempre. Instagram: "Nome (@usuario)",
        // ou só o @ quando não há nome — nunca "(null)".
        description:
          contactChannel(contact) === 'instagram'
            ? `${instagramNameWithHandle(contact)} foi adicionado ao funil`
            : `${contact.name} (${contact.phone}) foi adicionado ao funil`,
        timestamp: contact.created_at,
        status: 'success',
        metadata: {
          contactName: contact.name,
        }
      });
    });
    
    // Processar campanhas
    recentCampaigns?.forEach((campaign: any) => {
      const getStatusFromCampaign = (status: string) => {
        switch (status) {
          case 'completed': return 'success';
          case 'running': return 'pending';
          case 'failed': return 'error';
          default: return 'warning';
        }
      };
      
      activities.push({
        id: `campaign-${campaign.id}`,
        type: 'campaign',
        title: 'Campanha de mensagens',
        description: `${campaign.name} - ${campaign.sent_count || 0}/${campaign.total_recipients || 0} enviadas`,
        timestamp: campaign.created_at,
        status: getStatusFromCampaign(campaign.status),
        metadata: {
          campaignName: campaign.name,
          messageCount: campaign.sent_count || 0,
        }
      });
    });
    
    // Processar automações
    recentAutomations?.forEach((automation: any) => {
      activities.push({
        id: `automation-${automation.id}`,
        type: 'automation',
        title: automation.is_active ? 'Automação ativada' : 'Automação desativada',
        description: `${automation.name} foi ${automation.is_active ? 'ativada' : 'desativada'}`,
        timestamp: automation.updated_at,
        status: automation.is_active ? 'success' : 'warning',
        metadata: {
          automationName: automation.name,
        }
      });
    });
    
    // Ordenar por timestamp (mais recente primeiro) e limitar
    return activities
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  };
  
  const activities = processActivities();
  const isLoading = messagesLoading || contactsLoading || campaignsLoading || automationsLoading;
  
  return {
    activities,
    isLoading,
    error: null // TODO: Implementar tratamento de erro consolidado
  };
};

// Hook auxiliar para buscar atividades por tipo específico
export const useRecentActivityByType = (type: RecentActivityItem['type'], limit: number = 5) => {
  const { activities, isLoading, error } = useRecentActivity(50); // Buscar mais para filtrar
  
  const filteredActivities = activities.filter(activity => activity.type === type).slice(0, limit);
  
  return {
    activities: filteredActivities,
    isLoading,
    error
  };
};