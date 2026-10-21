/**
 * "Ver tutorial de novo" (topo da Ajuda): zera o estado e leva ao Dashboard.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

let habilitado = true;
let resultado = true;
const reset = vi.fn(async () => resultado);
const ok = vi.fn();
const erro = vi.fn();

vi.mock('@/hooks/useOnboarding', () => ({
  useOnboardingState: () => ({ enabled: habilitado, reset }),
}));
vi.mock('sonner', () => ({ toast: { success: (m: string) => ok(m), error: (m: string) => erro(m) } }));

import { VerTutorialDeNovoButton } from './VerTutorialDeNovoButton';

function Onde() {
  return <p data-testid="onde">{useLocation().pathname}</p>;
}

function montar() {
  return render(
    <MemoryRouter initialEntries={['/dashboard/help']}>
      <Routes>
        <Route path="*" element={<><VerTutorialDeNovoButton /><Onde /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  habilitado = true;
  resultado = true;
  reset.mockClear();
  ok.mockClear();
  erro.mockClear();
});

describe('Ver tutorial de novo', () => {
  it('zera o estado e leva ao Dashboard', async () => {
    montar();
    await userEvent.click(screen.getByRole('button', { name: 'Ver tutorial de novo' }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(ok).toHaveBeenCalledWith('Pronto! O tutorial recomeça no Dashboard.');
    expect(screen.getByTestId('onde')).toHaveTextContent('/dashboard');
  });

  it('se o banco recusar, avisa e fica na Ajuda', async () => {
    resultado = false;
    montar();
    await userEvent.click(screen.getByRole('button', { name: 'Ver tutorial de novo' }));
    expect(erro).toHaveBeenCalled();
    expect(screen.getByTestId('onde')).toHaveTextContent('/dashboard/help');
  });

  it('superadmin (sem onboarding): o botão não aparece', () => {
    habilitado = false;
    montar();
    expect(screen.queryByRole('button', { name: 'Ver tutorial de novo' })).toBeNull();
  });
});
