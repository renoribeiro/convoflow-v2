import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { logger } from '@/lib/logger';
import { QUERY_KEYS } from '@/lib/queryClient';
import type { ActiveBotSessionsMap } from '@/hooks/useChatbotSessions';

/**
 * Encerra manualmente a sessão ativa do chatbot de um contato.
 *
 * Contexto: quando um lead não escolhe uma opção válida, o motor do chatbot
 * fica reenviando o menu (o nó `show_options` permanece aguardando). Só existe
 * UMA sessão `active` por (contact_id, whatsapp_instance_id) — índice único
 * `uq_chatbot_active_session`. Marcar essa sessão como `completed` libera o
 * contato e faz o bot parar de reenviar; ele só volta a agir se um trigger novo
 * casar numa próxima mensagem.
 *
 * RLS: a policy "Users can access own tenant chatbot_sessions"
 * (tenant_id = get_current_user_tenant_id()) já permite o UPDATE pelo operador,
 * então não é preciso Edge Function. O gerente lendo uma Loja filha só tem
 * SELECT: para ele o UPDATE volta com zero linhas — por isso o `.select('id')`
 * abaixo, senão a tela diria "encerrada" sem nada ter acontecido.
 *
 * Rodízio: encerrar pelo botão é ação de pessoa (auth.uid() presente), e o
 * trigger `trg_rotation_assign_on_session_end` devolve antes de distribuir.
 * Nada aqui muda isso.
 */
interface EndChatbotSessionArgs {
  contactId: string;
  whatsappInstanceId?: string | null;
  /**
   * Quando a tela já sabe qual sessão está ativa (selo "Bot em atendimento"),
   * mira nela direto — sem a busca por contato/instância.
   */
  sessionId?: string | null;
}

interface EndChatbotSessionResult {
  /** true quando havia uma sessão ativa e ela foi encerrada. */
  ended: boolean;
}

export const SESSION_END_FORBIDDEN_MESSAGE =
  'Você não tem permissão para encerrar a sessão do bot nesta Loja.';

export const useEndChatbotSession = () => {
  const queryClient = useQueryClient();
  const { tenant } = useTenant();

  return useMutation<EndChatbotSessionResult, Error, EndChatbotSessionArgs>({
    mutationFn: async ({ contactId, whatsappInstanceId, sessionId }) => {
      if (!tenant?.id) throw new Error('Tenant ID is required');
      if (!contactId) throw new Error('Contact ID is required');

      let targetId = sessionId ?? null;

      if (!targetId) {
        // Localiza a sessão ativa do contato. O filtro por instância é aplicado
        // apenas quando conhecido — sessões antigas podem ter whatsapp_instance_id
        // nulo, e nesse caso o índice único garante que ainda há só uma ativa.
        let query = supabase
          .from('chatbot_sessions')
          .select('id')
          .eq('tenant_id', tenant.id)
          .eq('contact_id', contactId)
          .eq('status', 'active');

        if (whatsappInstanceId) {
          query = query.eq('whatsapp_instance_id', whatsappInstanceId);
        }

        const { data: session, error: findError } = await query.maybeSingle();
        if (findError) throw findError;
        if (!session?.id) return { ended: false };
        targetId = session.id;
      }

      // `status = 'active'` no WHERE: se o motor encerrou a sessão entre o
      // poll e o clique, não reescrevemos `ended_at` por cima.
      const { data: updated, error: updateError } = await supabase
        .from('chatbot_sessions')
        .update({
          status: 'completed',
          ended_at: new Date().toISOString(),
          awaiting_input: false,
        })
        .eq('id', targetId)
        .eq('tenant_id', tenant.id)
        .eq('status', 'active')
        .select('id');

      if (updateError) throw updateError;
      if (updated && updated.length > 0) return { ended: true };

      // Zero linhas: ou a sessão já não estava ativa (o motor terminou antes),
      // ou o RLS filtrou o UPDATE (gerente numa Loja filha). Uma leitura diz qual.
      const { data: still } = await supabase
        .from('chatbot_sessions')
        .select('id')
        .eq('id', targetId)
        .eq('status', 'active')
        .maybeSingle();

      if (still?.id) throw new Error(SESSION_END_FORBIDDEN_MESSAGE);
      return { ended: false };
    },
    onSuccess: (_data, variables) => {
      // O selo some na hora, sem esperar o próximo poll de 30 s: tira o
      // contato do mapa de sessões ativas. O onSettled abaixo confirma com o
      // servidor logo em seguida.
      const cacheKey = [QUERY_KEYS.CONVERSATIONS_BOT_SESSIONS, tenant?.id];
      queryClient.setQueryData<ActiveBotSessionsMap>(cacheKey, (old) => {
        const current = old?.[variables.contactId];
        if (!old || !current) return old;
        const next = { ...old };
        const remaining = variables.sessionId
          ? current.filter((s) => s.id !== variables.sessionId)
          : [];
        if (remaining.length > 0) next[variables.contactId] = remaining;
        else delete next[variables.contactId];
        return next;
      });
    },
    onError: (error) => {
      logger.error('[useEndChatbotSession] falha ao encerrar sessão do bot', {
        error: error instanceof Error ? error.message : String(error),
      });
    },
    onSettled: () => {
      // A lista de conversas não lê chatbot_sessions; o mapa de sessões ativas
      // sim — e é ele que a lista e o cabeçalho usam para o selo.
      queryClient.invalidateQueries({ queryKey: ['conversations', tenant?.id] });
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.CONVERSATIONS_BOT_SESSIONS, tenant?.id],
      });
    },
  });
};
