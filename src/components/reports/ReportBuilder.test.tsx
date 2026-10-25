/**
 * Aba "Criar" de Relatórios: mostra só o que o relatório traz (REPORT_CONTENTS)
 * e salva o modelo com o tipo escolhido. Até 2026-10-25 oferecia métricas que o
 * servidor nunca calculou (achado 72 do checkup).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mutate = vi.fn();

vi.mock('@/hooks/useReports', () => ({
  useCreateReportTemplate: () => ({ mutate, isPending: false }),
}));
vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenant: { id: 'aaaaaaaa-0000-4000-8000-000000000001' } }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { ReportBuilder } from './ReportBuilder';
import { REPORT_CONTENTS, REPORT_CONTENT_IDS } from '@/lib/reports/reportContents';

const INVENTADAS = ['Lifetime Value', 'ROI', 'Custo de Aquisição', 'Distribuição Geográfica', 'Receita Gerada', 'Visualizar Preview'];

beforeEach(() => mutate.mockClear());

describe('ReportBuilder', () => {
  it('lista o conteúdo real e nenhuma métrica inventada', () => {
    render(<ReportBuilder />);
    for (const item of REPORT_CONTENTS) expect(screen.getByText(item.label)).toBeInTheDocument();
    for (const fake of INVENTADAS) expect(screen.queryByText(fake)).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('salva o modelo com o conteúdo real e o tipo escolhido', () => {
    render(<ReportBuilder />);
    fireEvent.change(screen.getByLabelText('Nome do modelo'), { target: { value: 'Resumo semanal' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar modelo/ }));
    expect(mutate).toHaveBeenCalledTimes(1);
    const [dados] = mutate.mock.calls[0] as [Record<string, unknown>];
    expect(dados.name).toBe('Resumo semanal');
    expect(dados.config).toEqual({ reportType: 'general', format: 'html', metrics: [...REPORT_CONTENT_IDS] });
  });

  it('sem nome, não salva', () => {
    render(<ReportBuilder />);
    fireEvent.click(screen.getByRole('button', { name: /Salvar modelo/ }));
    expect(mutate).not.toHaveBeenCalled();
  });
});
