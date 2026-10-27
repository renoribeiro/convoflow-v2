/**
 * Senha, de ponta a ponta no navegador (backend falso, nada chega ao Supabase).
 *
 *   - /login e /auth são a MESMA tela, com o link "Esqueci minha senha".
 *     Até 2026-10-19 /login era uma tela antiga sem esse link, e é para lá que
 *     o "Entrar" do rodapé da página de vendas leva.
 *   - Configurações › Segurança troca a senha de verdade: confere a senha atual
 *     (POST /auth/v1/token?grant_type=password), troca (PUT /auth/v1/user) e
 *     encerra as OUTRAS sessões (POST /auth/v1/logout?scope=others). Antes ela
 *     só esperava 1,5 s e dizia "sucesso".
 *
 * Contra um site no ar:
 *   E2E_BASE_URL=https://www.convoflow.com.br npx playwright test e2e/senha.spec.ts
 */

import { test, expect as expectBase, type Route } from '@playwright/test';
import { installSupabaseMock, sessionFor } from './support/supabaseMock';

test.use({ serviceWorkers: 'block' });
const expect = expectBase.configure({ timeout: 20_000 });
test.describe.configure({ timeout: 60_000 });

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
  'access-control-expose-headers': '*',
};
const responder = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });

// Montada por pedaços para o próprio arquivo não acusar a grafia errada.
const GRAFIA_ERRADA = new RegExp(['Es', 'cique'].join(''), 'i');

for (const caminho of ['/login', '/auth']) {
  test(`${caminho}: tela de login com "Esqueci minha senha", que leva a /definir-senha`, async ({ context }) => {
    await installSupabaseMock(context, 'gerente', { sessao: false });
    const page = await context.newPage();
    await page.goto(caminho);

    const link = page.getByRole('link', { name: 'Esqueci minha senha' });
    await expect(link).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByText('Entre na sua conta')).toBeVisible();
    // Nada da tela antiga.
    await expect(page.getByText('Criar conta')).toHaveCount(0);
    await expect(page.getByText(GRAFIA_ERRADA)).toHaveCount(0);

    await link.click();
    await expect(page).toHaveURL(/\/definir-senha$/);
    await expect(page.getByText('Esqueci minha senha')).toBeVisible();
    await expect(page.getByText(/para você criar uma nova senha/)).toBeVisible();
  });
}

test.describe('Configurações › Segurança', () => {
  async function abrir(context: import('@playwright/test').BrowserContext) {
    await installSupabaseMock(context, 'gerente');
    const pedidos = { conferencia: [] as string[], troca: [] as string[], saida: [] as string[] };
    const sessao = sessionFor('gerente');

    // Registrado depois do mock geral: o Playwright tenta as rotas da última para a primeira.
    await context.route(/\/auth\/v1\/(token|user|logout)/, async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });

      if (url.pathname.endsWith('/token') && url.searchParams.get('grant_type') === 'password') {
        const corpo = req.postDataJSON() as { password?: string };
        pedidos.conferencia.push(corpo.password ?? '');
        if (corpo.password !== 'senhaatual12') {
          return responder(route, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
        }
        return responder(route, 200, sessao);
      }
      if (url.pathname.endsWith('/user') && req.method() === 'PUT') {
        pedidos.troca.push((req.postDataJSON() as { password?: string }).password ?? '');
        return responder(route, 200, sessao.user);
      }
      if (url.pathname.endsWith('/logout')) {
        pedidos.saida.push(url.searchParams.get('scope') ?? '(sem escopo)');
        return route.fulfill({ status: 204, headers: CORS });
      }
      return route.fallback();
    });

    const page = await context.newPage();
    await page.goto('/dashboard/settings?tab=security');
    await expect(page.getByLabel('Senha atual')).toBeVisible();
    return { page, pedidos };
  }

  test('senha atual errada: recusa, em português, e não troca nada', async ({ context }) => {
    const { page, pedidos } = await abrir(context);
    await page.getByLabel('Senha atual').fill('senhaerrada1');
    await page.getByLabel('Nova senha', { exact: true }).fill('novasenha123');
    await page.getByLabel('Repita a nova senha').fill('novasenha123');
    await page.getByRole('button', { name: 'Salvar nova senha' }).click();

    await expect(page.getByText('A senha atual não confere.')).toBeVisible();
    await expect(page.getByText(/Invalid login credentials/)).toHaveCount(0);
    expect(pedidos.conferencia).toEqual(['senhaerrada1']);
    expect(pedidos.troca).toEqual([]);
    expect(pedidos.saida).toEqual([]);
  });

  test('senha certa: troca de verdade e encerra as outras sessões', async ({ context }) => {
    const { page, pedidos } = await abrir(context);
    await page.getByLabel('Senha atual').fill('senhaatual12');
    await page.getByLabel('Nova senha', { exact: true }).fill('novasenha123');
    await page.getByLabel('Repita a nova senha').fill('novasenha123');
    await page.getByRole('button', { name: 'Salvar nova senha' }).click();

    await expect(page.getByText(/Senha trocada\. Saímos da sua conta nos outros aparelhos/)).toBeVisible();
    expect(pedidos.conferencia).toEqual(['senhaatual12']);
    expect(pedidos.troca).toEqual(['novasenha123']);
    expect(pedidos.saida).toEqual(['others']);
    // Continua logado nesta tela.
    await expect(page).toHaveURL(/\/dashboard\/settings/);
  });
});
