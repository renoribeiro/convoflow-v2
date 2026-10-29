import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * Fonte de tráfego (decisão D7): sem contatos, exclui; com contatos, só
 * desliga, e a janela diz quantos contatos chegaram por ela. A aba mostra as
 * desligadas também (para ligar de novo).
 */

const { estado } = vi.hoisted(() => ({
  estado: {
    fontes: [] as Array<Record<string, unknown>>,
    pedido: undefined as unknown,
    excluir: vi.fn(),
    atualizar: vi.fn(),
  },
}));

vi.mock('@/hooks/useTracking', () => ({
  useTrafficSources: (opcoes: unknown) => {
    estado.pedido = opcoes;
    return { data: estado.fontes, isLoading: false };
  },
  useCreateTrafficSource: () => ({ mutate: vi.fn() }),
  useUpdateTrafficSource: () => ({ mutate: vi.fn(), mutateAsync: estado.atualizar, isPending: false }),
  useDeleteTrafficSource: () => ({ mutateAsync: estado.excluir, isPending: false }),
}));
vi.mock('./SourceConfigModal', () => ({ SourceConfigModal: () => null }));

import { TrafficSourceConfig } from './TrafficSourceConfig';

const LIVRE = { id: 'f-livre', name: 'Link da bio', type: 'referral', is_active: true, created_at: '2026-10-01T00:00:00Z', lead_tracking: [{ count: 0 }] };
const USADA = { id: 'f-usada', name: 'Anúncio de outubro', type: 'paid', is_active: true, created_at: '2026-10-02T00:00:00Z', lead_tracking: [{ count: 12 }] };
const DESLIGADA = { id: 'f-off', name: 'Feira de setembro', type: 'direct', is_active: false, created_at: '2026-09-02T00:00:00Z', lead_tracking: [{ count: 3 }] };

beforeEach(() => {
  estado.fontes = [LIVRE, USADA, DESLIGADA];
  estado.excluir.mockReset().mockResolvedValue(undefined);
  estado.atualizar.mockReset().mockResolvedValue({});
});

describe('Fontes › excluir ou desligar', () => {
  it('a aba pede as desligadas também e mostra a desligada como Inativa', () => {
    render(<TrafficSourceConfig />);
    expect(estado.pedido).toEqual({ incluirDesligadas: true });
    expect(screen.getByText('Feira de setembro')).toBeInTheDocument();
    expect(screen.getByText('Inativa')).toBeInTheDocument();
  });

  it('fonte sem contatos: confirma e exclui', async () => {
    render(<TrafficSourceConfig />);
    fireEvent.click(screen.getByRole('button', { name: 'Excluir a fonte Link da bio' }));
    expect(await screen.findByText(/Nenhum contato chegou por esta fonte/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Excluir fonte' }));
    await waitFor(() => expect(estado.excluir).toHaveBeenCalledWith('f-livre'));
  });

  it('fonte com contatos: diz quantos, não exclui e oferece desligar', async () => {
    render(<TrafficSourceConfig />);
    fireEvent.click(screen.getByRole('button', { name: 'Excluir a fonte Anúncio de outubro' }));
    expect(await screen.findByText('A fonte "Anúncio de outubro" não pode ser excluída')).toBeInTheDocument();
    expect(screen.getByText(/12 contatos chegaram por esta fonte/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir fonte' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Desligar fonte' }));
    await waitFor(() => expect(estado.atualizar).toHaveBeenCalledWith({ id: 'f-usada', is_active: false }));
    expect(estado.excluir).not.toHaveBeenCalled();
  });

  it('fonte com contatos já desligada: só avisa', async () => {
    render(<TrafficSourceConfig />);
    fireEvent.click(screen.getByRole('button', { name: 'Excluir a fonte Feira de setembro' }));
    expect(await screen.findByText(/3 contatos chegaram por esta fonte/)).toBeInTheDocument();
    expect(screen.getByText('Ela já está desligada.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desligar fonte' })).toBeNull();
  });
});
