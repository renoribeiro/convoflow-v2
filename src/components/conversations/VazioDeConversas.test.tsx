import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/**
 * Conversas vazias (lote 6c, B13, decisão D8): sem número, quem configura
 * WhatsApp vê "Conectar número" e o atendente lê a quem pedir; com número,
 * "Nova conversa".
 */

const { estado } = vi.hoisted(() => ({ estado: { acesso: 'liberado' as string } }));

vi.mock('@/hooks/useAcessoTelas', () => ({
  useAcessoTelas: () => ({ acesso: (chave: string) => (chave === 'whatsapp-numbers' ? estado.acesso : 'liberado') }),
}));
vi.mock('./NewConversationModal', () => ({
  NewConversationModal: ({ noVazio }: { noVazio?: boolean }) => <button type="button">{noVazio ? 'Nova conversa' : 'outro'}</button>,
}));

import { VazioDeConversas } from './VazioDeConversas';

function montar(props: React.ComponentProps<typeof VazioDeConversas>) {
  render(
    <MemoryRouter initialEntries={['/dashboard/conversations']}>
      <Routes>
        <Route path="/dashboard/conversations" element={<VazioDeConversas {...props} />} />
        <Route path="/dashboard/whatsapp-numbers" element={<p>tela de números</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  estado.acesso = 'liberado';
});

describe('VazioDeConversas', () => {
  it('sem número, quem configura WhatsApp vê "Conectar número" e vai para Números', () => {
    montar({ temNumero: false, ladoInstagram: false });
    expect(screen.getByText('Nenhum número conectado')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Conectar número' }));
    expect(screen.getByText('tela de números')).toBeInTheDocument();
  });

  it('sem número, o atendente lê a quem pedir e não ganha botão', () => {
    estado.acesso = 'sem_capacidade';
    montar({ temNumero: false, ladoInstagram: false });
    expect(screen.getByText(/Peça ao Gestor da Loja para conectar um número/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Conectar número' })).toBeNull();
  });

  it('com número, oferece "Nova conversa"', () => {
    montar({ temNumero: true, ladoInstagram: false });
    expect(screen.getByText('Nenhuma conversa encontrada')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nova conversa' })).toBeInTheDocument();
  });

  it('enquanto os números carregam, não diz que falta número', () => {
    montar({ temNumero: null, ladoInstagram: false });
    expect(screen.queryByText('Nenhum número conectado')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Nova conversa' })).toBeNull();
  });

  it('no lado do Instagram não há Nova conversa nem aviso de número', () => {
    montar({ temNumero: false, ladoInstagram: true });
    expect(screen.queryByText('Nenhum número conectado')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Nova conversa' })).toBeNull();
  });
});
