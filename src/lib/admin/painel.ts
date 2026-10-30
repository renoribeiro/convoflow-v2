/**
 * Regras pequenas do painel de Administração (lote 6f, achados 132 a 134),
 * fora do componente para o teste provar sem tela.
 */

/** As abas do painel, na ordem da tela. O endereço escolhe com ?tab=. */
export const ABAS_DO_ADMIN = ['overview', 'users', 'signups', 'billing', 'reports', 'settings'] as const;
export type AbaDoAdmin = (typeof ABAS_DO_ADMIN)[number];

/**
 * A aba que o endereço pede, ou a Visão Geral. É o que deixa a faixa de
 * manutenção abrir direto em Configurações, onde a manutenção mora
 * (achado 134: abria sempre na Visão Geral).
 */
export function abaDoAdmin(pedida: string | null | undefined): AbaDoAdmin {
  return (ABAS_DO_ADMIN as readonly string[]).includes(pedida ?? '') ? (pedida as AbaDoAdmin) : 'overview';
}

/** Onde a faixa de manutenção leva: a aba Configurações do painel. */
export const CAMINHO_DA_MANUTENCAO = '/dashboard/admin?tab=settings';

export interface EstruturaDaPlataforma {
  /** tenants com kind 'account'. */
  contas: number;
  /** tenants com kind 'store'. */
  lojas: number;
}

/**
 * Contas e Lojas contadas pela estrutura de verdade (tenants.kind), não pelos
 * cargos (achado 132). Contar Gerentes como Contas e Gestores como Lojas
 * errava para os dois lados: uma Loja sem Gestor não contava, e uma Loja com
 * dois Gestores contava duas vezes.
 */
export function contarEstrutura(tenants: ReadonlyArray<{ kind?: string | null }>): EstruturaDaPlataforma {
  let contas = 0;
  let lojas = 0;
  for (const t of tenants) {
    if (t.kind === 'account') contas += 1;
    else if (t.kind === 'store') lojas += 1;
  }
  return { contas, lojas };
}
