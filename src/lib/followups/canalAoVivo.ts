/**
 * Um canal ao vivo de `individual_followups` por Loja, dividido entre todas
 * as partes da tela que o pedem.
 *
 * O DEFEITO QUE ISTO EXISTE PARA CONSERTAR (lote 6b, B15): cada parte de
 * Follow ups (contadores, lista da aba, calendário, "Novo Follow up") abria o
 * próprio canal com o MESMO nome. O servidor do Realtime junta canais de mesmo
 * nome numa conexão; quando uma parte fechava (a janela "Novo Follow up", por
 * exemplo), a saída dela derrubava o canal das outras, e a lista parava de se
 * atualizar sozinha.
 *
 * Agora há um contador por Loja: a primeira parte que entra abre o canal, as
 * seguintes só somam, e o canal só fecha quando a última sai. Cada mudança no
 * banco invalida a consulta compartilhada uma vez (o TanStack Query relê uma
 * vez para todas as partes).
 */
import type { QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { QUERY_KEYS } from '@/lib/queryClient';

type Canal = ReturnType<typeof supabase.channel>;

interface Entrada {
  canal: Canal;
  partes: number;
}

const canais = new Map<string, Entrada>();

/** Chave da consulta compartilhada de follow ups da Loja. */
export const chaveFollowups = (tenantId: string | null | undefined) =>
  [QUERY_KEYS.FOLLOWUPS, tenantId ?? null] as const;

/**
 * Entra no canal da Loja e devolve a função de sair. Chamar `sair` duas vezes
 * não desconta duas vezes.
 */
export function entrarNoCanalDeFollowups(tenantId: string, queryClient: QueryClient): () => void {
  let entrada = canais.get(tenantId);
  if (!entrada) {
    const canal = supabase
      .channel(`individual_followups:${tenantId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'individual_followups', filter: `tenant_id=eq.${tenantId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: chaveFollowups(tenantId) });
        },
      )
      .subscribe();
    entrada = { canal, partes: 0 };
    canais.set(tenantId, entrada);
  }
  entrada.partes += 1;

  let saiu = false;
  return () => {
    if (saiu) return;
    saiu = true;
    const atual = canais.get(tenantId);
    if (!atual) return;
    atual.partes -= 1;
    if (atual.partes <= 0) {
      canais.delete(tenantId);
      void supabase.removeChannel(atual.canal);
    }
  };
}

/** Só para os testes: quantas partes estão no canal da Loja (0 = fechado). */
export function partesNoCanal(tenantId: string): number {
  return canais.get(tenantId)?.partes ?? 0;
}
