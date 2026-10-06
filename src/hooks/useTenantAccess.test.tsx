/**
 * useTenantAccess — a ligação entre a tela e a RPC de herança de acesso.
 *
 * A regra em si (quem herda de quem) é testada em
 * `src/lib/access/tenantAccess.test.ts`. Aqui o que importa é o contrato que o
 * DashboardLayout consome:
 *   - `locked` NUNCA verdadeiro enquanto a consulta está no ar (senão pisca o
 *     paywall na cara de quem tem acesso);
 *   - SÓ o superadmin passa sem consultar nada. O gerente perdeu o bypass em
 *     2026-08-19 e agora é avaliado como todo mundo — a saída dele é o caminho
 *     de pagamento dentro da própria PaywallScreen;
 *   - a linha perguntada para o gerente é a PRÓPRIA Conta, nunca a Loja que ele
 *     esteja visitando pelo seletor;
 *   - RPC fora do ar degrada para o comportamento antigo, não tranca todo mundo.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: mockRpc },
}));

let role: string | null = 'gestor';
let tenant: Record<string, unknown> | null = null;
let profile: Record<string, unknown> | null = null;
let tenantLoading = false;

vi.mock('@/contexts/TenantContext', () => ({
  useRole: () => role,
  useTenant: () => ({ tenant, profile, loading: tenantLoading }),
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { useTenantAccess } from './useTenantAccess';

const LOJA_COM_PAI = {
  id: 'loja-teste',
  kind: 'store',
  parent_tenant_id: 'conta-teste',
  subscription_status: null,
  manual_access_granted: false,
};

/**
 * Loja sem `parent_tenant_id`, com a liberação na própria linha.
 *
 * Nenhuma existe em produção desde 2026-08-20 (`docs/remover_lojas_orfas.sql`).
 * A fixture fica porque o que importa é a FORMA — `tenants.parent_tenant_id` é
 * nullable e nada impede que apareça outra. O `id` é genérico de propósito:
 * teste que carrega nome de linha de produção mente na primeira faxina.
 */
const LOJA_ORFA_LIBERADA = {
  id: 'loja-orfa',
  kind: 'store',
  parent_tenant_id: null,
  subscription_status: null,
  manual_access_granted: true,
};

/** A Conta do gerente: é ela que responde pela cobrança dele. */
const CONTA_LIBERADA_NA_MAO = {
  id: 'conta-teste',
  kind: 'account',
  parent_tenant_id: null,
  subscription_status: null,
  manual_access_granted: true,
};

const CONTA_TRANCADA = {
  id: 'conta-teste',
  kind: 'account',
  parent_tenant_id: null,
  subscription_status: null,
  manual_access_granted: false,
};

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'TestQueryProvider';
  return Wrapper;
}

/** Uma RPC que nunca resolve — serve para inspecionar o estado "em voo". */
const rpcPendente = () => new Promise(() => {});

beforeEach(() => {
  vi.clearAllMocks();
  role = 'gestor';
  tenant = LOJA_COM_PAI;
  profile = { tenant_id: 'loja-teste' };
  tenantLoading = false;
});

describe('nada de piscar o paywall', () => {
  it('enquanto a RPC não responde, fica em loading e NUNCA locked', async () => {
    mockRpc.mockImplementation(rpcPendente);

    const { result } = renderHook(() => useTenantAccess(), { wrapper: makeWrapper() });

    expect(result.current.loading).toBe(true);
    expect(result.current.locked).toBe(false);
    expect(result.current.unlocked).toBe(false);
  });

  it('enquanto o tenant ainda carrega, fica em loading e não consulta', () => {
    tenantLoading = true;
    tenant = null;

    const { result } = renderHook(() => useTenantAccess(), { wrapper: makeWrapper() });

    expect(result.current.loading).toBe(true);
    expect(result.current.locked).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('enquanto o cargo não carregou, fica em loading', () => {
    role = null;

    const { result } = renderHook(() => useTenantAccess(), { wrapper: makeWrapper() });

    expect(result.current.loading).toBe(true);
    expect(result.current.locked).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('bypass por cargo', () => {
  it('superadmin entra sem consultar a RPC', () => {
    role = 'superadmin';

    const { result } = renderHook(() => useTenantAccess(), { wrapper: makeWrapper() });

    expect(result.current).toEqual({
      loading: false,
      unlocked: true,
      locked: false,
      source: 'bypass',
    });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('superadmin não é afetado nem quando a RPC devolveria trancado', () => {
    role = 'superadmin';
    mockRpc.mockResolvedValue({ data: [{ unlocked: false, source: 'locked' }], error: null });

    const { result } = renderHook(() => useTenantAccess(), { wrapper: makeWrapper() });

    expect(result.current.unlocked).toBe(true);
    expect(result.current.source).toBe('bypass');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('superadmin SEM Conta nenhuma entra igual — é como os três rodam hoje', () => {
    // Desde 2026-08-20 nenhum superadmin tem `tenant_id`: os três (reno,
    // os superadmins) rodam com NULL, e a Conta em foco vem do seletor.
    // O bypass é decidido pelo CARGO, antes de olhar linha nenhuma — por isso
    // `tenant: null` não vira paywall. Sem este teste, mover a checagem de
    // cargo para depois da linha trancaria os três de uma vez.
    role = 'superadmin';
    tenant = null;
    profile = { tenant_id: null };

    const { result } = renderHook(() => useTenantAccess(), { wrapper: makeWrapper() });

    expect(result.current).toEqual({
      loading: false,
      unlocked: true,
      locked: false,
      source: 'bypass',
    });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('o gerente NÃO tem mais bypass: ele é consultado como todo mundo', async () => {
    // Este é o teste que trava a regressão. Enquanto o gerente tinha bypass,
    // uma Conta sem pagamento nunca via o paywall — e não havia nem como cobrar.
    role = 'gerente';
    tenant = CONTA_TRANCADA;
    profile = { tenant_id: 'conta-teste' };
    mockRpc.mockResolvedValue({ data: [{ unlocked: false, source: 'locked' }], error: null });

    const { result } = renderHook(() => useTenantAccess(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toEqual({
      loading: false,
      unlocked: false,
      locked: true,
      source: 'locked',
    });
    expect(mockRpc).toHaveBeenCalled();
  });
});

describe('gerente é avaliado pela PRÓPRIA Conta', () => {
  beforeEach(() => {
    role = 'gerente';
    profile = { tenant_id: 'conta-teste' };
  });

  it('Conta liberada na mão continua liberada — é o caso de toda a produção hoje', async () => {
    tenant = CONTA_LIBERADA_NA_MAO;
    mockRpc.mockResolvedValue({ data: [{ unlocked: true, source: 'manual' }], error: null });

    const { result } = renderHook(() => useTenantAccess(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.unlocked).toBe(true);
    expect(result.current.source).toBe('manual');
  });

  it('Conta paga libera com source paid', async () => {
    tenant = { ...CONTA_TRANCADA, subscription_status: 'active' };
    mockRpc.mockResolvedValue({ data: [{ unlocked: true, source: 'paid' }], error: null });

    const { result } = renderHook(() => useTenantAccess(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.unlocked).toBe(true));
    expect(result.current.source).toBe('paid');
  });

  it('visitando uma Loja filha, ainda pergunta pela Conta dele — não pela Loja', async () => {
    // Quem assina é a Conta. Perguntar pela Loja em foco daria a mesma resposta
    // pela herança, mas refaria a consulta a cada troca de Loja e abriria a
    // porta para a Loja parecer ter acesso próprio, que não existe.
    tenant = LOJA_COM_PAI;
    mockRpc.mockResolvedValue({ data: [{ unlocked: true, source: 'manual' }], error: null });

    const { result } = renderHook(() => useTenantAccess(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockRpc).toHaveBeenCalledWith('tenant_access_state', {
      p_tenant_id: 'conta-teste',
    });
  });

  it('RPC fora do ar na própria Conta: avalia a linha em mãos e não tranca quem tem liberação', async () => {
    tenant = CONTA_LIBERADA_NA_MAO;
    mockRpc.mockResolvedValue({ data: null, error: { message: 'network' } });

    const { result } = renderHook(() => useTenantAccess(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 });
    expect(result.current.unlocked).toBe(true);
    expect(result.current.source).toBe('manual');
  });

  it('RPC fora do ar com uma Loja filha em foco não inventa bloqueio', async () => {
    // A linha da Conta não está em mãos (o RLS não a entrega numa consulta
    // comum). Trancar aqui seria pior que o comportamento anterior à mudança.
    tenant = LOJA_COM_PAI;
    mockRpc.mockResolvedValue({ data: null, error: { message: 'network' } });

    const { result } = renderHook(() => useTenantAccess(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 });
    expect(result.current.locked).toBe(false);
  });
});

describe('o que a RPC responde é o que vale', () => {
  it('Loja com Conta paga entra, com source paid', async () => {
    mockRpc.mockResolvedValue({ data: [{ unlocked: true, source: 'paid' }], error: null });

    const { result } = renderHook(() => useTenantAccess(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toEqual({
      loading: false,
      unlocked: true,
      locked: false,
      source: 'paid',
    });
  });

  it('Loja com Conta liberada manualmente entra — o defeito do Blocker 1', async () => {
    mockRpc.mockResolvedValue({ data: [{ unlocked: true, source: 'manual' }], error: null });

    const { result } = renderHook(() => useTenantAccess(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.unlocked).toBe(true));
    expect(result.current.source).toBe('manual');
    expect(result.current.locked).toBe(false);
  });

  it('Loja com Conta trancada vê o paywall', async () => {
    mockRpc.mockResolvedValue({ data: [{ unlocked: false, source: 'locked' }], error: null });

    const { result } = renderHook(() => useTenantAccess(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toEqual({
      loading: false,
      unlocked: false,
      locked: true,
      source: 'locked',
    });
  });

  it('pergunta pela Loja em foco', async () => {
    mockRpc.mockResolvedValue({ data: [{ unlocked: true, source: 'manual' }], error: null });

    const { result } = renderHook(() => useTenantAccess(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockRpc).toHaveBeenCalledWith('tenant_access_state', {
      p_tenant_id: 'loja-teste',
    });
  });

  it('aceita a função devolvendo objeto solto em vez de lista', async () => {
    mockRpc.mockResolvedValue({ data: { unlocked: true, source: 'manual' }, error: null });

    const { result } = renderHook(() => useTenantAccess(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.unlocked).toBe(true));
  });
});

describe('degradação quando a RPC não responde', () => {
  it('função ainda não aplicada não tranca uma Loja órfã liberada na própria linha', async () => {
    tenant = LOJA_ORFA_LIBERADA;
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Could not find the function public.tenant_access_state' },
    });

    const { result } = renderHook(() => useTenantAccess(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 });
    expect(result.current).toEqual({
      loading: false,
      unlocked: true,
      locked: false,
      source: 'manual',
    });
  });

  it('degradar devolve o comportamento antigo, nunca pior que ele', async () => {
    // A Loja com pai não tem nada na própria linha: antes desta mudança ela já
    // via o paywall. A degradação não conserta, mas também não piora.
    mockRpc.mockResolvedValue({ data: null, error: { message: 'network' } });

    const { result } = renderHook(() => useTenantAccess(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 });
    expect(result.current.locked).toBe(true);
  });

  it('resposta vazia da função também degrada em vez de estourar', async () => {
    tenant = LOJA_ORFA_LIBERADA;
    mockRpc.mockResolvedValue({ data: [], error: null });

    const { result } = renderHook(() => useTenantAccess(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 });
    expect(result.current.unlocked).toBe(true);
  });
});

describe('sem tenant', () => {
  it('perfil sem Conta fica trancado e não consulta', () => {
    tenant = null;

    const { result } = renderHook(() => useTenantAccess(), { wrapper: makeWrapper() });

    expect(result.current).toEqual({
      loading: false,
      unlocked: false,
      locked: true,
      source: 'locked',
    });
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
