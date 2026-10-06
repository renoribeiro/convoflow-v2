import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { QUERY_KEYS } from '@/lib/queryClient';

/**
 * Sessões ativas de chatbot — o que a tela de Conversas precisa saber para
 * mostrar "o bot está conduzindo esta conversa".
 *
 * Por que UMA query da Loja inteira, e não uma por conversa:
 *   - a lista é paginada e refaz todas as páginas a cada 30 s; uma consulta
 *     por linha seria 20+ idas ao servidor por tick, o mesmo custo que a
 *     prévia desnormalizada (20260817) tirou de lá;
 *   - o conjunto é pequeno por natureza: só sessões `status = 'active'`
 *     (55 na maior Loja em 2026-09-14), lidas pelo índice de tenant;
 *   - o cabeçalho do chat e a lista leem o MESMO cache, então abrir uma
 *     conversa não custa consulta nenhuma.
 *
 * Segue o desenho de `useSlaMutedConversations`: mapa isolado, falha aqui só
 * apaga o selo — a lista continua carregando.
 *
 * O que NÃO faz: nada aqui muda o motor do chatbot. É leitura e exibição.
 * Quem encerra a sessão é a pessoa, pelo botão que já existia
 * (`useEndChatbotSession`), e é ele que limpa este cache na hora.
 *
 * RLS: `chatbot_sessions` tem policy FOR ALL por tenant (e leitura do gerente
 * nas Lojas filhas), então todo cargo que abre a conversa vê o selo.
 */
export interface ActiveBotSession {
  id: string;
  contact_id: string;
  /** Instância em que o bot está falando. NULL só em sessões antigas. */
  whatsapp_instance_id: string | null;
  chatbot_id: string;
  /**
   * true = o bot mandou uma pergunta/menu e espera a resposta do cliente.
   * false = a sessão está ativa mas o motor ignora o que o cliente manda.
   * Guardado para diagnóstico; a tela não distingue os dois (ver relatório).
   */
  awaiting_input: boolean;
  last_activity_at: string;
}

/** contact_id → sessões ativas (quase sempre uma; ver `pickBotSession`). */
export type ActiveBotSessionsMap = Record<string, ActiveBotSession[]>;

export const buildBotSessionsMap = (rows: ActiveBotSession[]): ActiveBotSessionsMap => {
  const map: ActiveBotSessionsMap = {};
  for (const row of rows) {
    (map[row.contact_id] ??= []).push(row);
  }
  return map;
};

/**
 * A sessão que vale para a conversa aberta.
 *
 * A chave da sessão é (contact_id, whatsapp_instance_id) — o índice
 * `uq_chatbot_active_session` garante no máximo uma ativa por par — e a
 * conversa é uma por (tenant, contato). Como os contatos são por instância
 * desde 20260529120000, na prática há uma sessão por contato; mas um contato
 * antigo pode ter sessão em outra instância, ou sessão sem instância. Regra:
 *   1. a sessão da instância da conversa, se houver;
 *   2. senão, a única que existir;
 *   3. senão, a de atividade mais recente.
 * Em qualquer caso o bot ESTÁ falando com esse contato — esconder o selo por
 * causa de instância seria mentir para quem atende.
 */
export const pickBotSession = (
  sessions: ActiveBotSession[] | undefined,
  conversationInstanceId: string | null | undefined,
): ActiveBotSession | null => {
  if (!sessions || sessions.length === 0) return null;
  if (conversationInstanceId) {
    const exact = sessions.find((s) => s.whatsapp_instance_id === conversationInstanceId);
    if (exact) return exact;
  }
  if (sessions.length === 1) return sessions[0] ?? null;
  return [...sessions].sort((a, b) => b.last_activity_at.localeCompare(a.last_activity_at))[0] ?? null;
};

export const useActiveBotSessions = () => {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: [QUERY_KEYS.CONVERSATIONS_BOT_SESSIONS, tenant?.id],
    queryFn: async (): Promise<ActiveBotSessionsMap> => {
      if (!tenant?.id) return {};

      const { data, error } = await supabase
        .from('chatbot_sessions')
        .select('id, contact_id, whatsapp_instance_id, chatbot_id, awaiting_input, last_activity_at')
        .eq('tenant_id', tenant.id)
        .eq('status', 'active');

      if (error) throw error;
      return buildBotSessionsMap((data ?? []) as ActiveBotSession[]);
    },
    enabled: !!tenant?.id,
    // Mesma cadência da lista de conversas. O selo aparecer com até 30 s de
    // atraso é aceitável; sumir depois de encerrar é imediato (cache).
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 30,
    gcTime: 1000 * 60 * 15,
    // Falha aqui é cosmética (some o selo); não vale insistir.
    retry: 1,
  });
};

/**
 * Nome dos bots da Loja, para o selo dizer QUAL bot está na conversa.
 *
 * Separado do mapa de sessões de propósito: embutir `chatbots(name)` na query
 * das sessões custaria uma busca por linha a cada 30 s; aqui são duas colunas
 * de uma tabela minúscula, cacheadas 5 min (faixa `chatbots`, invalidada pelo
 * próprio `useChatbots` quando alguém renomeia).
 */
export const useChatbotNames = () => {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: [QUERY_KEYS.CHATBOTS, 'names', tenant?.id],
    queryFn: async (): Promise<Record<string, string>> => {
      if (!tenant?.id) return {};

      const { data, error } = await supabase
        .from('chatbots')
        .select('id, name')
        .eq('tenant_id', tenant.id);

      if (error) throw error;

      const names: Record<string, string> = {};
      for (const row of (data ?? []) as { id: string; name: string | null }[]) {
        if (row.name) names[row.id] = row.name;
      }
      return names;
    },
    enabled: !!tenant?.id,
    retry: 1,
  });
};

export interface ConversationBotSession {
  /** null = nenhum bot ativo neste contato. */
  session: ActiveBotSession | null;
  /** Nome do bot, ou null enquanto os nomes não carregaram. */
  botName: string | null;
}

/** O que o cabeçalho do chat mostra: a sessão da conversa aberta e o nome do bot. */
export const useConversationBotSession = (
  contactId: string | null | undefined,
  conversationInstanceId: string | null | undefined,
): ConversationBotSession => {
  const { data: sessionsMap } = useActiveBotSessions();
  const { data: names } = useChatbotNames();

  return useMemo(() => {
    const session = contactId ? pickBotSession(sessionsMap?.[contactId], conversationInstanceId) : null;
    return {
      session,
      botName: session ? (names?.[session.chatbot_id] ?? null) : null,
    };
  }, [sessionsMap, names, contactId, conversationInstanceId]);
};
