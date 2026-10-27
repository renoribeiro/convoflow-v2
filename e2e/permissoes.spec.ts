import { test, expect as expectBase, type BrowserContext, type Page, type Request, type Route } from '@playwright/test';
import { installSupabaseMock, IDS, type MockRole } from './support/supabaseMock';

/**
 * Lote 2 do checkup de usabilidade (2026-10-26), no navegador:
 *  1. o menu de cada cargo mostra só o que o cargo usa (registro único de
 *     telas, src/lib/access/telas.ts, sobre a matriz de capacidades);
 *  2. abrir pelo endereço uma tela proibida mostra "Você não tem acesso a esta
 *     tela", no mesmo endereço;
 *  3. cada ação destrutiva abre a confirmação, e Cancelar não grava nada.
 *
 * Backend falso (e2e/support/supabaseMock.ts): nada chega ao Supabase.
 *
 * COMO RODAR
 *   npx playwright test e2e/permissoes.spec.ts
 */

test.use({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
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

/** Responde a uma tabela do PostgREST com as linhas dadas (lista ou objeto). */
async function tabela(context: BrowserContext, nome: string, linhas: Array<Record<string, unknown>>) {
  await context.route(new RegExp(`/rest/v1/${nome}(\\?|$)`), (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (req.method() !== 'GET') return route.fallback();
    const objeto = (req.headers()['accept'] ?? '').includes('pgrst.object');
    return json(route, objeto ? linhas[0] ?? null : linhas);
  });
}

async function abrir(context: BrowserContext, papel: MockRole, caminho: string): Promise<Page> {
  await installSupabaseMock(context, papel);
  const page = await context.newPage();
  await page.goto(caminho);
  return page;
}

/** O que a página tentou gravar a partir de agora (o que não é leitura). */
function gravacoes(page: Page) {
  const lista: string[] = [];
  const ouvir = (r: Request) => {
    const url = r.url();
    const m = r.method();
    if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return;
    if (!/\/(rest|functions)\/v1\//.test(url)) return;
    // Leituras que o painel faz por POST o tempo todo (rpc de consulta).
    if (/\/rest\/v1\/rpc\/(tenant_access_state|maintenance_state|onboarding_checklist|current_user_role|get_current_user_role|tenant_team_directory|conversation_rotation_get|loja_message_counts|api_addon_estado|api_chaves_listar)/.test(url)) return;
    if (/\/rest\/v1\/user_onboarding/.test(url)) return;
    lista.push(`${m} ${url.replace(/^https?:\/\/[^/]+/, '').split('?')[0]}`);
  };
  page.on('request', ouvir);
  return { lista, parar: () => page.off('request', ouvir) };
}

const janela = (page: Page) => page.getByTestId('confirmacao');

// ---------------------------------------------------------------------------
// 1. Menu por cargo
// ---------------------------------------------------------------------------
const MENU: Record<MockRole, { tem: string[]; naoTem: string[] }> = {
  atendente: {
    tem: ['/dashboard', '/dashboard/conversations', '/dashboard/contacts', '/dashboard/funnel', '/dashboard/campaigns', '/dashboard/templates', '/dashboard/settings', '/dashboard/help'],
    naoTem: ['/dashboard/whatsapp-numbers', '/dashboard/team', '/dashboard/store-comparison', '/dashboard/admin'],
  },
  gestor: {
    tem: ['/dashboard/whatsapp-numbers', '/dashboard/team', '/dashboard/campaigns', '/dashboard/conversations'],
    naoTem: ['/dashboard/store-comparison', '/dashboard/admin'],
  },
  gerente: {
    tem: ['/dashboard/whatsapp-numbers', '/dashboard/team', '/dashboard/store-comparison', '/dashboard/campaigns'],
    naoTem: ['/dashboard/admin'],
  },
  superadmin: {
    tem: ['/dashboard/admin', '/dashboard/whatsapp-numbers'],
    naoTem: ['/dashboard/team', '/dashboard/store-comparison'],
  },
};

test.describe('menu por cargo', () => {
  for (const papel of ['atendente', 'gestor', 'gerente', 'superadmin'] as MockRole[]) {
    test(`${papel}: o menu mostra só o que o cargo usa`, async ({ context }) => {
      const page = await abrir(context, papel, '/dashboard');
      const menu = page.locator('nav').filter({ has: page.locator('a[href="/dashboard/help"]') }).first();
      await expect(menu.locator('a[href="/dashboard/help"]')).toBeVisible();
      for (const href of MENU[papel].tem) await expect(menu.locator(`a[href="${href}"]`), href).toHaveCount(1);
      for (const href of MENU[papel].naoTem) await expect(menu.locator(`a[href="${href}"]`), href).toHaveCount(0);
    });
  }
});

// ---------------------------------------------------------------------------
// 2. Endereço proibido
// ---------------------------------------------------------------------------
test.describe('tela proibida pelo endereço', () => {
  for (const [papel, caminho, quem] of [
    ['atendente', '/dashboard/whatsapp-numbers', /Gestor da sua Loja/],
    ['gestor', '/dashboard/store-comparison', /Gerente da sua Conta/],
    ['gerente', '/dashboard/admin', /contato@convoflow\.com\.br/],
  ] as const) {
    test(`${papel} em ${caminho}: "Você não tem acesso a esta tela" e a quem pedir`, async ({ context }) => {
      const page = await abrir(context, papel, caminho);
      await expect(page.getByTestId('sem-acesso')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Você não tem acesso a esta tela' })).toBeVisible();
      await expect(page.getByText(quem)).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`${caminho.replace(/\//g, '\\/')}$`));
      await page.getByRole('link', { name: 'Voltar ao Dashboard' }).click();
      await expect(page).toHaveURL(/\/dashboard$/);
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Ações destrutivas: abrem a confirmação, e Cancelar não grava nada
// ---------------------------------------------------------------------------
test.describe('confirmação antes de agir', () => {
  test('Disparar agora (campanha): mostra para quantos contatos e Cancelar não dispara', async ({ context }) => {
    await installSupabaseMock(context, 'gerente');
    await tabela(context, 'mass_message_campaigns', [{
      id: 'aaaaaaaa-0000-4000-8000-000000000101', tenant_id: IDS.tenant, name: 'Promoção de outubro', status: 'active',
      message_type: 'text', total_recipients: 1240, sent_count: 0, delivered_count: 0, read_count: 0,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      whatsapp_instance: { id: IDS.instance, name: 'Atendimento 1' },
    }]);
    const page = await context.newPage();
    await page.goto('/dashboard/campaigns');
    await page.getByRole('button', { name: 'Disparar agora' }).first().click();
    await expect(janela(page)).toBeVisible();
    await expect(janela(page).getByRole('button', { name: /Disparar para 1\.240 contatos/ })).toBeVisible();
    const g = gravacoes(page);
    await janela(page).getByRole('button', { name: 'Cancelar' }).click();
    await expect(janela(page)).toBeHidden();
    await page.waitForTimeout(500);
    g.parar();
    expect(g.lista.filter((x) => /schedule_campaign_messages|mass_message_campaigns/.test(x))).toEqual([]);
  });

  test('atendente não vê Nova Campanha nem Disparar agora', async ({ context }) => {
    await installSupabaseMock(context, 'atendente');
    await tabela(context, 'mass_message_campaigns', [{
      id: 'aaaaaaaa-0000-4000-8000-000000000102', tenant_id: IDS.tenant, name: 'Promoção de outubro', status: 'active',
      message_type: 'text', total_recipients: 10, sent_count: 0, delivered_count: 0, read_count: 0,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }]);
    const page = await context.newPage();
    await page.goto('/dashboard/campaigns');
    await expect(page.getByText('Promoção de outubro')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nova Campanha' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Disparar agora' })).toHaveCount(0);
  });

  test('Desconectar número: confirmação, e Cancelar não desconecta', async ({ context }) => {
    await installSupabaseMock(context, 'gerente');
    await tabela(context, 'whatsapp_instances', [{
      id: IDS.instance, tenant_id: IDS.tenant, name: 'Atendimento 1', instance_key: 'atendimento-1', provider: 'evolution',
      status: 'open', is_active: true, phone_number: '+55 11 99999-9999', connection_config: {},
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }]);
    const page = await context.newPage();
    await page.goto('/dashboard/whatsapp-numbers');
    await page.getByRole('button', { name: 'Desconectar' }).first().click();
    await expect(janela(page)).toBeVisible();
    await expect(janela(page)).toContainText('Atendimento 1');
    await expect(janela(page).getByRole('button', { name: 'Desconectar número' })).toBeVisible();
    const g = gravacoes(page);
    const externos: string[] = [];
    page.on('request', (r) => { if (/disconnect|logout/i.test(r.url())) externos.push(r.url()); });
    await janela(page).getByRole('button', { name: 'Cancelar' }).click();
    await expect(janela(page)).toBeHidden();
    await page.waitForTimeout(500);
    g.parar();
    expect(g.lista.filter((x) => /whatsapp_instances/.test(x))).toEqual([]);
    expect(externos).toEqual([]);
  });

  test('Suspender pessoa (Equipe): confirmação, e Cancelar não suspende', async ({ context }) => {
    const page = await abrir(context, 'gerente', '/dashboard/team');
    await page.getByRole('button', { name: /^Ações de / }).first().click();
    await page.getByRole('menuitem', { name: 'Suspender' }).click();
    await expect(janela(page)).toBeVisible();
    await expect(janela(page)).toContainText('perde o acesso agora');
    const g = gravacoes(page);
    await janela(page).getByRole('button', { name: 'Cancelar' }).click();
    await expect(janela(page)).toBeHidden();
    await page.waitForTimeout(500);
    g.parar();
    expect(g.lista.filter((x) => /manage-user|profiles/.test(x))).toEqual([]);
  });

  test('Apagar etapa com contatos: explica para onde levar os contatos e não apaga', async ({ context }) => {
    const page = await abrir(context, 'gestor', '/dashboard/funnel');
    await page.getByRole('button', { name: 'Configurar etapas' }).click();
    const g = gravacoes(page);
    await page.getByRole('button', { name: /^Apagar a etapa / }).first().click();
    await expect(janela(page)).toBeVisible();
    // O backend falso conta 37 contatos na etapa.
    await expect(janela(page)).toContainText('37 contatos');
    await expect(janela(page)).toContainText('arraste cada cartão');
    await expect(janela(page).getByRole('button', { name: 'Apagar etapa' })).toHaveCount(0);
    await janela(page).getByRole('button', { name: 'Entendi' }).click();
    await expect(janela(page)).toBeHidden();
    await page.waitForTimeout(500);
    g.parar();
    expect(g.lista.filter((x) => /funnel_stages/.test(x))).toEqual([]);
  });

  test('Contratar lojas extras: mostra o total por mês, e Cancelar não cobra', async ({ context }) => {
    const page = await abrir(context, 'gerente', '/dashboard/settings?tab=subscription');
    await page.getByRole('button', { name: /^Contratar 1 Loja por/ }).click();
    await expect(janela(page)).toBeVisible();
    await expect(janela(page).getByRole('button', { name: 'Contratar 1 Loja por R$ 99,90/mês' })).toBeVisible();
    const g = gravacoes(page);
    await janela(page).getByRole('button', { name: 'Cancelar' }).click();
    await expect(janela(page)).toBeHidden();
    await page.waitForTimeout(500);
    g.parar();
    expect(g.lista.filter((x) => /update-store-slots|create-checkout-session/.test(x))).toEqual([]);
  });

  test('Revogar acesso de uma Conta: exige digitar o nome, e Cancelar não revoga', async ({ context }) => {
    const page = await abrir(context, 'superadmin', '/dashboard/admin');
    await page.getByRole('tab', { name: 'Usuários' }).click();
    await page.getByRole('button', { name: 'Revogar Acesso' }).first().click();
    await expect(janela(page)).toBeVisible();
    await expect(janela(page).getByLabel(/Para confirmar, digite/)).toBeVisible();
    await expect(janela(page).getByRole('button', { name: 'Revogar acesso' })).toBeDisabled();
    const g = gravacoes(page);
    await janela(page).getByRole('button', { name: 'Cancelar' }).click();
    await expect(janela(page)).toBeHidden();
    await page.waitForTimeout(500);
    g.parar();
    expect(g.lista.filter((x) => /tenants|tenant_access_events/.test(x))).toEqual([]);
  });
});
