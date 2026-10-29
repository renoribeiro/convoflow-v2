import React from 'react';
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

/**
 * Editar follow up (achado 98): o mesmo formulário de criar, com a mensagem e
 * a hora editáveis. Salvar grava a hora escolhida no relógio de Brasília (a
 * edição antiga gravava o dia às 23:59 UTC, 20h59 em Brasília). A criação
 * também conta a hora de Brasília, inclusive perto da meia noite.
 */

const { estado } = vi.hoisted(() => ({
  estado: {
    contacts: [] as Record<string, unknown>[],
    createFollowup: vi.fn(),
    updateFollowup: vi.fn(),
    deleteFollowup: vi.fn(),
  },
}));

vi.mock('@/hooks/useContacts', () => ({ useContacts: () => ({ contacts: estado.contacts, loading: false }) }));
vi.mock('@/hooks/useFollowups', () => ({
  useFollowupMutations: () => ({
    createFollowup: estado.createFollowup,
    updateFollowup: estado.updateFollowup,
    deleteFollowup: estado.deleteFollowup,
  }),
}));
vi.mock('@/hooks/useFollowupSequences', () => ({
  useFollowupSequences: () => ({ sequences: [], loading: false, enrollContact: vi.fn() }),
}));
vi.mock('@/hooks/useWhatsAppApi', () => ({
  useWhatsAppInstancesSafe: () => ({
    instances: [{ row: { id: 'inst-qr', provider: 'evolution', is_active: true, created_at: '2026-01-01T00:00:00Z' } }],
    isLoading: false,
  }),
}));
vi.mock('@/contexts/TenantContext', () => ({ useTenantId: () => 't1' }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn(async () => ({ data: [], error: null })), from: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { FollowupScheduler } from './FollowupScheduler';
import type { IndividualFollowup } from '@/lib/followups/types';

beforeAll(() => {
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => {};
  proto.setPointerCapture ??= () => {};
});

// 28/10/2026 às 23:30 em Brasília (o UTC já está no dia 29).
const AGORA = new Date('2026-10-29T02:30:00Z');
const CONTATO = { id: 'c-1', channel: 'whatsapp', name: 'Cliente Exemplo', phone: '5585999990201', username: null, whatsapp_instance_id: null };

const base = {
  id: 'aaaaaaaa-0000-4000-8000-000000000010',
  tenant_id: 't1',
  contact_id: 'c-1',
  whatsapp_instance_id: null,
  priority: 'medium',
  notes: null,
  recurring: false,
  recurring_type: null,
  recurring_count: null,
  template_name: null,
  template_language: null,
  template_params: null,
  created_at: '2026-10-20T12:00:00Z',
  updated_at: '2026-10-20T12:00:00Z',
};

// Envio agendado para 30/10 às 14:00 de Brasília.
const agendado = {
  ...base,
  mode: 'scheduled',
  type: 'whatsapp',
  status: 'scheduled',
  task: 'Envio agendado de WhatsApp',
  message_body: 'Oi, tudo bem?',
  scheduled_at: '2026-10-30T17:00:00Z',
  due_date: '2026-10-30T17:00:00Z',
} as unknown as IndividualFollowup;

const tarefaAntiga = {
  ...base,
  mode: 'sequence',
  type: 'task',
  status: 'pending',
  task: 'Ligar para o cliente',
  message_body: null,
  scheduled_at: null,
  due_date: '2026-10-27T15:00:00Z', // já passou
} as unknown as IndividualFollowup;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AGORA);
  estado.contacts = [CONTATO];
  estado.createFollowup.mockReset().mockResolvedValue({ id: 'novo' });
  estado.updateFollowup.mockReset().mockResolvedValue(true);
  estado.deleteFollowup.mockReset().mockResolvedValue(true);
});

afterEach(() => vi.useRealTimers());

function montar(followup?: IndividualFollowup) {
  const onClose = vi.fn();
  render(
    <MemoryRouter>
      <FollowupScheduler onClose={onClose} followup={followup} />
    </MemoryRouter>,
  );
  return onClose;
}

describe('Editar follow up agendado', () => {
  it('abre o mesmo formulário com mensagem, data e hora de Brasília', () => {
    montar(agendado);
    expect(screen.getByText('Editar Follow up')).toBeInTheDocument();
    expect(screen.queryByText('Como este follow up vai funcionar?')).toBeNull();
    expect(screen.getByLabelText('Mensagem a enviar')).toHaveValue('Oi, tudo bem?');
    expect(screen.getByLabelText('Hora do envio')).toHaveValue('14:00');
    expect(screen.getByRole('button', { name: /30 de outubro de 2026/ })).toBeInTheDocument();
  });

  it('salvar grava a hora escolhida em Brasília (não 20h59) e a mensagem nova', async () => {
    const onClose = montar(agendado);
    fireEvent.change(screen.getByLabelText('Mensagem a enviar'), { target: { value: 'Oi! Passando para lembrar.' } });
    fireEvent.change(screen.getByLabelText('Hora do envio'), { target: { value: '15:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(estado.updateFollowup).toHaveBeenCalledTimes(1));
    const [id, dados] = estado.updateFollowup.mock.calls[0]!;
    expect(id).toBe(agendado.id);
    expect(dados).toMatchObject({
      message_body: 'Oi! Passando para lembrar.',
      scheduled_at: '2026-10-30T18:30:00.000Z',
      due_date: '2026-10-30T18:30:00.000Z',
      type: 'whatsapp',
    });
    expect(dados).not.toHaveProperty('contact_id');
    expect(dados).not.toHaveProperty('mode');
    expect(onClose).toHaveBeenCalled();
  });

  it('remarcar para hoje às 23:45, faltando 15 minutos para a meia noite, vale', async () => {
    montar(agendado);
    fireEvent.click(screen.getByRole('button', { name: /30 de outubro de 2026/ }));
    const grade = await screen.findByRole('grid');
    const hoje = within(grade).getAllByRole('gridcell', { name: '28' }).find((b) => !b.className.includes('day-outside'))!;
    expect(hoje).not.toBeDisabled();
    fireEvent.click(hoje);
    fireEvent.change(screen.getByLabelText('Hora do envio'), { target: { value: '23:45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(estado.updateFollowup).toHaveBeenCalledTimes(1));
    expect(estado.updateFollowup.mock.calls[0]![1].scheduled_at).toBe('2026-10-29T02:45:00.000Z');
  });

  it('hoje às 23:00 (já passou) não salva e diz a hora de Brasília', async () => {
    montar(agendado);
    fireEvent.click(screen.getByRole('button', { name: /30 de outubro de 2026/ }));
    const grade = await screen.findByRole('grid');
    fireEvent.click(within(grade).getAllByRole('gridcell', { name: '28' }).find((b) => !b.className.includes('day-outside'))!);
    fireEvent.change(screen.getByLabelText('Hora do envio'), { target: { value: '23:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(await screen.findByText(/não podem ser no passado \(agora são 23:30 em Brasília\)/)).toBeInTheDocument();
    expect(estado.updateFollowup).not.toHaveBeenCalled();
  });

  it('"Excluir" pede confirmação e exclui', async () => {
    const onClose = montar(agendado);
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir follow up' }));
    await waitFor(() => expect(estado.deleteFollowup).toHaveBeenCalledWith(agendado.id));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('Editar tarefa', () => {
  it('tipo antigo aparece marcado e a tarefa atrasada salva sem remarcar', async () => {
    montar(tarefaAntiga);
    expect(screen.getByText('Tarefa')).toBeInTheDocument();
    expect(screen.getByText('WhatsApp')).toBeInTheDocument();
    expect(screen.getByLabelText('Descrição da Tarefa')).toHaveValue('Ligar para o cliente');
    fireEvent.change(screen.getByLabelText('Notas Adicionais'), { target: { value: 'Cliente pediu para ligar à tarde' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(estado.updateFollowup).toHaveBeenCalledTimes(1));
    expect(estado.updateFollowup.mock.calls[0]![1]).toMatchObject({
      type: 'task',
      notes: 'Cliente pediu para ligar à tarde',
      due_date: '2026-10-27T15:00:00.000Z',
    });
  });
});

describe('Criar follow up perto da meia noite', () => {
  it('às 23:30 de Brasília, hoje às 23:45 grava 02:45 UTC do dia seguinte', async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByText('Selecione um contato').closest('button')!);
    await user.click(await screen.findByRole('option', { name: /Cliente Exemplo/ }));
    await user.click(screen.getByText('Ligação'));
    fireEvent.change(screen.getByLabelText('Descrição da Tarefa'), { target: { value: 'Retornar a ligação' } });
    await user.click(screen.getByRole('button', { name: /Selecionar data/ }));
    const grade = await screen.findByRole('grid');
    await user.click(within(grade).getAllByRole('gridcell', { name: '28' }).find((b) => !b.className.includes('day-outside'))!);
    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '23:45' } });
    await user.click(screen.getByRole('button', { name: 'Criar follow up' }));
    await waitFor(() => expect(estado.createFollowup).toHaveBeenCalledTimes(1));
    expect(estado.createFollowup.mock.calls[0]![0].due_date).toBe('2026-10-29T02:45:00.000Z');
  });
});
