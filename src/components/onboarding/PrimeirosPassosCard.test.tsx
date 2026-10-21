/**
 * Lista "Primeiros passos" na tela: progresso, "Fazer agora" (com o desvio do
 * Gerente para a Loja), "Ver passo a passo", "Esconder" e o "tudo pronto".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import {
  CHECKLISTS,
  buildChecklist,
  type ChecklistStatus,
  type ChecklistSummary,
  type ChecklistView,
} from '@/lib/onboarding/checklist';
import type { OnboardingState } from '@/lib/onboarding/state';
import { useTourQueue } from '@/lib/onboarding/tourQueue';

const LOJA_A = { id: 'aaaaaaaa-0000-4000-8000-00000000000a', name: 'Loja Centro' };
const LOJA_B = { id: 'aaaaaaaa-0000-4000-8000-00000000000b', name: 'Loja Praia' };

let papel: 'gerente' | 'gestor' | 'atendente' = 'gerente';
let view: ChecklistView = 'lista';
let summary: ChecklistSummary | null = null;
let tenantKind: 'account' | 'store' = 'account';
let lojas = [LOJA_A];
const update = vi.fn(async (_m: (s: OnboardingState) => OnboardingState) => true);
const setActiveTenant = vi.fn();
const toastInfo = vi.fn();

vi.mock('@/hooks/useOnboarding', () => ({
  useOnboardingChecklist: () => ({ role: papel, summary, view, onboarding: { update } }),
}));
vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenant: { id: 't', kind: tenantKind }, setActiveTenant }),
}));
vi.mock('@/hooks/useMyStores', () => ({
  useMyStores: () => ({ stores: lojas, isLoading: false }),
}));
vi.mock('sonner', () => ({ toast: { info: (...a: unknown[]) => toastInfo(...a) } }));

import { PrimeirosPassosCard } from './PrimeirosPassosCard';

const tudo = () => true;
function resumo(p: typeof papel, passos: Record<string, boolean>) {
  const status: ChecklistStatus = { papel: p, tenantId: 't', lojas: 1, passos };
  return buildChecklist(p, status, tudo);
}

function Onde() {
  return <p data-testid="onde">{useLocation().pathname + useLocation().search}</p>;
}

function montar() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="*" element={<><PrimeirosPassosCard /><Onde /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

const linha = (id: string) => document.querySelector(`[data-passo="${id}"]`) as HTMLElement;

beforeEach(() => {
  papel = 'gerente';
  view = 'lista';
  tenantKind = 'account';
  lojas = [LOJA_A];
  summary = resumo('gerente', { assinatura: true, dados_fiscais: true, loja: true });
  update.mockClear();
  setActiveTenant.mockClear();
  toastInfo.mockClear();
  useTourQueue.getState().clear();
});

describe('lista do Gerente', () => {
  it('mostra o progresso e os passos na ordem, com o selo de prioridade', () => {
    montar();
    expect(screen.getByRole('heading', { name: 'Primeiros passos' })).toBeInTheDocument();
    expect(screen.getByText('3 de 9')).toBeInTheDocument();
    const titulos = [...document.querySelectorAll('[data-passo]')].map((li) => li.getAttribute('data-passo'));
    expect(titulos).toEqual(CHECKLISTS.gerente.map((d) => d.id));
    expect(within(linha('whatsapp')).getByText('Obrigatório')).toBeInTheDocument();
    expect(within(linha('chatbot')).getByText('Opcional')).toBeInTheDocument();
    expect(linha('loja').getAttribute('data-feito')).toBe('sim');
  });

  it('passo feito não tem botão; o funil do Gerente tem "Fazer agora" e o passo a passo', () => {
    montar();
    expect(within(linha('loja')).queryByRole('button', { name: 'Fazer agora' })).toBeNull();
    expect(within(linha('funil')).getByRole('button', { name: 'Fazer agora' })).toBeInTheDocument();
    expect(within(linha('funil')).getByRole('link', { name: 'Ver passo a passo' })).toHaveAttribute(
      'href',
      '/dashboard/help#tutorial:montar-funil',
    );
  });

  it('"Fazer agora" no funil, com a Conta em foco e uma Loja só: abre a Loja e o Funil', async () => {
    montar();
    await userEvent.click(within(linha('funil')).getByRole('button', { name: 'Fazer agora' }));
    expect(setActiveTenant).toHaveBeenCalledWith(LOJA_A.id);
    expect(screen.getByTestId('onde')).toHaveTextContent('/dashboard/funnel');
    expect(useTourQueue.getState().pending?.tourId).toBe('configurar-funil');
  });

  it('"Fazer agora" em Convidar: abre Equipe e pede o tour do botão Convidar', async () => {
    montar();
    await userEvent.click(within(linha('equipe')).getByRole('button', { name: 'Fazer agora' }));
    expect(screen.getByTestId('onde')).toHaveTextContent('/dashboard/team');
    expect(useTourQueue.getState().pending?.tourId).toBe('convidar-equipe');
    expect(setActiveTenant).not.toHaveBeenCalled();
  });

  it('passo de Loja com a Conta em foco e uma Loja só: abre a Loja sozinho e avisa', async () => {
    montar();
    await userEvent.click(within(linha('whatsapp')).getByRole('button', { name: 'Fazer agora' }));
    expect(setActiveTenant).toHaveBeenCalledWith(LOJA_A.id);
    expect(toastInfo).toHaveBeenCalledWith('Abrimos a Loja Loja Centro para este passo.');
    expect(screen.getByTestId('onde')).toHaveTextContent('/dashboard/whatsapp-numbers');
    expect(useTourQueue.getState().pending?.tourId).toBe('conectar-whatsapp');
  });

  it('com várias Lojas: fica no Dashboard e destaca o seletor de Loja', async () => {
    lojas = [LOJA_A, LOJA_B];
    montar();
    await userEvent.click(within(linha('respostas_rapidas')).getByRole('button', { name: 'Fazer agora' }));
    expect(useTourQueue.getState().pending?.tourId).toBe('escolher-loja');
    expect(screen.getByTestId('onde')).toHaveTextContent('/dashboard');
    expect(setActiveTenant).not.toHaveBeenCalled();
  });

  it('com uma Loja já em foco: vai direto para a aba', async () => {
    tenantKind = 'store';
    montar();
    await userEvent.click(within(linha('respostas_rapidas')).getByRole('button', { name: 'Fazer agora' }));
    expect(screen.getByTestId('onde')).toHaveTextContent('/dashboard/settings?tab=quick-replies');
    expect(useTourQueue.getState().pending?.tourId).toBe('respostas-rapidas');
  });

  it('"Esconder" grava a marca e não pede tour', async () => {
    montar();
    await userEvent.click(screen.getByRole('button', { name: 'Esconder' }));
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]![0]({}).lista_escondida_em).toBeTruthy();
    expect(useTourQueue.getState().pending).toBeNull();
  });
});

describe('outros cargos e estados', () => {
  it('Atendente: os três passos pessoais', () => {
    papel = 'atendente';
    summary = resumo('atendente', { foto: true });
    montar();
    expect(screen.getByText('1 de 3')).toBeInTheDocument();
    expect(screen.getByText('Responder sua primeira conversa')).toBeInTheDocument();
  });

  it('"Tudo pronto": parabeniza e fecha', async () => {
    view = 'pronto';
    montar();
    expect(screen.getByText('Tudo pronto por aqui')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('oculta: não renderiza nada', () => {
    view = 'oculto';
    const { container } = montar();
    expect(container.querySelector('[data-tour="primeiros-passos"]')).toBeNull();
  });
});
