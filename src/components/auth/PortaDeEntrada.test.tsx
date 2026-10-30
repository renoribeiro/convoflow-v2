/**
 * PortaDeEntrada — o contrato de quem passa e quem não passa (lote 6f, B14).
 *
 * A porta juntou três guardas que esperavam em fila (sessão, manutenção e
 * pagamento). As regras de cada uma ficaram iguais, e este arquivo prova isso:
 *   - manutenção: bloqueia gerente, gestor e atendente; o superadmin JAMAIS é
 *     bloqueado nem espera; TODO caminho de dúvida abre o sistema (falha aberta);
 *   - pagamento: Conta sem acesso vê a tela de bloqueio (o Gerente recebe nela o
 *     caminho de pagamento, ver PaywallScreen.test); o superadmin passa;
 *   - a manutenção vem antes do pagamento;
 *   - sessão: sem sessão vai ao login; pendente vê o cadastro incompleto;
 *     suspenso ou excluído sai;
 *   - e a espera: as perguntas saem juntas, com um esqueleto só.
 *
 * A resolução da janela em si é testada sem React em
 * `src/lib/maintenance/maintenanceState.test.ts`, e a ordem das regras em
 * `src/lib/access/entrada.test.ts`.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const { mockRpc, mockLogout } = vi.hoisted(() => ({ mockRpc: vi.fn(), mockLogout: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: mockRpc },
}));

let role: string | null = 'gestor';
let perfilCarregando = false;
let statusDoPerfil = 'active';
let sessao = true;
let sessaoCarregando = false;
let acesso = { loading: false, locked: false };
let modulosCarregando = false;

vi.mock('@/contexts/TenantContext', () => ({
  useRole: () => (perfilCarregando ? null : role),
  useTenant: () => ({
    tenant: null,
    profile: perfilCarregando ? null : { id: 'p1', role, status: statusDoPerfil, tenant_id: 't1' },
    loading: perfilCarregando,
  }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    session: sessao ? { access_token: 'tok' } : null,
    isLoading: sessaoCarregando,
    logout: mockLogout,
  }),
}));

vi.mock('@/hooks/useTenantAccess', () => ({
  useTenantAccess: () => ({ ...acesso, unlocked: !acesso.loading && !acesso.locked, source: 'paid' }),
}));

vi.mock('@/hooks/useModules', () => ({
  useModules: () => ({ isLoading: modulosCarregando }),
}));

vi.mock('./PaywallScreen', () => ({
  PaywallScreen: () => <h1>Tela de bloqueio</h1>,
}));

vi.mock('./AccountStatusScreen', () => ({
  AccountStatusScreen: ({ status }: { status: string }) => <h1>Cadastro {status}</h1>,
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { PortaDeEntrada } from './PortaDeEntrada';

const APP = 'conteudo-do-sistema';
const BLOQUEIO = /Já já o ConvoFlow volta/i;
const PAYWALL = 'Tela de bloqueio';
const esqueleto = () => screen.queryAllByTestId('carregando-entrada');

/** Resposta da RPC no formato que o PostgREST devolve (lista de uma linha). */
const resposta = (patch: Record<string, unknown> = {}) => ({
  data: [
    {
      active: false,
      scheduled: false,
      reason: null,
      starts_at: null,
      ends_at: null,
      server_now: new Date().toISOString(),
      ...patch,
    },
  ],
  error: null,
});

const LIGADA = resposta({ active: true, reason: 'Atualizando o banco.' });
const DESLIGADA = resposta();

function renderGuard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <PortaDeEntrada>
                <div>{APP}</div>
              </PortaDeEntrada>
            }
          />
          <Route path="/auth" element={<h1>Tela de login</h1>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockRpc.mockReset();
  mockLogout.mockReset();
  role = 'gestor';
  perfilCarregando = false;
  statusDoPerfil = 'active';
  sessao = true;
  sessaoCarregando = false;
  acesso = { loading: false, locked: false };
  modulosCarregando = false;
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Quem é bloqueado pela manutenção
// ---------------------------------------------------------------------------

describe('com a manutenção ligada', () => {
  it.each(['gerente', 'gestor', 'atendente'])('bloqueia o %s', async (cargo) => {
    role = cargo;
    mockRpc.mockResolvedValue(LIGADA);

    renderGuard();

    expect(await screen.findByText(BLOQUEIO)).toBeInTheDocument();
    expect(screen.queryByText(APP)).not.toBeInTheDocument();
  });

  it('mostra o motivo escrito pelo superadmin', async () => {
    role = 'gerente';
    mockRpc.mockResolvedValue(LIGADA);

    renderGuard();

    expect(await screen.findByText('Atualizando o banco.')).toBeInTheDocument();
  });

  // O motivo de a regra existir: quem liga o bloqueio tem de conseguir
  // conferir o conserto antes de destrancar a porta para os outros.
  it('NÃO bloqueia o superadmin', async () => {
    role = 'superadmin';
    mockRpc.mockResolvedValue(LIGADA);

    renderGuard();

    expect(await screen.findByText(APP)).toBeInTheDocument();
    expect(screen.queryByText(BLOQUEIO)).not.toBeInTheDocument();
  });

  it('o superadmin nem espera a RPC para decidir', () => {
    role = 'superadmin';
    mockRpc.mockReturnValue(new Promise(() => {}));

    renderGuard();

    // Passa na primeira renderização, sem esperar resposta nenhuma. É o que
    // garante que uma RPC lenta não atrase quem está consertando o sistema.
    expect(screen.getByText(APP)).toBeInTheDocument();
  });

  it('o selo diz "ligada agora" quando a manutenção foi ligada na hora', async () => {
    role = 'atendente';
    mockRpc.mockResolvedValue(LIGADA);

    renderGuard();

    expect(await screen.findByText('Manutenção ligada agora')).toBeInTheDocument();
  });

  it('o selo diz "programada" quando a manutenção veio de uma janela marcada', async () => {
    role = 'atendente';
    mockRpc.mockResolvedValue(
      resposta({ active: true, starts_at: new Date(Date.now() - 600_000).toISOString() }),
    );

    renderGuard();

    expect(await screen.findByText('Manutenção programada, em andamento')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Janela vencida — resolve sozinha, sem cron
// ---------------------------------------------------------------------------

describe('janela vencida', () => {
  it('não bloqueia ninguém quando o servidor diz que a janela acabou', async () => {
    role = 'atendente';
    // É o servidor quem resolve a janela: passado o fim, ele devolve
    // active=false sem ninguém ter desligado nada.
    mockRpc.mockResolvedValue(
      resposta({
        active: false,
        reason: null,
        starts_at: new Date(Date.now() - 4 * 3600_000).toISOString(),
        ends_at: new Date(Date.now() - 3600_000).toISOString(),
      }),
    );

    renderGuard();

    expect(await screen.findByText(APP)).toBeInTheDocument();
    expect(screen.queryByText(BLOQUEIO)).not.toBeInTheDocument();
  });

  it('janela agendada que ainda não começou deixa todo mundo trabalhar', async () => {
    role = 'gestor';
    mockRpc.mockResolvedValue(
      resposta({
        scheduled: true,
        starts_at: new Date(Date.now() + 2 * 3600_000).toISOString(),
        ends_at: new Date(Date.now() + 4 * 3600_000).toISOString(),
      }),
    );

    renderGuard();

    expect(await screen.findByText(APP)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Falha aberta — a regra que manda em todas as outras
// ---------------------------------------------------------------------------

describe('falha aberta', () => {
  it('RPC devolvendo erro NÃO tranca ninguém', async () => {
    role = 'atendente';
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'function public.maintenance_state() does not exist' },
    });

    renderGuard();

    expect(await screen.findByText(APP)).toBeInTheDocument();
  });

  it('permissão negada NÃO tranca ninguém', async () => {
    role = 'gestor';
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'permission denied for function maintenance_state' },
    });

    renderGuard();

    expect(await screen.findByText(APP)).toBeInTheDocument();
  });

  it('rede fora NÃO tranca ninguém', async () => {
    role = 'gerente';
    mockRpc.mockRejectedValue(new TypeError('Failed to fetch'));

    renderGuard();

    expect(await screen.findByText(APP)).toBeInTheDocument();
  });

  it('resposta vazia NÃO tranca ninguém', async () => {
    role = 'atendente';
    mockRpc.mockResolvedValue({ data: [], error: null });

    renderGuard();

    expect(await screen.findByText(APP)).toBeInTheDocument();
  });

  it('resposta sem o campo active NÃO tranca ninguém', async () => {
    role = 'gestor';
    mockRpc.mockResolvedValue({ data: [{ reason: 'oi' }], error: null });

    renderGuard();

    expect(await screen.findByText(APP)).toBeInTheDocument();
  });

  // O caminho que mais escapa: a consulta que nunca responde. Um carregando
  // eterno é indistinguível de um bloqueio para quem está do outro lado.
  it('consulta que NUNCA responde abre o sistema depois do limite de espera', async () => {
    role = 'gestor';
    vi.useFakeTimers();
    mockRpc.mockReturnValue(new Promise(() => {}));

    renderGuard();

    // Antes do limite: o sistema não aparece (ainda estamos decidindo).
    expect(screen.queryByText(APP)).not.toBeInTheDocument();
    expect(esqueleto()).toHaveLength(1);

    // `waitFor` não serve aqui: ele usa temporizador e trava com os falsos.
    // Adiantar o relógio dentro de act() é o que faz o React aplicar o estado.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6100);
    });

    expect(screen.getByText(APP)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Pagamento (paywall) — as regras de antes, decididas na mesma porta
// ---------------------------------------------------------------------------

describe('Conta sem acesso liberado', () => {
  it.each(['gerente', 'gestor', 'atendente'])('o %s vê a tela de bloqueio', async (cargo) => {
    role = cargo;
    acesso = { loading: false, locked: true };
    mockRpc.mockResolvedValue(DESLIGADA);

    renderGuard();

    expect(await screen.findByText(PAYWALL)).toBeInTheDocument();
    expect(screen.queryByText(APP)).not.toBeInTheDocument();
  });

  it('o superadmin passa mesmo com a Conta bloqueada', () => {
    role = 'superadmin';
    acesso = { loading: false, locked: true };

    renderGuard();

    expect(screen.getByText(APP)).toBeInTheDocument();
  });

  it('enquanto o acesso não responde, mostra o esqueleto e NUNCA a tela de bloqueio', async () => {
    acesso = { loading: true, locked: false };
    mockRpc.mockResolvedValue(DESLIGADA);

    renderGuard();

    await act(async () => {});
    expect(esqueleto()).toHaveLength(1);
    expect(screen.queryByText(PAYWALL)).not.toBeInTheDocument();
    expect(screen.queryByText(APP)).not.toBeInTheDocument();
  });

  it('a manutenção vem antes do pagamento', async () => {
    role = 'gerente';
    acesso = { loading: false, locked: true };
    mockRpc.mockResolvedValue(LIGADA);

    renderGuard();

    expect(await screen.findByText(BLOQUEIO)).toBeInTheDocument();
    expect(screen.queryByText(PAYWALL)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Sessão e situação do perfil
// ---------------------------------------------------------------------------

describe('sessão e perfil', () => {
  it('sem sessão vai para o login', async () => {
    sessao = false;

    renderGuard();

    expect(await screen.findByText('Tela de login')).toBeInTheDocument();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('convite não concluído vê o cadastro incompleto', async () => {
    statusDoPerfil = 'pending';
    mockRpc.mockResolvedValue(DESLIGADA);

    renderGuard();

    expect(await screen.findByText('Cadastro pending')).toBeInTheDocument();
  });

  it.each(['suspended', 'deleted'])('perfil %s sai na hora e nada do painel aparece', async (status) => {
    statusDoPerfil = status;
    mockRpc.mockResolvedValue(DESLIGADA);

    renderGuard();

    await act(async () => {});
    expect(mockLogout).toHaveBeenCalled();
    expect(screen.queryByText(APP)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// A espera (B14): perguntas juntas, um esqueleto só
// ---------------------------------------------------------------------------

describe('a espera', () => {
  it('lendo a sessão: um esqueleto só, e ninguém pergunta nada ainda', () => {
    sessaoCarregando = true;

    renderGuard();

    expect(esqueleto()).toHaveLength(1);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('a manutenção pergunta enquanto o perfil ainda carrega (não depois)', async () => {
    perfilCarregando = true;
    mockRpc.mockResolvedValue(DESLIGADA);

    renderGuard();

    await act(async () => {});
    expect(mockRpc).toHaveBeenCalledWith('maintenance_state');
    expect(esqueleto()).toHaveLength(1);
    expect(screen.queryByText(APP)).not.toBeInTheDocument();
  });

  it('com os módulos ainda no ar, segue no mesmo esqueleto', async () => {
    modulosCarregando = true;
    mockRpc.mockResolvedValue(DESLIGADA);

    renderGuard();

    await act(async () => {});
    expect(esqueleto()).toHaveLength(1);
    expect(screen.queryByText(APP)).not.toBeInTheDocument();
  });

  it('tudo respondido: o painel aparece', async () => {
    mockRpc.mockResolvedValue(DESLIGADA);

    renderGuard();

    expect(await screen.findByText(APP)).toBeInTheDocument();
    expect(esqueleto()).toHaveLength(0);
  });
});
