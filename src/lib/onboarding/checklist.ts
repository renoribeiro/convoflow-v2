/**
 * Lista "Primeiros passos" do Dashboard, por cargo.
 *
 * O QUE ESTÁ FEITO nunca é gravado: vem da função onboarding_checklist(tenant)
 * (migração 20261021000001), que olha o dado real a cada chamada e devolve
 * verdadeiro/falso por passo. A chave de cada passo aqui é a MESMA chave de
 * `passos` que a função devolve; o teste checklist.test.ts confere a lista.
 *
 * ESCOPO (decidido na função, não aqui):
 *   Gerente   → a Conta inteira (Conta + todas as Lojas), qualquer que seja a
 *               Loja escolhida no seletor do topo.
 *   Gestor    → a própria Loja.
 *   Atendente → passos pessoais (foto e primeira resposta).
 *   Superadmin→ nada.
 *
 * QUEM VÊ A LISTA (ver decideChecklistView):
 *   - quem chegou depois de 2026-10-21: até cumprir os obrigatórios e os
 *     recomendados (o opcional não segura a lista), ou até clicar em Esconder;
 *   - o veterano (backfill da migração): só enquanto houver passo OBRIGATÓRIO
 *     pendente na Conta/Loja dele.
 *
 * Funções puras, para o teste provar as regras sem banco nem React.
 */
import type { UserRole } from '@/types/userHierarchy';
import type { HelpAccessDeclaration } from '@/hooks/useHelpVisibility';
import type { OnboardingRole, OnboardingState } from './state';
import { isOnboardingRole } from './state';

export type StepPriority = 'obrigatorio' | 'recomendado' | 'opcional';

export const PRIORITY_LABELS: Record<StepPriority, string> = {
  obrigatorio: 'Obrigatório',
  recomendado: 'Recomendado',
  opcional: 'Opcional',
};

export interface ChecklistStepDef {
  /** Chave em `passos` da função onboarding_checklist. */
  id: string;
  title: string;
  description: string;
  priority: StepPriority;
  /** Tela que "Fazer agora" abre. Sem tela: o passo não tem ação para este cargo. */
  screen?: string;
  /** Tour que roda na tela (src/lib/onboarding/tours.ts). */
  tourId?: string;
  /** "Ver passo a passo": tutorial da Ajuda... */
  tutorialId?: string;
  /** ...ou, quando não há tutorial, a entrada de referência. */
  helpKey?: string;
  /** Gerente: o passo acontece dentro de uma Loja (seletor do topo). */
  needsLoja?: boolean;
  /** Mesmo padrão do featureHelp/tutorials, filtrado pelo useHelpVisibility. */
  minRole?: UserRole;
  moduleName?: string;
}

// ------------------------------------------------------------------ passos
const whatsapp = (needsLoja: boolean): ChecklistStepDef => ({
  id: 'whatsapp',
  title: 'Conectar o WhatsApp',
  description: 'Sem um número conectado não há conversa, chatbot nem campanha.',
  priority: 'obrigatorio',
  screen: '/dashboard/whatsapp-numbers',
  tourId: 'conectar-whatsapp',
  tutorialId: 'conectar-whatsapp',
  needsLoja,
  minRole: 'gestor',
  moduleName: 'whatsapp-numbers',
});

const respostasRapidas = (needsLoja: boolean): ChecklistStepDef => ({
  id: 'respostas_rapidas',
  title: 'Criar respostas rápidas',
  description: 'Os textos que o time repete todo dia, prontos em um clique.',
  priority: 'recomendado',
  screen: '/dashboard/settings?tab=quick-replies',
  tourId: 'respostas-rapidas',
  helpKey: 'page:settings-quick-replies',
  needsLoja,
});

const horario = (needsLoja: boolean): ChecklistStepDef => ({
  id: 'horario',
  title: 'Definir horário e distribuição',
  description: 'Quando a Loja atende e como as conversas novas chegam ao time.',
  priority: 'recomendado',
  screen: '/dashboard/settings?tab=visibility',
  tourId: 'horario-distribuicao',
  tutorialId: 'configurar-distribuicao',
  helpKey: 'page:settings-visibility',
  needsLoja,
  minRole: 'gestor',
});

const chatbot = (needsLoja: boolean): ChecklistStepDef => ({
  id: 'chatbot',
  title: 'Criar um chatbot',
  description: 'Um primeiro atendimento automático, para ninguém ficar sem resposta.',
  priority: 'opcional',
  screen: '/dashboard/chatbots',
  tourId: 'criar-chatbot',
  tutorialId: 'primeiro-chatbot',
  needsLoja,
  moduleName: 'chatbots',
});

export const CHECKLISTS: Record<OnboardingRole, ChecklistStepDef[]> = {
  gerente: [
    {
      id: 'assinatura',
      title: 'Assinatura ativa',
      description: 'Sua Conta está liberada.',
      priority: 'obrigatorio',
      helpKey: 'page:settings-subscription',
      minRole: 'gerente',
    },
    {
      id: 'dados_fiscais',
      title: 'Dados para a nota fiscal',
      description: 'CPF ou CNPJ e endereço da Conta, para a nota sair certa.',
      priority: 'recomendado',
      screen: '/dashboard/settings?tab=subscription',
      tourId: 'dados-fiscais',
      helpKey: 'page:settings-subscription',
      minRole: 'gerente',
    },
    {
      id: 'loja',
      title: 'Criar sua primeira Loja',
      description: 'É na Loja que ficam o número, as conversas e a equipe.',
      priority: 'obrigatorio',
      screen: '/dashboard/team',
      tourId: 'criar-loja',
      tutorialId: 'configurar-equipe',
      minRole: 'gerente',
    },
    whatsapp(true),
    {
      id: 'equipe',
      title: 'Convidar a equipe',
      description: 'Gestor e atendentes, cada um na Loja onde trabalha.',
      priority: 'obrigatorio',
      screen: '/dashboard/team',
      tourId: 'convidar-equipe',
      tutorialId: 'configurar-equipe',
      minRole: 'gestor',
    },
    {
      // Etapas são de cada Loja: o Gerente grava nas Lojas da Conta dele
      // desde 20261021000002 (antes só lia), por isso needsLoja.
      id: 'funil',
      title: 'Montar o funil de vendas',
      description: 'As etapas do processo de venda de cada Loja, do primeiro contato até a venda.',
      priority: 'recomendado',
      screen: '/dashboard/funnel',
      tourId: 'configurar-funil',
      tutorialId: 'montar-funil',
      needsLoja: true,
      moduleName: 'funnel',
    },
    respostasRapidas(true),
    horario(true),
    chatbot(true),
  ],
  gestor: [
    whatsapp(false),
    {
      id: 'equipe',
      title: 'Convidar os atendentes',
      description: 'Cada atendente entra com o próprio acesso, na sua Loja.',
      priority: 'obrigatorio',
      screen: '/dashboard/team',
      tourId: 'convidar-equipe',
      tutorialId: 'configurar-equipe',
      minRole: 'gestor',
    },
    {
      id: 'funil',
      title: 'Montar o funil de vendas',
      description: 'As etapas do seu processo, do primeiro contato até a venda.',
      priority: 'recomendado',
      screen: '/dashboard/funnel',
      tourId: 'configurar-funil',
      tutorialId: 'montar-funil',
      moduleName: 'funnel',
    },
    respostasRapidas(false),
    horario(false),
    chatbot(false),
  ],
  atendente: [
    {
      id: 'foto',
      title: 'Colocar sua foto',
      description: 'O time reconhece você nas transferências.',
      priority: 'recomendado',
      screen: '/dashboard/settings?tab=profile',
      tourId: 'foto-perfil',
      helpKey: 'page:settings-profile',
    },
    // O passo "Escolher suas notificações" saiu em 2026-10-25 (achado 113 do
    // checkup, ops-privado/checkup-ux/RELATORIO_CHECKUP_UX.md): a preferência
    // era gravada e nada a lia. Volta junto com a preferência de verdade, com
    // a chave na função onboarding_checklist (migração nova) e o tour.
    {
      id: 'primeira_resposta',
      title: 'Responder sua primeira conversa',
      description: 'Assuma uma conversa da fila e responda o cliente.',
      priority: 'recomendado',
      screen: '/dashboard/conversations',
      tourId: 'conversas',
      tutorialId: 'atender-conversas',
      moduleName: 'conversations',
    },
  ],
};

// ------------------------------------------------------- resposta do banco
export interface ChecklistStatus {
  papel: OnboardingRole;
  /** Conta (gerente) ou Loja (gestor/atendente) do escopo. */
  tenantId: string | null;
  /** Gerente: quantas Lojas a Conta tem. */
  lojas: number | null;
  passos: Record<string, boolean>;
}

/** Lê a resposta da função sem confiar nela. Superadmin e lixo viram null. */
export function parseChecklistStatus(raw: unknown): ChecklistStatus | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const papel = r.papel as UserRole | undefined;
  if (!isOnboardingRole(papel)) return null;
  const passosRaw = r.passos;
  if (!passosRaw || typeof passosRaw !== 'object' || Array.isArray(passosRaw)) return null;
  const passos: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(passosRaw)) passos[k] = v === true;
  return {
    papel,
    tenantId: typeof r.tenant_id === 'string' ? r.tenant_id : null,
    lojas: typeof r.lojas === 'number' ? r.lojas : null,
    passos,
  };
}

// ------------------------------------------------------------- montagem
export interface ChecklistItem extends ChecklistStepDef {
  done: boolean;
}

export interface ChecklistSummary {
  items: ChecklistItem[];
  done: number;
  total: number;
  requiredPending: number;
  /** Obrigatórios e recomendados feitos. O opcional não segura a lista. */
  complete: boolean;
}

/**
 * Os passos do cargo, com o feito de cada um, já filtrados pelo acesso
 * (`canAccess` = useHelpVisibility().canAccess: módulo desligado ou cargo
 * abaixo do mínimo some da lista, como some da Ajuda).
 */
export function buildChecklist(
  role: OnboardingRole,
  status: ChecklistStatus,
  canAccess: (req: HelpAccessDeclaration) => boolean,
): ChecklistSummary {
  const items = CHECKLISTS[role]
    .filter((def) => canAccess(def))
    .map((def) => ({ ...def, done: status.passos[def.id] === true }));
  const done = items.filter((i) => i.done).length;
  const requiredPending = items.filter((i) => i.priority === 'obrigatorio' && !i.done).length;
  const complete = items.every((i) => i.done || i.priority === 'opcional');
  return { items, done, total: items.length, requiredPending, complete };
}

export type ChecklistView = 'oculto' | 'lista' | 'pronto';

/** Mostra a lista, o "tudo pronto" ou nada. Ver as regras no topo do arquivo. */
export function decideChecklistView(args: {
  role: UserRole | null | undefined;
  state: OnboardingState | null | undefined;
  status: ChecklistStatus | null | undefined;
  summary: ChecklistSummary | null | undefined;
}): ChecklistView {
  const { role, state, status, summary } = args;
  if (!isOnboardingRole(role) || !state || !status || !summary) return 'oculto';
  // Cargo mudou desde a leitura (ou a função respondeu por outro): não arrisca.
  if (status.papel !== role) return 'oculto';
  if (state.lista_escondida_em) return 'oculto';
  if (summary.total === 0) return 'oculto';
  if (state.veterano) return summary.requiredPending > 0 ? 'lista' : 'oculto';
  return summary.complete ? 'pronto' : 'lista';
}

// ------------------------------------------------------------ Fazer agora
export type FazerAgora =
  | { tipo: 'abrir'; screen: string; tourId?: string }
  | { tipo: 'trocar-loja'; lojaId: string; lojaNome: string; screen: string; tourId?: string }
  | { tipo: 'escolher-loja'; tourId: 'escolher-loja' }
  | { tipo: 'criar-loja'; screen: '/dashboard/team'; tourId: 'criar-loja' }
  | { tipo: 'nada' };

/**
 * O que "Fazer agora" faz. Só o Gerente tem desvio: passo que acontece numa
 * Loja, com a Conta em foco no seletor do topo —
 *   nenhuma Loja   → manda criar a primeira;
 *   uma Loja só    → abre essa Loja sozinho (a tela avisa com um toast);
 *   várias         → destaca o seletor para a pessoa escolher.
 */
export function planFazerAgora(args: {
  role: OnboardingRole;
  item: ChecklistStepDef;
  /** A Conta/Loja em foco é uma Loja? */
  emLoja: boolean;
  lojas: ReadonlyArray<{ id: string; name: string }>;
}): FazerAgora {
  const { role, item, emLoja, lojas } = args;
  if (!item.screen) return { tipo: 'nada' };
  if (role === 'gerente' && item.needsLoja && !emLoja) {
    const unica = lojas.length === 1 ? lojas[0] : undefined;
    if (lojas.length > 1) return { tipo: 'escolher-loja', tourId: 'escolher-loja' };
    if (!unica) return { tipo: 'criar-loja', screen: '/dashboard/team', tourId: 'criar-loja' };
    return { tipo: 'trocar-loja', lojaId: unica.id, lojaNome: unica.name, screen: item.screen, tourId: item.tourId };
  }
  return { tipo: 'abrir', screen: item.screen, tourId: item.tourId };
}

/** Link do "Ver passo a passo": tutorial, ou a entrada de referência. */
export function stepHelpHref(item: ChecklistStepDef): string | null {
  if (item.tutorialId) return `/dashboard/help#tutorial:${item.tutorialId}`;
  if (item.helpKey) return `/dashboard/help#${item.helpKey}`;
  return null;
}
