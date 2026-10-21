/**
 * Quem mexe nas ETAPAS do funil.
 *
 * Criar, editar, reordenar e excluir etapa: Gestor (a própria Loja), Gerente
 * (a Conta e as Lojas dela) e Superadmin. O Atendente é operacional: vê as
 * etapas e move os cards, mas não muda o funil.
 *
 * Espelho da regra do banco (20261021000003, policies funnel_stages_tenant_*:
 * current_capability_role() IN ('gestor','gerente'); o superadmin pela policy
 * dele). A tela esconde os controles; quem recusa de verdade é o banco.
 */
import type { UserRole } from '@/types/userHierarchy';

export function podeConfigurarEtapas(role: UserRole | null | undefined): boolean {
  return role === 'gestor' || role === 'gerente' || role === 'superadmin';
}
