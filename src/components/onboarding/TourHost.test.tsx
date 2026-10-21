/**
 * TourHost: o tour só começa na tela dele, pedido velho é descartado, saiu da
 * tela o tour acaba, terminou grava em user_onboarding, e superadmin nunca vê.
 */
import { act, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TOUR_REQUEST_TTL_MS, useTourQueue } from '@/lib/onboarding/tourQueue';

let papel = 'gestor';
const destroy = vi.fn();
let terminar: (() => void) | null = null;
const startTour = vi.fn(async (_tour: { id: string }, opts: { onFinish: () => void }) => {
  terminar = opts.onFinish;
  return { destroy: () => { destroy(); opts.onFinish(); } };
});
const patch = vi.fn(async () => true);

vi.mock('./TourRunner', () => ({ startTour: (t: { id: string }, o: { onFinish: () => void }) => startTour(t, o) }));
vi.mock('@/lib/onboarding/api', () => ({ patchOnboardingState: (...a: unknown[]) => patch(...(a as [])) }));
vi.mock('@/contexts/TenantContext', () => ({
  useRole: () => papel,
  useTenant: () => ({ profile: { user_id: 'aaaaaaaa-0000-4000-8000-000000000099' } }),
}));

import { TourHost } from './TourHost';

let navegar: (to: string) => void = () => {};
function Navegador() {
  const n = useNavigate();
  navegar = n;
  return null;
}

function montar(inicio = '/dashboard') {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[inicio]}>
        <Navegador />
        <TourHost />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  papel = 'gestor';
  startTour.mockClear();
  destroy.mockClear();
  patch.mockClear();
  terminar = null;
  useTourQueue.getState().clear();
});

describe('TourHost', () => {
  it('espera a tela do tour e só então começa', async () => {
    montar('/dashboard');
    act(() => useTourQueue.getState().request('convidar-equipe'));
    await new Promise((r) => setTimeout(r, 10));
    expect(startTour).not.toHaveBeenCalled();
    act(() => navegar('/dashboard/team'));
    await waitFor(() => expect(startTour).toHaveBeenCalledTimes(1));
    expect(startTour.mock.calls[0]![0].id).toBe('convidar-equipe');
    expect(useTourQueue.getState().pending).toBeNull();
  });

  it('pedido velho é descartado', async () => {
    montar('/dashboard/team');
    act(() => useTourQueue.setState({ pending: { tourId: 'convidar-equipe', at: Date.now() - TOUR_REQUEST_TTL_MS - 1 } }));
    await new Promise((r) => setTimeout(r, 10));
    expect(startTour).not.toHaveBeenCalled();
    expect(useTourQueue.getState().pending).toBeNull();
  });

  it('terminar grava o tour como visto', async () => {
    montar('/dashboard/team');
    act(() => useTourQueue.getState().request('convidar-equipe'));
    await waitFor(() => expect(terminar).not.toBeNull());
    act(() => terminar!());
    expect(patch).toHaveBeenCalledTimes(1);
  });

  it('saiu da tela: o tour acaba', async () => {
    montar('/dashboard/team');
    act(() => useTourQueue.getState().request('convidar-equipe'));
    await waitFor(() => expect(startTour).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    act(() => navegar('/dashboard/conversations'));
    await waitFor(() => expect(destroy).toHaveBeenCalled());
  });

  it('superadmin: o pedido é jogado fora', async () => {
    papel = 'superadmin';
    montar('/dashboard/team');
    act(() => useTourQueue.getState().request('convidar-equipe'));
    await new Promise((r) => setTimeout(r, 10));
    expect(startTour).not.toHaveBeenCalled();
    expect(useTourQueue.getState().pending).toBeNull();
  });

  it('tour desconhecido é jogado fora', async () => {
    montar('/dashboard');
    act(() => useTourQueue.getState().request('nao-existe'));
    await new Promise((r) => setTimeout(r, 10));
    expect(startTour).not.toHaveBeenCalled();
    expect(useTourQueue.getState().pending).toBeNull();
  });
});
