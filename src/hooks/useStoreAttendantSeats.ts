import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { QUERY_KEYS } from '@/lib/queryClient';
import { normalizeRole, AnyUserRole } from '@/types/userHierarchy';
import { parseSeatsRows, seatsByStore, type StoreSeats } from '@/lib/users/attendantSeats';

const FALHA_LEITURA = 'Não foi possível ler as vagas de atendente.';
const FALHA_GRAVACAO = 'Não foi possível salvar as vagas. Tente novamente.';

/**
 * Vagas de atendente das Lojas no alcance de quem está logado — RPC
 * `store_attendant_seats` (migração 20261009000003):
 *   gerente    → as Lojas da Conta dele;
 *   gestor     → a Loja dele;
 *   superadmin → as Lojas da Conta (ou a Loja) passada em `tenantId`;
 *                sem `tenantId`, não consulta (seriam todas as Lojas).
 * Atendente não consulta: a RPC devolveria nada.
 */
export function useStoreAttendantSeats(options?: { tenantId?: string | null; enabled?: boolean }) {
  const { profile } = useTenant();
  const role = normalizeRole(profile?.role as AnyUserRole | undefined);
  const alvo = role === 'superadmin' ? options?.tenantId ?? null : null;
  const enabled =
    (options?.enabled ?? true) &&
    !!profile &&
    (role === 'gerente' || role === 'gestor' || (role === 'superadmin' && !!alvo));

  const query = useQuery({
    queryKey: [QUERY_KEYS.ATTENDANT_SEATS, profile?.id ?? null, alvo],
    enabled,
    queryFn: async (): Promise<StoreSeats[]> => {
      // Cast local: função nova, fora dos tipos gerados.
      const { data, error } = await (supabase as any).rpc('store_attendant_seats', {
        p_tenant_id: alvo,
      });
      if (error) throw new Error(FALHA_LEITURA);
      return parseSeatsRows(data);
    },
  });

  const seats = query.data ?? [];
  return {
    seats,
    byStore: seatsByStore(seats),
    isLoading: enabled && query.isLoading,
    error: query.error,
  };
}

/**
 * Superadmin: muda as vagas extras de atendente de uma Loja (RPC
 * `set_store_extra_attendants`). A RPC recusa ficar abaixo do que a Loja usa
 * e devolve a frase em português; ela vai direto para a tela.
 */
export function useSetStoreExtraAttendants() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { storeId: string; extra: number; note?: string }) => {
      const { data, error } = await (supabase as any).rpc('set_store_extra_attendants', {
        p_store_id: input.storeId,
        p_extra: input.extra,
        p_note: input.note ?? null,
      });
      if (error) {
        const code = typeof error.code === 'string' ? error.code : '';
        const mensagem = typeof error.message === 'string' ? error.message : '';
        throw new Error(!mensagem || code.startsWith('PGRST') ? FALHA_GRAVACAO : mensagem);
      }
      return data as { limite: number; usados: number; changed: boolean } | null;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QUERY_KEYS.ATTENDANT_SEATS] }),
  });
}
