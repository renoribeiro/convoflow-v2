/**
 * Os números da página de vendas (pedido do Mário, 2026-10-10).
 *
 * As chaves de verdade estão em src/lib/landing/socialProof.ts. Aqui elas são
 * viradas só para o teste: o mock chama as funções reais com o valor que o
 * cenário pede, que é exatamente o que elas fazem com a chave virada no
 * arquivo. Assim o teste vale nos dois estados, e ligar a chave no arquivo não
 * quebra nada aqui.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const chaves = vi.hoisted(() => ({ hero: false, cta: false }));

vi.mock('@/lib/landing/socialProof', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/landing/socialProof')>();
  return {
    ...real,
    heroStatsOn: () => real.heroStatsOn(chaves.hero),
    ctaSubtitle: () => real.ctaSubtitle(chaves.cta),
  };
});

import LandingPage from '@/pages/LandingPage';
import { CTA_NEUTRAL_SENTENCE, HERO_STATS } from '@/lib/landing/socialProof';

const FRASE_ORIGINAL =
  'Junte-se a mais de 50.000 empresas que já revolucionaram seu atendimento e vendas com o ConvoFlow';

function renderPagina() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  );
}

describe('números da página de vendas com as chaves desligadas', () => {
  beforeEach(() => {
    chaves.hero = false;
    chaves.cta = false;
  });

  it('nenhum dos números aparece em lugar nenhum da página', () => {
    const { container } = renderPagina();
    const texto = container.textContent ?? '';
    expect(texto).not.toContain('300%');
    expect(texto).not.toMatch(/50k/i);
    expect(texto).not.toContain('1M');
    expect(texto).not.toContain('50.000');
  });

  it('a faixa do topo some inteira, sem sobrar cartão nem legenda', () => {
    renderPagina();
    expect(screen.queryByTestId('hero-numeros')).toBeNull();
    for (const stat of HERO_STATS) expect(screen.queryByText(stat.label)).toBeNull();
  });

  it('a chamada final mostra a frase sem número', () => {
    renderPagina();
    expect(screen.getByTestId('cta-subtitulo')).toHaveTextContent(
      /^Organize o atendimento e as vendas da sua equipe no WhatsApp com o ConvoFlow\.$/,
    );
    expect(CTA_NEUTRAL_SENTENCE).toBe(
      'Organize o atendimento e as vendas da sua equipe no WhatsApp com o ConvoFlow.',
    );
  });
});

describe('números da página de vendas com as chaves ligadas', () => {
  beforeEach(() => {
    chaves.hero = true;
    chaves.cta = true;
  });

  it('a faixa do topo volta com os três cartões, na ordem, vindos do arquivo', () => {
    renderPagina();
    const faixa = screen.getByTestId('hero-numeros');
    const valores = [...faixa.querySelectorAll('h3')].map((h) => h.textContent);
    expect(valores).toEqual(['+300%', '50k+', '1M+']);
    expect(valores).toEqual(HERO_STATS.map((s) => s.value));
    for (const stat of HERO_STATS) expect(faixa).toHaveTextContent(stat.label);
  });

  it('a chamada final volta com a frase original dos 50.000', () => {
    renderPagina();
    expect(screen.getByTestId('cta-subtitulo')).toHaveTextContent(new RegExp(`^${FRASE_ORIGINAL}$`));
    expect(screen.queryByText(CTA_NEUTRAL_SENTENCE)).toBeNull();
  });
});

describe('cada chave liga só o próprio bloco', () => {
  it('só a faixa do topo ligada', () => {
    chaves.hero = true;
    chaves.cta = false;
    renderPagina();
    expect(screen.getByTestId('hero-numeros')).toHaveTextContent('+300%');
    expect(screen.getByTestId('cta-subtitulo')).toHaveTextContent(CTA_NEUTRAL_SENTENCE);
  });

  it('só a frase do fim ligada', () => {
    chaves.hero = false;
    chaves.cta = true;
    renderPagina();
    expect(screen.queryByTestId('hero-numeros')).toBeNull();
    expect(screen.getByTestId('cta-subtitulo')).toHaveTextContent(FRASE_ORIGINAL);
  });
});
