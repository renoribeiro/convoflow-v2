import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Lista de campanhas (lote 6c): a cancelada tem aba própria e o cartão não
 * oferece mais "Ver Relatório" (decisão D10: abria o relatório de todas as
 * campanhas). O vazio leva à primeira ação de quem pode criar.
 */

const { estado } = vi.hoisted(() => ({
  estado: {
    campanhas: [] as Array<Record<string, unknown>>,
    podeAgir: true,
    statusPedido: '' as string,
  },
}));

vi.mock('@/contexts/TenantContext', () => ({ useCan: () => estado.podeAgir }));
vi.mock('@/hooks/useCampaigns', () => ({
  useCampaignsByStatus: (status: string) => {
    estado.statusPedido = status;
    return { data: estado.campanhas, isLoading: false };
  },
  useCampaignMutations: () => ({
    setCampaignStatus: { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false },
    duplicateCampaign: { mutate: vi.fn() },
    deleteCampaign: { mutateAsync: vi.fn(), isPending: false },
    scheduleCampaign: { mutateAsync: vi.fn(), isPending: false },
  }),
}));
vi.mock('./CampaignDetailsModal', () => ({ CampaignDetailsModal: () => null }));

import { CampaignsList } from './CampaignsList';

const ontem = new Date(Date.now() - 86_400_000).toISOString();

const cancelada = {
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  tenant_id: 'aaaaaaaa-0000-4000-8000-0000000000aa',
  name: 'Promoção de inverno',
  status: 'cancelled',
  message_type: 'text',
  total_recipients: 40,
  sent_count: 12,
  delivered_count: 10,
  read_count: 4,
  created_at: ontem,
  updated_at: ontem,
  cancelled_at: ontem,
  whatsapp_instance: { name: 'Loja Centro', status: 'connected' },
};

beforeEach(() => {
  estado.campanhas = [];
  estado.podeAgir = true;
  estado.statusPedido = '';
});

describe('CampaignsList', () => {
  it('a aba Canceladas pede as canceladas e mostra quando foi cancelada', () => {
    estado.campanhas = [cancelada];
    render(<CampaignsList status="cancelled" onEdit={vi.fn()} />);
    expect(estado.statusPedido).toBe('cancelled');
    expect(screen.getByText('Promoção de inverno')).toBeInTheDocument();
    expect(screen.getByText('Cancelada')).toBeInTheDocument();
    expect(screen.getByText('Cancelada Ontem')).toBeInTheDocument();
  });

  it('o menu do cartão tem "Ver detalhes" e não tem mais "Ver Relatório"', async () => {
    estado.campanhas = [cancelada];
    const user = userEvent.setup();
    render(<CampaignsList status="cancelled" onEdit={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /Mais ações da campanha Promoção de inverno/ }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText('Ver detalhes')).toBeInTheDocument();
    expect(within(menu).queryByText(/Ver Relat/i)).toBeNull();
    // Cancelada não se edita nem se cancela de novo; duplicar e excluir seguem.
    expect(within(menu).queryByText('Editar')).toBeNull();
    expect(within(menu).queryByText('Cancelar')).toBeNull();
    expect(within(menu).getByText('Duplicar')).toBeInTheDocument();
    expect(within(menu).getByText('Excluir')).toBeInTheDocument();
  });

  it('vazio: quem dispara ganha "Nova Campanha"; o atendente não', () => {
    const onNova = vi.fn();
    const { unmount } = render(<CampaignsList status="cancelled" onEdit={vi.fn()} onNova={onNova} />);
    screen.getByRole('button', { name: 'Nova Campanha' }).click();
    expect(onNova).toHaveBeenCalled();
    unmount();
    estado.podeAgir = false;
    render(<CampaignsList status="cancelled" onEdit={vi.fn()} onNova={onNova} />);
    expect(screen.getByText('Não há campanhas canceladas no momento.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nova Campanha' })).toBeNull();
  });
});
