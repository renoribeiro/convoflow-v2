/**
 * Tela do Funil por cargo: "Configurar Estágios" só para quem monta o funil
 * (Gestor e Gerente); "Novo Lead" para todo mundo da Loja.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

let papel = 'atendente';
vi.mock('@/contexts/TenantContext', () => ({ useRole: () => papel }));
vi.mock('@/components/shared/PageHeader', () => ({
  PageHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) => (
    <header>
      <h1>{title}</h1>
      {actions}
    </header>
  ),
}));
vi.mock('@/components/funnel/FunnelBoard', () => ({ FunnelBoard: () => <div>quadro</div> }));
vi.mock('@/components/funnel/FunnelMetrics', () => ({ FunnelMetrics: () => null }));
vi.mock('@/components/funnel/StageConfigModal', () => ({ StageConfigModal: () => <div>janela de etapas</div> }));
vi.mock('@/components/funnel/NewLeadModal', () => ({ NewLeadModal: () => null }));

import Funnel from './Funnel';

function montar() {
  return render(
    <MemoryRouter>
      <Funnel />
    </MemoryRouter>,
  );
}

describe('Funil por cargo', () => {
  it('Atendente: sem "Configurar Estágios" (nem a janela), com "Novo Lead"', () => {
    papel = 'atendente';
    montar();
    expect(screen.queryByRole('button', { name: /Configurar Estágios/ })).toBeNull();
    expect(screen.queryByText('janela de etapas')).toBeNull();
    expect(screen.getByRole('button', { name: /Novo Lead/ })).toBeInTheDocument();
  });

  it.each(['gestor', 'gerente'])('%s: com "Configurar Estágios" e "Novo Lead"', (p) => {
    papel = p;
    montar();
    expect(screen.getByRole('button', { name: /Configurar Estágios/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Novo Lead/ })).toBeInTheDocument();
  });
});
