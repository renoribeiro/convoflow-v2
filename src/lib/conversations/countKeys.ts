import type { QueryClient } from '@tanstack/react-query';

/**
 * Prefixo das contagens de Conversas: as pílulas de servidor e o selo do outro
 * canal (`useConversationsCount`) moram em `['conversations', 'total', …]`.
 */
export const CONVERSATION_COUNTS_KEY = ['conversations', 'total'] as const;

/**
 * Invalidar `['conversations', tenantId]` NÃO alcança as contagens — o segundo
 * segmento delas é 'total', não o id da Loja — e o número só mudava no próximo
 * ciclo de 30 s. Quem muda uma conversa (ler, marcar não lida, arquivar,
 * assumir/transferir) chama isto, e as contagens se refazem na hora.
 */
export const invalidateConversationCounts = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({ queryKey: [...CONVERSATION_COUNTS_KEY] });
