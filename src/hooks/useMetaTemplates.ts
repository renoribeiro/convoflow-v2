/**
 * Busca dos templates aprovados na Meta, para a tela /dashboard/templates.
 *
 * Dois hooks, porque são duas perguntas diferentes:
 *  - `useMetaWabaGroups` responde "quais contas do WhatsApp Business esta Loja
 *    tem?", olhando as instâncias oficiais e deduplicando por WABA.
 *  - `useMetaTemplates` responde "quais templates existem nesta conta?",
 *    chamando a edge function.
 *
 * NÃO existe tabela de cache aqui, e é decisão consciente: status de template
 * muda do lado da Meta sem nos avisar (ela pausa por qualidade, desativa depois
 * de pausar de novo, aprova o que estava pendente). Uma linha nossa dizendo
 * "Aprovado" para um template desativado há uma hora manda o atendente para um
 * envio que falha. Busca viva se conserta sozinha.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenantId } from '@/contexts/TenantContext';
import { QUERY_KEYS } from '@/lib/queryClient';
import { mensagemDaEdgeFunction } from '@/lib/edgeFunctionError';
import { logger } from '@/lib/logger';
import {
  dedupeWabaGroups,
  type OfficialInstanceRow,
  type WabaGroup,
} from '@/lib/templates/metaTemplates';
import type { WhatsAppTemplate } from '@/services/whatsapp';

interface WabaGroupsResult {
  groups: WabaGroup[];
  /**
   * Quantas instâncias oficiais a Loja tem, ANTES da dedupe.
   *
   * A tela precisa dos dois números para escolher a mensagem certa: zero
   * instâncias oficiais é "você não usa a API Oficial ainda"; instâncias
   * oficiais sem nenhum grupo é "tem número oficial, mas falta o WABA ID".
   * São problemas diferentes com soluções diferentes.
   */
  officialCount: number;
}

/** WABAs distintos da Loja ativa, deduplicados a partir das instâncias. */
export function useMetaWabaGroups() {
  const tenantId = useTenantId();

  const query = useQuery({
    queryKey: [QUERY_KEYS.WHATSAPP_WABAS, tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<WabaGroupsResult> => {
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('id, name, phone_number, connection_config')
        .eq('tenant_id', tenantId as string)
        .eq('provider', 'official')
        .order('created_at', { ascending: true });

      if (error) throw error;

      const rows = (data ?? []) as OfficialInstanceRow[];
      return { groups: dedupeWabaGroups(rows), officialCount: rows.length };
    },
  });

  return {
    groups: query.data?.groups ?? [],
    officialCount: query.data?.officialCount ?? 0,
    isLoading: query.isLoading,
    error: query.error as Error | null,
  };
}

interface ListTemplatesResponse {
  ok?: boolean;
  templates?: WhatsAppTemplate[];
  error?: string;
}

/**
 * Templates da conta Meta à qual a instância pertence.
 *
 * O contrato da edge function é por `instance_id` — passe a instância-alça do
 * grupo de WABA, não o WABA ID.
 */
export function useMetaTemplates(instanceId: string | null) {
  return useQuery({
    queryKey: [QUERY_KEYS.WHATSAPP_TEMPLATES, instanceId],
    enabled: !!instanceId,
    // `retry: false` sobrescrevendo o padrão do queryClient de propósito: o erro
    // desta função é quase sempre 4xx determinístico (instância não-oficial,
    // wabaId ausente, token vencido). Repetir três vezes com backoff só atrasa
    // em vários segundos a mensagem que o usuário precisa ler para agir.
    retry: false,
    queryFn: async (): Promise<WhatsAppTemplate[]> => {
      const { data, error } = await supabase.functions.invoke('list-whatsapp-templates', {
        body: { instance_id: instanceId },
      });

      if (error) {
        // Sem isto, toda falha vira "Edge Function returned a non-2xx status
        // code" e a frase em pt-BR que a função escreveu ("connection_config.
        // wabaId ausente...") se perde. É exatamente o que esta tela não pode
        // fazer: aqui a falha tem de ser legível, não silenciosa.
        const mensagem = await mensagemDaEdgeFunction(
          error,
          'Não foi possível carregar os templates desta conta.',
        );
        logger.error('[useMetaTemplates] falha ao listar templates', {
          instanceId,
          error: mensagem,
        });
        throw new Error(mensagem);
      }

      const res = data as ListTemplatesResponse | null;
      if (!res?.ok) {
        throw new Error(res?.error || 'Não foi possível carregar os templates desta conta.');
      }
      return res.templates ?? [];
    },
  });
}
