/**
 * MaintenanceGuard — o contrato de quem passa e quem não passa.
 *
 * Esta trava fecha a base inteira de clientes de uma vez, então os testes aqui
 * cobrem os dois lados com o mesmo peso:
 *   - o bloqueio funciona para gerente, gestor e atendente;
 *   - o superadmin JAMAIS é bloqueado, nem fica esperando;
 *   - e, acima de tudo, TODO caminho de dúvida abre o sistema (falha aberta).
 *
 * A resolução da janela em si é testada sem React em
 * `src/lib/maintenance/maintenanceState.test.ts` e foi conferida contra o banco
 * de produção com um probe (ver docs/RUNBOOK_modo_manutencao.md).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: mockRpc },
}));

let role: string | null = 'gestor';
vi.mock('@/contexts/TenantContext', () => ({
  useRole: () => role,
  useTenant: () => ({ tenant: null, profile: null, loading: false }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ logout: vi.fn() }),
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { MaintenanceGuard } from './MaintenanceGuard';

const APP = 'conteudo-do-sistema';
const BLOQUEIO = /Já já o ConvoFlow volta/i;

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

function renderGuard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MaintenanceGuard>
          <div>{APP}</div>
        </MaintenanceGuard>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockRpc.mockReset();
  role = 'gestor';
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Quem é bloqueado
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

  it('o superadmin nem chega a consultar a RPC para decidir', async () => {
    role = 'superadmin';
    mockRpc.mockResolvedValue(LIGADA);

    renderGuard();

    // Passa na primeira renderização, sem esperar resposta nenhuma. É o que
    // garante que uma RPC lenta não atrase quem está consertando o sistema.
    expect(screen.getByText(APP)).toBeInTheDocument();
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

    // `waitFor` não serve aqui: ele usa temporizador e trava com os falsos.
    // Adiantar o relógio dentro de act() é o que faz o React aplicar o estado.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6100);
    });

    expect(screen.getByText(APP)).toBeInTheDocument();
  });
});
