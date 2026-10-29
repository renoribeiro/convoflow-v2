import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/** Vazio de Modelos de relatório (lote 6c, B13): "Criar relatório" leva à aba Criar. */

vi.mock('@/hooks/useReports', () => ({
  useReportTemplates: () => ({ data: [], isLoading: false, error: null }),
  useDeleteReportTemplate: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/contexts/TenantContext', () => ({ useTenant: () => ({ tenant: { id: 't1' }, loading: false }) }));
vi.mock('./NewReportModal', () => ({ NewReportModal: () => null }));
vi.mock('./ViewTemplateModal', () => ({ ViewTemplateModal: () => null }));
vi.mock('./DeleteConfirmationModal', () => ({ DeleteConfirmationModal: () => null }));

import { ReportTemplates } from './ReportTemplates';

describe('ReportTemplates vazio', () => {
  it('oferece "Criar relatório"', () => {
    const onCriar = vi.fn();
    render(<ReportTemplates onCriar={onCriar} />);
    expect(screen.getByText('Nenhum modelo de relatório encontrado')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Criar relatório' }));
    expect(onCriar).toHaveBeenCalled();
  });
});
