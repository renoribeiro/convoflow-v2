import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

/**
 * O cartão do Instagram em Instâncias e APIs mostra a validade da conexão e um
 * estado claro quando vai vencer, venceu ou precisa reconectar (fatia 4/5,
 * renovação). Só exibição. As linhas de WhatsApp não mudam.
 */

const { state } = vi.hoisted(() => ({ state: { rows: [] as Record<string, unknown>[] } }));

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({
    tenant: { id: 't1', name: 'Conta Teste' },
    profile: { id: 'p1', role: 'gerente', tenant_id: 't1' },
    tenantId: 't1',
    loading: false,
    error: null,
    refreshTenant: vi.fn(),
    updateTenantSettings: vi.fn(),
  }),
  useTenantId: () => 't1',
  useRole: () => 'gerente',
  useIsSuperAdmin: () => false,
  useCan: () => true,
}));
vi.mock('@/hooks/useSupabaseQuery', () => ({
  useSupabaseQuery: () => ({ data: state.rows, isLoading: false, error: null, refetch: vi.fn() }),
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
vi.mock('@/components/whatsapp/DeleteInstanceModal', () => ({ DeleteInstanceModal: () => null }));
vi.mock('@/components/whatsapp/RenameInstanceModal', () => ({ RenameInstanceModal: () => null }));
vi.mock('@/components/whatsapp/QRCodeModal', () => ({ QRCodeModal: () => null }));
vi.mock('@/components/whatsapp/WebhookConfigModal', () => ({ WebhookConfigModal: () => null }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(), functions: { invoke: vi.fn() }, rpc: vi.fn() },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import WhatsAppNumbers from './WhatsAppNumbers';

const NOW = new Date('2026-10-25T12:00:00Z');
const ISSUED = '2026-09-24T00:16:36.715273+00:00';

const whatsapp = {
  id: 'wa-1',
  name: 'Vaga Certa',
  instance_key: '100000000000099',
  status: 'open',
  is_active: true,
  provider: 'official',
  created_at: '2026-06-11T22:42:51.000Z',
  updated_at: '2026-06-11T22:42:51.000Z',
};

function instagram(id: string, name: string, expiresAt: string, renewal?: Record<string, unknown>) {
  return {
    id,
    name,
    instance_key: `instagram_${id}`,
    status: 'connected',
    is_active: true,
    provider: 'instagram',
    profile_name: '@convoflow',
    created_at: '2026-09-24T00:16:36.000Z',
    updated_at: '2026-09-24T00:16:36.000Z',
    connection_config: {
      igAccountId: '17841419262135883',
      tokenIssuedAt: ISSUED,
      tokenExpiresAt: expiresAt,
      ...(renewal ? { renewal: { ...renewal, forTokenIssuedAt: ISSUED } } : {}),
    },
  };
}

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

/** A linha inteira de uma instância, achada pelo nome. */
function rowOf(name: string): HTMLElement {
  const title = screen.getByText(name);
  const row = title.closest('div.border');
  if (!row) throw new Error(`linha de ${name} não encontrada`);
  return row as HTMLElement;
}

function metric(label: string): string {
  const el = screen.getByText(label);
  return el.parentElement?.querySelector('p.text-2xl')?.textContent ?? '';
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Instâncias e APIs — cartão do Instagram', () => {
  it('válida: data de Brasília, "renova sozinha", conectado, e o WhatsApp igual a antes', async () => {
    state.rows = [whatsapp, instagram('ig-1', 'Instagram Teste', '2026-11-23T00:16:36.715273+00:00')];
    renderPage();
    await screen.findByText('Instagram Teste');

    const ig = rowOf('Instagram Teste');
    expect(within(ig).getByTestId('instagram-validity')).toHaveTextContent(
      'Válida até 22/11/2026 às 21:16. Renova sozinha antes de vencer.',
    );
    expect(within(ig).getByText('Conectado')).toBeInTheDocument();
    expect(within(ig).queryByText('Desconectado')).toBeNull();

    const wa = rowOf('Vaga Certa');
    expect(within(wa).getByText('Conectado')).toBeInTheDocument();
    expect(within(wa).queryByTestId('instagram-validity')).toBeNull();

    expect(metric('Conectados')).toBe('2');
    expect(metric('Desconectados')).toBe('0');
  });

  it('vai vencer: quantos dias faltam', async () => {
    state.rows = [instagram('ig-2', 'IG Vencendo', '2026-10-28T12:00:00Z', { status: 'retrying' })];
    renderPage();
    await screen.findByText('IG Vencendo');
    const ig = rowOf('IG Vencendo');
    expect(within(ig).getByText('Vence em 3 dias')).toBeInTheDocument();
    expect(within(ig).getByTestId('instagram-validity')).toHaveTextContent('A renovação automática ainda não conseguiu renovar.');
    expect(metric('Conectados')).toBe('1');
  });

  it('venceu: "Vencida", respostas paradas, como reconectar; conta como desconectada', async () => {
    state.rows = [instagram('ig-3', 'IG Vencida', '2026-10-20T00:00:00Z')];
    renderPage();
    await screen.findByText('IG Vencida');
    const ig = rowOf('IG Vencida');
    expect(within(ig).getByText('Vencida')).toBeInTheDocument();
    expect(within(ig).getByTestId('instagram-validity')).toHaveTextContent('As respostas pelo Instagram estão paradas.');
    expect(within(ig).getByTestId('instagram-validity')).toHaveTextContent('contato@convoflow.com.br');
    expect(metric('Conectados')).toBe('0');
    expect(metric('Desconectados')).toBe('1');
  });

  it('precisa reconectar: diz por quê e o que fazer', async () => {
    state.rows = [
      instagram('ig-4', 'IG Reconectar', '2026-11-23T00:16:36.715273+00:00', {
        status: 'needs_reconnect',
        message: 'O Instagram não aceita mais o acesso atual desta conta.',
      }),
    ];
    renderPage();
    await screen.findByText('IG Reconectar');
    const ig = rowOf('IG Reconectar');
    expect(within(ig).getByText('Reconectar')).toBeInTheDocument();
    expect(within(ig).getByTestId('instagram-validity')).toHaveTextContent(
      'Válida até 22/11/2026 às 21:16, mas o Instagram não aceita mais renovar este acesso (O Instagram não aceita mais o acesso atual desta conta). Para reconectar, escreva para contato@convoflow.com.br.',
    );
    expect(metric('Desconectados')).toBe('1');
  });
});
