import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * Editar sequência (achado 99, decisão D12): "Editar" abre o formulário de
 * criar preenchido, avisa que quem já está dentro segue os passos antigos e
 * salva tudo de uma vez (update_followup_sequence). Passo de template volta
 * com o template escolhido.
 */

const { estado } = vi.hoisted(() => ({
  estado: {
    sequences: [] as Array<Record<string, unknown>>,
    updateSequence: vi.fn(),
    createSequence: vi.fn(),
    grupos: [] as Array<Record<string, unknown>>,
  },
}));

vi.mock('@/hooks/useFollowupSequences', () => ({
  useFollowupSequences: () => ({
    sequences: estado.sequences,
    loading: false,
    deleteSequence: vi.fn(),
    toggleActive: vi.fn(),
    createSequence: estado.createSequence,
    updateSequence: estado.updateSequence,
  }),
}));
vi.mock('@/hooks/useMetaTemplates', () => ({
  useMetaWabaGroups: () => ({ groups: estado.grupos, officialCount: estado.grupos.length, isLoading: false, error: null }),
  useMetaTemplates: () => ({
    data: [{ name: 'retorno', language: 'pt_BR', status: 'APPROVED', paramCount: 1, bodyText: 'Oi {{1}}' }],
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock('@/components/shared/FeatureHelp', () => ({ FeatureHelp: () => null }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { SequencesManager } from './SequencesManager';

const sequencia = {
  id: 'aaaaaaaa-0000-4000-8000-000000000020',
  tenant_id: 't1',
  name: 'Pós-visita',
  description: 'Depois da visita ao imóvel',
  is_active: true,
  stop_on_reply: true,
  inscritosAtivos: 2,
  steps: [
    { id: 's1', step_order: 1, action_type: 'whatsapp', delay_amount: 1, delay_unit: 'days', message_body: 'O que achou?', task_title: null, task_priority: 'medium', template_name: null, template_language: null, template_params: null },
    { id: 's2', step_order: 2, action_type: 'manual_task', delay_amount: 3, delay_unit: 'days', message_body: null, task_title: 'Ligar', task_priority: 'high', template_name: null, template_language: null, template_params: null },
  ],
};

beforeEach(() => {
  estado.sequences = [sequencia];
  estado.grupos = [];
  estado.updateSequence.mockReset().mockResolvedValue(true);
  estado.createSequence.mockReset().mockResolvedValue({ id: 'nova' });
});

function montar() {
  render(
    <MemoryRouter>
      <SequencesManager />
    </MemoryRouter>,
  );
}

describe('Editar sequência', () => {
  it('abre preenchida e avisa que quem já está dentro segue os passos antigos', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: /Editar/ }));
    const janela = screen.getByRole('dialog');
    expect(within(janela).getByText('Editar sequência')).toBeInTheDocument();
    expect(within(janela).getByLabelText('Nome *')).toHaveValue('Pós-visita');
    expect(within(janela).getByLabelText('Mensagem')).toHaveValue('O que achou?');
    expect(within(janela).getByDisplayValue('Ligar')).toBeInTheDocument();
    expect(within(janela).getByText(/2 contatos estão nela agora e seguem os passos antigos até o fim/)).toBeInTheDocument();
    expect(within(janela).getByText(/valem para quem entrar na sequência daqui em diante/)).toBeInTheDocument();
  });

  it('salvar manda os passos novos de uma vez', async () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: /Editar/ }));
    const janela = screen.getByRole('dialog');
    fireEvent.change(within(janela).getByLabelText('Mensagem'), { target: { value: 'Gostou do imóvel?' } });
    fireEvent.click(within(janela).getByRole('button', { name: /Adicionar passo/ }));
    const mensagens = within(janela).getAllByLabelText('Mensagem');
    fireEvent.change(mensagens[1]!, { target: { value: 'Tenho outro parecido' } });
    fireEvent.click(within(janela).getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(estado.updateSequence).toHaveBeenCalledTimes(1));
    const [id, valores] = estado.updateSequence.mock.calls[0]!;
    expect(id).toBe(sequencia.id);
    expect(valores.name).toBe('Pós-visita');
    expect(valores.steps.map((p: { action_type: string; message_body: string | null; task_title: string | null }) =>
      p.action_type === 'whatsapp' ? p.message_body : p.task_title,
    )).toEqual(['Gostou do imóvel?', 'Ligar', 'Tenho outro parecido']);
    expect(estado.createSequence).not.toHaveBeenCalled();
  });

  it('passo de template volta com o template escolhido (Loja com API Oficial)', () => {
    estado.grupos = [{ wabaId: 'w1', instanceId: 'inst-oficial', label: 'Oficial Centro', instanceNames: ['Oficial Centro'] }];
    estado.sequences = [{
      ...sequencia,
      steps: [{ ...sequencia.steps[0]!, message_body: null, template_name: 'retorno', template_language: 'pt_BR', template_params: ['{{primeiro_nome}}'] }],
    }];
    montar();
    fireEvent.click(screen.getByRole('button', { name: /Editar/ }));
    const janela = screen.getByRole('dialog');
    expect(within(janela).getByRole('button', { name: 'Template aprovado', pressed: true })).toBeInTheDocument();
    expect(within(janela).getByText('Oi {{1}}')).toBeInTheDocument();
    expect(within(janela).getByLabelText('Variável 1')).toHaveValue('{{primeiro_nome}}');
  });
});
