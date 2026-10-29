import React from 'react';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

/**
 * Follow up agendado por número da API Oficial (achado 93, decisão D12): dá
 * para escolher "Template aprovado" da lista, e o follow up grava o template e
 * o número cuja conta Meta forneceu a lista. Número de QR Code não oferece.
 */

const { estado } = vi.hoisted(() => ({
  estado: {
    contacts: [] as Record<string, unknown>[],
    instances: [] as Record<string, unknown>[],
    createFollowup: vi.fn(),
  },
}));

vi.mock('@/hooks/useContacts', () => ({ useContacts: () => ({ contacts: estado.contacts, loading: false }) }));
vi.mock('@/hooks/useFollowups', () => ({ useFollowupMutations: () => ({ createFollowup: estado.createFollowup }) }));
vi.mock('@/hooks/useFollowupSequences', () => ({
  useFollowupSequences: () => ({ sequences: [], loading: false, enrollContact: vi.fn() }),
}));
vi.mock('@/hooks/useWhatsAppApi', () => ({
  useWhatsAppInstancesSafe: () => ({ instances: estado.instances.map((row) => ({ row })), isLoading: false }),
}));
vi.mock('@/hooks/useMetaTemplates', () => ({
  useMetaTemplates: () => ({
    data: [{ name: 'retorno_orcamento', language: 'pt_BR', status: 'APPROVED', paramCount: 1, bodyText: 'Oi {{1}}, tudo bem?' }],
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock('@/contexts/TenantContext', () => ({ useTenantId: () => 't1' }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn(async () => ({ data: [], error: null })), from: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { FollowupScheduler } from './FollowupScheduler';

beforeAll(() => {
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => {};
  proto.setPointerCapture ??= () => {};
});

const CONTATO = { id: 'c-1', channel: 'whatsapp', name: 'Cliente Exemplo', phone: '5585999990201', username: null, whatsapp_instance_id: 'inst-oficial' };

beforeEach(() => {
  estado.contacts = [CONTATO];
  estado.instances = [
    { id: 'inst-qr', provider: 'evolution', is_active: true, created_at: '2026-01-01T00:00:00Z' },
    { id: 'inst-oficial', provider: 'official', is_active: true, created_at: '2026-02-01T00:00:00Z' },
  ];
  estado.createFollowup.mockReset().mockResolvedValue({ id: 'f-1' });
});

async function abrirAgendado(user: ReturnType<typeof userEvent.setup>) {
  render(
    <MemoryRouter>
      <FollowupScheduler onClose={vi.fn()} />
    </MemoryRouter>,
  );
  await user.click(screen.getByText('Agendado'));
  await user.click(screen.getByText('Selecione um contato').closest('button')!);
  await user.click(await screen.findByRole('option', { name: /Cliente Exemplo/ }));
}

describe('Follow up agendado com template', () => {
  it('número oficial oferece "Template aprovado" e esconde a mensagem livre ao escolher', async () => {
    const user = userEvent.setup();
    await abrirAgendado(user);
    expect(screen.getByLabelText('Mensagem a enviar')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Template aprovado/ }));
    expect(screen.queryByLabelText('Mensagem a enviar')).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Template aprovado *' })).toBeInTheDocument();
  });

  it('número de QR Code não oferece template', async () => {
    estado.contacts = [{ ...CONTATO, whatsapp_instance_id: 'inst-qr' }];
    const user = userEvent.setup();
    await abrirAgendado(user);
    expect(screen.queryByRole('button', { name: /Template aprovado/ })).toBeNull();
  });

  it('grava o template e o número da lista', async () => {
    const user = userEvent.setup();
    await abrirAgendado(user);
    await user.click(screen.getByRole('button', { name: /Template aprovado/ }));
    await user.click(screen.getByRole('combobox', { name: 'Template aprovado *' }));
    await user.click(await screen.findByRole('option', { name: /retorno_orcamento/ }));
    await user.type(screen.getByLabelText('Variável 1'), 'Cliente');
    // Data de amanhã pelo calendário e uma hora qualquer.
    await user.click(screen.getByRole('button', { name: /Selecionar data/ }));
    const amanha = new Date(Date.now() + 86_400_000);
    const dias = await screen.findAllByRole('gridcell', { name: String(amanha.getDate()) });
    await user.click(dias.find((d) => !d.className.includes('day-outside'))!);
    await user.type(screen.getByLabelText('Hora do envio'), '10:00');
    await user.click(screen.getByRole('button', { name: 'Agendar envio' }));
    await waitFor(() => expect(estado.createFollowup).toHaveBeenCalledTimes(1));
    expect(estado.createFollowup.mock.calls[0]![0]).toMatchObject({
      mode: 'scheduled',
      whatsapp_instance_id: 'inst-oficial',
      template_name: 'retorno_orcamento',
      template_language: 'pt_BR',
      template_params: ['Cliente'],
      message_body: null,
    });
  });
});
