import { supabase } from '@/integrations/supabase/client';

/**
 * Hook simples para acessar o cliente Supabase
 * @returns Objeto contendo o cliente supabase
 */
export function useSupabase() {
  return {
    supabase
  };
}