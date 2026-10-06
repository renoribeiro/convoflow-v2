import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';

/**
 * "Existe conversa para este contato?" — inclusive uma que o RLS esconde de
 * quem pergunta (RPC `contact_has_conversation`, migração 20260914000001).
 *
 * Só existência, dentro do alcance de Conta do chamador. É o que o deep link
 * `/dashboard/conversations?contact=<id>` precisa para não cair na armadilha:
 * antes, `useConversationByContact` voltava vazio para uma conversa escondida
 * e a tela tentava CRIAR outra — chave duplicada (tenant_id, contact_id) e o
 * toast "Erro ao criar conversa". Com isto a tela distingue "não existe"
 * (cria) de "existe mas não é sua" (avisa e não cria nada).
 */
export const useContactHasConversation = (contactId: string | null | undefined, enabled = true) => {
  const { tenant } = useTenant();

  return useQuery<boolean>({
    queryKey: ['contact-has-conversation', contactId, tenant?.id],
    enabled: enabled && !!contactId && !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('contact_has_conversation', {
        p_contact_id: contactId,
      });
      if (error) throw error;
      return data === true;
    },
    staleTime: 0,
  });
};
