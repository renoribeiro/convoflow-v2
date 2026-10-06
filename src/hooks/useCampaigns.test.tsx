/**
 * Tests for useCampaigns hooks.
 *
 * The Supabase fluent chain for useCampaignsByStatus is:
 *   .from(table).select(cols).eq('tenant_id', id).order('created_at', …)
 *   then either:
 *     .in('status', ['active','paused'])   ← status === 'active'
 *     .eq('status', status)                ← otherwise
 *   The final call is awaited → { data, error }
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── hoisted mocks ─────────────────────────────────────────────────────────────

const { mockFrom, mockRpc, mockTenantId } = vi.hoisted(() => {
  const mockFrom = vi.fn();
  const mockRpc = vi.fn(() => ({ error: null }));
  const mockTenantId = vi.fn(() => 'tenant-abc');
  return { mockFrom, mockRpc, mockTenantId };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: mockFrom, rpc: mockRpc },
}));

vi.mock('@/contexts/TenantContext', () => ({
  useTenantId: mockTenantId,
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a fluent Supabase mock chain that returns `rows` (or throws `err`)
 * when the terminal .in() or .eq() is awaited.
 *
 * Chain shape:
 *   from → select → eq(tenant_id) → order → [eq(status)|in(status)]
 *                                             ↑ this is awaited
 */
function makeByStatusChain(
  rows: unknown[],
  err: Error | null = null,
  spies: { inSpy?: ReturnType<typeof vi.fn>; eqStatusSpy?: ReturnType<typeof vi.fn> } = {}
) {
  // Terminal result (what .in() / .eq(status) resolves to)
  const terminal = { data: err ? null : rows, error: err };

  const inSpy = spies.inSpy ?? vi.fn(() => terminal);
  const eqStatusSpy = spies.eqStatusSpy ?? vi.fn(() => terminal);

  // .order() → chainable, has .in() and .eq()
  const orderResult = { in: inSpy, eq: eqStatusSpy };
  const orderSpy = vi.fn(() => orderResult);

  // .eq('tenant_id') → chainable, has .order()
  const eqTenantResult = { order: orderSpy };
  const eqTenantSpy = vi.fn(() => eqTenantResult);

  // .select() → chainable, has .eq()
  const selectResult = { eq: eqTenantSpy };
  const selectSpy = vi.fn(() => selectResult);

  // .from() → has .select()
  const fromResult = { select: selectSpy };

  return { fromResult, selectSpy, eqTenantSpy, orderSpy, inSpy, eqStatusSpy };
}

/**
 * Chain for useCampaignGlobalStats:
 *   from(mass_message_campaigns).select(...).eq('tenant_id', id) → { data, error }
 *   from(campaign_metrics).select(...).eq('tenant_id', id) → { data, error }
 */
function makeGlobalStatsChain(
  campaignRows: unknown[],
  metricsRows: unknown[],
  campaignErr: Error | null = null,
  metricsErr: Error | null = null
) {
  let callCount = 0;
  mockFrom.mockImplementation(() => {
    callCount++;
    if (callCount === 1) {
      // mass_message_campaigns
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ data: campaignErr ? null : campaignRows, error: campaignErr })),
        })),
      };
    }
    // campaign_metrics
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ data: metricsErr ? null : metricsRows, error: metricsErr })),
      })),
    };
  });
}

/**
 * Chain for useCampaignReportMetrics:
 *   from(mass_message_campaigns).select(...).eq('tenant_id', id)
 *     .gte('created_at', cutoff)[.eq('status', s)].order(...)
 *     → { data, error }
 */
function makeReportChain(rows: unknown[], err: Error | null = null) {
  const orderResult = { data: err ? null : rows, error: err };
  const orderSpy = vi.fn(() => orderResult);

  // After gte → optionally .eq(status) then .order(), or directly .order()
  const gteEqResult = { order: orderSpy };
  const gteEqSpy = vi.fn(() => gteEqResult);
  const gteResult = { order: orderSpy, eq: gteEqSpy };
  const gteSpy = vi.fn(() => gteResult);

  const eqResult = { gte: gteSpy };
  const eqSpy = vi.fn(() => eqResult);
  const selectResult = { eq: eqSpy };
  const selectSpy = vi.fn(() => selectResult);
  const fromResult = { select: selectSpy };

  return { fromResult, selectSpy, eqSpy, gteSpy, gteEqSpy, orderSpy };
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'TestQueryProvider';
  return Wrapper;
}

// ── imports (after mocks) ─────────────────────────────────────────────────────

import {
  useCampaignsByStatus,
  useCampaignGlobalStats,
  useCampaignReportMetrics,
} from './useCampaigns';

// ── beforeEach ────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockTenantId.mockReturnValue('tenant-abc');
});

// ── useCampaignsByStatus ──────────────────────────────────────────────────────

describe('useCampaignsByStatus', () => {
  it('returns an empty array when supabase returns no rows', async () => {
    const { fromResult } = makeByStatusChain([]);
    mockFrom.mockReturnValue(fromResult);

    const { result } = renderHook(() => useCampaignsByStatus('draft'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual([]);
  });

  it('queries the mass_message_campaigns table', async () => {
    const { fromResult } = makeByStatusChain([]);
    mockFrom.mockReturnValue(fromResult);

    const { result } = renderHook(() => useCampaignsByStatus('scheduled'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockFrom).toHaveBeenCalledWith('mass_message_campaigns');
  });

  it('uses .in(["active","paused"]) for status="active"', async () => {
    const inSpy = vi.fn(() => ({ data: [], error: null }));
    const eqStatusSpy = vi.fn(() => ({ data: [], error: null }));
    const { fromResult } = makeByStatusChain([], null, { inSpy, eqStatusSpy });
    mockFrom.mockReturnValue(fromResult);

    const { result } = renderHook(() => useCampaignsByStatus('active'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(inSpy).toHaveBeenCalledWith('status', ['active', 'paused']);
    expect(eqStatusSpy).not.toHaveBeenCalled();
  });

  it('uses .eq("status","draft") for status="draft" (no .in())', async () => {
    const inSpy = vi.fn(() => ({ data: [], error: null }));
    const eqStatusSpy = vi.fn(() => ({ data: [], error: null }));
    const { fromResult } = makeByStatusChain([], null, { inSpy, eqStatusSpy });
    mockFrom.mockReturnValue(fromResult);

    const { result } = renderHook(() => useCampaignsByStatus('draft'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(inSpy).not.toHaveBeenCalled();
    expect(eqStatusSpy).toHaveBeenCalledWith('status', 'draft');
  });

  it('scopes query to the current tenantId via .eq("tenant_id")', async () => {
    const { fromResult, eqTenantSpy } = makeByStatusChain([]);
    mockFrom.mockReturnValue(fromResult);

    const { result } = renderHook(() => useCampaignsByStatus('draft'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(eqTenantSpy).toHaveBeenCalledWith('tenant_id', 'tenant-abc');
  });

  it('is disabled when tenantId is null', async () => {
    mockTenantId.mockReturnValueOnce(null);

    const { result } = renderHook(() => useCampaignsByStatus('draft'), {
      wrapper: makeWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('surfaces a supabase error via result.error', async () => {
    const dbError = new Error('network failure');
    const { fromResult } = makeByStatusChain([], dbError);
    mockFrom.mockReturnValue(fromResult);

    const { result } = renderHook(() => useCampaignsByStatus('draft'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeTruthy();
  });
});

// ── useCampaignGlobalStats ────────────────────────────────────────────────────

describe('useCampaignGlobalStats', () => {
  it('returns zero stats when there are no campaigns or metrics', async () => {
    makeGlobalStatsChain([], []);

    const { result } = renderHook(() => useCampaignGlobalStats(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toMatchObject({
      totalCampaigns: 0,
      activeCampaigns: 0,
      messagesSent: 0,
      successRate: 0,
    });
  });

  it('counts active and paused in activeCampaigns, others not', async () => {
    const campaignRows = [
      { status: 'active', sent_count: 100 },
      { status: 'paused', sent_count: 50 },
      { status: 'draft', sent_count: 0 },
      { status: 'completed', sent_count: 200 },
    ];
    makeGlobalStatsChain(campaignRows, []);

    const { result } = renderHook(() => useCampaignGlobalStats(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data?.totalCampaigns).toBe(4);
    expect(result.current.data?.activeCampaigns).toBe(2); // active + paused
    expect(result.current.data?.messagesSent).toBe(350);
  });

  it('computes successRate as average of delivery_rate from metrics', async () => {
    const campaignRows = [{ status: 'completed', sent_count: 100 }];
    const metricsRows = [{ delivery_rate: 80 }, { delivery_rate: 60 }];
    makeGlobalStatsChain(campaignRows, metricsRows);

    const { result } = renderHook(() => useCampaignGlobalStats(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data?.successRate).toBe(70);
  });

  it('falls back to successRate=0 when metrics query errors', async () => {
    const campaignRows = [{ status: 'active', sent_count: 50 }];
    makeGlobalStatsChain(campaignRows, [], null, new Error('table missing'));

    const { result } = renderHook(() => useCampaignGlobalStats(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data?.successRate).toBe(0);
  });

  it('is disabled when tenantId is null', async () => {
    mockTenantId.mockReturnValueOnce(null);

    const { result } = renderHook(() => useCampaignGlobalStats(), {
      wrapper: makeWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

// ── useCampaignReportMetrics ──────────────────────────────────────────────────

describe('useCampaignReportMetrics', () => {
  it('aggregates sent/delivered/read/replied across returned campaigns', async () => {
    const rows = [
      { id: '1', name: 'C1', status: 'completed', sent_count: 100, delivered_count: 80, read_count: 60, replied_count: 10, created_at: new Date().toISOString() },
      { id: '2', name: 'C2', status: 'active', sent_count: 200, delivered_count: 150, read_count: 100, replied_count: 20, created_at: new Date().toISOString() },
    ];
    const { fromResult } = makeReportChain(rows);
    mockFrom.mockReturnValue(fromResult);

    const { result } = renderHook(() => useCampaignReportMetrics('30days', 'all'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data?.totalSent).toBe(300);
    expect(result.current.data?.totalDelivered).toBe(230);
    expect(result.current.data?.totalRead).toBe(160);
    expect(result.current.data?.totalReplied).toBe(30);
    expect(result.current.data?.campaigns).toHaveLength(2);
  });

  it('returns zero totals when there are no campaigns', async () => {
    const { fromResult } = makeReportChain([]);
    mockFrom.mockReturnValue(fromResult);

    const { result } = renderHook(() => useCampaignReportMetrics('30days', 'all'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data?.totalSent).toBe(0);
    expect(result.current.data?.totalDelivered).toBe(0);
    expect(result.current.data?.campaigns).toHaveLength(0);
  });

  it('treats null count columns as 0', async () => {
    const rows = [
      { id: '1', name: 'N', status: 'draft', sent_count: null, delivered_count: null, read_count: null, replied_count: null, created_at: new Date().toISOString() },
    ];
    const { fromResult } = makeReportChain(rows);
    mockFrom.mockReturnValue(fromResult);

    const { result } = renderHook(() => useCampaignReportMetrics('30days', 'all'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data?.totalSent).toBe(0);
    expect(result.current.data?.totalDelivered).toBe(0);
  });

  it('surfaces a supabase error via result.error', async () => {
    const dbError = new Error('db down');
    const { fromResult } = makeReportChain([], dbError);
    mockFrom.mockReturnValue(fromResult);

    const { result } = renderHook(() => useCampaignReportMetrics('30days', 'all'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('is disabled when tenantId is null', async () => {
    mockTenantId.mockReturnValueOnce(null);

    const { result } = renderHook(() => useCampaignReportMetrics('30days', 'all'), {
      wrapper: makeWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

// ── cross-tenant isolation ────────────────────────────────────────────────────

describe('cross-tenant isolation', () => {
  it('separate QueryClients for separate tenants — no shared cache state', async () => {
    const qcA = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const WrapperA = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qcA}>{children}</QueryClientProvider>
    );
    WrapperA.displayName = 'WrapperA';

    const qcB = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const WrapperB = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qcB}>{children}</QueryClientProvider>
    );
    WrapperB.displayName = 'WrapperB';

    // Both chains return empty arrays
    const chainA = makeByStatusChain([]);
    const chainB = makeByStatusChain([]);
    mockFrom.mockReturnValueOnce(chainA.fromResult).mockReturnValueOnce(chainB.fromResult);

    mockTenantId.mockReturnValue('tenant-A');
    renderHook(() => useCampaignsByStatus('draft'), { wrapper: WrapperA });

    mockTenantId.mockReturnValue('tenant-B');
    renderHook(() => useCampaignsByStatus('draft'), { wrapper: WrapperB });

    // Client A must not have tenant-B's key in its cache
    const crossLeakAtoB = qcA.getQueriesData({ queryKey: ['campaigns', 'tenant-B'] });
    const crossLeakBtoA = qcB.getQueriesData({ queryKey: ['campaigns', 'tenant-A'] });

    expect(crossLeakAtoB).toHaveLength(0);
    expect(crossLeakBtoA).toHaveLength(0);
  });
});
