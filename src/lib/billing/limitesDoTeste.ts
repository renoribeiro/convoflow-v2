// =============================================================================
// Os limites do teste grátis e do cadastro pelo site, lidos do banco
// =============================================================================
// Sessão 2 (migração 20261109000001). Os números moram em uma linha só,
// public.limites_da_plataforma, e o superadmin muda na tela "Limites de uso".
// Quem decide é o servidor (public.teste_limite); aqui é só para MOSTRAR: na
// tela de bloqueio, antes do cartão, e na tela do superadmin.
// =============================================================================

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { QUERY_KEYS } from '@/lib/queryClient';

export {
  CAMPOS_DOS_LIMITES,
  LIMITES_PADRAO,
  resumoDosLimitesDoTeste,
  type CampoDoLimite,
  type LimitesDaPlataforma,
} from './limitesDoTesteTexto';
import type { LimitesDaPlataforma } from './limitesDoTesteTexto';

/** Os números de hoje. Todo logado lê (o RLS deixa). */
export function useLimitesDaPlataforma(habilitado = true) {
  return useQuery({
    queryKey: [QUERY_KEYS.SETTINGS, 'limites-da-plataforma'],
    enabled: habilitado,
    retry: false,
    queryFn: async (): Promise<LimitesDaPlataforma | null> => {
      const { data, error } = await (supabase as any)
        .from('limites_da_plataforma')
        .select('*')
        .eq('id', true)
        .maybeSingle();
      if (error) throw error;
      const linha = (data ?? null) as LimitesDaPlataforma | null;
      // Resposta sem os números (a linha não existe ou veio estranha): nada a mostrar.
      if (!linha || typeof linha.teste_lojas !== 'number') return null;
      return linha;
    },
  });
}
