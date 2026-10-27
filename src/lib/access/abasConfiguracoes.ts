/**
 * As abas de Configurações (src/pages/Settings.tsx): nome, quem alcança e a
 * ajuda de cada uma. A página lê DAQUI os rótulos, a regra e a chave de ajuda;
 * a matriz de cobertura da ajuda (src/lib/help/cobertura.ts) também.
 *
 * Os porquês de cada regra estão comentados em Settings.tsx, junto do conteúdo
 * da aba.
 */
import type { Capability } from '@/types/userHierarchy';

export interface AbaDeConfiguracoes {
  /** Valor do `?tab=` na URL. */
  value: string;
  label: string;
  /** Capacidade exigida para a aba existir. Ausente = todo mundo vê. */
  requer?: Capability;
  /**
   * Só o Gerente, e só com a API liberada para o público ou já ligada na
   * Conta dele (Conta de teste que o superadmin ligou).
   */
  soGerenteComApi?: boolean;
  /** Entrada de ajuda da aba (src/lib/help/featureHelp.ts). */
  helpKey: string;
}

export const ABAS_DE_CONFIGURACOES: readonly AbaDeConfiguracoes[] = [
  { value: 'profile', label: 'Perfil', helpKey: 'page:settings-profile' },
  { value: 'attendance', label: 'Atendimento', helpKey: 'page:settings-attendance' },
  { value: 'visibility', label: 'Distribuição e transferência', helpKey: 'page:settings-visibility' },
  { value: 'quick-replies', label: 'Respostas rápidas', helpKey: 'page:settings-quick-replies' },
  { value: 'followups', label: 'Follow ups', helpKey: 'page:settings-followups' },
  { value: 'subscription', label: 'Assinatura', requer: 'billing.view', helpKey: 'page:settings-subscription' },
  { value: 'security', label: 'Segurança', helpKey: 'page:settings-security' },
  { value: 'integrations', label: 'Avisos para sistemas', requer: 'store.admin', helpKey: 'page:settings-integrations' },
  { value: 'api', label: 'Chaves de API', soGerenteComApi: true, helpKey: 'page:settings-api' },
];

/** A aba pelo valor do `?tab=`. Lança se não existir: valor errado é erro de código. */
export function abaDeConfiguracoes(value: string): AbaDeConfiguracoes {
  const aba = ABAS_DE_CONFIGURACOES.find((a) => a.value === value);
  if (!aba) throw new Error(`Aba não registrada em src/lib/access/abasConfiguracoes.ts: "${value}"`);
  return aba;
}
