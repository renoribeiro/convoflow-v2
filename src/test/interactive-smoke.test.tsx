import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';

/**
 * Auditoria de clique das telas do dashboard.
 *
 * O e2e do Playwright para na porta do /auth: entrar exige sessao real do
 * Supabase, e este projeto nao tem usuario de teste. Entao o clique de verdade
 * nas telas logadas acontece aqui — jsdom, Supabase mockado, cada botao
 * habilitado clicado de fato.
 *
 * O que este teste pega: botao que explode ao ser clicado (handler indefinido,
 * leitura de propriedade de undefined, estado que quebra o render seguinte).
 * O que ele NAO pega: se a acao chegou no banco. Isso e trabalho de e2e com
 * sessao, que continua em aberto.
 */

// ---------------------------------------------------------------- mocks base
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: any) =>
      React.cloneElement(children, { width: 400, height: 300 }),
  };
});

/**
 * Cargo do usuário simulado. É mutável para a mesma bateria de cliques rodar
 * como superadmin, gerente, gestor e atendente — telas mudam de conteúdo por
 * cargo, e um botão que só o atendente vê não seria clicado nunca se o teste
 * rodasse só como superadmin.
 */
const estado = vi.hoisted(() => ({ papel: 'superadmin' as string }));

vi.mock('@/contexts/TenantContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/contexts/TenantContext')>();
  // As decisões por cargo saem das funções REAIS do projeto. Reimplementar a
  // hierarquia aqui só provaria que o mock concorda com ele mesmo.
  const { roleAtLeast, resolveCapabilities, can } = await import('@/types/userHierarchy');
  const tenant = { id: 't1', name: 'Loja Teste', kind: 'account', parent_tenant_id: null };
  const perfil = () => ({
    id: 'p1',
    role: estado.papel,
    tenant_id: 't1',
    full_name: 'Usuário de Teste',
  });
  return {
    ...actual,
    // Mesma forma do value real do TenantProvider (TenantContext.tsx:280):
    // nome inventado aqui vira "bug" fantasma na tela.
    useTenant: () => ({
      tenant,
      profile: perfil(),
      tenantId: 't1',
      loading: false,
      error: null,
      refreshTenant: vi.fn(),
      updateTenantSettings: vi.fn(),
      isImpersonating: false,
      canSwitchTenant: estado.papel === 'superadmin' || estado.papel === 'gerente',
      setActiveTenant: vi.fn(),
    }),
    useTenantId: () => 't1',
    useRole: () => estado.papel,
    useIsSuperAdmin: () => estado.papel === 'superadmin',
    useIsGerente: () => estado.papel === 'gerente',
    useIsGestor: () => estado.papel === 'gestor',
    useIsAtendente: () => estado.papel === 'atendente',
    useIsTenantAdmin: () => estado.papel === 'gestor',
    useCanSwitchTenant: () =>
      estado.papel === 'superadmin' || estado.papel === 'gerente',
    useHasMinRole: (minimo: any) => roleAtLeast(estado.papel as any, minimo),
    useCan: (capacidade: any) => can(estado.papel as any, capacidade),
    useCapabilities: () => resolveCapabilities(estado.papel as any),
  };
});

// A forma aqui espelha exatamente o value do AuthContext real
// ({ user, session, login, register, logout, isLoading }). Mock com nome
// diferente do de verdade transforma erro do teste em "bug" que nao existe —
// foi assim que o clique em "Sair" do paywall apareceu como quebrado.
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'teste@convoflow.test' },
    session: { access_token: 'tok' },
    isLoading: false,
    login: vi.fn(async () => {}),
    register: vi.fn(async () => {}),
    logout: vi.fn(async () => {}),
  }),
  AuthProvider: ({ children }: any) => <>{children}</>,
}));

/**
 * Sem este mock o teste sai para a internet de verdade: a tela de Conversas
 * chama /instance/connectionState na Evolution API e o erro 404 volta depois,
 * já dentro de outro teste. Teste de unidade não faz requisição de rede.
 */
vi.mock('@/services/evolutionApi', () => {
  const semResposta = async () => ({ instance: { state: 'close' } });
  const servico = new Proxy(
    {},
    { get: () => vi.fn(semResposta) },
  );
  return {
    EvolutionApiService: vi.fn(() => servico),
    createEvolutionApiService: vi.fn(() => servico),
  };
});

vi.mock('@/integrations/supabase/client', () => {
  const linha = () => ({
    id: 'id1',
    tenant_id: 't1',
    created_at: '2026-06-25T10:00:00.000Z',
    updated_at: '2026-06-25T10:00:00.000Z',
    name: 'Registro de Teste',
    title: 'Registro de Teste',
    status: 'active',
    is_active: true,
    enabled: true,
    phone: '5511999999999',
    email: 'teste@convoflow.test',
    role: 'atendente',
    order: 1,
    color: '#DAE27C',
    settings: {},
    metadata: {},
  });
  const builder = () => {
    const resultado = { data: [linha(), linha()], count: 2, error: null };
    const b: any = {};
    for (const m of [
      'select', 'insert', 'update', 'upsert', 'delete', 'eq', 'neq', 'gt', 'gte',
      'lt', 'lte', 'like', 'ilike', 'in', 'is', 'or', 'not', 'order', 'limit',
      'range', 'match', 'contains', 'overlaps', 'filter',
    ]) b[m] = vi.fn(() => b);
    b.single = vi.fn(() => Promise.resolve({ data: linha(), error: null }));
    b.maybeSingle = vi.fn(() => Promise.resolve({ data: linha(), error: null }));
    b.then = (resolve: any) => Promise.resolve(resultado).then(resolve);
    return b;
  };
  return {
    supabase: {
      from: vi.fn(() => builder()),
      rpc: vi.fn((nome: string) =>
        Promise.resolve({
          // O modal de excluir instância chama esta RPC ao abrir e trata
          // resposta sem `ok` como erro (e loga). No smoke a instância
          // "guarda histórico": a exclusão é recusada e o botão nem aparece.
          data:
            nome === 'whatsapp_instance_delete_preview'
              ? {
                  ok: false,
                  reason: 'has_history',
                  total: 3,
                  counts: {
                    conversations: 1, messages: 2, contacts: 0, chatbots: 0,
                    chatbot_sessions: 0, campaigns: 0, followups: 0,
                    followup_enrollments: 0, followup_sequences: 0,
                  },
                }
              : [],
          error: null,
        }),
      ),
      channel: vi.fn(() => ({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
      })),
      removeChannel: vi.fn(),
      auth: {
        getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'u1' } }, error: null })),
        getSession: vi.fn(() =>
          Promise.resolve({ data: { session: { access_token: 'tok' } }, error: null }),
        ),
      },
      functions: { invoke: vi.fn(() => Promise.resolve({ data: {}, error: null })) },
      storage: {
        from: vi.fn(() => ({
          upload: vi.fn(() => Promise.resolve({ data: {}, error: null })),
          getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://exemplo.test/a.png' } })),
        })),
      },
    },
  };
});

// Estas telas montam a arvore inteira do dashboard e clicam em dezenas de
// botoes. Rodando junto com o resto da suite, em paralelo, 10s (o padrao do
// vitest.config.ts) estoura por lentidao — nao por defeito. 30s da folga sem
// esconder travamento de verdade.
const TEMPO_LIMITE = 30_000;

// ------------------------------------------------------------------ utilidade
const Moldura = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <MemoryRouter>{children}</MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

/**
 * Erro de console que NAO e defeito de botao.
 *
 * Duas familias: ruido do React/Radix dentro do jsdom, e a aplicacao reagindo
 * CERTO a um ambiente sem backend (nao ha realtime, nem Evolution API, nem
 * resposta no formato que as consultas de analise esperam). Nesses casos o
 * app loga e segue de pe — que e o comportamento desejado.
 *
 * Lista curta e explicita de proposito: filtro largo aqui esconderia defeito
 * de verdade, que e justamente o que este arquivo existe para achar.
 */
function ehRuidoDeAmbiente(texto: string): boolean {
  if (/not wrapped in act|validateDOMNesting|useLayoutEffect|Warning:/i.test(texto)) return true;
  return /Erro no WebSocket|Erro ao buscar dados de análise|Chat history sync failed/i.test(
    texto,
  );
}

/** Clica em todo botao habilitado e devolve o que explodiu. */
async function clicarTudo(): Promise<string[]> {
  const falhas: string[] = [];
  const botoes = screen.queryAllByRole('button');
  for (const botao of botoes) {
    if ((botao as HTMLButtonElement).disabled) continue;
    const nome = (botao.textContent || botao.getAttribute('aria-label') || '?')
      .trim()
      .slice(0, 50);
    try {
      botao.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      // deixa o React processar o estado antes do proximo clique
      await new Promise((r) => setTimeout(r, 0));
    } catch (erro) {
      falhas.push(`"${nome}": ${(erro as Error).message}`);
    }
  }
  return falhas;
}

// ------------------------------------------------------------------- as telas
const TELAS: Array<[string, () => Promise<{ default: React.ComponentType<any> }>]> = [
  ['Início', () => import('@/pages/Index')],
  ['Contatos', () => import('@/pages/Contacts')],
  ['Funil', () => import('@/pages/Funnel')],
  ['Campanhas', () => import('@/pages/Campaigns')],
  ['Chatbots', () => import('@/pages/Chatbots')],
  ['Relatórios', () => import('@/pages/Reports')],
  ['Follow-ups', () => import('@/pages/Followups')],
  ['Automação', () => import('@/pages/Automation')],
  ['Rastreamento', () => import('@/pages/Tracking')],
  ['Templates', () => import('@/pages/Templates')],
  ['Notificações', () => import('@/pages/Notifications')],
  ['Ajuda', () => import('@/pages/Help')],
  ['Configurações', () => import('@/pages/Settings')],
  ['Números de WhatsApp', () => import('@/pages/WhatsAppNumbers')],
  ['Conversas', () => import('@/pages/Conversations')],
  // Telas com cargo minimo: o mock acima loga como superadmin.
  ['Administração', () => import('@/pages/dashboard/AdminDashboard')],
  ['Admin · Usuários', () => import('@/pages/dashboard/admin/UsersPage')],
  ['Admin · Limites de uso', () => import('@/pages/dashboard/admin/UsageLimitsPage')],
  ['Equipe', () => import('@/pages/dashboard/TeamPage')],
  ['Comparação de Lojas', () => import('@/pages/dashboard/StoreComparison')],
  [
    'Perfil',
    () =>
      import('@/components/settings/ProfileSettings').then((m) => ({
        default: m.ProfileSettings,
      })),
  ],
];

/**
 * Componentes que nao sao "tela" mas aparecem em toda tela (a moldura do
 * dashboard) ou em estados que o smoke de pagina nunca alcanca (paywall, conta
 * suspensa, erro). Cada um entra com as props minimas que exige.
 */
const PECAS: Array<[string, () => Promise<React.ReactElement>]> = [
  [
    'Moldura do dashboard (Sidebar + Navbar)',
    async () => {
      const { DashboardLayout } = await import('@/components/layout/DashboardLayout');
      return <DashboardLayout />;
    },
  ],
  [
    'Paleta de comandos',
    async () => {
      const { CommandPalette } = await import('@/components/layout/CommandPalette');
      return <CommandPalette open onOpenChange={() => {}} />;
    },
  ],
  [
    'Botão de reportar bug',
    async () => {
      const { BugReportButton } = await import('@/components/bug-report/BugReportButton');
      return <BugReportButton />;
    },
  ],
  [
    'Tela de paywall',
    async () => {
      const { PaywallScreen } = await import('@/components/auth/PaywallScreen');
      return <PaywallScreen />;
    },
  ],
  [
    'Aviso de tela só para Loja',
    async () => {
      const { LojaOnlyNotice } = await import('@/components/auth/LojaOnlyNotice');
      return <LojaOnlyNotice />;
    },
  ],
  [
    'Tela de conta suspensa',
    async () => {
      const { AccountStatusScreen } = await import('@/components/auth/AccountStatusScreen');
      return <AccountStatusScreen status="suspended" />;
    },
  ],
  [
    'Alternador de tema',
    async () => {
      const { ThemeToggle } = await import('@/components/shared/ThemeToggle');
      return <ThemeToggle />;
    },
  ],
  [
    'Central de notificações',
    async () => {
      const { NotificationCenter } = await import('@/components/notifications/NotificationCenter');
      return <NotificationCenter />;
    },
  ],
];

describe('telas do dashboard: renderizam e aguentam clique', () => {
  let erroDeConsole: string[] = [];
  let espiao: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    erroDeConsole = [];
    espiao = vi.spyOn(console, 'error').mockImplementation((...args) => {
      const texto = String(args[0] ?? '');
      if (ehRuidoDeAmbiente(texto)) return;
      erroDeConsole.push(texto);
    });
  });

  afterEach(() => {
    espiao.mockRestore();
    cleanup();
  });

  // A bateria abaixo roda como superadmin, que e quem enxerga mais tela. Os
  // outros tres cargos tem describe proprio no fim do arquivo.
  beforeEach(() => {
    estado.papel = 'superadmin';
  });

  for (const [nome, carregar] of TELAS) {
    it(`${nome}: renderiza sem lançar`, async () => {
      const { default: Tela } = await carregar();
      let erro: unknown = null;
      try {
        render(
          <Moldura>
            <Tela />
          </Moldura>,
        );
        await new Promise((r) => setTimeout(r, 20));
      } catch (e) {
        erro = e;
      }
      expect(erro, `${nome} quebrou ao renderizar`).toBeNull();
    }, TEMPO_LIMITE);

    it(`${nome}: nenhum botão explode ao ser clicado`, async () => {
      const { default: Tela } = await carregar();
      render(
        <Moldura>
          <Tela />
        </Moldura>,
      );
      await new Promise((r) => setTimeout(r, 20));

      const falhas = await clicarTudo();
      expect(falhas, `${nome}: botões que lançaram`).toEqual([]);
      expect(erroDeConsole, `${nome}: erros de console após clique`).toEqual([]);
    }, TEMPO_LIMITE);
  }

  it('Construtor de fluxo do chatbot: renderiza e nenhum botão explode', async () => {
    const { default: Construtor } = await import('@/pages/ChatbotFlowBuilder');
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    let erro: unknown = null;
    try {
      render(
        <QueryClientProvider client={qc}>
          <TooltipProvider>
            {/* a rota real e /dashboard/chatbots/:id/builder — o useParams
                precisa do :id para o componente sair do estado de carregando */}
            <MemoryRouter initialEntries={['/dashboard/chatbots/bot-1/builder']}>
              <Routes>
                <Route path="/dashboard/chatbots/:id/builder" element={<Construtor />} />
              </Routes>
            </MemoryRouter>
          </TooltipProvider>
        </QueryClientProvider>,
      );
      await new Promise((r) => setTimeout(r, 30));
    } catch (e) {
      erro = e;
    }
    expect(erro, 'construtor de fluxo quebrou ao renderizar').toBeNull();

    const falhas = await clicarTudo();
    expect(falhas, 'construtor de fluxo: botões que lançaram').toEqual([]);
    expect(erroDeConsole, 'construtor de fluxo: erros de console').toEqual([]);
  }, TEMPO_LIMITE);

  for (const [nome, montar] of PECAS) {
    it(`${nome}: renderiza e nenhum botão explode`, async () => {
      const elemento = await montar();
      let erro: unknown = null;
      try {
        render(<Moldura>{elemento}</Moldura>);
        await new Promise((r) => setTimeout(r, 20));
      } catch (e) {
        erro = e;
      }
      expect(erro, `${nome} quebrou ao renderizar`).toBeNull();

      const falhas = await clicarTudo();
      expect(falhas, `${nome}: botões que lançaram`).toEqual([]);
      expect(erroDeConsole, `${nome}: erros de console após clique`).toEqual([]);
    }, TEMPO_LIMITE);
  }
});

/**
 * Mesma bateria, nos outros três cargos.
 *
 * Tela muda de conteúdo por cargo: o gestor não vê o que o superadmin vê, e o
 * atendente vê menos ainda. Rodando só como superadmin, um botão que só
 * aparece para o atendente nunca seria clicado — e é justamente onde defeito
 * costuma se esconder, porque é o caminho menos usado no desenvolvimento.
 *
 * Quem decide o que cada cargo alcança continua sendo o código de verdade
 * (`roleAtLeast`, `resolveCapabilities`, `can`); este teste não redefine
 * permissão nenhuma, só troca de quem é a sessão.
 */
describe.each(['gerente', 'gestor', 'atendente'])(
  'telas do dashboard como %s: renderizam e aguentam clique',
  (papel) => {
    let erroDeConsole: string[] = [];
    let espiao: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      vi.clearAllMocks();
      estado.papel = papel;
      erroDeConsole = [];
      espiao = vi.spyOn(console, 'error').mockImplementation((...args) => {
        const texto = String(args[0] ?? '');
        if (ehRuidoDeAmbiente(texto)) return;
        erroDeConsole.push(texto);
      });
    });

    afterEach(() => {
      espiao.mockRestore();
      cleanup();
      estado.papel = 'superadmin';
    });

    for (const [nome, carregar] of TELAS) {
      it(`${nome}: renderiza e nenhum botão explode`, async () => {
        const { default: Tela } = await carregar();
        let erro: unknown = null;
        try {
          render(
            <Moldura>
              <Tela />
            </Moldura>,
          );
          await new Promise((r) => setTimeout(r, 20));
        } catch (e) {
          erro = e;
        }
        expect(erro, `${nome} quebrou ao renderizar como ${papel}`).toBeNull();

        const falhas = await clicarTudo();
        expect(falhas, `${nome} como ${papel}: botões que lançaram`).toEqual([]);
        expect(erroDeConsole, `${nome} como ${papel}: erros de console`).toEqual([]);
      }, TEMPO_LIMITE);
    }
  },
);
