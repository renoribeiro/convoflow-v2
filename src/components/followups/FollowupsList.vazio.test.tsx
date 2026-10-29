import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/** Vazio de Follow ups (lote 6c, B13): a primeira ação é "Novo Follow up". */

vi.mock('@/hooks/useFollowups', () => ({
  useFollowups: () => ({
    followups: [],
    loading: false,
    completeFollowup: vi.fn(),
    getFollowupsByStatus: () => [],
    getOverdueFollowups: () => [],
  }),
}));
vi.mock('@/components/followups/FollowupScheduler', () => ({ FollowupScheduler: () => null }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { FollowupsList } from './FollowupsList';

describe('FollowupsList vazio', () => {
  it('diz o filtro da aba e oferece "Novo Follow up"', () => {
    const onNovo = vi.fn();
    render(<FollowupsList status="overdue" onNovo={onNovo} />);
    expect(screen.getByText('Nenhum follow up em atraso')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Novo Follow up' }));
    expect(onNovo).toHaveBeenCalled();
  });
});
