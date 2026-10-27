/**
 * Tela do Funil por cargo: "Configurar Estágios" só para quem monta o funil
 * (Gestor e Gerente); "Novo Lead" para todo mundo da Loja. O funil é de cada
 * Loja: com a Conta em foco, o Gerente escolhe a Loja antes de configurar, e a
 * janela que ele tinha aberto volta depois da troca.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { pedirAcaoFunil, useFunilPendente } from '@/lib/funnel/funilPendente';

let papel = 'atendente';
let kind = 'store';
vi.mock('@/contexts/TenantContext', () => ({
  useRole: () => papel,
  useTenant: () => ({ tenant: { kind } }),
}));
vi.mock('@/components/shared/PageHeader', () => ({
  PageHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) => (
    <header>
      <h1>{title}</h1>
      {actions}
    </header>
  ),
}));
vi.mock('@/components/funnel/FunnelBoard', () => ({ FunnelBoard: () => <div>quadro</div> }));
vi.mock('@/components/funnel/StageConfigModal', () => ({
  StageConfigModal: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div>janela de etapas aberta</div> : null),
}));
vi.mock('@/components/funnel/NewLeadModal', () => ({
  NewLeadModal: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div>novo lead aberto</div> : null),
}));
vi.mock('@/components/funnel/EstadoVazioFunil', () => ({
  EstadoVazioFunil: ({ situacao, acaoDepoisDaLoja }: { situacao: string; acaoDepoisDaLoja?: string }) => (
    <div>
      escolher loja: {situacao} / {acaoDepoisDaLoja}
    </div>
  ),
}));

import Funnel from './Funnel';

function montar() {
  return render(
    <MemoryRouter>
      <Funnel />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  papel = 'atendente';
  kind = 'store';
  useFunilPendente.getState().limpar();
});

describe('Funil por cargo', () => {
  it('Atendente: sem "Configurar Estágios", com "Novo Lead"', () => {
    montar();
    expect(screen.queryByRole('button', { name: /Configurar etapas/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Novo Lead/ })).toBeInTheDocument();
  });

  it.each(['gestor', 'gerente'])('%s numa Loja: "Configurar Estágios" abre a janela de etapas', async (p) => {
    papel = p;
    montar();
    await userEvent.click(screen.getByRole('button', { name: /Configurar etapas/ }));
    expect(screen.getByText('janela de etapas aberta')).toBeInTheDocument();
  });

  it('Gerente com a Conta em foco: "Configurar Estágios" pede a Loja, nunca abre etapas da Conta', async () => {
    papel = 'gerente';
    kind = 'account';
    montar();
    await userEvent.click(screen.getByRole('button', { name: /Configurar etapas/ }));
    expect(screen.getByText('escolher loja: conta / configurar-etapas')).toBeInTheDocument();
    expect(screen.queryByText('janela de etapas aberta')).toBeNull();
  });
});

describe('depois de escolher a Loja, a janela volta', () => {
  it('pedido de Novo Lead reabre o Novo Lead', () => {
    papel = 'gerente';
    pedirAcaoFunil('novo-lead');
    montar();
    expect(screen.getByText('novo lead aberto')).toBeInTheDocument();
    expect(useFunilPendente.getState().pendente).toBeNull();
  });

  it('pedido de Configurar Estágios reabre a janela de etapas (Gerente na Loja)', () => {
    papel = 'gerente';
    pedirAcaoFunil('configurar-etapas');
    montar();
    expect(screen.getByText('janela de etapas aberta')).toBeInTheDocument();
  });

  it('atendente não ganha a janela de etapas nem por pedido', () => {
    papel = 'atendente';
    pedirAcaoFunil('configurar-etapas');
    montar();
    expect(screen.queryByText('janela de etapas aberta')).toBeNull();
  });
});
