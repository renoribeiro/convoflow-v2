/**
 * Quem mexe nas ETAPAS do funil.
 *
 * Criar, editar, reordenar e excluir etapa: Gestor (a própria Loja), Gerente
 * (a Conta e as Lojas dela) e Superadmin. O Atendente é operacional: vê as
 * etapas e move os cards, mas não muda o funil.
 *
 * Desde 2026-10-26 a regra sai da matriz de capacidades (store.admin), a fonte
 * única de quem pode o quê (src/types/userHierarchy.ts, tabela em
 * docs/PERMISSOES_POR_CARGO.md). Antes era uma lista de cargos escrita aqui.
 *
 * O banco confere pelo CARGO, não pela capacidade (20261021000003, policies
 * funnel_stages_tenant_*: current_capability_role() IN ('gestor','gerente'); o
 * superadmin pela policy dele). Hoje dá no mesmo, porque store.admin é
 * exatamente desses três cargos. A tela esconde os controles; quem recusa de
 * verdade é o banco.
 */
import { can, type UserRole } from '@/types/userHierarchy';

export function podeConfigurarEtapas(role: UserRole | null | undefined): boolean {
  if (!role) return false;
  return can(role, 'store.admin');
}
