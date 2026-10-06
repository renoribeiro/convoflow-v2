import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

/**
 * Lê o estado do modo de manutenção.
 *
 * DE PROPÓSITO SEPARADO DO PAYWALL. Não reaproveita `useTenantAccess` nem nada
 * de `lib/access/`: são duas perguntas diferentes ("esta Conta pagou?" e "o
 * sistema inteiro está parado?") com dois donos diferentes e dois jeitos
 * diferentes de errar. Juntá-las faria cada mudança em uma exigir reler a
 * outra.
 *
 * QUEM RESPONDE É O SERVIDOR. A RPC `maintenance_state` já devolve `active`
 * calculado com o relógio do banco. O front não recalcula a janela: se o
 * computador do usuário estiver com a data errada, isso não pode ligar nem
 * desligar a manutenção para ele.
 *
 * FALHA ABERTA. RPC ausente (SQL ainda não aplicado), permissão negada, rede
 * caindo — tudo resulta em `active: false`. Este bloqueio tranca a base inteira
 * de clientes; uma soluçada do banco não pode ser o gatilho. O erro fica
 * visível em `unreadable`, que o superadmin vê no painel, mas nunca bloqueia.
 *
 * A CHAVE É PÚBLICA. A função tem GRANT para `anon`, porque a tela de login
 * precisa avisar antes de existir sessão.
 */
export interface MaintenanceState {
  /** Primeira leitura ainda no ar. Só é `true` enquanto não há resposta nenhuma. */
  loading: boolean;
  /** Bloqueia todo mundo que não é superadmin. */
  active: boolean;
  /** Ligada, mas a janela ainda não começou. Sistema aberto. */
  scheduled: boolean;
  reason: string | null;
  startsAt: string | null;
  /** Fim da janela — a previsão de retorno mostrada ao usuário. */
  endsAt: string | null;
  /** A leitura falhou. Falha aberta, mas o superadmin merece saber. */
  unreadable: boolean;
  /** Repergunta agora (botão "Tentar de novo" da tela de manutenção). */
  refetch: () => void;
}

const DESLIGADO = {
  active: false,
  scheduled: false,
  reason: null as string | null,
  startsAt: null as string | null,
  endsAt: null as string | null,
};

export const MAINTENANCE_QUERY_KEY = ['maintenance', 'state'] as const;

/**
 * De quanto em quanto tempo a página repergunta.
 *
 * É isto que solta a tela de quem está bloqueado quando a manutenção acaba:
 * sem o refetch, a pessoa ficaria olhando a tela de manutenção até recarregar
 * na mão, e a impressão seria de que o sistema não voltou.
 */
const INTERVALO_MS = 60_000;

export function useMaintenanceMode(): MaintenanceState {
  const consulta = useQuery({
    queryKey: MAINTENANCE_QUERY_KEY,
    // A faixa padrão do queryClient (5 min) é longa demais aqui: são 5 minutos
    // de clientes trancados depois que a manutenção já acabou.
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchInterval: INTERVALO_MS,
    refetchIntervalInBackground: false,
    // Duas tentativas bastam. Os erros prováveis — função não aplicada,
    // permissão negada — são permanentes, e insistir só prolonga o tempo que a
    // pessoa passa olhando o carregando antes de a falha abrir o sistema.
    retry: 1,
    retryDelay: 400,
    queryFn: async () => {
      // Cast local: função nova, fora dos tipos gerados em types.ts.
      const { data, error } = await (supabase as any).rpc('maintenance_state');

      if (error) {
        logger.warn('[useMaintenanceMode] maintenance_state falhou; sistema segue aberto', {
          message: error.message,
        });
        throw error;
      }

      const linha = Array.isArray(data) ? data[0] : data;
      if (!linha) return DESLIGADO;

      return {
        active: linha.active === true,
        scheduled: linha.scheduled === true,
        reason: (linha.reason as string | null) ?? null,
        startsAt: (linha.starts_at as string | null) ?? null,
        endsAt: (linha.ends_at as string | null) ?? null,
      };
    },
  });

  const dados = consulta.data ?? DESLIGADO;

  return {
    // `isLoading` só é true sem nenhum dado em mãos. Um refetch de fundo não
    // devolve a tela ao carregando nem pisca a tela de manutenção.
    loading: consulta.isLoading,
    active: dados.active,
    scheduled: dados.scheduled,
    reason: dados.reason,
    startsAt: dados.startsAt,
    endsAt: dados.endsAt,
    unreadable: consulta.isError,
    refetch: () => {
      void consulta.refetch();
    },
  };
}
