import { test, expect as expectBase, type BrowserContext, type Page, type Route } from '@playwright/test';
import { installSupabaseMock, IDS } from './support/supabaseMock';
import { TOURS, type Tour } from '../src/lib/onboarding/tours';
import { CHECKLISTS } from '../src/lib/onboarding/checklist';

/**
 * TODOS os tours, para Gerente, Gestor e Atendente, passo a passo: em cada
 * balão, o elemento destacado é o do passo e está visível. É o par, no
 * navegador, do teste src/lib/onboarding/tours.test.ts ("cada cargo só recebe
 * tour cujo alvo ele enxerga"), que confere a regra sem tela.
 *
 * Como cada tour é pedido: o da boas vindas pelo "Começar"; os outros pelo
 * "Fazer agora" do passo da lista "Primeiros passos". O Gerente roda os passos
 * de Loja com uma Loja escolhida no topo, e o desvio "Escolha a Loja" com a
 * Conta em foco.
 *
 * No celular, passo que aponta para o menu vira o cartão "Abra o menu ☰", e
 * passo marcado soNoComputador vira cartão no centro (de propósito, ver
 * tours.ts); todos os outros têm de achar o elemento.
 *
 * Backend falso (e2e/support/supabaseMock.ts): nada chega ao Supabase real.
 *   npx playwright test e2e/tourPorCargo.spec.ts
 */

test.use({ serviceWorkers: 'block' });
const expect = expectBase.configure({ timeout: 20_000 });
test.describe.configure({ timeout: 240_000 });

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
  'access-control-expose-headers': '*',
};
const json = (route: Route, body: unknown) =>
  route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });

type Papel = 'gerente' | 'gestor' | 'atendente';
const ORDEM: Record<Papel, number> = { atendente: 1, gestor: 2, gerente: 3 };

/** Uma Loja filha da Conta do mock (o mock devolve kind 'store' para ela). */
const LOJA = 'tttttttt-0000-4000-8000-000000000001';

/** Lista com tudo por fazer (menos a assinatura, que não tem tela). */
const LISTA: Record<Papel, unknown> = {
  gerente: {
    papel: 'gerente', escopo: 'conta', tenant_id: IDS.tenant, lojas: 1,
    passos: { assinatura: true, dados_fiscais: false, loja: false, whatsapp: false, equipe: false, funil: false, respostas_rapidas: false, horario: false, chatbot: false },
  },
  gestor: {
    papel: 'gestor', escopo: 'loja', tenant_id: IDS.tenant,
    passos: { whatsapp: false, equipe: false, funil: false, respostas_rapidas: false, horario: false, chatbot: false },
  },
  atendente: {
    papel: 'atendente', escopo: 'pessoal', tenant_id: IDS.tenant,
    passos: { foto: false, primeira_resposta: false },
  },
};

/** Os passos da lista do cargo que têm tour (todo módulo ligado no mock). */
const passosComTour = (papel: Papel) =>
  CHECKLISTS[papel].filter(
    (p) => p.tourId && p.screen && (!p.minRole || ORDEM[papel] >= ORDEM[p.minRole as Papel]),
  );

const tour = (id: string): Tour => {
  const t = TOURS.find((x) => x.id === id);
  if (!t) throw new Error(`tour ${id} não existe`);
  return t;
};

async function abrir(context: BrowserContext, papel: Papel, { lojaEmFoco }: { lojaEmFoco: boolean }): Promise<Page> {
  await installSupabaseMock(context, papel);
  // Registrado depois do mock: roda depois dele em cada carga de página.
  if (lojaEmFoco) {
    await context.addInitScript((loja) => window.localStorage.setItem('convoflow-active-tenant', loja), LOJA);
  }
  let estado: Record<string, unknown> = {};
  await context.route(/\/rest\/v1\/user_onboarding/, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (req.method() === 'GET') {
      const objeto = (req.headers()['accept'] ?? '').includes('pgrst.object');
      return json(route, objeto ? { state: estado } : [{ state: estado }]);
    }
    const corpo = req.postDataJSON() as Record<string, unknown> | Array<Record<string, unknown>>;
    const linha = Array.isArray(corpo) ? corpo[0]! : corpo;
    estado = (linha.state as Record<string, unknown>) ?? {};
    return json(route, [linha]);
  });
  await context.route(/\/rest\/v1\/rpc\/onboarding_checklist/, (route) =>
    route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers: CORS }) : json(route, LISTA[papel]),
  );
  return context.newPage();
}

const balao = (page: Page) => page.locator('.driver-popover');

/** Percorre o tour: título de cada balão e o elemento destacado. */
async function percorrer(page: Page, t: Tour, celular: boolean) {
  for (let i = 0; i < t.steps.length; i++) {
    const s = t.steps[i]!;
    const onde = `${t.id}, passo ${i + 1} de ${t.steps.length}`;
    await expect(balao(page).locator('.driver-popover-title'), onde).toHaveText(s.title);
    if (s.target && !(celular && (s.menuItem || s.soNoComputador))) {
      const alvo = page.locator(`[data-tour="${s.target}"].driver-active-element`);
      await expect(alvo, `${onde}: o destaque não caiu em ${s.target}`).toHaveCount(1);
      await expect(alvo, `${onde}: ${s.target} não está visível`).toBeVisible();
    }
    if (celular && s.menuItem) {
      await expect(page.locator(`[data-tour="${s.target}"].driver-active-element`)).toHaveCount(0);
      await expect(balao(page).getByText(/Abra o menu ☰ no topo/)).toBeVisible();
    }
    if (celular && s.soNoComputador) {
      // Cartão no centro, de propósito: nada destacado.
      await expect(page.locator('.driver-active-element[data-tour]')).toHaveCount(0);
    }
    await balao(page).getByRole('button', { name: i === t.steps.length - 1 ? 'Entendi' : 'Próximo' }).click();
  }
  await expect(balao(page)).toBeHidden();
}

async function fazerAgora(page: Page, passo: string) {
  await page.goto('/dashboard');
  await abrirPasso(page, passo);
  await page.locator(`[data-passo="${passo}"]`).getByRole('button', { name: 'Fazer agora' }).click();
}

/** No celular a lista mostra só os 2 próximos (lote 6f, B12): abre o resto. */
async function abrirPasso(page: Page, passo: string) {
  await page.locator('#primeiros-passos-titulo').waitFor();
  if (!(await page.locator(`[data-passo="${passo}"]`).isVisible())) {
    await page.locator('[data-tour="primeiros-passos"]').getByRole('button', { name: 'Ver todos' }).click();
  }
}

const TELAS = [
  { nome: 'computador', viewport: { width: 1280, height: 800 }, celular: false },
  { nome: 'celular', viewport: { width: 390, height: 844 }, celular: true },
] as const;

for (const tela of TELAS) {
  test.describe(`tour de cada cargo no ${tela.nome}`, () => {
    for (const papel of ['gerente', 'gestor', 'atendente'] as const) {
      test(`${papel}: boas vindas e todos os passos da lista`, async ({ browser }) => {
        const context = await browser.newContext({ viewport: tela.viewport });
        const page = await abrir(context, papel, { lojaEmFoco: papel === 'gerente' });
        const vistos: string[] = [];

        await page.goto('/dashboard');
        const janela = page.getByRole('dialog', { name: 'Olá, Paulo! Que bom ter você aqui.' });
        await janela.getByRole('button', { name: 'Começar' }).click();
        const daBoasVindas = tour(papel === 'atendente' ? 'conversas' : 'primeiros-passos');
        await percorrer(page, daBoasVindas, tela.celular);
        vistos.push(daBoasVindas.id);

        for (const passo of passosComTour(papel)) {
          await fazerAgora(page, passo.id);
          const t = tour(passo.tourId!);
          await expect(page).toHaveURL(new RegExp(t.route.replace(/[?]/g, '\\?') + '$'));
          await percorrer(page, t, tela.celular);
          vistos.push(t.id);
        }

        // Nenhum tour do cargo ficou sem passar por aqui (fora o desvio do
        // Gerente com a Conta em foco, no teste abaixo).
        expect(vistos.length).toBeGreaterThan(papel === 'atendente' ? 2 : 6);
        await context.close();
      });
    }

    test('gerente com a Conta em foco: "Escolha a Loja" destaca o seletor', async ({ browser }) => {
      const context = await browser.newContext({ viewport: tela.viewport });
      const page = await abrir(context, 'gerente', { lojaEmFoco: false });
      await page.goto('/dashboard');
      await page.getByRole('dialog').getByRole('button', { name: 'Agora não' }).click();
      await abrirPasso(page, 'funil');
      await page.locator('[data-passo="funil"]').getByRole('button', { name: 'Fazer agora' }).click();
      await percorrer(page, tour('escolher-loja'), tela.celular);
      await context.close();
    });
  });
}
