import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/lib/logger';

/**
 * Conversas silenciadas na sinalização de SLA ("o cliente não vai responder").
 *
 * Por que uma query separada em vez de mais duas colunas no `select` de
 * `useConversations`: a lista de conversas é a tela mais crítica do produto e
 * este é um recorte pequeno e opcional. Isolado, ele só roda quando a Loja liga
 * a feature, e uma falha aqui (por exemplo, a migration ainda não aplicada)
 * apaga apenas a sinalização — a lista continua carregando normalmente.
 *
 * O conjunto é naturalmente pequeno: cada silenciamento é um clique manual.
 */
const MUTED_QUERY_KEY = 'conversations-sla-muted';

/** Mapa `conversationId → sla_muted_at`. */
export type SlaMutedMap = Record<string, string>;

export const useSlaMutedConversations = (enabled: boolean) => {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: [MUTED_QUERY_KEY, tenant?.id],
    queryFn: async (): Promise<SlaMutedMap> => {
      if (!tenant?.id) return {};

      const { data, error } = await supabase
        .from('conversations')
        .select('id, sla_muted_at')
        .eq('tenant_id', tenant.id)
        .not('sla_muted_at', 'is', null);

      if (error) throw error;

      const map: SlaMutedMap = {};
      for (const row of data ?? []) {
        if (row.sla_muted_at) map[row.id] = row.sla_muted_at;
      }
      return map;
    },
    enabled: enabled && !!tenant?.id,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    // Falha aqui é cosmética (some a sinalização); não vale insistir.
    retry: 1,
  });
};

interface ToggleVariables {
  conversationId: string;
  muted: boolean;
}

/**
 * Liga/desliga o silenciamento de uma conversa.
 *
 * Escreve SÓ `sla_muted_at`/`sla_muted_by`: silenciar não arquiva a conversa e
 * não mexe em `unread_count` — quem tinha mensagem não lida continua tendo.
 *
 * A atualização é otimista sobre o cache do mapa acima (a lista inteira não é
 * invalidada: o estado de silenciamento não vive nela).
 */
export const useToggleSlaMute = () => {
  const queryClient = useQueryClient();
  const { tenant } = useTenant();
  const { user } = useAuth();

  const cacheKey = [MUTED_QUERY_KEY, tenant?.id];

  return useMutation({
    mutationFn: async ({ conversationId, muted }: ToggleVariables) => {
      if (!tenant?.id) throw new Error('Nenhuma Conta carregada');

      const patch = muted
        ? { sla_muted_at: new Date().toISOString(), sla_muted_by: user?.id ?? null }
        : { sla_muted_at: null, sla_muted_by: null };

      const { error } = await supabase
        .from('conversations')
        .update(patch)
        .eq('id', conversationId)
        .eq('tenant_id', tenant.id);

      if (error) throw error;
      return { conversationId, muted };
    },

    onMutate: async ({ conversationId, muted }: ToggleVariables) => {
      await queryClient.cancelQueries({ queryKey: cacheKey });
      const previous = queryClient.getQueryData<SlaMutedMap>(cacheKey);

      queryClient.setQueryData<SlaMutedMap>(cacheKey, (old) => {
        const next = { ...(old ?? {}) };
        if (muted) next[conversationId] = new Date().toISOString();
        else delete next[conversationId];
        return next;
      });

      return { previous };
    },

    onError: (error, _variables, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(cacheKey, context.previous);
      }
      logger.error(
        'Erro ao alterar sinalização de SLA da conversa',
        undefined,
        error instanceof Error ? error : undefined,
      );
      toast.error('Não foi possível alterar a sinalização. Tente novamente.');
    },

    onSuccess: ({ muted }) => {
      toast.success(
        muted
          ? 'Conversa marcada como não respondida.'
          : 'Conversa voltou a ser sinalizada.',
      );
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: cacheKey });
    },
  });
};
