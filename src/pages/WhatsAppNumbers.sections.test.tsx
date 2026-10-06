import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

/**
 * Instâncias e APIs em duas seções (fatia 4a): "Instâncias WhatsApp" e
 * "Contas do Instagram". Na Loja sem Instagram (a VagaCerta) a tela é a de
 * sempre. O Instagram nunca aparece como "instância" nem com "Chave", e não
 * tem botão de conectar/reconectar/desconectar nesta entrega.
 */

const { state } = vi.hoisted(() => ({ state: { rows: [] as Record<string, unknown>[] } }));

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({
    tenant: { id: 't1', name: 'Loja Teste' },
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

const vagaCerta = {
  id: 'wa-1',
  name: 'Vaga Certa',
  instance_key: '100000000000099',
  phone_number: '5585999990000',
  status: 'open',
  is_active: true,
  provider: 'official',
  created_at: '2026-06-11T22:42:51.000Z',
  updated_at: '2026-06-11T22:42:51.000Z',
};
const evolutionClosed = {
  id: 'wa-2',
  name: 'Recepção',
  instance_key: 'recepcao',
  status: 'close',
  is_active: true,
  provider: 'evolution',
  created_at: '2026-06-11T22:42:51.000Z',
  updated_at: '2026-06-11T22:42:51.000Z',
};
const instagramTeste = {
  id: 'cccccccc-0000-4000-8000-000000000003',
  name: 'Instagram Teste',
  instance_key: 'instagram_17841419262135883',
  status: 'connected',
  is_active: true,
  provider: 'instagram',
  phone_number: null,
  profile_name: '@convoflow',
  created_at: '2026-09-24T00:16:36.000Z',
  updated_at: '2026-09-24T00:16:36.000Z',
  connection_config: {
    igAccountId: '17841419262135883',
    igUsername: 'convoflow',
    tokenIssuedAt: '2026-09-25T10:43:29Z',
    tokenExpiresAt: '2026-11-24T10:43:29.415655+00:00',
  },
};

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

function metric(label: string): string {
  const el = screen.getByText(label);
  return el.parentElement?.querySelector('p.text-2xl')?.textContent ?? '';
}

/** O cartão (Card) de uma seção, pelo título. */
function section(title: string): HTMLElement {
  const heading = screen.getByText(title);
  const card = heading.closest('div.rounded-lg.border');
  if (!card) throw new Error(`seção ${title} não encontrada`);
  return card as HTMLElement;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Instâncias e APIs — Loja sem Instagram (VagaCerta)', () => {
  it('uma seção só, os contadores e o rótulo de sempre', () => {
    state.rows = [vagaCerta, evolutionClosed];
    renderPage();
    expect(screen.getByText('Instâncias WhatsApp')).toBeInTheDocument();
    expect(screen.queryByText('Contas do Instagram')).toBeNull();
    expect(metric('Total de Instâncias')).toBe('2');
    expect(metric('Conectados')).toBe('1');
    expect(metric('Desconectados')).toBe('1');
    expect(screen.queryByTestId('total-breakdown')).toBeNull();
    // a linha do WhatsApp continua com a chave, o número e os botões de sempre
    expect(screen.getByText('Chave: 100000000000099')).toBeInTheDocument();
    expect(screen.getByText('Número: 5585999990000')).toBeInTheDocument();
    expect(screen.getAllByTitle('Renomear instância')).toHaveLength(2);
    expect(screen.getAllByTitle('Excluir instância')).toHaveLength(2);
    expect(screen.getByTitle('Conectar via QR Code')).toBeInTheDocument();
  });
});

describe('Instâncias e APIs — Loja com Instagram', () => {
  beforeEach(() => {
    state.rows = [vagaCerta, instagramTeste];
  });

  it('duas seções: o Instagram só na dele, o WhatsApp só na dele', () => {
    renderPage();
    const wa = section('Instâncias WhatsApp');
    const ig = section('Contas do Instagram');
    expect(within(wa).getByText('Vaga Certa')).toBeInTheDocument();
    expect(within(wa).queryByText('Instagram Teste')).toBeNull();
    expect(within(ig).getByText('Instagram Teste')).toBeInTheDocument();
    expect(within(ig).queryByText('Vaga Certa')).toBeNull();
  });

  it('cartão do Instagram: o @, a validade e o estado — sem "Chave" e sem a palavra instância', () => {
    renderPage();
    const ig = section('Contas do Instagram');
    expect(within(ig).getByTestId('instagram-handle')).toHaveTextContent('Conta: @convoflow');
    expect(within(ig).getByTestId('instagram-validity')).toHaveTextContent(
      'Válida até 24/11/2026 às 07:43. Renova sozinha antes de vencer.',
    );
    expect(within(ig).getByText('Conectado')).toBeInTheDocument();
    expect(ig.textContent).not.toMatch(/chave/i);
    expect(ig.textContent).not.toMatch(/inst[aâ]ncia/i);
    expect(ig.textContent).not.toContain('instagram_17841419262135883');
    // títulos dos botões também
    const titles = Array.from(ig.querySelectorAll('[title]')).map((el) => el.getAttribute('title') ?? '');
    expect(titles).toEqual(['Renomear conta', 'Excluir conta do Instagram']);
  });

  it('sem conectar, reconectar nem desconectar nesta entrega', () => {
    renderPage();
    const ig = section('Contas do Instagram');
    expect(within(ig).queryByTitle(/Conectar|Desconectar|Atualizar status|Webhook|Testar|Registrar/)).toBeNull();
  });

  it('contadores somam as duas seções, com a divisão por canal', () => {
    renderPage();
    expect(metric('Total de conexões')).toBe('2');
    expect(screen.getByTestId('total-breakdown')).toHaveTextContent('1 instância de WhatsApp · 1 conta do Instagram');
    expect(metric('Conectados')).toBe('2');
    expect(metric('Desconectados')).toBe('0');
  });

  it('Instagram vencido conta como desconectado', () => {
    state.rows = [
      vagaCerta,
      { ...instagramTeste, connection_config: { ...instagramTeste.connection_config, tokenExpiresAt: '2026-10-20T00:00:00Z' } },
    ];
    renderPage();
    expect(metric('Conectados')).toBe('1');
    expect(metric('Desconectados')).toBe('1');
  });

  it('@ ausente: diz que não foi informado, não fica em branco', () => {
    state.rows = [{ ...instagramTeste, profile_name: null, connection_config: { tokenExpiresAt: '2026-11-24T10:43:29Z' } }];
    renderPage();
    expect(screen.getByTestId('instagram-handle')).toHaveTextContent('Conta: @ não informado');
  });
});

describe('Instâncias e APIs — só Instagram', () => {
  it('a seção do WhatsApp diz que não há instância, e o Instagram aparece na dele', () => {
    state.rows = [instagramTeste];
    renderPage();
    expect(screen.getByTestId('no-whatsapp-instances')).toHaveTextContent('Nenhuma instância de WhatsApp cadastrada.');
    expect(within(section('Contas do Instagram')).getByText('Instagram Teste')).toBeInTheDocument();
    expect(metric('Total de conexões')).toBe('1');
  });
});
