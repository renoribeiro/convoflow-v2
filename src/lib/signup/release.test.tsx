/**
 * A chave do cadastro pelo site: enquanto ela está desligada, a página de
 * vendas não alcança /cadastro por nenhum botão, não fala em teste grátis, e
 * /cadastro e /register levam ao login.
 *
 * Aqui tudo roda com as chaves REAIS de hoje. O lado ligado (os mesmos botões
 * indo para /cadastro, com o texto do teste) está em
 * src/components/landing/landingTrialCopy.test.tsx.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import {
  LOGIN_PATH,
  PUBLIC_SIGNUP_ENABLED,
  SIGNUP_PATH,
  salesTrialOn,
  signupEntryPath,
  startCtaLabel,
} from './release';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ session: null }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }));

import { LandingNavbar } from '@/components/landing/LandingNavbar';
import { CTASection } from '@/components/landing/CTASection';
import Cadastro from '@/pages/Cadastro';
import LandingPage from '@/pages/LandingPage';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '..', '..');

describe('signupEntryPath', () => {
  it('desligado → login; ligado → formulário', () => {
    expect(signupEntryPath(false)).toBe(LOGIN_PATH);
    expect(signupEntryPath(true)).toBe(SIGNUP_PATH);
  });

  it('hoje está desligado', () => {
    expect(PUBLIC_SIGNUP_ENABLED).toBe(false);
    expect(signupEntryPath()).toBe('/auth');
  });
});

describe('o teste grátis na página de vendas (salesTrialOn / startCtaLabel)', () => {
  it('só aparece com as duas chaves ligadas', () => {
    expect(salesTrialOn(false, false)).toBe(false);
    expect(salesTrialOn(false, true)).toBe(false); // teste no checkout, mas sem cadastro pelo site
    expect(salesTrialOn(true, false)).toBe(false); // cadastro sem teste: a tela seguinte cobraria no dia
    expect(salesTrialOn(true, true)).toBe(true);
  });

  it('o rótulo dos botões segue a mesma regra', () => {
    expect(startCtaLabel(false)).toBe('Começar Agora');
    expect(startCtaLabel(true)).toBe('Começar teste grátis');
  });

  it('hoje: sem teste na página, e o rótulo de sempre', () => {
    expect(salesTrialOn()).toBe(false);
    expect(startCtaLabel()).toBe('Começar Agora');
  });
});

describe('página de vendas com as chaves de hoje (desligadas)', () => {
  const hrefs = () => screen.getAllByRole('link').map((a) => a.getAttribute('href'));

  it('o menu não tem link para /cadastro, e "Começar Agora" leva ao login (antes dizia "Começar Grátis")', () => {
    render(
      <MemoryRouter>
        <LandingNavbar />
      </MemoryRouter>,
    );
    expect(hrefs()).not.toContain(SIGNUP_PATH);
    const comecar = screen.getByRole('button', { name: /Começar Agora/i }).closest('a');
    expect(comecar?.getAttribute('href')).toBe('/auth');
    expect(screen.queryByText(/grátis/i)).toBeNull();
  });

  it('a chamada final "Começar Agora" leva ao login', () => {
    render(
      <MemoryRouter>
        <CTASection />
      </MemoryRouter>,
    );
    expect(hrefs()).not.toContain(SIGNUP_PATH);
    const comecar = screen.getByRole('button', { name: /Começar Agora/i }).closest('a');
    expect(comecar?.getAttribute('href')).toBe('/auth');
  });

  it('nenhum arquivo da página de vendas aponta direto para /cadastro ou /register', () => {
    const dir = path.join(SRC, 'components', 'landing');
    for (const nome of fs.readdirSync(dir)) {
      if (!/\.tsx?$/.test(nome) || /\.test\./.test(nome)) continue;
      const fonte = fs.readFileSync(path.join(dir, nome), 'utf8');
      expect(fonte, nome).not.toMatch(/["'`]\/cadastro["'`]/);
      expect(fonte, nome).not.toMatch(/["'`]\/register["'`]/);
    }
  });

  it('a página inteira: todo "Começar" diz "Começar Agora", leva ao login, e nada fala em teste grátis', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/auth" element={<p>tela de login</p>} />
          <Route path="/cadastro" element={<p>formulário de cadastro</p>} />
        </Routes>
      </MemoryRouter>,
    );

    // Nenhuma promessa de teste em lugar nenhum da página, FAQ incluída.
    expect(container.textContent).not.toMatch(/grátis|gratuito|teste/i);
    expect(screen.queryByText('Como funciona o teste grátis?')).toBeNull();
    expect(screen.queryByTestId('hero-teste-gratis')).toBeNull();
    expect(screen.queryByTestId('preco-teste-gratis')).toBeNull();
    expect(screen.queryByTestId('preco-teste-gratis-selo')).toBeNull();
    expect(screen.queryByTestId('cta-teste-gratis')).toBeNull();

    // Menu (a versão de computador; a do celular só monta aberta), topo, preço e fim.
    const comecar = screen.getAllByRole('button', { name: /^Começar/ });
    expect(comecar).toHaveLength(4);
    for (const b of comecar) expect(b).toHaveTextContent(/^Começar Agora$/);
    const links = comecar.map((b) => b.closest('a')).filter(Boolean);
    expect(links).toHaveLength(3);
    for (const a of links) expect(a!.getAttribute('href')).toBe('/auth');

    // O do preço navega por clique: também vai ao login.
    const doPreco = comecar.find((b) => !b.closest('a'))!;
    fireEvent.click(doPreco);
    expect(screen.getByText('tela de login')).toBeInTheDocument();
  });

  it('a FAQ de cancelamento aponta para o botão, sem falar em teste', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('Posso cancelar a qualquer momento?'));
    const resposta = screen.getByText(/Cancelar assinatura/);
    expect(resposta).toHaveTextContent('Configurações › Assinatura');
    expect(resposta).toHaveTextContent('até o fim do ciclo já pago');
    expect(resposta.textContent).not.toMatch(/e-mail|teste/i);
  });

  it('os botões de começar usam a chave (virar a chave vira todos juntos)', () => {
    const usos = ['LandingNavbar.tsx', 'HeroSection.tsx', 'CTASection.tsx', 'PricingSection.tsx'].map(
      (f) => fs.readFileSync(path.join(SRC, 'components', 'landing', f), 'utf8').match(/signupEntryPath\(\)/g)?.length ?? 0,
    );
    expect(usos).toEqual([2, 1, 1, 1]);
  });

  it('os rótulos e o texto do teste também usam a chave: nenhum "grátis" escrito fora dela', () => {
    for (const nome of ['LandingNavbar.tsx', 'HeroSection.tsx', 'CTASection.tsx', 'PricingSection.tsx']) {
      const fonte = fs.readFileSync(path.join(SRC, 'components', 'landing', nome), 'utf8');
      expect(fonte, nome).toMatch(/startCtaLabel\(/);
      expect(fonte, nome).not.toMatch(/Começar (Agora|Grátis|teste grátis)/);
    }
  });
});

describe('rotas', () => {
  const app = () => fs.readFileSync(path.join(SRC, 'App.tsx'), 'utf8');

  it('/cadastro só monta a página com a chave ligada; senão vai ao login', () => {
    const trecho = app().match(/<Route path="\/cadastro" element=\{[\s\S]*?\} \/>/)?.[0] ?? '';
    expect(trecho).toContain('PUBLIC_SIGNUP_ENABLED ?');
    expect(trecho).toContain('<Cadastro />');
    expect(trecho).toContain('<Navigate to={LOGIN_PATH} replace />');
  });

  it('/register segue a chave', () => {
    expect(app()).toContain('<Route path="/register" element={<Navigate to={signupEntryPath()} replace />} />');
  });

  it('a página, mesmo se montada com a chave desligada, redireciona ao login', () => {
    render(
      <MemoryRouter initialEntries={['/cadastro']}>
        <Routes>
          <Route path="/cadastro" element={<Cadastro habilitado={false} />} />
          <Route path="/auth" element={<p>tela de login</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('tela de login')).toBeInTheDocument();
  });
});
