/**
 * Quem lê qual conteúdo de ajuda: a regra, sem React.
 *
 * Não existe fonte de permissão nova aqui.
 *  - A entrada de uma TELA do painel (`page:<tela>`) segue o registro único de
 *    telas (src/lib/access/telas.ts), o mesmo do menu, da busca rápida e da
 *    TelaGuard: quem não alcança a tela não lê a ajuda dela.
 *  - O resto (abas de Configurações, tutoriais, tours, passos da lista) declara
 *    o próprio requisito: `moduleName`, `minRole` e `capacidade` (a matriz
 *    DEFAULT_CAPABILITIES).
 *
 * O gancho useHelpVisibility só junta o contexto da pessoa e chama estas
 * funções; a matriz de cobertura (src/lib/help/cobertura.ts) chama as mesmas
 * para cada cargo.
 */
import { roleAtLeast, type Capability, type UserRole } from '@/types/userHierarchy';
import { TELAS, acessoATela, chaveDeAjudaDaTela, type ContextoDeAcesso, type Tela } from '@/lib/access/telas';
import type { FeatureHelpEntry } from './featureHelp';

/** O que qualquer conteúdo pode declarar sobre o acesso à tela que descreve. */
export interface HelpAccessDeclaration {
  moduleName?: string;
  minRole?: UserRole;
  /** Capacidade da matriz DEFAULT_CAPABILITIES que o conteúdo exige. */
  capacidade?: Capability;
}

const TELA_DA_AJUDA: ReadonlyMap<string, Tela> = new Map(TELAS.map((t) => [chaveDeAjudaDaTela(t), t]));

/**
 * O requisito declarado vale para esta pessoa?
 *
 * O superadmin lê tudo: ele opera a plataforma e dá suporte sobre todas as
 * telas, inclusive as que o DashboardLayout bloqueia por privacidade
 * (TELAS_SO_DE_LOJA). Ler a documentação não é acessar dado de cliente.
 *
 * Enquanto os módulos carregam (`moduloLigado` null), não esconde nada: é a
 * mesma tolerância do menu lateral, que evita a lista "piscar".
 */
export function podeAcessarConteudo(req: HelpAccessDeclaration, ctx: ContextoDeAcesso): boolean {
  if (ctx.papel === 'superadmin') return true;
  if (req.minRole && !roleAtLeast(ctx.papel, req.minRole)) return false;
  if (req.capacidade && ctx.capacidades[req.capacidade] !== true) return false;
  if (req.moduleName && ctx.moduloLigado && !ctx.moduloLigado(req.moduleName)) return false;
  return true;
}

/** A entrada aparece na página de Ajuda para esta pessoa? */
export function podeLerEntrada(entry: FeatureHelpEntry & { key?: string }, ctx: ContextoDeAcesso): boolean {
  // Chatbot, automações e conceitos não são presos a tela: valem para todos.
  if (entry.category !== 'tela') return true;
  if (ctx.papel === 'superadmin') return true;
  const t = entry.key ? TELA_DA_AJUDA.get(entry.key) : undefined;
  if (t) return acessoATela(t, ctx) === 'liberado';
  return podeAcessarConteudo(entry, ctx);
}
