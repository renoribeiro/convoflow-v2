/**
 * Modal "Novo Relatório".
 *
 * O que importa (decisões de 2026-09-21): a segunda etapa mostra SÓ o que o
 * servidor calcula (REPORT_CONTENTS), sem caixinha e sem métrica inventada;
 * diz de frente que não há números por atendente; e o envio leva a Loja
 * aberta no seletor (tenant_id) — sem isso um gerente recebia zeros.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const invoke = vi.fn(async () => ({ data: { success: true, delivered: [{ channel: 'email', to: ['a@b.example'] }], warnings: [] }, error: null }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...(args as [])) } },
}));
vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenant: { id: 'loja-aberta-no-seletor' }, profile: { role: 'gerente' }, loading: false }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { NewReportModal } from './NewReportModal';
import { REPORT_CONTENTS, REPORT_CONTENT_IDS } from '@/lib/reports/reportContents';

// Métricas que o modal oferecia e o servidor NUNCA calculou.
const FAKE_METRICS = ['Satisfação do Cliente', 'Taxa de Resolução', 'Receita Gerada', 'Oportunidades Perdidas', 'Mensagens Abertas', 'Tempo Médio no Estágio', 'Tendências'];

const openModal = (initialData?: Record<string, unknown>) =>
  render(<NewReportModal isOpen onClose={() => {}} initialData={initialData as never} />);

const goToStep2 = () => {
  fireEvent.change(screen.getByLabelText(/Nome do Relatório/i), { target: { value: 'Semanal' } });
  fireEvent.click(screen.getByText('Conversas'));
  fireEvent.click(screen.getByRole('button', { name: 'Próximo' }));
};

beforeEach(() => {
  invoke.mockClear();
});

describe('NewReportModal — o que vai no relatório', () => {
  it('a etapa 2 lista exatamente o conteúdo real, sem caixinha', () => {
    openModal();
    goToStep2();
    expect(screen.getByTestId('report-contents-step')).toBeInTheDocument();
    for (const item of REPORT_CONTENTS) {
      expect(screen.getByTestId(`report-content-${item.id}`)).toHaveTextContent(item.label);
    }
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByText('Selecionar Métricas')).not.toBeInTheDocument();
  });

  it('nenhuma métrica inventada sobrou', () => {
    openModal();
    goToStep2();
    for (const fake of FAKE_METRICS) expect(screen.queryByText(fake)).not.toBeInTheDocument();
  });

  it('os três números de atendimento estão lá, com a explicação de leigo', () => {
    openModal();
    goToStep2();
    expect(screen.getByTestId('report-content-first_human_reply_median')).toHaveTextContent('Não conta bot nem campanha');
    expect(screen.getByTestId('report-content-waiting_human_now')).toHaveTextContent('sem responsável');
    expect(screen.getByTestId('report-content-no_human_reply')).toHaveTextContent('só o bot falou');
  });

  it('diz de frente que não há números por atendente', () => {
    openModal();
    goToStep2();
    expect(screen.getByTestId('report-not-included')).toHaveTextContent('Não traz números por atendente');
  });

  it('a etapa 2 não trava o avanço (não há nada para marcar)', () => {
    openModal();
    goToStep2();
    expect(screen.getByRole('button', { name: 'Próximo' })).toBeEnabled();
  });

  it('gerar a partir de um template antigo ignora as métricas inventadas gravadas nele', () => {
    openModal({ name: 'Antigo', type: 'conversations', metrics: ['satisfaction', 'resolution_rate'] });
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }));
    expect(screen.getByTestId('report-contents-step')).toBeInTheDocument();
    expect(screen.queryByText('Satisfação do Cliente')).not.toBeInTheDocument();
  });
});

describe('NewReportModal — a Loja do relatório', () => {
  it('o envio leva o tenant_id da Loja aberta no seletor e o conteúdo real', async () => {
    openModal();
    goToStep2();
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }));
    fireEvent.click(screen.getByLabelText('Enviar por Email'));
    fireEvent.change(screen.getByLabelText('Destinatários'), { target: { value: 'dono@empresa.example' } });
    fireEvent.click(screen.getByRole('button', { name: /Criar Relatório/ }));

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    const [fn, opts] = invoke.mock.calls[0] as unknown as [string, { body: Record<string, unknown> }];
    expect(fn).toBe('send-report');
    expect(opts.body.tenant_id).toBe('loja-aberta-no-seletor');
    expect(opts.body.metrics).toEqual([...REPORT_CONTENT_IDS]);
  });
});
