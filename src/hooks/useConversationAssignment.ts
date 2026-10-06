import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { logger } from '@/lib/logger';
import {
  assumeConversation,
  describeAssignmentError,
  transferConversation,
  type AssumeResult,
  type ConversationsClient,
} from '@/lib/conversations/assignment';
import { memberFirstName, useTeamMemberLookup } from '@/hooks/useTeamDirectory';
import { invalidateConversationCounts } from '@/lib/conversations/countKeys';

/**
 * Assumir e transferir conversa — a camada React em cima de
 * `src/lib/conversations/assignment.ts`.
 *
 * Qualquer cargo assume; transferir pode ser desligado para atendentes pela
 * Loja (Configurações › Escala/Transferência, migração 20260914000001). Quem
 * recusa é o SERVIDOR (trigger tg_guard_conversation_transfer, 42501); o
 * `ConversationOwnerControl` só esconde o botão, e aqui a recusa vira a frase
 * do servidor no toast em vez do texto genérico.
 *
 * As invalidações são as mesmas de `useMarkConversationAsRead`: a lista, a
 * conversa aberta e as recentes. A lista também se refaz sozinha a cada 30 s.
 */
const invalidarConversa = (
  queryClient: ReturnType<typeof useQueryClient>,
  tenantId: string | undefined,
  conversationId: string,
) => {
  queryClient.invalidateQueries({ queryKey: ['conversations', tenantId] });
  queryClient.invalidateQueries({ queryKey: ['conversation', conversationId, tenantId] });
  queryClient.invalidateQueries({ queryKey: ['recent-conversations', tenantId] });
  // "Minhas" / "Sem responsável" mudam na hora, não no próximo ciclo de 30 s.
  invalidateConversationCounts(queryClient);
};

// O builder do Supabase é estruturalmente compatível com o mínimo que
// `assignment.ts` pede; o cast só existe porque os genéricos do PostgREST não
// batem com a interface enxuta declarada lá.
const client = supabase as unknown as ConversationsClient;

export const useAssumeConversation = () => {
  const queryClient = useQueryClient();
  const { tenant, profile } = useTenant();
  const lookup = useTeamMemberLookup();

  return useMutation<AssumeResult, Error, { conversationId: string }>({
    mutationFn: async ({ conversationId }) => {
      if (!tenant?.id) throw new Error('Nenhuma Conta carregada');
      if (!profile?.id) throw new Error('Perfil ainda não carregado');
      return assumeConversation(client, {
        conversationId,
        tenantId: tenant.id,
        profileId: profile.id,
      });
    },

    onSuccess: (result, { conversationId }) => {
      // Nos dois desfechos a tela precisa se atualizar — no "taken" é o que
      // faz o nome de quem ficou aparecer no chip.
      invalidarConversa(queryClient, tenant?.id, conversationId);

      if (result.status === 'assigned') {
        toast.success('Conversa assumida.');
        return;
      }

      const holder = lookup(result.holderProfileId);
      // `holderProfileId` nulo tem dois motivos possíveis: alguém assumiu e, com a
      // visibilidade restringida, a conversa SAIU do seu alcance; ou ela sumiu.
      // Nos dois casos ela não está mais disponível para você — é isso que a
      // frase diz, sem inventar um nome.
      toast.warning(
        holder
          ? `${memberFirstName(holder)} assumiu esta conversa antes de você.`
          : 'Esta conversa não está mais disponível para você: outra pessoa assumiu antes, ou ela saiu do seu alcance. A tela foi atualizada.',
      );
    },

    onError: (error) => {
      logger.error('Erro ao assumir conversa', undefined, error);
      toast.error('Não foi possível assumir a conversa. Tente novamente.');
    },
  });
};

export const useTransferConversation = () => {
  const queryClient = useQueryClient();
  const { tenant, profile } = useTenant();
  const lookup = useTeamMemberLookup();

  return useMutation<{ status: 'transferred' }, Error, { conversationId: string; toProfileId: string }>({
    mutationFn: async ({ conversationId, toProfileId }) => {
      if (!tenant?.id) throw new Error('Nenhuma Conta carregada');
      if (!profile?.id) throw new Error('Perfil ainda não carregado');
      return transferConversation(client, {
        conversationId,
        tenantId: tenant.id,
        toProfileId,
        byProfileId: profile.id,
      });
    },

    onSuccess: (_result, { conversationId, toProfileId }) => {
      invalidarConversa(queryClient, tenant?.id, conversationId);
      const receiver = lookup(toProfileId);
      toast.success(
        toProfileId === profile?.id
          ? 'Conversa assumida.'
          : receiver
            ? `Conversa transferida para ${memberFirstName(receiver)}.`
            : 'Conversa transferida.',
      );
    },

    onError: (error) => {
      logger.error('Erro ao transferir conversa', undefined, error);
      toast.error(describeAssignmentError(error) ?? 'Não foi possível transferir a conversa. Tente novamente.');
    },
  });
};
