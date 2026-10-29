import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * Excluir agendamento de relatório (lote 6c, B10): botão no cartão, confirmação
 * que diz o que acontece, e a função que já existia (useDeleteReportSchedule).
 */

const { estado } = vi.hoisted(() => ({
  estado: { schedules: [] as Array<Record<string, unknown>>, excluir: vi.fn() },
}));

vi.mock('@/hooks/useReports', () => ({
  useReportSchedules: () => ({ data: estado.schedules, isLoading: false, error: null }),
  useCreateReportSchedule: () => ({ mutateAsync: vi.fn() }),
  useUpdateReportSchedule: () => ({ mutateAsync: vi.fn() }),
  useDeleteReportSchedule: () => ({ mutateAsync: estado.excluir, isPending: false }),
  useToggleReportSchedule: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('./ScheduleModal', () => ({ ScheduleModal: () => null }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { ScheduleList } from './ScheduleList';

beforeEach(() => {
  estado.schedules = [{
    id: 'aaaaaaaa-0000-4000-8000-000000000030',
    name: 'Resumo da semana',
    template_id: null,
    cron_expression: '0 9 * * 1',
    recipients: ['gerente@exemplo.com.br'],
    is_active: true,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  }];
  estado.excluir.mockReset().mockResolvedValue(undefined);
});

describe('Agendamentos › Excluir', () => {
  it('pede confirmação, diz que as entregas ficam e exclui', async () => {
    render(<ScheduleList />);
    fireEvent.click(screen.getByRole('button', { name: 'Excluir o agendamento Resumo da semana' }));
    expect(await screen.findByText('Excluir o agendamento?')).toBeInTheDocument();
    expect(screen.getByText(/"Resumo da semana" deixa de ser enviado/)).toBeInTheDocument();
    expect(screen.getByText(/continuam na aba Entregas/)).toBeInTheDocument();
    expect(estado.excluir).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Excluir agendamento' }));
    await waitFor(() => expect(estado.excluir).toHaveBeenCalledWith('aaaaaaaa-0000-4000-8000-000000000030'));
  });

  it('cancelar não exclui', async () => {
    render(<ScheduleList />);
    fireEvent.click(screen.getByRole('button', { name: 'Excluir o agendamento Resumo da semana' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    expect(estado.excluir).not.toHaveBeenCalled();
  });
});
