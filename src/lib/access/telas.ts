/**
 * Quem vê qual tela do painel: o REGISTRO ÚNICO.
 *
 * Desde 2026-10-26 (lote 2 do checkup de usabilidade) o menu lateral, a busca
 * rápida (Ctrl+K), a guarda de rota (TelaGuard, em App.tsx) e a Ajuda leem
 * DAQUI. Antes cada um tinha a sua regra: o menu e o ModuleGuard olhavam só
 * se o módulo estava ligado, e o atendente via telas inteiras que não podia
 * usar (achado 24 do checkup).
 *
 * Este arquivo NÃO diz o que cada cargo pode: isso continua sendo a matriz
 * `DEFAULT_CAPABILITIES` (src/types/userHierarchy.ts), espelhada no servidor.
 * Aqui só se diz qual capacidade cada tela exige. Para mudar o que um cargo vê,
 * mude a matriz; para mudar o que uma tela exige, mude a linha dela abaixo.
 * A tabela legível está em docs/PERMISSOES_POR_CARGO.md.
 *
 * Duas condições, e as duas valem:
 *   1. o módulo ligado na Conta (module_settings, o liga e desliga de produto
 *      que o superadmin controla) — quando a tela tem módulo;
 *   2. a capacidade do cargo — quando a tela exige uma.
 * O superadmin não depende de módulo (como sempre foi) e tem todas as
 * capacidades na matriz.
 */
import type { Capability, UserRole } from '@/types/userHierarchy';

export type GrupoDoMenu = 'operacao' | 'marketing' | 'configuracao' | 'equipe' | 'admin' | 'fora_do_menu';

export interface Tela {
  /** Caminho depois de /dashboard/ ('' é o Dashboard). Igual ao da rota em App.tsx. */
  chave: string;
  /** Rótulo no menu e na busca rápida. */
  nome: string;
  grupo: GrupoDoMenu;
  /** module_settings.module_name; null = não depende de módulo. */
  modulo: string | null;
  /** Capacidade exigida (matriz DEFAULT_CAPABILITIES); null = qualquer cargo com sessão. */
  capacidade: Capability | null;
  /**
   * Tela que o superadmin alcança mas que não aparece no menu dele (ele usa a
   * Administração e o seletor de Conta). Só afeta o menu, nunca a guarda.
   */
  foraDoMenuDoSuperadmin?: boolean;
}

export const TELAS: readonly Tela[] = [
  { chave: '', nome: 'Dashboard', grupo: 'operacao', modulo: null, capacidade: null },
  { chave: 'conversations', nome: 'Conversas', grupo: 'operacao', modulo: 'conversations', capacidade: 'conversations.handle' },
  { chave: 'contacts', nome: 'Contatos', grupo: 'operacao', modulo: 'contacts', capacidade: 'contacts.manage' },
  { chave: 'funnel', nome: 'Funil de Vendas', grupo: 'operacao', modulo: 'funnel', capacidade: 'contacts.manage' },

  { chave: 'tracking', nome: 'Rastreamento', grupo: 'marketing', modulo: 'tracking', capacidade: null },
  { chave: 'reports', nome: 'Relatórios', grupo: 'marketing', modulo: 'reports', capacidade: null },
  { chave: 'chatbots', nome: 'Chatbots', grupo: 'marketing', modulo: 'chatbots', capacidade: 'automations.operate' },
  { chave: 'campaigns', nome: 'Campanhas', grupo: 'marketing', modulo: 'campaigns', capacidade: 'campaigns.view_convos' },
  // Consulta só de leitura dos templates aprovados na Meta: o atendente
  // precisa dela antes de responder fora da janela de 24 horas.
  { chave: 'templates', nome: 'Templates', grupo: 'marketing', modulo: null, capacidade: null },
  { chave: 'followups', nome: 'Follow ups', grupo: 'marketing', modulo: 'followups', capacidade: 'contacts.manage' },
  { chave: 'automation', nome: 'Automação', grupo: 'marketing', modulo: 'automation', capacidade: 'automations.operate' },

  // Tudo nesta tela exige configurar o WhatsApp (o servidor recusa o resto:
  // policies whatsapp_instances_tenant_insert/update/delete). O atendente vê
  // a situação dos números no Dashboard.
  { chave: 'whatsapp-numbers', nome: 'Números de WhatsApp', grupo: 'configuracao', modulo: 'whatsapp-numbers', capacidade: 'whatsapp.configure' },
  { chave: 'settings', nome: 'Configurações', grupo: 'configuracao', modulo: null, capacidade: null },
  { chave: 'help', nome: 'Ajuda', grupo: 'configuracao', modulo: null, capacidade: null },

  { chave: 'team', nome: 'Equipe', grupo: 'equipe', modulo: null, capacidade: 'store.admin', foraDoMenuDoSuperadmin: true },
  { chave: 'store-comparison', nome: 'Comparar Lojas', grupo: 'equipe', modulo: null, capacidade: 'stores.compare', foraDoMenuDoSuperadmin: true },

  { chave: 'admin', nome: 'Administração', grupo: 'admin', modulo: null, capacidade: 'platform.ops' },
  { chave: 'admin/users', nome: 'Gestão de Usuários', grupo: 'fora_do_menu', modulo: null, capacidade: 'platform.ops' },
  { chave: 'admin/usage-limits', nome: 'Limites de uso', grupo: 'fora_do_menu', modulo: null, capacidade: 'platform.ops' },

  { chave: 'profile', nome: 'Meu Perfil', grupo: 'fora_do_menu', modulo: null, capacidade: null },
  { chave: 'notifications', nome: 'Notificações', grupo: 'fora_do_menu', modulo: null, capacidade: null },
];

/**
 * Telas operacionais (dado de cliente) que o superadmin não abre: ele passa
 * pela guarda, mas o DashboardLayout mostra "Exclusivo para Lojas". Ele só vê
 * estatísticas (Dashboard, Rastreamento, Relatórios) e administra.
 */
export const TELAS_SO_DE_LOJA: readonly string[] = [
  'conversations',
  'contacts',
  'funnel',
  'chatbots',
  'campaigns',
  'followups',
  'automation',
  'whatsapp-numbers',
];

const POR_CHAVE: ReadonlyMap<string, Tela> = new Map(TELAS.map((t) => [t.chave, t]));

/** A tela pela chave. Lança se não existir: chave errada é erro de código, não de dado. */
export function tela(chave: string): Tela {
  const t = POR_CHAVE.get(chave);
  if (!t) throw new Error(`Tela não registrada em src/lib/access/telas.ts: "${chave}"`);
  return t;
}

/** A tela de um caminho do navegador (/dashboard/chatbots/<id>/builder cai em chatbots). */
export function telaDoCaminho(pathname: string): Tela | null {
  const resto = pathname.replace(/^\/dashboard\/?/, '').replace(/\/+$/, '');
  if (POR_CHAVE.has(resto)) return POR_CHAVE.get(resto)!;
  const primeiro = resto.split('/')[0] ?? '';
  return POR_CHAVE.get(primeiro) ?? null;
}

export const caminhoDaTela = (t: Tela): string => (t.chave ? `/dashboard/${t.chave}` : '/dashboard');

/** Chave da entrada de ajuda da tela (featureHelp.ts): 'page:dashboard', 'page:admin-users'... */
export const chaveDeAjudaDaTela = (t: Tela): string => `page:${t.chave ? t.chave.replace(/\//g, '-') : 'dashboard'}`;

export type AcessoATela = 'liberado' | 'sem_capacidade' | 'modulo_desligado';

export interface ContextoDeAcesso {
  papel: UserRole | null;
  capacidades: Record<Capability, boolean>;
  /** O módulo está ligado para a pessoa? null enquanto carregam (não esconde nada). */
  moduloLigado: ((modulo: string) => boolean) | null;
}

/** A regra, sem React: o mesmo cálculo para menu, guarda, busca e Ajuda. */
export function acessoATela(t: Tela, ctx: ContextoDeAcesso): AcessoATela {
  if (t.capacidade && ctx.capacidades[t.capacidade] !== true) return 'sem_capacidade';
  if (t.modulo && ctx.papel !== 'superadmin' && ctx.moduloLigado && !ctx.moduloLigado(t.modulo)) {
    return 'modulo_desligado';
  }
  return 'liberado';
}

/** A tela aparece no menu desta pessoa? */
export function telaNoMenu(t: Tela, ctx: ContextoDeAcesso): boolean {
  if (t.grupo === 'fora_do_menu') return false;
  if (t.foraDoMenuDoSuperadmin && ctx.papel === 'superadmin') return false;
  return acessoATela(t, ctx) === 'liberado';
}

/** Quem a pessoa procura quando não alcança uma tela. Texto de interface. */
export function aQuemPedir(papel: UserRole | null, motivo: Exclude<AcessoATela, 'liberado'>): string {
  if (motivo === 'modulo_desligado') {
    return papel === 'gerente'
      ? 'Esta parte do sistema não está ligada na sua Conta. Para ligar, escreva para contato@convoflow.com.br.'
      : 'Esta parte do sistema não está ligada na sua Conta. Se você precisa dela, fale com o Gerente da sua Conta.';
  }
  switch (papel) {
    case 'atendente':
      return 'Esta tela é do Gestor da sua Loja. Se você precisa de algo aqui, peça a ele.';
    case 'gestor':
      return 'Esta tela é do Gerente da sua Conta. Se você precisa de algo aqui, peça a ele.';
    case 'gerente':
      return 'Esta tela é da equipe do ConvoFlow. Se precisar de ajuda, escreva para contato@convoflow.com.br.';
    default:
      return 'Se você acha que deveria ver esta tela, fale com quem administra a sua Conta.';
  }
}
