import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

/**
 * A árvore de rotas DE VERDADE do src/App.tsx, com os guardas de verdade.
 *
 * POR QUE EXISTE. Os outros testes montam cada tela dentro de um MemoryRouter
 * próprio. Nenhum deles passa pelo <BrowserRouter> do App.tsx, pelo AuthGuard,
 * pelo RoleGuard, pelo ModuleGuard nem pela troca para o paywall do
 * DashboardLayout. Uma atualização do React Router (ou do Vite) que mudasse o
 * casamento de rotas ou o redirecionamento passaria em todos eles.
 *
 * O QUE É DE MENTIRA. As telas viram uma "tela falsa" (src/test/telaFalsa.tsx)
 * que só mostra o nome e o que o roteador entregou — caminho, ?busca, #fragmento
 * e parâmetros. Sessão, cargo, módulos ligados e o "pago ou não" vêm de
 * `estado`, abaixo. A Sidebar e o Navbar saem: não decidem rota.
 *
 * O QUE É DE VERDADE. App.tsx inteiro (rotas, Navigate, Suspense, lazy),
 * AuthGuard, RoleGuard, ModuleGuard, DashboardLayout, LojaOnlyNotice e NotFound.
 *
 * O comportamento real das telas que recebem link de fora (DefinirSenha lendo o
 * token, Ajuda rolando até o tópico, volta do Stripe e do Instagram) é coberto
 * no navegador, em e2e/rotas.spec.ts.
 */

const { padrao, nomeada, estado, ESTADO_INICIAL } = vi.hoisted(() => {
  const ESTADO_INICIAL = {
    sessao: true,
    authCarregando: false,
    papel: 'gerente' as string,
    statusPerfil: 'active' as string,
    modulos: [
      'conversations', 'contacts', 'funnel', 'tracking', 'reports', 'chatbots',
      'campaigns', 'followups', 'automation', 'whatsapp-numbers',
    ] as string[],
    bloqueado: false,
  };
  const padrao = (nome: string) => async () => ({
    default: (await import('./telaFalsa')).telaFalsa(nome),
  });
  const nomeada = (exportado: string, nome: string) => async () => ({
    [exportado]: (await import('./telaFalsa')).telaFalsa(nome),
  });
  return { padrao, nomeada, estado: { ...ESTADO_INICIAL }, ESTADO_INICIAL };
});

// ------------------------------------------------------------------ telas --
vi.mock('@/pages/LandingPage', padrao('Landing'));
vi.mock('@/pages/Login', padrao('Login'));
vi.mock('@/pages/Auth', nomeada('Auth', 'Auth'));
vi.mock('@/pages/DefinirSenha', nomeada('DefinirSenha', 'DefinirSenha'));
vi.mock('@/pages/TermsOfService', padrao('Termos'));
vi.mock('@/pages/PrivacyPolicy', padrao('Privacidade'));
vi.mock('@/pages/DataDeletion', padrao('ExclusaoDeDados'));
vi.mock('@/pages/Cadastro', padrao('Cadastro'));
vi.mock('@/pages/Index', padrao('Index'));
vi.mock('@/pages/Conversations', padrao('Conversations'));
vi.mock('@/pages/Contacts', padrao('Contacts'));
vi.mock('@/pages/Funnel', padrao('Funnel'));
vi.mock('@/pages/Tracking', padrao('Tracking'));
vi.mock('@/pages/Reports', padrao('Reports'));
vi.mock('@/pages/Chatbots', padrao('Chatbots'));
vi.mock('@/pages/Campaigns', padrao('Campaigns'));
vi.mock('@/pages/Templates', padrao('Templates'));
vi.mock('@/pages/Followups', padrao('Followups'));
vi.mock('@/pages/Automation', padrao('Automation'));
vi.mock('@/pages/Settings', padrao('Settings'));
vi.mock('@/components/settings/ProfileSettings', nomeada('ProfileSettings', 'Profile'));
vi.mock('@/pages/Notifications', padrao('Notifications'));
vi.mock('@/pages/Help', padrao('Help'));
vi.mock('@/pages/dashboard/AdminDashboard', padrao('Admin'));
vi.mock('@/pages/dashboard/admin/UsersPage', padrao('AdminUsers'));
vi.mock('@/pages/dashboard/admin/UsageLimitsPage', padrao('AdminUsageLimits'));
vi.mock('@/pages/dashboard/TeamPage', padrao('Team'));
vi.mock('@/pages/dashboard/StoreComparison', padrao('StoreComparison'));
vi.mock('@/pages/WhatsAppNumbers', padrao('WhatsAppNumbers'));
vi.mock('@/pages/ChatbotFlowBuilder', padrao('ChatbotFlowBuilder'));
vi.mock('@/components/auth/AccountStatusScreen', nomeada('AccountStatusScreen', 'ContaPendente'));

// O paywall mostra a busca que ELE lê (window.location), não a do roteador:
// é assim que a PaywallScreen real decide a tela de "confirmando pagamento".
vi.mock('@/components/auth/PaywallScreen', () => ({
  PaywallScreen: () => (
    <div>
      <h1>Tela Paywall</h1>
      <p data-testid="paywall-busca">{window.location.search}</p>
    </div>
  ),
}));

// ------------------------------------------------- moldura que não decide rota --
vi.mock('@/components/layout/Sidebar', () => ({ Sidebar: () => null }));
vi.mock('@/components/layout/Navbar', () => ({ Navbar: () => null }));
vi.mock('@/components/maintenance/MaintenanceBanner', () => ({ MaintenanceBanner: () => null }));
vi.mock('@/components/maintenance/MaintenanceGuard', () => ({
  MaintenanceGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/contexts/ChatbotContext', () => ({
  ChatbotProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useChatbot: () => ({}),
}));

// ------------------------------------------------- sessão, cargo e acesso --
vi.mock('@/contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({
    user: estado.sessao ? { id: 'u1', email: 'eu@exemplo.com.br' } : null,
    session: estado.sessao ? { access_token: 'tok' } : null,
    isLoading: estado.authCarregando,
    login: vi.fn(async () => {}),
    register: vi.fn(async () => {}),
    logout: vi.fn(async () => {}),
  }),
}));

vi.mock('@/contexts/TenantContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/contexts/TenantContext')>();
  const { roleAtLeast } = await import('@/types/userHierarchy');
  const papel = () => (estado.sessao ? estado.papel : null);
  return {
    ...actual,
    TenantProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useTenant: () => ({
      tenant: estado.sessao ? { id: 't1', name: 'Loja Teste', kind: 'account', parent_tenant_id: null } : null,
      profile: estado.sessao
        ? { id: 'p1', role: estado.papel, status: estado.statusPerfil, tenant_id: 't1' }
        : null,
      tenantId: estado.sessao ? 't1' : null,
      loading: false,
      error: null,
      refreshTenant: vi.fn(),
      updateTenantSettings: vi.fn(),
      isImpersonating: false,
      canSwitchTenant: false,
      setActiveTenant: vi.fn(),
    }),
    useTenantId: () => (estado.sessao ? 't1' : null),
    useRole: papel,
    useIsSuperAdmin: () => papel() === 'superadmin',
    useHasMinRole: (minimo: any) => papel() !== null && roleAtLeast(papel() as any, minimo),
  };
});

vi.mock('@/hooks/useModules', () => {
  const useModules = () => ({
    visibleModules: estado.modulos.map((module_name) => ({ module_name, is_enabled: true })),
    isLoading: false,
  });
  return { useModules, default: useModules };
});

vi.mock('@/hooks/useTenantAccess', () => ({
  useTenantAccess: () => ({ loading: false, locked: estado.bloqueado }),
}));

import App from '@/App';

// ----------------------------------------------------------------- apoio --
function abrir(endereco: string) {
  window.history.pushState({}, '', endereco);
  render(<App />);
}

const tela = (nome: string) => screen.findByRole('heading', { name: `Tela ${nome}` });

async function esperarCaminho(caminho: string) {
  await waitFor(() => expect(window.location.pathname).toBe(caminho));
}

afterEach(() => {
  cleanup();
  Object.assign(estado, { ...ESTADO_INICIAL, modulos: [...ESTADO_INICIAL.modulos] });
  window.history.pushState({}, '', '/');
});

/** Toda rota do dashboard que o gerente alcança, e a tela que ela abre. */
const DASHBOARD_GERENTE: Array<[string, string]> = [
  ['/dashboard', 'Index'],
  ['/dashboard/conversations', 'Conversations'],
  ['/dashboard/contacts', 'Contacts'],
  ['/dashboard/funnel', 'Funnel'],
  ['/dashboard/tracking', 'Tracking'],
  ['/dashboard/reports', 'Reports'],
  ['/dashboard/chatbots', 'Chatbots'],
  ['/dashboard/chatbots/bot-1/builder', 'ChatbotFlowBuilder'],
  ['/dashboard/campaigns', 'Campaigns'],
  ['/dashboard/templates', 'Templates'],
  ['/dashboard/followups', 'Followups'],
  ['/dashboard/automation', 'Automation'],
  ['/dashboard/whatsapp-numbers', 'WhatsAppNumbers'],
  ['/dashboard/settings', 'Settings'],
  ['/dashboard/team', 'Team'],
  ['/dashboard/store-comparison', 'StoreComparison'],
  ['/dashboard/profile', 'Profile'],
  ['/dashboard/notifications', 'Notifications'],
  ['/dashboard/help', 'Help'],
];

describe('App.tsx — rotas públicas', () => {
  it.each([
    ['/', 'Landing'],
    ['/auth', 'Auth'],
    ['/login', 'Login'],
    ['/definir-senha', 'DefinirSenha'],
    ['/terms-of-service', 'Termos'],
    ['/privacy-policy', 'Privacidade'],
    ['/exclusao-de-dados', 'ExclusaoDeDados'],
  ])('%s abre a tela %s sem sessão', async (caminho, nome) => {
    estado.sessao = false;
    abrir(caminho);
    expect(await tela(nome)).toBeInTheDocument();
    expect(window.location.pathname).toBe(caminho);
  });

  it.each(['/register', '/cadastro'])('%s leva ao login enquanto o cadastro pelo site está desligado', async (caminho) => {
    estado.sessao = false;
    abrir(caminho);
    expect(await tela('Auth')).toBeInTheDocument();
    await esperarCaminho('/auth');
  });
});

describe('App.tsx — 404', () => {
  it.each(['/rota-que-nao-existe', '/dashboard/rota-que-nao-existe', '/dashboard/admin/nada'])(
    '%s mostra "Página não encontrada" e não troca o endereço',
    async (caminho) => {
      abrir(caminho);
      expect(await screen.findByRole('heading', { name: 'Página não encontrada' })).toBeInTheDocument();
      expect(window.location.pathname).toBe(caminho);
    },
  );
});

describe('App.tsx — AuthGuard', () => {
  it.each(DASHBOARD_GERENTE)('sem sessão, %s manda para /auth', async (caminho) => {
    estado.sessao = false;
    abrir(caminho);
    expect(await tela('Auth')).toBeInTheDocument();
    await esperarCaminho('/auth');
  });

  it('enquanto a sessão carrega, não redireciona nem mostra a tela', async () => {
    estado.authCarregando = true;
    abrir('/dashboard/contacts');
    // Dá tempo para um redirect errado acontecer, se fosse acontecer.
    await new Promise((r) => setTimeout(r, 50));
    expect(window.location.pathname).toBe('/dashboard/contacts');
    expect(screen.queryByRole('heading', { name: /^Tela / })).not.toBeInTheDocument();
  });

  it('convite não concluído (status pending) vê a tela de conta pendente, não o dashboard', async () => {
    estado.statusPerfil = 'pending';
    abrir('/dashboard/contacts');
    expect(await tela('ContaPendente')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Tela Contacts' })).not.toBeInTheDocument();
  });
});

describe('App.tsx — cada rota do dashboard abre a sua tela', () => {
  it.each(DASHBOARD_GERENTE)('gerente: %s abre %s', async (caminho, nome) => {
    abrir(caminho);
    expect(await tela(nome)).toBeInTheDocument();
    expect(window.location.pathname).toBe(caminho);
  });

  it('o :id do construtor de chatbot chega à tela', async () => {
    abrir('/dashboard/chatbots/bot-1/builder');
    await tela('ChatbotFlowBuilder');
    expect(screen.getByTestId('params')).toHaveTextContent('{"id":"bot-1"}');
  });

  it.each([
    ['/dashboard/admin', 'Admin'],
    ['/dashboard/admin/users', 'AdminUsers'],
    ['/dashboard/admin/usage-limits', 'AdminUsageLimits'],
  ])('superadmin: %s abre %s', async (caminho, nome) => {
    estado.papel = 'superadmin';
    abrir(caminho);
    expect(await tela(nome)).toBeInTheDocument();
    expect(window.location.pathname).toBe(caminho);
  });
});

describe('App.tsx — RoleGuard', () => {
  it.each([
    ['gerente', '/dashboard/admin'],
    ['gestor', '/dashboard/admin/users'],
    ['atendente', '/dashboard/admin/usage-limits'],
    ['atendente', '/dashboard/team'],
    ['gestor', '/dashboard/store-comparison'],
    ['atendente', '/dashboard/store-comparison'],
  ])('%s em %s volta para /dashboard', async (papel, caminho) => {
    estado.papel = papel;
    abrir(caminho);
    expect(await tela('Index')).toBeInTheDocument();
    await esperarCaminho('/dashboard');
  });

  it.each([
    ['gestor', '/dashboard/team', 'Team'],
    ['gerente', '/dashboard/team', 'Team'],
    ['superadmin', '/dashboard/store-comparison', 'StoreComparison'],
  ])('%s em %s passa', async (papel, caminho, nome) => {
    estado.papel = papel;
    abrir(caminho);
    expect(await tela(nome)).toBeInTheDocument();
    expect(window.location.pathname).toBe(caminho);
  });
});

describe('App.tsx — ModuleGuard', () => {
  it('módulo desligado manda para a página inicial (/)', async () => {
    estado.modulos = estado.modulos.filter((m) => m !== 'campaigns');
    abrir('/dashboard/campaigns');
    expect(await tela('Landing')).toBeInTheDocument();
    await esperarCaminho('/');
  });

  it('desligar um módulo não fecha os outros', async () => {
    estado.modulos = estado.modulos.filter((m) => m !== 'campaigns');
    abrir('/dashboard/contacts');
    expect(await tela('Contacts')).toBeInTheDocument();
  });

  it('templates, settings, profile, notifications e help não dependem de módulo', async () => {
    estado.modulos = [];
    for (const [caminho, nome] of [
      ['/dashboard/templates', 'Templates'],
      ['/dashboard/settings', 'Settings'],
      ['/dashboard/profile', 'Profile'],
      ['/dashboard/notifications', 'Notifications'],
      ['/dashboard/help', 'Help'],
    ] as const) {
      abrir(caminho);
      expect(await tela(nome)).toBeInTheDocument();
      cleanup();
    }
  });

  it('superadmin passa pelo ModuleGuard, mas tela de Loja mostra o aviso "exclusivo para lojas"', async () => {
    estado.papel = 'superadmin';
    estado.modulos = [];
    abrir('/dashboard/reports');
    expect(await tela('Reports')).toBeInTheDocument();
    cleanup();
    abrir('/dashboard/campaigns');
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Tela Campaigns' })).not.toBeInTheDocument());
    expect(window.location.pathname).toBe('/dashboard/campaigns');
    expect(await screen.findByText('Exclusivo para lojas')).toBeInTheDocument();
  });
});

describe('App.tsx — paywall', () => {
  it.each(DASHBOARD_GERENTE)('Conta sem acesso: %s mostra o paywall e não a tela', async (caminho, nome) => {
    estado.bloqueado = true;
    abrir(caminho);
    expect(await tela('Paywall')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: `Tela ${nome}` })).not.toBeInTheDocument();
    expect(window.location.pathname).toBe(caminho);
  });

  it.each(['?checkout=success', '?checkout=cancel'])(
    'a volta do Stripe (%s) chega inteira ao paywall',
    async (busca) => {
      estado.bloqueado = true;
      abrir(`/dashboard/settings${busca}`);
      await tela('Paywall');
      expect(screen.getByTestId('paywall-busca')).toHaveTextContent(busca);
    },
  );

  it('o paywall não fecha as rotas públicas (convite e senha continuam abrindo)', async () => {
    estado.bloqueado = true;
    abrir('/definir-senha');
    expect(await tela('DefinirSenha')).toBeInTheDocument();
  });
});

describe('App.tsx — links que chegam de fora', () => {
  it.each([
    ['/definir-senha#access_token=tok-falso&refresh_token=r-falso&type=invite', 'DefinirSenha', false],
    ['/definir-senha#error=access_denied&error_code=otp_expired', 'DefinirSenha', false],
    ['/dashboard/help#page:conversations', 'Help', true],
    ['/dashboard/help#tutorial:montar-funil', 'Help', true],
    ['/dashboard/settings?checkout=success', 'Settings', true],
    ['/dashboard/settings?checkout=cancel', 'Settings', true],
    ['/dashboard/settings?tab=subscription', 'Settings', true],
    ['/dashboard/settings?tab=subscription&cartao=atualizado', 'Settings', true],
    ['/dashboard/whatsapp-numbers?ig_state=estado-falso&ig_code=codigo-falso', 'WhatsAppNumbers', true],
    ['/dashboard/whatsapp-numbers?ig_error=access_denied&ig_error_description=negado', 'WhatsAppNumbers', true],
    ['/dashboard/conversations?contact=aaaaaaaa-0000-4000-8000-000000000001', 'Conversations', true],
  ])('%s abre %s com a busca e o fragmento intactos', async (endereco, nome, comSessao) => {
    estado.sessao = comSessao;
    abrir(endereco);
    expect(await tela(nome)).toBeInTheDocument();
    expect(screen.getByTestId('local')).toHaveTextContent(endereco, { normalizeWhitespace: false });
  });
});
