import { SAFE_INSTANCE_SELECT } from '@/lib/whatsapp/safeInstanceColumns';

/**
 * Tabelas em que o navegador NÃO pode pedir a linha inteira.
 *
 * Desde a sessão 3 do docs/RUNBOOK_segredos_das_instancias.md (migração
 * 20261026000002), `authenticated` e `anon` leem e gravam `whatsapp_instances`
 * coluna por coluna, sem `evolution_api_key`, `evolution_api_url` e `qr_code`.
 * Um `select('*')` (ou `.select()` depois de insert/update, que é o mesmo
 * `*`) nessa tabela volta 42501 e a tela quebra. Os ajudantes genéricos
 * (`useSupabaseQuery`, `useSupabaseMutation` e os "enhanced") usam
 * `colunasPadrao(tabela)` no lugar do `*`.
 */
export const COLUNAS_PADRAO_POR_TABELA: Readonly<Record<string, string>> = {
  whatsapp_instances: SAFE_INSTANCE_SELECT,
};

/** O `select` padrão de uma tabela: as colunas permitidas, ou `*`. */
export function colunasPadrao(tabela: string): string {
  return COLUNAS_PADRAO_POR_TABELA[tabela] ?? '*';
}

/**
 * As colunas que o navegador não lê nem grava (só o servidor, com a chave dele).
 * As três primeiras são segredo; `registered_elsewhere` (20261111000003) não é
 * segredo, mas é decisão do servidor: se a tela gravasse, um Gestor desligaria
 * o aquecimento do número à mão.
 */
export const COLUNAS_FECHADAS_INSTANCIA = ['evolution_api_key', 'evolution_api_url', 'qr_code', 'registered_elsewhere'] as const;
