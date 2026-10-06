import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// Força os gráficos recharts a renderizarem com dimensões reais no jsdom
// (ResponsiveContainer normalmente fica 0x0 sem ResizeObserver de verdade,
// então os internals do recharts nunca executam e crashes passam batido).
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: any) =>
      React.cloneElement(children, { width: 400, height: 300 }),
  };
});

// --- Mock TenantContext: tenant presente ---
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
}));

// NOTA: o evolutionStore real é usado de propósito (sem mock) — assim este teste
// pega regressões na CRIAÇÃO da store zustand (ex.: o bug `create()()` que fazia
// useRealTimeUpdates lançar "api.getState is not a function").

// --- Mock Supabase client: builder encadeável que resolve vazio ---
vi.mock('@/integrations/supabase/client', () => {
  // Linha "rica" que cobre os campos lidos por TODAS as queries do dashboard,
  // incluindo embeds PostgREST (contacts, funnel_stages).
  const richRow = () => ({
    id: 'id1',
    created_at: '2026-06-25T10:00:00.000Z',
    stage_entered_at: '2026-06-01T10:00:00.000Z',
    current_stage_id: 's1',
    lead_source_id: 'ls1',
    direction: 'outbound',
    conversation_id: 'c1',
    last_message_at: '2026-06-20T10:00:00.000Z',
    unread_count: 2,
    is_archived: false,
    due_date: '2026-06-01T10:00:00.000Z',
    status: 'pending',
    task: 'Ligar para o cliente',
    name: 'Fulano de Tal',
    phone: '5511999999999',
    order: 1,
    is_final: false,
    color: '#DAE27C',
    contacts: { id: 'ct1', name: 'Fulano de Tal', phone: '5511999999999' },
    funnel_stages: { id: 's1', name: 'Lead', order: 1, color: '#DAE27C' },
  });
  const makeBuilder = () => {
    const result = { data: [richRow(), richRow()], count: 7, error: null };
    const builder: any = {};
    const chain = ['select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'in', 'is', 'order', 'limit', 'update'];
    for (const m of chain) builder[m] = vi.fn(() => builder);
    builder.single = vi.fn(() => Promise.resolve({ data: richRow(), error: null }));
    builder.maybeSingle = vi.fn(() => Promise.resolve({ data: richRow(), error: null }));
    builder.then = (resolve: any) => Promise.resolve(result).then(resolve);
    return builder;
  };
  return {
    supabase: {
      from: vi.fn(() => makeBuilder()),
      channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })) })),
    },
  };
});

import Index from '@/pages/Index';

describe('Dashboard <Index> smoke render', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renderiza sem suspender nem lançar erro', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let renderError: unknown = null;
    try {
      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <Index />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    } catch (e) {
      renderError = e;
    }
    expect(renderError).toBeNull();
    // Texto que só existe no MEU dashboard novo:
    await waitFor(() => {
      expect(screen.getByText('Precisa de Atenção')).toBeTruthy();
    });
  });
});
