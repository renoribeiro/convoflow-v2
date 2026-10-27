/**
 * Matriz de cobertura da ajuda: para cada tela, aba de Configurações e tela
 * especial, e para cada cargo que a alcança, que camadas de ajuda existem.
 *
 *   botão    a entrada de ajuda da tela (o <FeatureHelp /> da própria tela)
 *   Ajuda    a mesma entrada na página de Ajuda, para AQUELE cargo
 *   tutorial tutoriais da Ajuda que passam pela tela, visíveis ao cargo
 *   tour     destaques (driver.js) que o cargo recebe na tela, pela lista
 *            "Primeiros passos" ou pela boas-vindas
 *
 * Tudo é CALCULADO do código (registro de telas, abas, matriz de capacidades,
 * featureHelp, tutoriais, tours e lista "Primeiros passos"); nada aqui é
 * declarado à mão além de quais arquivos formam cada tela. O teste
 * src/lib/help/cobertura.test.ts quebra quando uma tela alcançável não tem
 * ajuda, e imprime a matriz com IMPRIMIR_MATRIZ=1 (contando também as dicas
 * "?" dos campos, <DicaDoCampo />, nos arquivos de cada tela).
 */
import { DEFAULT_CAPABILITIES, type UserRole } from '@/types/userHierarchy';
import {
  TELAS,
  TELAS_SO_DE_LOJA,
  acessoATela,
  caminhoDaTela,
  chaveDeAjudaDaTela,
  type ContextoDeAcesso,
  type Tela,
} from '@/lib/access/telas';
import { ABAS_DE_CONFIGURACOES } from '@/lib/access/abasConfiguracoes';
import { getFeatureHelp } from './featureHelp';
import { TUTORIALS, type Tutorial, type TutorialStep } from './tutorials';
import { podeAcessarConteudo, podeLerEntrada } from './acesso';
import { TOURS, routeMatches, type Tour } from '@/lib/onboarding/tours';
import { CHECKLISTS } from '@/lib/onboarding/checklist';

export const PAPEIS_DA_MATRIZ: readonly UserRole[] = ['gerente', 'gestor', 'atendente', 'superadmin'];

/** Contexto de um cargo com a matriz padrão e todos os módulos ligados. */
export const contextoDoCargo = (papel: UserRole): ContextoDeAcesso => ({
  papel,
  capacidades: DEFAULT_CAPABILITIES[papel],
  moduloLigado: () => true,
});

/** 'sim', 'nao', ou 'so_de_loja' (o superadmin passa a guarda e vê "Exclusivo para Lojas"). */
export type Alcance = 'sim' | 'nao' | 'so_de_loja';

export interface SuperficieDeAjuda {
  id: string;
  nome: string;
  /** Caminho da tela (com `?tab=` nas abas); null quando não é rota. */
  rota: string | null;
  /** Entrada de ajuda; null só na própria Ajuda, que é a documentação. */
  helpKey: string | null;
  /** Arquivos ou pastas (prefixo) de que a tela é feita, a partir da raiz. */
  fontes: string[];
  alcance: (papel: UserRole) => Alcance;
}

/** Arquivos de cada tela do registro (onde o botão de ajuda e as dicas moram). */
const FONTES_DAS_TELAS: Record<string, string[]> = {
  '': ['src/pages/Index.tsx', 'src/components/dashboard/', 'src/components/onboarding/'],
  conversations: ['src/pages/Conversations.tsx', 'src/components/conversations/'],
  contacts: ['src/pages/Contacts.tsx', 'src/components/contacts/'],
  funnel: ['src/pages/Funnel.tsx', 'src/components/funnel/'],
  tracking: ['src/pages/Tracking.tsx', 'src/components/tracking/'],
  reports: ['src/pages/Reports.tsx', 'src/components/reports/'],
  chatbots: ['src/pages/Chatbots.tsx', 'src/components/chatbots/NewChatbotFlowModal.tsx'],
  campaigns: ['src/pages/Campaigns.tsx', 'src/components/campaigns/'],
  templates: ['src/pages/Templates.tsx'],
  followups: ['src/pages/Followups.tsx', 'src/components/followups/'],
  automation: ['src/pages/Automation.tsx', 'src/components/automation/'],
  'whatsapp-numbers': ['src/pages/WhatsAppNumbers.tsx', 'src/components/whatsapp/'],
  settings: ['src/pages/Settings.tsx'],
  help: ['src/pages/Help.tsx'],
  team: ['src/pages/dashboard/TeamPage.tsx', 'src/components/users/', 'src/components/stores/'],
  'store-comparison': ['src/pages/dashboard/StoreComparison.tsx'],
  admin: ['src/pages/dashboard/AdminDashboard.tsx', 'src/components/admin/'],
  'admin/users': ['src/pages/dashboard/admin/UsersPage.tsx'],
  'admin/usage-limits': ['src/pages/dashboard/admin/UsageLimitsPage.tsx'],
  profile: ['src/components/settings/ProfileSettings.tsx'],
  notifications: ['src/pages/Notifications.tsx'],
};

/** Arquivos de cada aba de Configurações. */
const FONTES_DAS_ABAS: Record<string, string[]> = {
  profile: ['src/components/settings/ProfileSettings.tsx'],
  attendance: ['src/components/settings/AttendanceSettings.tsx'],
  visibility: [
    'src/components/settings/VisibilitySettings.tsx',
    'src/components/settings/RotationSettings.tsx',
    'src/components/settings/ResponseRuleSettings.tsx',
  ],
  'quick-replies': ['src/components/settings/QuickRepliesSettings.tsx'],
  followups: ['src/components/settings/FollowupSettings.tsx'],
  subscription: ['src/components/settings/SubscriptionSettings.tsx', 'src/components/settings/ApiAddonCard.tsx', 'src/components/billing/'],
  security: ['src/components/settings/SecuritySettings.tsx'],
  integrations: ['src/components/settings/IntegrationSettings.tsx'],
  api: ['src/components/settings/ApiKeysSettings.tsx'],
};

const alcanceDaTela = (t: Tela) => (papel: UserRole): Alcance => {
  if (acessoATela(t, contextoDoCargo(papel)) !== 'liberado') return 'nao';
  if (papel === 'superadmin' && TELAS_SO_DE_LOJA.includes(t.chave)) return 'so_de_loja';
  return 'sim';
};

const ehDeLoja = (papel: UserRole) => papel !== 'superadmin';

/** As linhas da matriz, na ordem do menu. */
export const SUPERFICIES: readonly SuperficieDeAjuda[] = [
  ...TELAS.flatMap((t): SuperficieDeAjuda[] => {
    const linha: SuperficieDeAjuda = {
      id: t.chave || 'dashboard',
      nome: t.nome,
      rota: caminhoDaTela(t),
      // A Ajuda é a documentação, não um assunto dela; /dashboard/profile usa
      // a ajuda da aba Perfil (o mesmo componente).
      helpKey: t.chave === 'help' ? null : t.chave === 'profile' ? 'page:settings-profile' : chaveDeAjudaDaTela(t),
      fontes: FONTES_DAS_TELAS[t.chave] ?? [],
      alcance: alcanceDaTela(t),
    };
    if (t.chave === 'chatbots') {
      return [
        linha,
        {
          id: 'chatbots/builder',
          nome: 'Construtor de fluxo',
          rota: null,
          helpKey: 'page:chatbot-builder',
          fontes: ['src/pages/ChatbotFlowBuilder.tsx', 'src/components/chatbots/flow/'],
          alcance: alcanceDaTela(t),
        },
      ];
    }
    if (t.chave !== 'settings') return [linha];
    return [
      linha,
      ...ABAS_DE_CONFIGURACOES.map(
        (aba): SuperficieDeAjuda => ({
          id: `settings?tab=${aba.value}`,
          nome: `Configurações › ${aba.label}`,
          rota: `/dashboard/settings?tab=${aba.value}`,
          helpKey: aba.helpKey,
          fontes: FONTES_DAS_ABAS[aba.value] ?? [],
          alcance: (papel) => {
            if (aba.requer && DEFAULT_CAPABILITIES[papel][aba.requer] !== true) return 'nao';
            if (aba.soGerenteComApi && papel !== 'gerente') return 'nao';
            return 'sim';
          },
        }),
      ),
    ];
  }),
  {
    id: 'paywall',
    nome: 'Tela de bloqueio',
    rota: null,
    helpKey: 'page:paywall',
    fontes: ['src/components/auth/PaywallScreen.tsx'],
    alcance: (papel) => (ehDeLoja(papel) ? 'sim' : 'nao'),
  },
  {
    id: 'sem-acesso',
    nome: 'Você não tem acesso a esta tela',
    rota: null,
    helpKey: 'concept:cargos',
    fontes: ['src/components/auth/SemAcesso.tsx'],
    alcance: (papel) => (ehDeLoja(papel) ? 'sim' : 'nao'),
  },
];

// ------------------------------------------------------------------- tours
/**
 * Os tours que o cargo pode receber de fato: o da boas-vindas e os da lista
 * "Primeiros passos" dele (só os passos que o cargo alcança), mais os desvios
 * do Gerente (escolher e criar Loja). Um tour que nenhum caminho pede para o
 * cargo não conta, mesmo sem `minRole`.
 */
export function toursDoCargo(papel: UserRole): Tour[] {
  if (papel === 'superadmin') return [];
  const ctx = contextoDoCargo(papel);
  const ids = new Set<string>([papel === 'atendente' ? 'conversas' : 'primeiros-passos']);
  for (const passo of CHECKLISTS[papel]) {
    if (passo.tourId && podeAcessarConteudo(passo, ctx)) ids.add(passo.tourId);
  }
  if (papel === 'gerente') {
    ids.add('escolher-loja');
    ids.add('criar-loja');
  }
  return TOURS.filter((t) => ids.has(t.id) && podeAcessarConteudo(t, ctx));
}

// ----------------------------------------------------------------- células
const caminhoESearch = (rota: string) => {
  const u = new URL(rota, 'https://convoflow.invalid');
  return { pathname: u.pathname, search: u.search, temAba: u.searchParams.has('tab') };
};

/** O passo do tutorial acontece nesta tela? Pela entrada de ajuda ou pela rota. */
function passoNaTela(s: TutorialStep, sup: SuperficieDeAjuda): boolean {
  if (sup.helpKey && s.helpKey === sup.helpKey) return true;
  if (!sup.rota || !s.screen) return false;
  const { pathname, temAba } = caminhoESearch(sup.rota);
  // /dashboard/settings sem aba não diz qual aba: só o helpKey decide.
  if (temAba || pathname === '/dashboard/settings') return false;
  return s.screen === pathname;
}

export interface CelulaDaMatriz {
  alcance: Alcance;
  /** Existe entrada de ajuda para o botão da tela. */
  botao: boolean;
  /** A entrada aparece na página de Ajuda para este cargo. */
  ajuda: boolean;
  tutoriais: Tutorial[];
  tours: Tour[];
}

export function celula(sup: SuperficieDeAjuda, papel: UserRole): CelulaDaMatriz {
  const alcance = sup.alcance(papel);
  const ctx = contextoDoCargo(papel);
  const entry = sup.helpKey ? getFeatureHelp(sup.helpKey) : null;
  const tutoriais = TUTORIALS.filter(
    (t) => podeAcessarConteudo(t, ctx) && t.steps.some((s) => passoNaTela(s, sup)),
  );
  const tours = sup.rota
    ? toursDoCargo(papel).filter((t) => {
        const { pathname, search } = caminhoESearch(sup.rota as string);
        return routeMatches(t.route, pathname, search);
      })
    : [];
  return {
    alcance,
    botao: !!entry,
    ajuda: !!entry && !entry.oculta && !!sup.helpKey && podeLerEntrada({ ...entry, key: sup.helpKey }, ctx),
    tutoriais,
    tours,
  };
}
