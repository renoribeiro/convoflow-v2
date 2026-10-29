import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

/**
 * Agendamento e rascunho do assistente (lote 6c, achado 95):
 *  - hoje fica liberado no calendário e só aceita hora que ainda não passou,
 *    no relógio de Brasília (perto da meia noite inclusive);
 *  - "Salvar como rascunho" existe em todo passo.
 */

type Row = Record<string, unknown>;
const { db, mutacoes, toast } = vi.hoisted(() => ({
  db: { tables: {} as Record<string, Row[]> },
  mutacoes: { create: vi.fn(), update: vi.fn(), schedule: vi.fn() },
  toast: vi.fn(),
}));

function query(table: string) {
  let rows = [...(db.tables[table] ?? [])];
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.order = () => chain;
  chain.eq = (col: string, val: unknown) => {
    rows = rows.filter((r) => r[col] === val);
    return chain;
  };
  chain.in = () => chain;
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve);
  return chain;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (t: string) => query(t), rpc: vi.fn(), storage: { from: vi.fn() } },
}));
vi.mock('@/contexts/TenantContext', () => ({ useTenantId: () => 't1' }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }), toast }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('@/hooks/useCampaigns', () => ({
  useCampaignMutations: () => ({
    createCampaign: { mutateAsync: mutacoes.create },
    updateCampaign: { mutateAsync: mutacoes.update },
    scheduleCampaign: { mutateAsync: mutacoes.schedule },
  }),
}));

import { CampaignWizard } from './CampaignWizardNew';

// 28/10/2026 às 23:30 em Brasília = 29/10 02:30 UTC: o UTC já virou o dia.
const AGORA = new Date('2026-10-29T02:30:00Z');

const rascunho = {
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  tenant_id: 't1',
  name: 'Aviso de última hora',
  status: 'draft',
  whatsapp_instance_id: 'inst-1',
  message_type: 'text',
  message_template: 'Oi {first_name}',
  audience_type: 'contact_list',
  audience_config: { contact_ids: ['c-1'] },
  target_tags: [],
  timezone: 'America/Sao_Paulo',
  // 23:45 de hoje em Brasília.
  scheduled_at: '2026-10-29T02:45:00Z',
} as unknown as React.ComponentProps<typeof CampaignWizard>['campaign'];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AGORA);
  toast.mockReset();
  mutacoes.create.mockReset().mockResolvedValue({ id: 'nova' });
  mutacoes.update.mockReset().mockResolvedValue({ id: 'x' });
  db.tables = {
    whatsapp_instances: [{ id: 'inst-1', tenant_id: 't1', is_active: true, name: 'Loja Centro', status: 'open', provider: 'evolution' }],
    tags: [],
    funnel_stages: [],
    contacts: [{ id: 'c-1', tenant_id: 't1', channel: 'whatsapp', name: 'Cliente Exemplo', phone: '5585999990201', current_stage_id: null }],
  };
});

afterEach(() => {
  vi.useRealTimers();
});

async function irAoAgendamento() {
  render(<CampaignWizard onClose={vi.fn()} campaign={rascunho} />);
  for (let i = 0; i < 2; i++) {
    const proximo = await screen.findByRole('button', { name: 'Próximo' });
    await waitFor(() => expect(proximo).not.toBeDisabled());
    fireEvent.click(proximo);
  }
  await screen.findByText('Quando enviar?');
}

describe('Campanha › Agendamento (hora de Brasília)', () => {
  it('às 23:30, agendar para hoje às 23:45 vale', async () => {
    await irAoAgendamento();
    expect(screen.getByLabelText('Hora')).toHaveValue('23:45');
    expect(screen.getByText(/28\/10 23:45, horário de Brasília/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Próximo' })).not.toBeDisabled();
  });

  it('hora que já passou hoje trava o avanço e diz a hora de agora', async () => {
    await irAoAgendamento();
    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '23:00' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Esse horário já passou');
    expect(screen.getByRole('alert')).toHaveTextContent('agora são 23:30 em Brasília');
    expect(screen.getByRole('button', { name: 'Próximo' })).toBeDisabled();
  });

  it('o calendário deixa hoje (28) e desliga ontem (27), mesmo com o UTC já no dia 29', async () => {
    await irAoAgendamento();
    fireEvent.click(screen.getByRole('button', { name: /28\/10\/2026/ }));
    const grade = await screen.findByRole('grid');
    // Só os dias de outubro: a grade também mostra o fim de setembro.
    const dia = (n: string) =>
      within(grade).getAllByRole('gridcell', { name: n }).find((b) => !b.className.includes('day-outside'))!;
    expect(dia('28')).not.toBeDisabled();
    expect(dia('27')).toBeDisabled();
  });
});

describe('Campanha › Salvar como rascunho em todo passo', () => {
  it('já no primeiro passo salva como rascunho', async () => {
    db.tables.whatsapp_instances = [{ id: 'inst-1', tenant_id: 't1', is_active: true, name: 'Loja Centro', status: 'open', provider: 'evolution' }];
    render(<CampaignWizard onClose={vi.fn()} campaign={rascunho} />);
    const botao = await screen.findByRole('button', { name: 'Salvar como rascunho' });
    fireEvent.click(botao);
    await waitFor(() => expect(mutacoes.update).toHaveBeenCalledTimes(1));
    expect(mutacoes.update.mock.calls[0]![0].input.status).toBe('draft');
  });

  it('sem nome, avisa o que falta e não grava', async () => {
    render(<CampaignWizard onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Salvar como rascunho' }));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Dê um nome à campanha para salvar o rascunho.' }));
    expect(mutacoes.create).not.toHaveBeenCalled();
  });
});
