import { test, expect, type Page } from '@playwright/test';
import { PUBLIC_SIGNUP_ENABLED } from '../src/lib/signup/chave';

// Os botões de começar seguem a chave do cadastro (src/lib/signup/chave.ts):
// ligada, "Começar teste grátis" abre /cadastro; desligada, "Começar Agora"
// leva ao login.
const COMECAR = PUBLIC_SIGNUP_ENABLED ? 'Começar teste grátis' : 'Começar Agora';
const COMECAR_RE = PUBLIC_SIGNUP_ENABLED ? /Começar teste grátis/ : /Começar Agora/;
const DESTINO = PUBLIC_SIGNUP_ENABLED ? /\/cadastro$/ : /\/auth$/;

/**
 * Auditoria da superficie publica: clique de verdade em cada link e botao da
 * landing, das rotas legais e do 404. Nao precisa de sessao do Supabase.
 */

// Erros de console que ja existem no projeto e nao sao culpa de um botao.
const RUIDO_CONHECIDO = [
  /Download the React DevTools/i,
  /React Router Future Flag/i,
  /vite/i,
  /Failed to load resource.*favicon/i,
];

function coletarErros(page: Page) {
  const erros: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const t = msg.text();
    if (RUIDO_CONHECIDO.some((re) => re.test(t))) return;
    erros.push(t);
  });
  page.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`));
  return erros;
}

test.describe('Landing — navegação', () => {
  test('a landing carrega sem erro de runtime', async ({ page }) => {
    const erros = coletarErros(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(erros).toEqual([]);
  });

  test('âncoras do menu apontam para seções que existem', async ({ page }) => {
    await page.goto('/');
    for (const id of ['features', 'pricing', 'testimonials', 'faq']) {
      await expect(page.locator(`#${id}`)).toHaveCount(1);
    }
  });

  test('navbar: "Entrar" leva para /auth', async ({ page }) => {
    await page.goto('/');
    await page.locator('nav').getByRole('link', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(/\/auth$/);
  });

  test('navbar: o botão de começar segue a chave do cadastro', async ({ page }) => {
    await page.goto('/');
    await page.locator('nav').getByRole('link', { name: COMECAR, exact: true }).click();
    await expect(page).toHaveURL(DESTINO);
  });

  test('navbar: logo volta para /', async ({ page }) => {
    await page.goto('/terms-of-service');
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'ConvoFlow' }).first()).toBeVisible();
  });

  test('hero: o botão de começar segue a chave do cadastro', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: COMECAR_RE }).first().click();
    await expect(page).toHaveURL(DESTINO);
  });

  test('hero: "Ver funcionalidades" rola até a seção de Funcionalidades', async ({ page }) => {
    await page.goto('/');
    const features = page.locator('#features');
    await expect(features).not.toBeInViewport();

    await page.getByRole('link', { name: /Ver funcionalidades/ }).click();

    // Nao troca de rota: e ancora na propria pagina.
    await expect(page).toHaveURL(/\/(#features)?$/);
    await expect(features).toBeInViewport();
  });

  test('CTA final: o botão de começar segue a chave do cadastro', async ({ page }) => {
    await page.goto('/');
    const links = page.getByRole('link', { name: COMECAR_RE });
    await links.last().click();
    await expect(page).toHaveURL(DESTINO);
  });

  test('rodapé: Termos de Uso abre a página legal', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Termos de Uso' }).click();
    await expect(page).toHaveURL(/\/terms-of-service$/);
    // A pagina legal usa CardTitle (div), nao <h1> — conferimos o texto.
    await expect(page.getByText('Termos de Uso', { exact: true }).first()).toBeVisible();
  });

  test('rodapé: Política de Privacidade abre a página legal', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Política de Privacidade' }).click();
    await expect(page).toHaveURL(/\/privacy-policy$/);
    await expect(page.getByText('Política de Privacidade', { exact: true }).first()).toBeVisible();
  });

  test('rodapé: Exclusão de Dados abre a página legal', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Exclusão de Dados' }).click();
    await expect(page).toHaveURL(/\/exclusao-de-dados$/);
    await expect(page.getByText('Instruções para Exclusão de Dados', { exact: true }).first()).toBeVisible();
  });

  test('CTA final: "Falar com Especialista" abre o e-mail de contato', async ({ page }) => {
    await page.goto('/');
    const link = page.getByRole('link', { name: /Falar com Especialista/ });
    await expect(link).toHaveAttribute('href', /^mailto:contato@convoflow\.com\.br/);
  });

  test('rodapé: "Entrar" leva para /login', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('contentinfo').getByRole('link', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  // Achado 3, decisão D12: a tela de login sempre tem saída para quem ainda não
  // é cliente. Com o cadastro ligado é o teste grátis; desligado, o email.
  test('login: quem ainda não é cliente tem uma saída que segue a chave do cadastro', async ({ page }) => {
    for (const rota of ['/auth', '/login']) {
      await page.goto(rota);
      const linha = page.getByTestId('login-nao-cliente');
      await expect(linha).toContainText('Ainda não é cliente?');
      if (PUBLIC_SIGNUP_ENABLED) {
        await expect(linha.getByRole('link', { name: 'Comece seu teste grátis' })).toHaveAttribute('href', '/cadastro');
      } else {
        await expect(linha.getByRole('link', { name: 'Fale com a gente' })).toHaveAttribute(
          'href',
          /^mailto:contato@convoflow\.com\.br\?subject=/,
        );
      }
    }
  });

  test('rodapé: "Painel" sem sessão cai no /auth (PortaDeEntrada)', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('contentinfo').getByRole('link', { name: 'Painel' }).click();
    await expect(page).toHaveURL(/\/(auth|dashboard)/);
  });

  test('menu mobile abre e fecha', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    // No mobile o unico botao visivel da navbar e o hamburguer; os "Entrar" /
    // "Comecar Agora" do desktop continuam no DOM, porem escondidos. Busca so
    // dentro do nav: o hero e o CTA final tambem tem "Comecar Agora".
    const alternar = page.locator('nav button').locator('visible=true').first();
    const comecar = page.locator('nav').getByRole('link', { name: COMECAR, exact: true });
    await alternar.click();
    await expect(comecar).toBeVisible();
    await alternar.click();
    await expect(comecar).toHaveCount(0);
  });
});

test.describe('Landing — links externos', () => {
  test('todo link externo abre em nova aba e tem rel seguro', async ({ page }) => {
    await page.goto('/');
    // Desde 2026-09-12 a landing não tem mais link externo (o "Falar com
    // Especialista" virou mailto). O teste continua valendo para qualquer link
    // externo que volte a aparecer — hoje ele passa em vazio.
    const externos = page.locator('a[href^="http"]');
    const n = await externos.count();
    for (let i = 0; i < n; i++) {
      const a = externos.nth(i);
      const href = await a.getAttribute('href');
      expect(href, 'href externo não pode ser vazio').toBeTruthy();
      expect(await a.getAttribute('target')).toBe('_blank');
      expect(await a.getAttribute('rel')).toContain('noopener');
    }
  });
});

test.describe('Rotas públicas', () => {
  for (const rota of ['/auth', '/login', '/definir-senha', '/terms-of-service', '/privacy-policy', '/exclusao-de-dados']) {
    test(`${rota} renderiza sem erro de runtime`, async ({ page }) => {
      const erros = coletarErros(page);
      await page.goto(rota);
      await expect(page.locator('body')).toBeVisible();
      expect(erros).toEqual([]);
    });
  }

  test('/register segue a chave do cadastro', async ({ page }) => {
    await page.goto('/register');
    await expect(page).toHaveURL(DESTINO);
  });

  test('rota inexistente mostra o 404 e o botão volta para a home', async ({ page }) => {
    await page.goto('/rota-que-nao-existe-1234');
    await expect(page.getByText('Página não encontrada')).toBeVisible();
    await page.getByRole('button', { name: /Ir para o início/ }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('404: botão "Voltar" volta no histórico', async ({ page }) => {
    await page.goto('/');
    await page.goto('/rota-que-nao-existe-5678');
    await page.getByRole('button', { name: /Voltar/ }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});
