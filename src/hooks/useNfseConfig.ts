import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { QUERY_KEYS } from '@/lib/queryClient';
import type { Tables } from '@/integrations/supabase/types';

export type NfseConfig = Tables<'nfse_config'>;

/** A linha única de nfse_config (qualquer usuário autenticado lê). */
export function useNfseConfig() {
  return useQuery({
    queryKey: [QUERY_KEYS.NFSE_CONFIG, 'config'],
    queryFn: async (): Promise<NfseConfig | null> => {
      const { data, error } = await supabase.from('nfse_config').select('*').limit(1).maybeSingle();
      if (error) throw new Error('Não foi possível carregar a configuração da nota fiscal.');
      return data;
    },
  });
}
