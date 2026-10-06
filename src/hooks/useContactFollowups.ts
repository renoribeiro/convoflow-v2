import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';

export interface ContactFollowup {
  id: string;
  task: string;
  due_date: string;
  status: string | null;
  mode: string;
  message_body: string | null;
}

/**
 * Pending/overdue follow-ups for a single contact, shown in the contact panel.
 * Read-only — creation/management lives in the Follow-ups module.
 */
export const useContactFollowups = (contactId?: string | null) => {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ['contact-followups', contactId, tenant?.id],
    queryFn: async (): Promise<ContactFollowup[]> => {
      if (!tenant?.id || !contactId) return [];

      const { data, error } = await supabase
        .from('individual_followups')
        .select('id, task, due_date, status, mode, message_body')
        .eq('tenant_id', tenant.id)
        .eq('contact_id', contactId)
        .in('status', ['pending', 'overdue'])
        .order('due_date', { ascending: true });

      if (error) throw error;
      return (data ?? []) as ContactFollowup[];
    },
    enabled: !!tenant?.id && !!contactId,
    staleTime: 1000 * 60, // 1 minute
    gcTime: 1000 * 60 * 10,
  });
};
