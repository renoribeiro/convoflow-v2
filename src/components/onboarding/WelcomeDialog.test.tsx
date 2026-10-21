/**
 * Boas-vindas: aparece uma vez, por cargo; "Começar" abre o primeiro tour;
 * "Agora não" fecha de vez; superadmin e estado ainda não lido não veem nada.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { OnboardingState } from '@/lib/onboarding/state';
import { useTourQueue } from '@/lib/onboarding/tourQueue';

let papel: string | null = 'gerente';
let estado: OnboardingState | null = {};
const update = vi.fn(async (_muda: (s: OnboardingState) => OnboardingState) => true);

vi.mock('@/hooks/useOnboarding', () => ({
  useOnboardingState: () => ({ state: estado, role: papel, update, enabled: true }),
}));
vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ profile: { first_name: 'Ana' } }),
}));
vi.mock('@/hooks/useHelpVisibility', () => ({
  useHelpVisibility: () => ({ canAccess: () => true }),
}));

import { WelcomeDialog } from './WelcomeDialog';

function Onde() {
  const loc = useLocation();
  return <p data-testid="onde">{loc.pathname}</p>;
}

function montar() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="*" element={<><WelcomeDialog /><Onde /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  papel = 'gerente';
  estado = {};
  update.mockClear();
  useTourQueue.getState().clear();
});

describe('boas-vindas', () => {
  it('Gerente novo: vê o nome, o texto do cargo e os dois botões', () => {
    montar();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Olá, Ana! Que bom ter você aqui.')).toBeInTheDocument();
    expect(screen.getByText(/Você é Gerente da Conta/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agora não' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Começar' })).toBeInTheDocument();
  });

  it('"Começar" (Gerente): grava que viu e destaca a lista aqui mesmo', async () => {
    montar();
    await userEvent.click(screen.getByRole('button', { name: 'Começar' }));
    expect(update).toHaveBeenCalledTimes(1);
    const muda = update.mock.calls[0]![0];
    expect(muda({}).boas_vindas_em).toBeTruthy();
    expect(useTourQueue.getState().pending?.tourId).toBe('primeiros-passos');
    expect(screen.getByTestId('onde')).toHaveTextContent('/dashboard');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('"Começar" (Atendente): vai para Conversas com o tour de 4 passos', async () => {
    papel = 'atendente';
    montar();
    expect(screen.getByText(/4 passos rápidos/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Começar' }));
    expect(useTourQueue.getState().pending?.tourId).toBe('conversas');
    expect(screen.getByTestId('onde')).toHaveTextContent('/dashboard/conversations');
  });

  it('"Agora não": fecha de vez, sem tour', async () => {
    papel = 'gestor';
    montar();
    expect(screen.getByText(/Você é Gestor da Loja/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Agora não' }));
    expect(update).toHaveBeenCalledTimes(1);
    expect(useTourQueue.getState().pending).toBeNull();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('já vista: não aparece', () => {
    estado = { boas_vindas_em: '2026-10-21T12:00:00Z' };
    montar();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('superadmin: nunca', () => {
    papel = 'superadmin';
    montar();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('estado ainda não lido (ou com erro): nada aparece', () => {
    estado = null;
    montar();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
