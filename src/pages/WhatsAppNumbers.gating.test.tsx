import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

/**
 * A lixeira aparecia para TODO cargo, ao contrário do lápis (renomear), que já
 * era escondido sem `whatsapp.configure`. Este teste fixa que os dois botões
 * seguem a mesma regra. Esconder é cortesia; quem nega de verdade é a RPC
 * delete_whatsapp_instance (docs/teste_exclusao_instancia.sql).
 */

const { state } = vi.hoisted(() => ({
  state: { canConfigure: true },
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
  useRole: () => (state.canConfigure ? 'gestor' : 'atendente'),
  useIsSuperAdmin: () => false,
  useCan: () => state.canConfigure,
}));

vi.mock('@/hooks/useSupabaseQuery', () => ({
  useSupabaseQuery: () => ({
    data: [
      {
        id: 'inst-1',
        name: 'Vaga Certa',
        instance_key: '100000000000099',
        status: 'open',
        is_active: true,
        provider: 'official',
        created_at: '2026-06-11T22:42:51.000Z',
        updated_at: '2026-06-11T22:42:51.000Z',
      },
    ],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/hooks/useSupabaseMutation', () => ({
  useSupabaseMutation: () => ({ mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useMetaApi', () => ({
  useMetaApi: () => ({ verifyConnection: vi.fn(), registerNumber: vi.fn() }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }));
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
vi.mock('@/components/whatsapp/DeleteInstanceModal', () => ({
  DeleteInstanceModal: ({ open }: { open: boolean }) => (open ? <div data-testid="delete-modal" /> : null),
}));
vi.mock('@/components/whatsapp/RenameInstanceModal', () => ({ RenameInstanceModal: () => null }));
vi.mock('@/components/whatsapp/QRCodeModal', () => ({ QRCodeModal: () => null }));
vi.mock('@/components/whatsapp/WebhookConfigModal', () => ({ WebhookConfigModal: () => null }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(), functions: { invoke: vi.fn() }, rpc: vi.fn() },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import WhatsAppNumbers from './WhatsAppNumbers';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <WhatsAppNumbers />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('WhatsAppNumbers — lixeira segue a mesma regra do lápis', () => {
  it('com whatsapp.configure: renomear e excluir aparecem', async () => {
    state.canConfigure = true;
    renderPage();
    await screen.findByText('Vaga Certa');
    expect(screen.getByTitle('Renomear instância')).toBeInTheDocument();
    expect(screen.getByTitle('Excluir instância')).toBeInTheDocument();
  });

  it('sem whatsapp.configure (atendente): nem renomear, nem excluir', async () => {
    state.canConfigure = false;
    renderPage();
    await screen.findByText('Vaga Certa');
    expect(screen.queryByTitle('Renomear instância')).toBeNull();
    expect(screen.queryByTitle('Excluir instância')).toBeNull();
    expect(screen.queryByTestId('delete-modal')).toBeNull();
  });

  it('a lixeira abre o modal (que é quem confere o histórico)', async () => {
    state.canConfigure = true;
    renderPage();
    await screen.findByText('Vaga Certa');
    fireEvent.click(screen.getByTitle('Excluir instância'));
    await waitFor(() => expect(screen.getByTestId('delete-modal')).toBeInTheDocument());
  });
});
