/**
 * Testes do único ponto de descoberta dos tutoriais.
 *
 * O que importa aqui: o cartão só aparece para quem está no zero, some quando a
 * Conta já tem instância, e não volta depois de dispensado.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/** Instâncias devolvidas pelo hook no teste corrente. */
let instances: Array<{ id: string; status: string }> = [];
let loading = false;

vi.mock('@/hooks/useWhatsAppInstances', () => ({
  useWhatsAppInstances: () => ({ instances, isLoading: loading, error: null }),
}));

import {
  OnboardingTutorialsCard,
  TUTORIALS_CARD_DISMISSED_KEY,
} from './OnboardingTutorialsCard';
import { TUTORIALS, tutorialKey } from '@/lib/help/tutorials';

const renderCard = () =>
  render(
    <MemoryRouter>
      <OnboardingTutorialsCard />
    </MemoryRouter>,
  );

/** O cartão está na tela? Identificado pelo botão "Ver todos". */
const isVisible = () => screen.queryByRole('link', { name: 'Ver todos' }) !== null;

beforeEach(() => {
  instances = [];
  loading = false;
  localStorage.clear();
});

describe('OnboardingTutorialsCard', () => {
  it('aparece para uma Conta sem nenhuma instância de WhatsApp', () => {
    instances = [];
    renderCard();
    expect(isVisible()).toBe(true);
  });

  it('não aparece quando a Conta já tem uma instância', () => {
    instances = [{ id: 'inst-1', status: 'connected' }];
    renderCard();
    expect(isVisible()).toBe(false);
  });

  it('não aparece nem com instância desconectada — o zero é não ter nenhuma', () => {
    instances = [{ id: 'inst-1', status: 'disconnected' }];
    renderCard();
    expect(isVisible()).toBe(false);
  });

  it('não pisca enquanto as instâncias carregam', () => {
    loading = true;
    renderCard();
    expect(isVisible()).toBe(false);
  });

  it('some ao ser dispensado e grava a preferência', () => {
    renderCard();
    expect(isVisible()).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Dispensar sugestão de tutoriais' }));

    expect(isVisible()).toBe(false);
    expect(localStorage.getItem(TUTORIALS_CARD_DISMISSED_KEY)).toBe('1');
  });

  it('continua dispensado numa nova montagem', () => {
    localStorage.setItem(TUTORIALS_CARD_DISMISSED_KEY, '1');
    renderCard();
    expect(isVisible()).toBe(false);
  });

  it('usa a convenção de chave do projeto', () => {
    expect(TUTORIALS_CARD_DISMISSED_KEY).toBe('convoflow:tutorials-card-dismissed');
  });

  it('leva para o primeiro tutorial e para a página de Ajuda', () => {
    renderCard();
    const first = TUTORIALS[0]!;

    expect(screen.getByRole('link', { name: first.title }).getAttribute('href')).toBe(
      `/dashboard/help#${tutorialKey(first.id)}`,
    );
    expect(screen.getByRole('link', { name: 'Ver todos' }).getAttribute('href')).toBe(
      '/dashboard/help',
    );
  });

  it('não quebra quando o localStorage está bloqueado', () => {
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('storage bloqueado');
      });
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('storage bloqueado');
      });

    try {
      renderCard();
      expect(isVisible()).toBe(true);
      // Dispensar segue funcionando na sessão, mesmo sem conseguir persistir.
      fireEvent.click(screen.getByRole('button', { name: 'Dispensar sugestão de tutoriais' }));
      expect(isVisible()).toBe(false);
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });
});
