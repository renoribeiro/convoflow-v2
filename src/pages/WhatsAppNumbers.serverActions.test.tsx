import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

/**
 * Estado, QR, desconectar e detalhes de número Evolution e WAHA: pelo SERVIDOR
 * (instanceAction), nunca com chave lida no navegador. A tela pede só colunas
 * sem segredo. Valores inventados.
 */

const { state, acao, select, from } = vi.hoisted(() => ({
  state: { canConfigure: true },
  acao: vi.fn(),
  select: { value: '' },
  from: vi.fn(),
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
  useSupabaseQuery: (opts: { select?: string }) => {
    select.value = opts.select ?? '';
    return {
      data: [
        { id: 'aaaaaaaa-0000-4000-8000-0000000000a1', name: 'Comercial', instance_key: 'comercial-exemplo', status: 'open', is_active: true, provider: 'evolution', created_at: '2026-10-26T12:00:00Z', updated_at: '2026-10-26T12:00:00Z' },
        { id: 'aaaaaaaa-0000-4000-8000-0000000000a2', name: 'Suporte WAHA', instance_key: 'suporte-exemplo', status: 'disconnected', is_active: true, provider: 'waha', created_at: '2026-10-26T12:00:00Z', updated_at: '2026-10-26T12:00:00Z', cfg_sessionName: 'suporte-exemplo' },
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    };
  },
}));

vi.mock('@/hooks/useSupabaseMutation', () => ({
  useSupabaseMutation: () => ({ mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useMetaApi', () => ({
  useMetaApi: () => ({ verifyConnection: vi.fn(), registerNumber: vi.fn() }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }));
vi.mock('@/services/whatsapp/instanceActions', () => ({
  instanceAction: acao,
  hasServerActions: (p: string | null | undefined) => !p || p === 'evolution' || p === 'waha',
  isConnectedState: (s: string | null | undefined) => s === 'open' || s === 'connected',
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
vi.mock('@/components/whatsapp/QRCodeModal', () => ({
  QRCodeModal: ({ open, instanceId }: { open: boolean; instanceId: string }) => (open ? <div data-testid="qr-modal">{instanceId}</div> : null),
}));
vi.mock('@/components/whatsapp/ViewInstanceModal', () => ({
  ViewInstanceModal: ({ open }: { open: boolean }) => (open ? <div data-testid="detalhes-modal" /> : null),
}));
vi.mock('@/components/whatsapp/WebhookConfigModal', () => ({ WebhookConfigModal: () => null }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from, functions: { invoke: vi.fn() }, rpc: vi.fn() },
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
  acao.mockResolvedValue({ ok: true, status: 'open', changed: false });
});

describe('WhatsAppNumbers: ações de Evolution e WAHA pelo servidor', () => {
  it('a lista pede só colunas sem segredo', async () => {
    state.canConfigure = true;
    renderPage();
    await screen.findByText('Comercial');
    expect(select.value).not.toMatch(/\*|evolution_api_key|evolution_api_url|apiKey|baseUrl/);
  });

  it('ao abrir, confere o estado de cada número pelo servidor, uma vez', async () => {
    state.canConfigure = true;
    renderPage();
    await waitFor(() => expect(acao).toHaveBeenCalledWith('aaaaaaaa-0000-4000-8000-0000000000a1', 'status'));
    expect(acao).toHaveBeenCalledWith('aaaaaaaa-0000-4000-8000-0000000000a2', 'status');
    expect(acao).toHaveBeenCalledTimes(2);
  });

  it('WAHA desconectado ganha QR Code; Evolution conectado ganha Desconectar', async () => {
    state.canConfigure = true;
    renderPage();
    await screen.findByText('Suporte WAHA');
    expect(screen.getAllByTitle('Conectar pelo QR Code')).toHaveLength(1);
    expect(screen.getAllByTitle('Desconectar')).toHaveLength(1);
    expect(screen.getAllByTitle('Atualizar status')).toHaveLength(2);
    expect(screen.getAllByTitle('Detalhes e chave')).toHaveLength(2);
    fireEvent.click(screen.getByTitle('Conectar pelo QR Code'));
    expect(await screen.findByTestId('qr-modal')).toHaveTextContent('aaaaaaaa-0000-4000-8000-0000000000a2');
  });

  it('Desconectar confirma e pede ao servidor; o navegador não grava nada', async () => {
    state.canConfigure = true;
    renderPage();
    await screen.findByText('Comercial');
    fireEvent.click(screen.getByTitle('Desconectar'));
    fireEvent.click(await screen.findByRole('button', { name: 'Desconectar número' }));
    await waitFor(() => expect(acao).toHaveBeenCalledWith('aaaaaaaa-0000-4000-8000-0000000000a1', 'disconnect'));
    expect(from).not.toHaveBeenCalled();
  });

  it('Atualizar status pede ao servidor', async () => {
    state.canConfigure = true;
    renderPage();
    await screen.findByText('Comercial');
    acao.mockClear();
    fireEvent.click(screen.getAllByTitle('Atualizar status')[0]!);
    await waitFor(() => expect(acao).toHaveBeenCalledWith(expect.any(String), 'status'));
  });

  it('Detalhes abre a janela da chave', async () => {
    state.canConfigure = true;
    renderPage();
    await screen.findByText('Comercial');
    fireEvent.click(screen.getAllByTitle('Detalhes e chave')[0]!);
    expect(await screen.findByTestId('detalhes-modal')).toBeInTheDocument();
  });

  it('sem whatsapp.configure: nenhum desses botões', async () => {
    state.canConfigure = false;
    renderPage();
    await screen.findByText('Comercial');
    for (const t of ['Conectar pelo QR Code', 'Desconectar', 'Atualizar status', 'Detalhes e chave']) {
      expect(screen.queryByTitle(t)).toBeNull();
    }
  });
});
