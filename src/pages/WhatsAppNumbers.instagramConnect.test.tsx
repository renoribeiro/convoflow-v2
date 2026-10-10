import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

/**
 * Fatia 4b — conectar, reconectar, desligar e religar o Instagram pela tela.
 *
 *   - O banco diz não (a Conta, onde o Instagram nunca fica): sem seção, sem
 *     botão. Desde a 20261008000002 não há chave por Loja: em toda Loja o
 *     banco diz sim para Gestor/Gerente.
 *   - Loja: seção com "Conectar Instagram", e "Reconectar" no cartão, que
 *     manda a instância ao servidor.
 *   - "Desligar" pede confirmação que diz o que se perde, e chama a RPC.
 *   - Na volta do Instagram a tela conclui UMA vez e limpa a barra.
 */

const h = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  enabled: false,
  can: true,
  toast: vi.fn(),
  invoke: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({
    tenant: { id: 't1', name: 'Loja Teste' },
    profile: { id: 'p1', role: 'gestor', tenant_id: 't1' },
    tenantId: 't1',
    loading: false,
    error: null,
    refreshTenant: vi.fn(),
    updateTenantSettings: vi.fn(),
  }),
  useTenantId: () => 't1',
  useRole: () => 'gestor',
  useIsSuperAdmin: () => false,
  useCan: () => h.can,
}));
vi.mock('@/hooks/useSupabaseQuery', () => ({
  useSupabaseQuery: () => ({ data: h.rows, isLoading: false, error: null, refetch: vi.fn() }),
}));
vi.mock('@/hooks/useSupabaseMutation', () => ({
  useSupabaseMutation: () => ({ mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useMetaApi', () => ({
  useMetaApi: () => ({ verifyConnection: vi.fn(), registerNumber: vi.fn() }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: h.toast }), toast: h.toast }));
vi.mock('@/services/whatsapp/evolutionInstanceService', () => ({
  evolutionCredentialsFrom: () => null,
  evolutionServiceForRow: () => ({ getInstanceStatus: vi.fn() }),
}));
vi.mock('@/components/webhook/WebhookDashboard', () => ({ WebhookDashboard: () => null }));
vi.mock('@/components/debug/EnvironmentDebug', () => ({ EnvironmentDebug: () => null }));
vi.mock('@/components/debug/SupabaseDebug', () => ({ SupabaseDebug: () => null }));
vi.mock('@/components/shared/PageHeader', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock('@/components/whatsapp/CreateInstanceModal', () => ({ CreateInstanceModal: () => null }));
vi.mock('@/components/whatsapp/DeleteInstanceModal', () => ({ DeleteInstanceModal: () => null }));
vi.mock('@/components/whatsapp/RenameInstanceModal', () => ({ RenameInstanceModal: () => null }));
vi.mock('@/components/whatsapp/QRCodeModal', () => ({ QRCodeModal: () => null }));
vi.mock('@/components/whatsapp/WebhookConfigModal', () => ({ WebhookConfigModal: () => null }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(), functions: { invoke: h.invoke }, rpc: h.rpc },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import WhatsAppNumbers from './WhatsAppNumbers';

const NOW = new Date('2026-10-25T12:00:00Z');
const STATE = 'c'.repeat(64);

const whatsapp = {
  id: 'wa-1', name: 'Loja Exemplo Centro', instance_key: '100000000000099', status: 'open', is_active: true,
  provider: 'official', created_at: '2026-06-11T22:42:51.000Z', updated_at: '2026-06-11T22:42:51.000Z',
};
const igAccount = (over: Record<string, unknown> = {}) => ({
  id: 'ig-1', name: 'Instagram Teste', instance_key: 'instagram_17841419262135883', status: 'connected',
  is_active: true, provider: 'instagram', profile_name: '@convoflow',
  created_at: '2026-09-24T00:16:36.000Z', updated_at: '2026-09-24T00:16:36.000Z',
  connection_config: {
    igAccountId: '17841419262135883', igUsername: 'convoflow',
    tokenIssuedAt: '2026-09-25T10:43:29.415655+00:00', tokenExpiresAt: '2026-11-24T10:43:29.415655+00:00',
  },
  ...over,
});

function LocationProbe() {
  const loc = useLocation();
  return <output data-testid="location">{loc.pathname + loc.search}</output>;
}

function renderPage(url = '/dashboard/whatsapp-numbers') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/dashboard/whatsapp-numbers" element={<><WhatsAppNumbers /><LocationProbe /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const assign = vi.fn();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  h.rows = [];
  h.enabled = false;
  h.can = true;
  h.toast.mockReset();
  h.invoke.mockReset();
  h.rpc.mockReset();
  h.rpc.mockImplementation(async (fn: string) => {
    if (fn === 'instagram_connect_enabled') return { data: h.enabled, error: null };
    if (fn === 'set_instagram_account_active') return { data: { ok: true }, error: null };
    return { data: null, error: null };
  });
  assign.mockReset();
  Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign } });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Instagram pela tela — quem vê o quê', () => {
  it('o banco diz não (a Conta) e não há Instagram: nenhuma seção, nenhum botão', async () => {
    h.rows = [whatsapp];
    h.enabled = false;
    renderPage();
    await screen.findByText('Loja Exemplo Centro');
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith('instagram_connect_enabled', { p_tenant_id: 't1' }));
    expect(screen.queryByText('Contas do Instagram')).toBeNull();
    expect(screen.queryByText('Conectar Instagram')).toBeNull();
    expect(screen.queryByText('Reconectar')).toBeNull();
  });

  it('Loja sem conta: seção vazia com "Conectar Instagram" que leva ao Instagram', async () => {
    h.rows = [whatsapp];
    h.enabled = true;
    h.invoke.mockResolvedValue({ data: { ok: true, mode: 'connect', url: 'https://www.instagram.com/oauth/authorize?x=1' }, error: null });
    renderPage();
    const btn = await screen.findByTestId('instagram-connect');
    expect(screen.getByTestId('no-instagram-accounts')).toHaveTextContent('Nenhuma conta do Instagram conectada nesta Loja.');
    fireEvent.click(btn);
    await waitFor(() =>
      expect(h.invoke).toHaveBeenCalledWith('instagram-connect', { body: { action: 'start', tenantId: 't1', instanceId: null } }),
    );
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://www.instagram.com/oauth/authorize?x=1'));
  });

  it('servidor recusa o começo: mostra a mensagem dele e não sai da tela', async () => {
    h.enabled = true;
    h.invoke.mockResolvedValue({
      data: { ok: false, reason: 'forbidden_tenant', message: 'Você não pode conectar o Instagram nesta Loja.' },
      error: null,
    });
    renderPage();
    fireEvent.click(await screen.findByTestId('instagram-connect'));
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({
        description: 'Você não pode conectar o Instagram nesta Loja.', variant: 'destructive',
      })),
    );
    expect(assign).not.toHaveBeenCalled();
  });

  it('"Reconectar" manda a instância do cartão; o texto do cartão aponta para o botão', async () => {
    h.rows = [igAccount({ connection_config: { igUsername: 'convoflow', tokenExpiresAt: '2026-10-20T00:00:00Z' } })];
    h.enabled = true;
    h.invoke.mockResolvedValue({ data: { ok: true, mode: 'reconnect', url: 'https://www.instagram.com/oauth/authorize?y=2' }, error: null });
    renderPage();
    const card = (await screen.findByTestId('instagram-account')) as HTMLElement;
    await waitFor(() =>
      expect(within(card).getByTestId('instagram-validity')).toHaveTextContent('Para reconectar, clique em Reconectar neste cartão.'),
    );
    fireEvent.click(within(card).getByText('Reconectar'));
    await waitFor(() =>
      expect(h.invoke).toHaveBeenCalledWith('instagram-connect', { body: { action: 'start', tenantId: 't1', instanceId: 'ig-1' } }),
    );
  });

  it('conta posta numa Conta (o banco diz não): sem Reconectar (e o cartão manda escrever), mas Desligar existe', async () => {
    h.rows = [igAccount({ connection_config: { igUsername: 'convoflow', tokenExpiresAt: '2026-10-20T00:00:00Z' } })];
    h.enabled = false;
    renderPage();
    const card = (await screen.findByTestId('instagram-account')) as HTMLElement;
    await waitFor(() => expect(h.rpc).toHaveBeenCalled());
    expect(within(card).queryByText('Reconectar')).toBeNull();
    expect(screen.queryByTestId('instagram-connect')).toBeNull();
    expect(within(card).getByTestId('instagram-validity')).toHaveTextContent('escreva para contato@convoflow.com.br');
    expect(within(card).getByText('Desligar')).toBeInTheDocument();
  });

  it('Atendente: nem conectar, nem reconectar, nem desligar', async () => {
    h.rows = [igAccount()];
    h.enabled = false; // o banco já diria false para ele
    h.can = false;
    renderPage();
    const card = (await screen.findByTestId('instagram-account')) as HTMLElement;
    expect(within(card).queryByText('Reconectar')).toBeNull();
    expect(within(card).queryByText('Desligar')).toBeNull();
    expect(screen.queryByTestId('instagram-connect')).toBeNull();
  });
});

describe('Desligar / religar', () => {
  it('confirma dizendo o que se perde, e só então chama a RPC', async () => {
    h.rows = [igAccount()];
    h.enabled = true;
    renderPage();
    const card = (await screen.findByTestId('instagram-account')) as HTMLElement;
    expect(within(card).getByText('Ligada')).toBeInTheDocument();
    fireEvent.click(within(card).getByText('Desligar'));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Desligar @convoflow?')).toBeInTheDocument();
    expect(dialog).toHaveTextContent('O histórico fica');
    expect(dialog).toHaveTextContent('NÃO entram no ConvoFlow e se perdem');
    expect(h.rpc).not.toHaveBeenCalledWith('set_instagram_account_active', expect.anything());

    fireEvent.click(within(dialog).getByRole('button', { name: 'Desligar' }));
    await waitFor(() =>
      expect(h.rpc).toHaveBeenCalledWith('set_instagram_account_active', { p_instance_id: 'ig-1', p_active: false }),
    );
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Instagram desligado' })));
  });

  it('desligada: selo "Desligada", conta como desconectada, botão Religar', async () => {
    h.rows = [igAccount({ is_active: false })];
    h.enabled = true;
    renderPage();
    const card = (await screen.findByTestId('instagram-account')) as HTMLElement;
    expect(within(card).getByText('Desligada')).toBeInTheDocument();
    fireEvent.click(within(card).getByText('Religar'));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Religar' }));
    await waitFor(() =>
      expect(h.rpc).toHaveBeenCalledWith('set_instagram_account_active', { p_instance_id: 'ig-1', p_active: true }),
    );
  });
});

describe('volta do Instagram', () => {
  it('conclui UMA vez, mostra a validade e limpa a barra', async () => {
    h.enabled = true;
    h.invoke.mockResolvedValue({
      data: {
        ok: true, mode: 'connect', username: 'convoflow',
        instance: { id: 'ig-1', tenant_id: 't1', name: 'Instagram @convoflow', profile_name: '@convoflow', is_active: true, valid_until: '2026-11-24T10:43:29.415655+00:00' },
      },
      error: null,
    });
    renderPage(`/dashboard/whatsapp-numbers?ig_state=${STATE}&ig_code=AQB123`);
    await waitFor(() =>
      expect(h.invoke).toHaveBeenCalledWith('instagram-connect', { body: { action: 'complete', code: 'AQB123', state: STATE } }),
    );
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith({
        title: 'Instagram conectado',
        description: '@convoflow foi conectada a esta Loja. Válida até 24/11/2026 às 07:43.',
      }),
    );
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/dashboard\/whatsapp-numbers$/);
    expect(h.invoke.mock.calls.filter(([, o]) => o.body.action === 'complete')).toHaveLength(1);
  });

  it('recusa do servidor (outra conta no cartão) vira aviso com a mensagem dele', async () => {
    h.invoke.mockResolvedValue({
      data: { ok: false, reason: 'wrong_account', message: 'Você entrou no Instagram com outra conta. Este cartão é da conta @convoflow.' },
      error: null,
    });
    renderPage(`/dashboard/whatsapp-numbers?ig_state=${STATE}&ig_code=AQB123`);
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith({
        title: 'Instagram não conectado',
        description: 'Você entrou no Instagram com outra conta. Este cartão é da conta @convoflow.',
        variant: 'destructive',
      }),
    );
  });

  it('cancelou no Instagram: avisa, não chama o servidor', async () => {
    renderPage(`/dashboard/whatsapp-numbers?ig_state=${STATE}&ig_error=access_denied`);
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith({
        title: 'Conexão cancelada',
        description: 'Você cancelou a autorização no Instagram. Nada foi alterado.',
        variant: 'destructive',
      }),
    );
    expect(h.invoke).not.toHaveBeenCalled();
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/dashboard\/whatsapp-numbers$/);
  });
});
