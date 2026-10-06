/**
 * A página de vendas com as chaves LIGADAS (teste grátis, entrega 4).
 *
 * As chaves de verdade estão desligadas; aqui elas são viradas só para o teste.
 * O mock não inventa comportamento: ele chama as funções reais de
 * src/lib/signup/release.ts com o valor da chave que o cenário pede, que é
 * exatamente o que elas fazem com a chave virada no arquivo. O lado desligado,
 * com as chaves reais, está em src/lib/signup/release.test.tsx.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const chaves = vi.hoisted(() => ({ signup: true, trial: true }));

vi.mock('@/lib/signup/release', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/signup/release')>();
  return {
    ...real,
    PUBLIC_SIGNUP_ENABLED: chaves.signup,
    signupEntryPath: () => real.signupEntryPath(chaves.signup),
    salesTrialOn: () => real.salesTrialOn(chaves.signup, chaves.trial),
    startCtaLabel: (on?: boolean) =>
      real.startCtaLabel(on ?? real.salesTrialOn(chaves.signup, chaves.trial)),
  };
});

import LandingPage from '@/pages/LandingPage';
import { COMO_CANCELAR_NO_TESTE, TRIAL_DAYS } from '@/lib/billing/trialOffer';

function renderPagina() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/auth" element={<p>tela de login</p>} />
        <Route path="/cadastro" element={<p>formulário de cadastro</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const botoesDeComecar = () => screen.getAllByRole('button', { name: /^Começar/ });

describe('página de vendas com o cadastro e o teste ligados', () => {
  beforeEach(() => {
    chaves.signup = true;
    chaves.trial = true;
  });

  it('todo "Começar" diz "Começar teste grátis" e leva ao cadastro', () => {
    renderPagina();
    const comecar = botoesDeComecar();
    expect(comecar).toHaveLength(4); // menu, topo, preço, fim
    for (const b of comecar) expect(b).toHaveTextContent(/^Começar teste grátis$/);

    const links = comecar.map((b) => b.closest('a')).filter(Boolean);
    expect(links).toHaveLength(3);
    for (const a of links) expect(a!.getAttribute('href')).toBe('/cadastro');

    fireEvent.click(comecar.find((b) => !b.closest('a'))!);
    expect(screen.getByText('formulário de cadastro')).toBeInTheDocument();
  });

  it('o menu do celular segue a mesma regra', () => {
    renderPagina();
    const abrir = screen
      .getAllByRole('button')
      .find((b) => b.closest('nav') && b.textContent === '' && b.querySelector('svg'))!;
    fireEvent.click(abrir);
    const comecar = botoesDeComecar();
    expect(comecar).toHaveLength(5);
    for (const b of comecar) expect(b).toHaveTextContent(/^Começar teste grátis$/);
  });

  it('o teste aparece como vantagem no topo, no preço e no fim', () => {
    renderPagina();
    expect(screen.getByTestId('hero-teste-gratis')).toHaveTextContent(`${TRIAL_DAYS} dias grátis.`);
    expect(screen.getByTestId('preco-teste-gratis-selo')).toHaveTextContent(`${TRIAL_DAYS} dias grátis para testar`);
    expect(screen.getByTestId('cta-teste-gratis')).toHaveTextContent(`${TRIAL_DAYS} dias grátis`);

    // O preço explica o que os Termos (cláusula 4.3) dizem: cartão no começo,
    // cobrança só no fim, como não pagar nada e um teste por Conta.
    const preco = screen.getByTestId('preco-teste-gratis');
    expect(preco).toHaveTextContent('Você cadastra o cartão ao começar');
    expect(preco).toHaveTextContent('só é cobrada no dia em que o teste termina');
    expect(preco).toHaveTextContent(COMO_CANCELAR_NO_TESTE);
    expect(preco).toHaveTextContent('Um teste por Conta.');
  });

  it('a FAQ ganha "Como funciona o teste grátis?" e o cancelamento cita o teste', () => {
    renderPagina();
    fireEvent.click(screen.getByText('Como funciona o teste grátis?'));
    const teste = screen.getByText(/A primeira assinatura de cada Conta começa com/);
    expect(teste).toHaveTextContent(`${TRIAL_DAYS} dias grátis`);
    expect(teste).toHaveTextContent('nada é cobrado durante o teste');
    expect(teste).toHaveTextContent(COMO_CANCELAR_NO_TESTE);
    expect(teste).toHaveTextContent('uma vez por Conta');

    fireEvent.click(screen.getByText('Posso cancelar a qualquer momento?'));
    expect(screen.getByText(/O Gerente da Conta cancela sozinho/)).toHaveTextContent(
      'até o fim do teste grátis ou do ciclo já pago',
    );
  });
});

describe('só a oferta do teste ligada, sem o cadastro pelo site', () => {
  beforeEach(() => {
    chaves.signup = false;
    chaves.trial = true;
  });

  it('a página não promete o teste: o visitante não teria onde pegá-lo', () => {
    const { container } = renderPagina();
    for (const b of botoesDeComecar()) expect(b).toHaveTextContent(/^Começar Agora$/);
    for (const a of botoesDeComecar().map((b) => b.closest('a')).filter(Boolean)) {
      expect(a!.getAttribute('href')).toBe('/auth');
    }
    expect(container.textContent).not.toMatch(/grátis|teste/i);
  });
});

describe('cadastro ligado sem a oferta (combinação que outro teste proíbe)', () => {
  beforeEach(() => {
    chaves.signup = true;
    chaves.trial = false;
  });

  it('os botões levam ao cadastro, mas nada promete teste', () => {
    const { container } = renderPagina();
    for (const b of botoesDeComecar()) expect(b).toHaveTextContent(/^Começar Agora$/);
    for (const a of botoesDeComecar().map((b) => b.closest('a')).filter(Boolean)) {
      expect(a!.getAttribute('href')).toBe('/cadastro');
    }
    expect(container.textContent).not.toMatch(/grátis|teste/i);
  });
});
