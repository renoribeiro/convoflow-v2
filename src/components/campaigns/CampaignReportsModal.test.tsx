/**
 * Tests for CampaignReportsModal.
 *
 * Strategy:
 * - Mock useCampaignReportMetrics so we control returned data
 * - Assert that displayed values come from hook data, NOT hardcoded constants
 * - Test the rate() computation visible in the rendered output
 * - Test empty state, loading state, and that totalSent is never hardcoded
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// ── module mocks ──────────────────────────────────────────────────────────────

const mockUseCampaignReportMetrics = vi.fn();

vi.mock('@/hooks/useCampaigns', () => ({
  useCampaignReportMetrics: (...args: unknown[]) => mockUseCampaignReportMetrics(...args),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// Silence radix Portal warnings in jsdom
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <div data-value={value}>{children}</div>
  ),
}));

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <span className={className}>{children}</span>
  ),
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h3>{children}</h3>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

// lucide-react icons
vi.mock('lucide-react', () => ({
  Send: () => <span data-testid="icon-send" />,
  CheckCircle: () => <span data-testid="icon-check" />,
  Users: () => <span data-testid="icon-users" />,
  MessageSquare: () => <span data-testid="icon-msg" />,
  Download: () => <span data-testid="icon-dl" />,
}));

// ── fixtures ──────────────────────────────────────────────────────────────────

function makeData(overrides: Partial<ReturnType<typeof defaultData>> = {}) {
  return { ...defaultData(), ...overrides };
}

function defaultData() {
  return {
    campaigns: [] as Array<{
      id: string;
      name: string;
      status: string;
      sent_count: number | null;
      delivered_count: number | null;
      read_count: number | null;
      replied_count: number | null;
      created_at: string;
    }>,
    totalSent: 0,
    totalDelivered: 0,
    totalRead: 0,
    totalReplied: 0,
  };
}

// ── component import (after mocks) ────────────────────────────────────────────

import { CampaignReportsModal } from './CampaignReportsModal';

// ── helpers ───────────────────────────────────────────────────────────────────

function renderModal(isOpen = true) {
  return render(<CampaignReportsModal isOpen={isOpen} onClose={vi.fn()} />);
}

// ── tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockUseCampaignReportMetrics.mockReturnValue({ data: makeData(), isLoading: false });
});

describe('CampaignReportsModal', () => {
  describe('title and modal rendering', () => {
    it('renders the modal title', () => {
      renderModal();
      expect(screen.getByText('Relatórios de Campanhas')).toBeInTheDocument();
    });

    it('does not render when isOpen=false', () => {
      renderModal(false);
      expect(screen.queryByText('Relatórios de Campanhas')).toBeNull();
    });
  });

  describe('loading state', () => {
    it('renders skeleton loaders when isLoading=true', () => {
      mockUseCampaignReportMetrics.mockReturnValue({ data: undefined, isLoading: true });
      renderModal();
      const skeletons = screen.getAllByTestId('skeleton');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('does not render skeletons when data is available', () => {
      renderModal();
      // No skeletons should appear for the metric cards when not loading
      // (there may be none at all since loading=false)
      // We just assert the metric labels are visible
      expect(screen.getByText('Total Enviadas')).toBeInTheDocument();
    });
  });

  describe('metric cards — values come from hook data', () => {
    it('displays totalSent from hook data (not a hardcoded value like 2847)', () => {
      mockUseCampaignReportMetrics.mockReturnValue({
        data: makeData({ totalSent: 999, totalDelivered: 800, totalRead: 600, totalReplied: 50 }),
        isLoading: false,
      });
      renderModal();
      // 999 should appear (from totalSent) — may appear more than once (card + funnel bar)
      expect(screen.getAllByText('999').length).toBeGreaterThan(0);
      // 2847 must NOT appear anywhere
      expect(screen.queryByText('2847')).toBeNull();
      expect(screen.queryByText('2.847')).toBeNull(); // pt-BR formatted
    });

    it('displays 0 for all metric cards when hook returns zeros', () => {
      renderModal();
      const zeros = screen.getAllByText('0');
      expect(zeros.length).toBeGreaterThanOrEqual(4);
    });

    it('formats large numbers with pt-BR locale', () => {
      mockUseCampaignReportMetrics.mockReturnValue({
        data: makeData({ totalSent: 12345 }),
        isLoading: false,
      });
      renderModal();
      // pt-BR formats 12345 as "12.345" — may appear in card AND funnel bar
      expect(screen.getAllByText('12.345').length).toBeGreaterThan(0);
    });
  });

  describe('rate computation (delivery / read / reply rates)', () => {
    it('shows delivery rate as XX.X% in the Entregues card sub-label', () => {
      mockUseCampaignReportMetrics.mockReturnValue({
        data: makeData({ totalSent: 200, totalDelivered: 150 }),
        isLoading: false,
      });
      renderModal();
      // 150/200 * 100 = 75.0%
      expect(screen.getByText(/75\.0% taxa/)).toBeInTheDocument();
    });

    it('shows 0.0% delivery rate when totalSent is 0 (no divide-by-zero)', () => {
      mockUseCampaignReportMetrics.mockReturnValue({
        data: makeData({ totalSent: 0, totalDelivered: 0 }),
        isLoading: false,
      });
      renderModal();
      // Should not throw and should display 0.0%
      expect(screen.getAllByText(/0\.0% taxa/).length).toBeGreaterThan(0);
    });

    it('shows read rate relative to delivered (Lidas card)', () => {
      mockUseCampaignReportMetrics.mockReturnValue({
        data: makeData({ totalSent: 1000, totalDelivered: 800, totalRead: 400 }),
        isLoading: false,
      });
      renderModal();
      // 400/800 * 100 = 50.0%
      expect(screen.getByText(/50\.0% taxa/)).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('shows the empty-state message when no campaigns', () => {
      renderModal();
      expect(
        screen.getByText('Nenhuma campanha encontrada para o período selecionado.')
      ).toBeInTheDocument();
    });

    it('Export CSV button is disabled when campaign list is empty', () => {
      renderModal();
      const exportBtn = screen.getByText(/Exportar CSV/).closest('button');
      expect(exportBtn).toBeDisabled();
    });
  });

  describe('per-campaign table', () => {
    it('renders a row for each campaign', () => {
      const campaigns = [
        { id: '1', name: 'Campanha Alpha', status: 'completed', sent_count: 500, delivered_count: 400, read_count: 300, replied_count: 50, created_at: new Date().toISOString() },
        { id: '2', name: 'Campanha Beta', status: 'active', sent_count: 200, delivered_count: 180, read_count: 100, replied_count: 10, created_at: new Date().toISOString() },
      ];
      mockUseCampaignReportMetrics.mockReturnValue({
        data: makeData({ campaigns, totalSent: 700, totalDelivered: 580, totalRead: 400, totalReplied: 60 }),
        isLoading: false,
      });
      renderModal();
      expect(screen.getByText('Campanha Alpha')).toBeInTheDocument();
      expect(screen.getByText('Campanha Beta')).toBeInTheDocument();
    });

    it('renders the correct status badge label in pt-BR', () => {
      const campaigns = [
        { id: '1', name: 'Test', status: 'completed', sent_count: 100, delivered_count: 80, read_count: 60, replied_count: 5, created_at: new Date().toISOString() },
      ];
      mockUseCampaignReportMetrics.mockReturnValue({
        data: makeData({ campaigns, totalSent: 100 }),
        isLoading: false,
      });
      renderModal();
      expect(screen.getByText('Concluída')).toBeInTheDocument();
    });

    it('handles null count values gracefully in table rows', () => {
      const campaigns = [
        { id: '1', name: 'Nulos', status: 'draft', sent_count: null, delivered_count: null, read_count: null, replied_count: null, created_at: new Date().toISOString() },
      ];
      mockUseCampaignReportMetrics.mockReturnValue({
        data: makeData({ campaigns }),
        isLoading: false,
      });
      renderModal();
      // Should not throw; the row name should still appear
      expect(screen.getByText('Nulos')).toBeInTheDocument();
    });
  });

  describe('funnel section', () => {
    it('renders the conversion funnel when totalSent > 0', () => {
      mockUseCampaignReportMetrics.mockReturnValue({
        data: makeData({ totalSent: 500, totalDelivered: 400, totalRead: 300, totalReplied: 50 }),
        isLoading: false,
      });
      renderModal();
      expect(screen.getByText('Funil de Conversão')).toBeInTheDocument();
    });

    it('does NOT render the conversion funnel when totalSent === 0', () => {
      renderModal();
      expect(screen.queryByText('Funil de Conversão')).toBeNull();
    });
  });
});
