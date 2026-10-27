/**
 * Tours do onboarding: destaques na tela de verdade, um balão por passo.
 *
 * QUANDO UM TOUR RODA. Só depois de um clique da pessoa: "Fazer agora" na lista
 * "Primeiros passos" ou "Começar" na boas-vindas. Nada abre sozinho em outra
 * tela (regra do CLAUDE.md, "Ajuda no produto").
 *
 * ONDE O BALÃO APONTA. `target` é o valor do atributo `data-tour` do elemento.
 * O teste src/lib/onboarding/tours.test.ts varre o src/ e QUEBRA quando um
 * passo aponta para uma marca que não existe mais. Mudou a tela? Mova a marca
 * junto e revise o texto do balão no mesmo commit.
 *
 * CELULAR. Nunca apontamos para item do menu lateral no celular (o menu é uma
 * gaveta que nem está na página). Passo com `menuItem` vira, abaixo de 768px,
 * um cartão no centro: "Abra o menu ☰ e toque em <menuItem>." Passo cujo alvo
 * não aparece em alguns segundos também vira cartão no centro, com o mesmo
 * texto: o tour nunca trava esperando.
 *
 * TEXTO. pt-BR, curto, segunda pessoa, sem hífen nem travessão (o teste
 * confere). Rótulos de botão iguais aos da tela.
 */
import type { UserRole } from '@/types/userHierarchy';

export interface TourStep {
  /** Valor de `data-tour` do elemento destacado. Sem alvo: cartão no centro. */
  target?: string;
  /**
   * O alvo mora no menu lateral. No celular o passo vira o cartão
   * "Abra o menu ☰ e toque em <menuItem>." em vez de apontar.
   */
  menuItem?: string;
  title: string;
  body: string;
}

export interface Tour {
  id: string;
  /** Tela onde o tour roda: caminho, mais `?tab=` quando é uma aba. */
  route: string;
  steps: TourStep[];
  /** Mesma escala do RoleGuard; filtrado pelo useHelpVisibility. */
  minRole?: UserRole;
  /** Mesmo nome do ModuleGuard; filtrado pelo useHelpVisibility. */
  moduleName?: string;
}

export const TOURS: Tour[] = [
  // ------------------------------------------------- depois da boas-vindas
  {
    id: 'primeiros-passos',
    route: '/dashboard',
    steps: [
      {
        target: 'primeiros-passos',
        title: 'Seus primeiros passos',
        body: 'Siga a lista na ordem. Em cada passo, clique em Fazer agora e mostramos onde clicar na tela.',
      },
      {
        target: 'menu-ajuda',
        menuItem: 'Ajuda',
        title: 'A Ajuda fica aqui',
        body: 'Lá estão os tutoriais completos e o botão Ver tutorial de novo, se quiser rever esta apresentação.',
      },
    ],
  },
  {
    id: 'conversas',
    route: '/dashboard/conversations',
    moduleName: 'conversations',
    steps: [
      {
        target: 'conversas-filtros-rapidos',
        title: 'Suas conversas e a fila',
        body: 'Minhas mostra o que está com você. Sem responsável é a fila: as conversas que ninguém pegou ainda.',
      },
      {
        target: 'conversas-lista',
        title: 'Abra uma conversa',
        body: 'Clique numa conversa da lista para ver o histórico e responder.',
      },
      {
        target: 'conversas-filtros',
        title: 'Filtros',
        body: 'Quando a lista crescer, filtre por etiqueta, responsável ou data.',
      },
      {
        target: 'conversas-janela',
        title: 'Assuma antes de responder',
        body: 'Com a conversa aberta, clique em Sem responsável no topo e depois em Assumir. Para passar a um colega, use Transferir.',
      },
    ],
  },

  // ------------------------------------------------- Gerente: Conta e Lojas
  {
    id: 'escolher-loja',
    route: '/dashboard',
    minRole: 'gerente',
    steps: [
      {
        target: 'seletor-loja',
        title: 'Escolha a Loja',
        body: 'Este passo é feito dentro de uma Loja. Escolha a Loja aqui e depois clique de novo em Fazer agora.',
      },
    ],
  },
  {
    id: 'criar-loja',
    route: '/dashboard/team',
    minRole: 'gerente',
    steps: [
      {
        target: 'equipe-nova-loja',
        title: 'Clique em Nova Loja',
        body: 'Dê à Loja o nome que o time usa no dia a dia e clique em Criar Loja. É nela que ficam o número, as conversas e a equipe.',
      },
    ],
  },
  {
    id: 'dados-fiscais',
    route: '/dashboard/settings?tab=subscription',
    minRole: 'gerente',
    steps: [
      {
        target: 'dados-fiscais',
        title: 'Dados para a nota fiscal',
        body: 'Escolha CNPJ ou CPF, digite o documento e o CEP. O endereço se completa sozinho. Confira e clique em Salvar dados.',
      },
    ],
  },

  // ------------------------------------------------- Gerente e Gestor: Loja
  {
    id: 'conectar-whatsapp',
    route: '/dashboard/whatsapp-numbers',
    minRole: 'gestor',
    moduleName: 'whatsapp-numbers',
    steps: [
      {
        target: 'whatsapp-nova-instancia',
        title: 'Clique em Conectar número',
        body: 'Escolha API Oficial do WhatsApp e clique em Continuar. Depois clique em Conectar com a Meta e siga a janela da Meta até o fim.',
      },
    ],
  },
  {
    id: 'convidar-equipe',
    route: '/dashboard/team',
    minRole: 'gestor',
    steps: [
      {
        target: 'equipe-convidar',
        title: 'Clique em Convidar',
        body: 'Preencha os dados da pessoa, escolha a função e clique em Enviar convite. Ela recebe o convite e cria a própria senha.',
      },
    ],
  },
  {
    id: 'configurar-funil',
    route: '/dashboard/funnel',
    // O botão "Configurar Estágios" não existe para o atendente (20261021000003).
    minRole: 'gestor',
    moduleName: 'funnel',
    steps: [
      {
        target: 'funil-configurar-estagios',
        title: 'Clique em Configurar etapas',
        body: 'Crie as etapas do seu processo de venda, na ordem em que acontecem. Quatro a seis etapas costumam bastar.',
      },
    ],
  },
  {
    id: 'respostas-rapidas',
    route: '/dashboard/settings?tab=quick-replies',
    steps: [
      {
        target: 'respostas-rapidas-nova',
        title: 'Clique em Nova resposta',
        body: 'Dê um nome curto e escreva o texto que o time repete todo dia. Na conversa, ele aparece no botão de raio ou digitando / no campo vazio.',
      },
    ],
  },
  {
    id: 'horario-distribuicao',
    route: '/dashboard/settings?tab=visibility',
    minRole: 'gestor',
    steps: [
      {
        target: 'distribuicao',
        title: 'Distribua as conversas novas',
        body: 'Com pelo menos 2 atendentes, ligue a distribuição automática e ajuste a fatia de cada pessoa. Depois clique em Salvar distribuição.',
      },
      {
        target: 'horario-funcionamento',
        title: 'Horário de funcionamento',
        body: 'Aqui ficam os dias e horários da Loja e a regra para quando ninguém responde. Ajuste e clique em Salvar regra.',
      },
    ],
  },
  {
    id: 'criar-chatbot',
    route: '/dashboard/chatbots',
    moduleName: 'chatbots',
    steps: [
      {
        target: 'chatbots-novo',
        title: 'Clique em Novo Chatbot',
        body: 'Dê um nome, escolha o número e o gatilho e clique em Criar e Abrir Editor. Monte o fluxo e clique em Publicar.',
      },
    ],
  },

  // ------------------------------------------------- Atendente: perfil
  {
    id: 'foto-perfil',
    route: '/dashboard/settings?tab=profile',
    steps: [
      {
        target: 'perfil-foto',
        title: 'Clique em Alterar Foto',
        body: 'Escolha uma foto sua. Depois clique em Salvar Alterações, no fim do quadro. É ela que o time vê nas transferências.',
      },
    ],
  },
];

export const TOUR_BY_ID: Record<string, Tour> = Object.fromEntries(TOURS.map((t) => [t.id, t]));

export function getTour(id: string): Tour | null {
  return TOUR_BY_ID[id] ?? null;
}

/** Texto do cartão no centro quando o alvo mora no menu e a tela é de celular. */
export function menuCardBody(menuItem: string): string {
  return `Abra o menu ☰ no topo e toque em ${menuItem}.`;
}

/**
 * A tela atual é a do tour? Compara o caminho e os parâmetros que a rota do
 * tour exige (o `?tab=` das abas); parâmetro a mais na URL não atrapalha.
 */
export function routeMatches(tourRoute: string, pathname: string, search: string): boolean {
  const alvo = new URL(tourRoute, 'https://convoflow.invalid');
  const norm = (p: string) => p.replace(/\/+$/, '') || '/';
  if (norm(alvo.pathname) !== norm(pathname)) return false;
  const atual = new URLSearchParams(search);
  for (const [chave, valor] of alvo.searchParams) {
    if (atual.get(chave) !== valor) return false;
  }
  return true;
}
