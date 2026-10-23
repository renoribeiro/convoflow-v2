import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { mensagemDaEdgeFunction } from '@/lib/edgeFunctionError';
import { dataCurta } from '@/lib/billing/subscriptionActions';
import { API_ADDON_PRICE_LABEL } from '@/lib/api/release';

// =============================================================================
// Complemento "API e integrações": estado, textos e chamadas (R$ 99,90/mês)
// =============================================================================

/**
 * Chaves do TanStack Query. Nenhuma delas começa por um segmento das faixas
 * realtime/estática de queryClient.ts, então caem em semiStatic (5 min). Quem
 * muda o estado invalida na hora.
 */
export const API_QUERY_KEYS = {
  ADDON: 'api-addon',
  CHAVES: 'api-chaves',
  LOJAS: 'api-lojas-da-conta',
} as const;

export type MotivoAddon = 'teste_gratis' | 'pago' | 'ate_fim_do_ciclo' | 'manual' | 'desligado' | 'sem_conta';

export interface EstadoAddon {
  ativo: boolean;
  motivo: MotivoAddon;
  ate: string | null;
}

/** As RPCs novas ainda não estão em types.ts: este é o corte estreito para chamá-las. */
interface ClienteRpc {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
}

export async function chamarRpcApi<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await (supabase as unknown as ClienteRpc).rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export async function buscarEstadoAddon(contaId: string): Promise<EstadoAddon | null> {
  const linhas = await chamarRpcApi<EstadoAddon[] | EstadoAddon | null>('api_addon_estado', { p_conta: contaId });
  if (Array.isArray(linhas)) return linhas[0] ?? null;
  return linhas ?? null;
}

export function useApiAddonEstado(contaId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: [API_QUERY_KEYS.ADDON, contaId],
    enabled: enabled && !!contaId,
    queryFn: () => buscarEstadoAddon(contaId as string),
  });
}

export interface RespostaUpdateApiAddon {
  success: boolean;
  cobrado: boolean;
  ate: string | null;
  estado: EstadoAddon;
}

/** Liga ou desliga o complemento pela edge function update-api-addon. */
export async function atualizarApiAddon(ligar: boolean): Promise<RespostaUpdateApiAddon> {
  const { data, error } = await supabase.functions.invoke('update-api-addon', { body: { ligar } });
  if (error) {
    throw new Error(await mensagemDaEdgeFunction(error, 'Não foi possível alterar a API agora. Tente de novo em alguns minutos.'));
  }
  if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : data.error.message);
  return data as RespostaUpdateApiAddon;
}

export async function ligarApiManual(contaId: string, ligar: boolean): Promise<void> {
  await chamarRpcApi<void>('api_addon_liberar_manual', { p_conta: contaId, p_ligar: ligar });
}

// -----------------------------------------------------------------------------
// Cartão em Configurações › Assinatura
// -----------------------------------------------------------------------------

export type SituacaoCartao =
  | 'teste'
  | 'manual'
  | 'sem_assinatura'
  | 'past_due'
  | 'desligada'
  | 'ligada'
  | 'ate_fim_do_ciclo';

export function situacaoDoCartao(i: {
  estado: EstadoAddon | null | undefined;
  status: string | null | undefined;
  temAssinatura: boolean;
  acessoManual: boolean;
}): SituacaoCartao {
  if (i.status === 'trialing') return 'teste';
  if (!i.temAssinatura) return i.acessoManual ? 'manual' : 'sem_assinatura';
  if (i.estado?.ativo && i.estado.motivo === 'ate_fim_do_ciclo') return 'ate_fim_do_ciclo';
  if (i.estado?.ativo) return 'ligada';
  if (i.status === 'past_due') return 'past_due';
  return 'desligada';
}

export const TEXTO_LIGAR = `Você contrata a API e integrações por ${API_ADDON_PRICE_LABEL} por mês. Hoje entra na próxima fatura só o valor proporcional aos dias que faltam do mês. Para desligar depois: o valor sai da fatura seguinte, sem crédito, e as chaves funcionam até o fim do mês já pago.`;
export const TEXTO_DESLIGAR =
  'O valor sai da próxima fatura, sem crédito. As chaves seguem funcionando até o fim do mês já pago e depois ficam suspensas (não são apagadas).';
export const TEXTO_RELIGAR = `Como este mês já está pago, religar agora não gera cobrança extra. A partir do próximo mês volta o valor de ${API_ADDON_PRICE_LABEL}.`;

export function textoAteFimDoCiclo(ate: string | null | undefined): string {
  const data = dataCurta(ate);
  return data ? `Desligada. As chaves funcionam até ${data}.` : 'Desligada. As chaves funcionam até o fim do mês já pago.';
}

// -----------------------------------------------------------------------------
// Chave "API liberada" do superadmin
// -----------------------------------------------------------------------------

/**
 * O superadmin só liga a API na mão para Conta de acesso manual, sem assinatura
 * que cobra. Cortesia para quem paga é cupom do Stripe, não esta chave.
 */
export function podeLiberarApiManual(
  conta: { manual_access_granted?: boolean | null; subscription_status?: string | null } | null | undefined,
): boolean {
  if (!conta?.manual_access_granted) return false;
  const status = conta.subscription_status ?? null;
  return status !== 'active' && status !== 'trialing' && status !== 'past_due';
}
