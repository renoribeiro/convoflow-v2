import { test, expect as expectBase, type BrowserContext, type Page, type Route } from '@playwright/test';
import { installSupabaseMock, IDS, type MockRole } from './support/supabaseMock';

/**
 * Primeiro acesso de um Gerente, um Gestor e um Atendente novos, no
 * computador e no celular: boas-vindas, lista "Primeiros passos" e os
 * destaques na tela (driver.js, carregado só quando o tour começa).
 *
 * Backend falso (e2e/support/supabaseMock.ts), com duas trocas por cima:
 *   user_onboarding           → pessoa nova (estado {}); as gravações ficam
 *                                registradas para o teste conferir.
 *   rpc onboarding_checklist  → a resposta da função para o cargo.
 *
 * COMO RODAR
 *   npx playwright test e2e/onboarding.spec.ts
 *   E2E_BASE_URL=https://<preview> E2E_STORAGE_STATE=... npx playwright test e2e/onboarding.spec.ts
 */

test.use({ serviceWorkers: 'block' });
const expect = expectBase.configure({ timeout: 20_000 });
test.describe.configure({ timeout: 90_000 });

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
  'access-control-expose-headers': '*',
};
const json = (route: Route, body: unknown) =>
  route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });

const TELAS = [
  { nome: 'computador', viewport: { width: 1280, height: 800 } },
  { nome: 'celular', viewport: { width: 390, height: 844 } },
] as const;

/** O que a função onboarding_checklist responderia para cada cargo novo. */
const LISTA: Record<'gerente' | 'gestor' | 'atendente', unknown> = {
  gerente: {
    papel: 'gerente', escopo: 'conta', tenant_id: IDS.tenant, lojas: 1,
    passos: { assinatura: true, dados_fiscais: true, loja: true, whatsapp: false, equipe: false, funil: false, respostas_rapidas: false, horario: false, chatbot: false },
  },
  gestor: {
    papel: 'gestor', escopo: 'loja', tenant_id: IDS.tenant,
    passos: { whatsapp: true, equipe: false, funil: false, respostas_rapidas: false, horario: false, chatbot: false },
  },
  atendente: {
    papel: 'atendente', escopo: 'pessoal', tenant_id: IDS.tenant,
    passos: { foto: false, notificacoes: false, primeira_resposta: false },
  },
};

interface Abertura {
  page: Page;
  gravacoes: Array<Record<string, unknown>>;
}

async function abrirNovo(
  context: BrowserContext,
  role: MockRole,
  { bloqueada = false }: { bloqueada?: boolean } = {},
): Promise<Abertura> {
  await installSupabaseMock(context, role);
  const gravacoes: Array<Record<string, unknown>> = [];
  let estado: Record<string, unknown> = {};

  // No Playwright a rota registrada por último responde primeiro.
  await context.route(/\/rest\/v1\/user_onboarding/, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (req.method() === 'GET') {
      const objeto = (req.headers()['accept'] ?? '').includes('pgrst.object');
      const linha = { state: estado };
      return json(route, objeto ? linha : [linha]);
    }
    const corpo = req.postDataJSON() as Record<string, unknown> | Array<Record<string, unknown>>;
    const linha = Array.isArray(corpo) ? corpo[0]! : corpo;
    gravacoes.push(linha);
    estado = (linha.state as Record<string, unknown>) ?? {};
    return json(route, [linha]);
  });
  if (role !== 'superadmin') {
    await context.route(/\/rest\/v1\/rpc\/onboarding_checklist/, (route) =>
      route.request().method() === 'OPTIONS'
        ? route.fulfill({ status: 204, headers: CORS })
        : json(route, LISTA[role]),
    );
  }
  if (bloqueada) {
    await context.route(/\/rest\/v1\/rpc\/tenant_access_state/, (route) =>
      route.request().method() === 'OPTIONS'
        ? route.fulfill({ status: 204, headers: CORS })
        : json(route, [{ unlocked: false, source: 'locked' }]),
    );
  }
  return { page: await context.newPage(), gravacoes };
}

const balao = (page: Page) => page.locator('.driver-popover');
const destacado = (page: Page) => page.locator('.driver-active-element');

async function semRolagemLateral(page: Page) {
  const larguras = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, janela: window.innerWidth }));
  expect(larguras.doc, 'a página rola para o lado').toBeLessThanOrEqual(larguras.janela);
}

for (const tela of TELAS) {
  test.describe(`primeiro acesso no ${tela.nome}`, () => {
    test.use({ viewport: tela.viewport });

    for (const role of ['gerente', 'gestor'] as const) {
      test(`${role} novo: boas-vindas, lista e destaque do Convidar`, async ({ browser }) => {
        const context = await browser.newContext({ viewport: tela.viewport });
        const { page, gravacoes } = await abrirNovo(context, role);
        await page.goto('/dashboard');

        const janela = page.getByRole('dialog', { name: 'Olá, Paulo! Que bom ter você aqui.' });
        await expect(janela.getByText('Olá, Paulo! Que bom ter você aqui.')).toBeVisible();
        await expect(janela.getByText(role === 'gerente' ? /Você é Gerente da Conta/ : /Você é Gestor da Loja/)).toBeVisible();
        // Por baixo da janela (o Radix esconde o resto da página dos leitores de
        // tela enquanto ela está aberta, por isso o id e não o papel).
        await expect(page.locator('#primeiros-passos-titulo')).toHaveText('Primeiros passos');

        await janela.getByRole('button', { name: 'Começar' }).click();
        await expect(janela).toBeHidden();
        await expect.poll(() => gravacoes.some((g) => typeof (g.state as Record<string, unknown>)?.boas_vindas_em === 'string')).toBe(true);

        // Tour da boas-vindas: 1) a lista, 2) onde fica a Ajuda.
        await expect(balao(page).getByText('Seus primeiros passos')).toBeVisible();
        await expect(destacado(page)).toHaveAttribute('data-tour', 'primeiros-passos');
        await balao(page).getByRole('button', { name: 'Próximo' }).click();
        await expect(balao(page).getByText('A Ajuda fica aqui')).toBeVisible();
        if (tela.nome === 'celular') {
          // Nunca aponta para o menu no celular: cartão no centro.
          await expect(balao(page).getByText(/Abra o menu ☰ no topo e toque em Ajuda\./)).toBeVisible();
          await expect(page.locator('[data-tour="menu-ajuda"].driver-active-element')).toHaveCount(0);
          const caixa = await balao(page).boundingBox();
          expect(caixa!.x).toBeGreaterThanOrEqual(0);
          expect(caixa!.x + caixa!.width).toBeLessThanOrEqual(tela.viewport.width);
        } else {
          await expect(destacado(page)).toHaveAttribute('data-tour', 'menu-ajuda');
        }
        await balao(page).getByRole('button', { name: 'Entendi' }).click();
        await expect(balao(page)).toBeHidden();
        await semRolagemLateral(page);

        // "Fazer agora" no convite: abre Equipe e destaca o botão.
        const passo = page.locator('[data-passo="equipe"]');
        await passo.getByRole('button', { name: 'Fazer agora' }).click();
        await expect(page).toHaveURL(/\/dashboard\/team$/);
        await expect(balao(page).getByText('Clique em Convidar')).toBeVisible();
        await expect(destacado(page)).toHaveAttribute('data-tour', 'equipe-convidar');

        // Clicar no botão destacado é fazer o passo: o tour sai da frente.
        await destacado(page).click();
        await expect(balao(page)).toBeHidden();
        await expect(page.getByRole('dialog', { name: 'Convidar novo usuário' })).toBeVisible(); // a janela de convite abriu

        await context.close();
      });
    }

    test('atendente novo: boas-vindas e os 4 passos de Conversas', async ({ browser }) => {
      const context = await browser.newContext({ viewport: tela.viewport });
      const { page } = await abrirNovo(context, 'atendente');
      await page.goto('/dashboard');

      const janela = page.getByRole('dialog', { name: 'Olá, Paulo! Que bom ter você aqui.' });
      await expect(janela.getByText(/Vamos mostrar a tela de Conversas em 4 passos/)).toBeVisible();
      await janela.getByRole('button', { name: 'Começar' }).click();

      await expect(page).toHaveURL(/\/dashboard\/conversations$/);
      await expect(balao(page).getByText('Suas conversas e a fila')).toBeVisible();
      await expect(balao(page).getByText('1 de 4')).toBeVisible();
      await expect(destacado(page)).toHaveAttribute('data-tour', 'conversas-filtros-rapidos');

      await balao(page).getByRole('button', { name: 'Próximo' }).click();
      await expect(balao(page).getByText('Abra uma conversa')).toBeVisible();
      await balao(page).getByRole('button', { name: 'Próximo' }).click();
      await expect(balao(page).getByText('Filtros', { exact: true })).toBeVisible();
      await balao(page).getByRole('button', { name: 'Próximo' }).click();
      await expect(balao(page).getByText('Assuma antes de responder')).toBeVisible();
      await expect(balao(page).getByText('4 de 4')).toBeVisible();
      if (tela.nome === 'computador') {
        await expect(destacado(page)).toHaveAttribute('data-tour', 'conversas-janela');
      }
      await balao(page).getByRole('button', { name: 'Entendi' }).click();
      await expect(balao(page)).toBeHidden();

      // De volta ao Dashboard: a lista pessoal, sem a boas-vindas de novo.
      await page.goto('/dashboard');
      await expect(page.getByRole('heading', { name: 'Primeiros passos' })).toBeVisible();
      await expect(page.locator('[data-passo="foto"]')).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await semRolagemLateral(page);

      await context.close();
    });
  });
}

test('Conta bloqueada: nada aparece, só a tela de bloqueio', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const { page } = await abrirNovo(context, 'gerente', { bloqueada: true });
  await page.goto('/dashboard');
  await expect(page.getByText(/Assinar agora|Começar teste grátis/).first()).toBeVisible();
  await expect(page.getByText('Olá, Paulo! Que bom ter você aqui.')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Primeiros passos' })).toHaveCount(0);
  await expect(balao(page)).toHaveCount(0);
  await context.close();
});

test('Ver tutorial de novo: zera e a boas-vindas volta no Dashboard', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  // Veterano (padrão do mock), mas com a gravação liberada pela troca abaixo.
  await installSupabaseMock(context, 'gestor');
  const gravacoes: Array<Record<string, unknown>> = [];
  let estado: Record<string, unknown> = { v: 1, boas_vindas_em: '2026-10-21T12:00:00Z', veterano: true };
  await context.route(/\/rest\/v1\/user_onboarding/, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (req.method() === 'GET') return json(route, { state: estado });
    const corpo = req.postDataJSON() as Record<string, unknown>;
    gravacoes.push(corpo);
    estado = corpo.state as Record<string, unknown>;
    return json(route, [corpo]);
  });
  const page = await context.newPage();

  await page.goto('/dashboard/help');
  await expect(page.getByRole('heading', { name: 'Ajuda' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Ver tutorial de novo' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('dialog').getByText('Olá, Paulo! Que bom ter você aqui.')).toBeVisible();
  expect(gravacoes.at(-1)?.state).toEqual({});
  await context.close();
});
