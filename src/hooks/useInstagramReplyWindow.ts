import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { instagramWindowState, type InstagramWindowState } from '@/lib/instagram/reply';

/**
 * Janela de 24 h do Instagram para um contato, pela MESMA função que a edge
 * function confere antes de chamar a Meta (`instagram_reply_window`). A tela
 * não calcula a janela por conta própria a partir das mensagens carregadas:
 * uma fonte só.
 *
 * `refreshKey` (o id da última mensagem recebida na tela) refaz a consulta
 * quando o cliente escreve; o relógio local reavalia `closes_at` a cada 30 s,
 * para a janela fechar na tela sem esperar consulta nova.
 */
export function useInstagramReplyWindow(
  contactId: string | null | undefined,
  enabled: boolean,
  refreshKey?: string | null,
): InstagramWindowState & { isLoading: boolean; isError: boolean } {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!enabled) return;
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, [enabled]);

  const query = useQuery({
    queryKey: ['instagram-window', contactId, refreshKey ?? null],
    enabled: enabled && !!contactId,
    staleTime: 30_000,
    queryFn: async () => {
      // A função é nova (fatia 3) e não está nos tipos gerados.
      const client = supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
      };
      const { data, error } = await client.rpc('instagram_reply_window', { p_contact_id: contactId });
      if (error) throw new Error(error.message);
      return (data ?? {}) as { closes_at?: string | null };
    },
  });

  const state = instagramWindowState(query.data?.closes_at ?? null, now);
  return { ...state, isLoading: query.isLoading, isError: query.isError };
}
