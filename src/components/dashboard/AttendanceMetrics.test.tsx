/**
 * Seção "Atendimento" do Dashboard.
 *
 * O que importa: os dois tempos de resposta aparecem como cartões separados
 * (bot × pessoa), cada um dizendo o que não conta; "esperando agora" fala do
 * número sem responsável; a etiqueta "Toda a Loja" segue o padrão (só para
 * atendente restrito); e fora do alcance a seção diz isso em vez de zerar.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { LojaConversationMetricsRow } from '@/hooks/useLojaStats';

let current: LojaConversationMetricsRow | null | undefined = undefined;
let previous: LojaConversationMetricsRow | null | undefined = undefined;
let loading = false;
let restricted = false;

vi.mock('@/hooks/useLojaStats', () => ({
  useLojaConversationMetrics: ({ keySuffix }: { keySuffix?: unknown[] }) => ({
    data: keySuffix?.[0] === 'prev' ? previous : current,
    isLoading: loading,
  }),
}));
vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenant: { id: 'loja-1' }, profile: null, loading: false }),
}));
vi.mock('@/hooks/useConversationVisibilityConfig', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/hooks/useConversationVisibilityConfig')>();
  return {
    ...mod,
    useConversationVisibilityConfig: () => ({
      atendente_visibility: restricted ? 'own' : 'all',
      atendente_can_transfer: true,
      isRestricted: restricted,
      transferBlocked: false,
      isLoading: false,
    }),
  };
});

import { AttendanceMetrics } from './AttendanceMetrics';
import { usePeriodFilter } from '@/hooks/usePeriodFilter';

const ROW: LojaConversationMetricsRow = {
  n_conversations: 17,
  n_bot_touched: 17,
  n_no_human_reply: 3,
  n_waiting_human: 92,
  n_waiting_human_unowned: 92,
  n_first_human: 14,
  median_first_human_minutes: 118.03,
  n_first_bot: 17,
  median_first_bot_minutes: 0.0956,
  median_messages: 16,
  median_duration_minutes: 192.3,
};

const Harness = () => {
  const period = usePeriodFilter('7d');
  return <AttendanceMetrics period={period} />;
};

const renderSection = () =>
  render(
    <MemoryRouter>
      <TooltipProvider>
        <Harness />
      </TooltipProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  current = ROW;
  previous = null;
  loading = false;
  restricted = false;
});

describe('AttendanceMetrics', () => {
  it('mostra bot e pessoa como dois cartões, com os valores da RPC', () => {
    renderSection();
    expect(screen.getByText('1ª resposta do bot')).toBeInTheDocument();
    expect(screen.getByText('1ª resposta de uma pessoa')).toBeInTheDocument();
    expect(screen.getByTestId('attendance-card-bot')).toHaveTextContent('6 s');
    expect(screen.getByTestId('attendance-card-human')).toHaveTextContent('1 h 58 min');
    expect(screen.getByTestId('attendance-card-bot')).toHaveTextContent('Não conta pessoa');
    expect(screen.getByTestId('attendance-card-human')).toHaveTextContent('Não conta bot');
  });

  it('esperando agora traz o total e quantas estão sem responsável', () => {
    renderSection();
    const card = screen.getByTestId('attendance-card-waiting');
    expect(card).toHaveTextContent('92');
    expect(card).toHaveTextContent('92 sem responsável');
  });

  it('variação da mediana humana vs. período anterior, no sentido "mais rápido"', () => {
    previous = { ...ROW, median_first_human_minutes: 236.06 };
    renderSection();
    expect(screen.getByTestId('attendance-card-human')).toHaveTextContent('50% mais rápido');
  });

  it('etiqueta "Toda a Loja" só para atendente com visibilidade restrita', () => {
    renderSection();
    expect(screen.queryAllByTestId('loja-wide-hint')).toHaveLength(0);
  });

  it('...e aparece em todos os cartões quando restrito', () => {
    restricted = true;
    renderSection();
    expect(screen.getAllByTestId('loja-wide-hint')).toHaveLength(6);
  });

  it('fora do alcance (RPC vazia) diz isso em vez de mostrar zeros', () => {
    current = null;
    renderSection();
    expect(screen.getByTestId('attendance-unavailable')).toBeInTheDocument();
    expect(screen.queryByTestId('attendance-card-human')).not.toBeInTheDocument();
  });
});
