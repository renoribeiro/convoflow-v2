import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';

const estado = vi.hoisted(() => ({
  valor: { metrics: [] as unknown[], isLoading: false, error: null as unknown, tentarDeNovo: vi.fn() },
}));
vi.mock('@/hooks/useStoreComparison', () => ({ useStoreComparison: () => estado.valor }));

import StoreComparison from './StoreComparison';

const montar = () =>
  render(
    <TooltipProvider>
      <StoreComparison />
    </TooltipProvider>,
  );

describe('Comparar Lojas (achado 75)', () => {
  beforeEach(() => {
    estado.valor = { metrics: [], isLoading: false, error: null, tentarDeNovo: vi.fn() };
  });

  it('consulta que falhou mostra o erro e "Tentar de novo", não "nenhuma Loja"', async () => {
    estado.valor.error = new Error('falhou');
    montar();
    expect(screen.getByText('Não foi possível carregar a comparação.')).toBeInTheDocument();
    expect(screen.queryByText(/Nenhuma Loja/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /tentar de novo/i }));
    expect(estado.valor.tentarDeNovo).toHaveBeenCalledTimes(1);
  });

  it('sem erro e sem Lojas, continua o convite para criar a primeira', () => {
    montar();
    expect(screen.getByText('Nenhuma Loja na sua Conta ainda.')).toBeInTheDocument();
  });

  it('diz o período dos números', () => {
    estado.valor.metrics = [{ id: 'aaaaaaaa-0000-4000-8000-000000000001', name: 'Loja Centro', contacts: 3, conversations: 2, messages: 9 }];
    montar();
    expect(screen.getByText(/no total desde o início de cada uma/)).toBeInTheDocument();
  });
});
