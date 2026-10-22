/**
 * Funil vazio, ou aberto na Conta: o que mostrar no lugar do quadro e do
 * formulário de "Novo Lead".
 *
 * O FUNIL É SEMPRE DE UMA LOJA (decisão de 2026-10-21). Medido em produção
 * nesse dia: nenhuma Conta tinha etapa, nenhum contato de Conta tinha etapa,
 * nenhuma sequência de follow-up usava etapa de Conta. Por isso, com a Conta
 * em foco no seletor do topo, o Gerente é levado a escolher a Loja antes de
 * ver o quadro, cadastrar lead ou configurar etapas. A função
 * funnel_criar_etapas_padrao também recusa Conta (22023).
 *
 * Funções puras, para o teste provar cada caso sem tela.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { UserRole } from '@/types/userHierarchy';
import { podeConfigurarEtapas } from './permissoes';

export type SituacaoFunil =
  /** Gerente com a Conta em foco: escolher a Loja. */
  | 'conta'
  /** Loja sem etapa, para quem pode criar (Gestor, Gerente). */
  | 'sem-etapas-configura'
  /** Loja sem etapa, para o Atendente: pedir a quem pode. */
  | 'sem-etapas-atendente'
  | 'pronto';

export function situacaoDoFunil(args: {
  role: UserRole | null | undefined;
  /** A Conta/Loja em foco é uma Conta (kind = 'account')? */
  emConta: boolean;
  temEtapas: boolean;
}): SituacaoFunil {
  if (args.role === 'gerente' && args.emConta) return 'conta';
  if (args.temEtapas) return 'pronto';
  return podeConfigurarEtapas(args.role) ? 'sem-etapas-configura' : 'sem-etapas-atendente';
}

/**
 * As etapas de "Usar etapas prontas", na ordem. A fonte é a função SQL
 * funnel_criar_etapas_padrao (20261021000004); esta lista é para o texto da
 * tela, e src/lib/funnel/etapasPadraoSql.test.ts confere que as duas batem.
 */
export const ETAPAS_PADRAO = ['Novo contato', 'Em atendimento', 'Proposta', 'Fechado', 'Perdido'] as const;

/** "Novo contato, Em atendimento, Proposta, Fechado e Perdido". */
export const ETAPAS_PADRAO_TEXTO = `${ETAPAS_PADRAO.slice(0, -1).join(', ')} e ${ETAPAS_PADRAO[ETAPAS_PADRAO.length - 1]}`;

/** Cria as etapas prontas numa Loja vazia. Devolve quantas criou (5, ou 0 se já havia). */
export async function criarEtapasPadrao(client: SupabaseClient<Database>, tenantId: string): Promise<number> {
  const { data, error } = await client.rpc('funnel_criar_etapas_padrao', { p_tenant_id: tenantId });
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}
