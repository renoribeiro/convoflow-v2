import { test, expect as expectBase, type Browser, type Page, type Route } from '@playwright/test';
import { installSupabaseMock, IDS, type MockRole } from './support/supabaseMock';

/**
 * O nome do número no servidor de conexão (2026-11-04, decisão do dono).
 *
 * Backend falso (support/supabaseMock.ts) com três números: um Evolution, um
 * WAHA e um da API oficial. As linhas chegam de propósito com servidor e
 * chave inventados, como se o banco os devolvesse: a tela não pode mostrar.
 *
 * Prova, no navegador:
 *   1. o cartão diz o tipo de conexão e, no Evolution e no WAHA, "Nome no
 *      servidor: ..." com botão de copiar; a API oficial não tem essa linha;
 *   2. Detalhes e QR Code mostram o nome no servidor; nenhum segredo aparece;
 *   3. na janela de conectar, o nome no servidor nasce do nome digitado, e
 *      Cancelar não cria nada;
 *   4. na busca rápida (Ctrl+K) o Gestor vê o nome no servidor; o Atendente não.
 */

test.use({ serviceWorkers: 'block' });
const expect = expectBase.configure({ timeout: 20_000 });
test.describe.configure({ timeout: 120_000 });

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
  'access-control-expose-headers': '*',
};

const SEGREDOS = ['evo-FAKE.exemplo.com.br', 'chave-FAKE-que-nao-aparece', 'outra-chave-FAKE'];

const comSegredo = {
  evolution_api_url: 'https://evo-FAKE.exemplo.com.br',
  evolution_api_key: 'outra-chave-FAKE',
  connection_config: { baseUrl: 'https://evo-FAKE.exemplo.com.br', apiKey: 'chave-FAKE-que-nao-aparece' },
};

const base = {
  tenant_id: IDS.tenant,
  profile_name: null,
  profile_picture_url: null,
  is_active: true,
  last_connected_at: null,
  created_at: '2026-11-01T12:00:00Z',
  updated_at: '2026-11-01T12:00:00Z',
  assigned_profile_id: null,
  webhook_url: null,
  webhook_configured: true,
};

const NUMEROS = [
  { ...base, ...comSegredo, id: 'aaaaaaaa-0000-4000-8000-0000000000c1', name: 'WhatsApp Vendas', instance_key: 'whatsapp_vendas_k3f9', phone_number: '5585999990201', status: 'disconnected', provider: 'evolution' },
  { ...base, ...comSegredo, id: 'aaaaaaaa-0000-4000-8000-0000000000c2', name: 'Suporte', instance_key: 'suporte_loja', phone_number: '5585999990202', status: 'connected', provider: 'waha', cfg_sessionName: 'suporte_loja' },
  { ...base, id: 'aaaaaaaa-0000-4000-8000-0000000000c3', name: 'Oficial', instance_key: '100000000000099', phone_number: '5585999990203', status: 'connected', provider: 'official', cfg_phoneNumberId: '100000000000099', cfg_wabaId: '200000000000099' },
];

interface Painel {
  page: Page;
  criacoes: string[];
}

async function abrir(browser: Browser, role: MockRole, caminho: string): Promise<Painel> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await installSupabaseMock(context, role);
  if (role !== 'atendente') await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const criacoes: string[] = [];

  await context.route(/\/rest\/v1\/whatsapp_instances(\?|$)/, async (route: Route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const um = (req.headers()['accept'] ?? '').includes('pgrst.object');
    return route.fulfill({
      status: 200,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify(um ? NUMEROS[0] : NUMEROS),
    });
  });
  await context.route(/\/functions\/v1\/(evolution-provision|waha-provision)/, async (route: Route) => {
    if (route.request().method() !== 'OPTIONS') criacoes.push(route.request().url());
    return route.fulfill({ status: 500, headers: CORS, body: '{}' });
  });

  const page = await context.newPage();
  await page.goto(caminho);
  return { page, criacoes };
}

async function semSegredo(page: Page) {
  const html = await page.content();
  for (const s of SEGREDOS) expect(html, `a tela mostrou ${s}`).not.toContain(s);
}

const cartao = (page: Page, nome: string) =>
  page.locator('div.p-4.border.rounded-lg').filter({ has: page.getByRole('heading', { name: nome, exact: true }) });

test('cartão: tipo de conexão, nome no servidor com copiar, e nada secreto', async ({ browser }) => {
  const { page } = await abrir(browser, 'gerente', '/dashboard/whatsapp-numbers');

  const evo = cartao(page, 'WhatsApp Vendas');
  await expect(evo.getByText('QR Code (Evolution)')).toBeVisible();
  await expect(evo.getByTestId('nome-no-servidor')).toHaveText(/Nome no servidor:\s*whatsapp_vendas_k3f9/);

  const waha = cartao(page, 'Suporte');
  await expect(waha.getByText('Seu servidor (WAHA)')).toBeVisible();
  await expect(waha.getByTestId('nome-no-servidor')).toHaveText(/Nome no servidor:\s*suporte_loja/);

  const oficial = cartao(page, 'Oficial');
  await expect(oficial.getByText('API oficial da Meta')).toBeVisible();
  await expect(oficial.getByTestId('nome-no-servidor')).toHaveCount(0);

  await evo.getByRole('button', { name: 'Copiar o nome no servidor' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('whatsapp_vendas_k3f9');

  await semSegredo(page);
});

test('Detalhes e QR Code mostram o nome no servidor, sem os rótulos velhos', async ({ browser }) => {
  const { page } = await abrir(browser, 'gestor', '/dashboard/whatsapp-numbers');
  const evo = cartao(page, 'WhatsApp Vendas');

  await evo.getByRole('button', { name: 'Detalhes e chave' }).click();
  const detalhes = page.getByRole('dialog');
  await expect(detalhes.getByText('Nome no servidor de conexão')).toBeVisible();
  await expect(detalhes.getByTestId('nome-no-servidor-valor')).toHaveText('whatsapp_vendas_k3f9');
  await expect(detalhes).not.toContainText('Código interno');
  await semSegredo(page);
  await page.keyboard.press('Escape');
  await expect(detalhes).toHaveCount(0);

  await evo.getByRole('button', { name: 'Conectar pelo QR Code' }).click();
  const qr = page.getByRole('dialog');
  await expect(qr).toContainText('WhatsApp Vendas');
  await expect(qr.getByTestId('nome-no-servidor')).toHaveText(/Nome no servidor:\s*whatsapp_vendas_k3f9/);
  await semSegredo(page);
});

test('conectar pelo QR Code: o nome no servidor nasce do nome digitado; Cancelar não cria nada', async ({ browser }) => {
  const { page, criacoes } = await abrir(browser, 'gestor', '/dashboard/whatsapp-numbers');
  await page.getByRole('button', { name: 'Conectar número' }).click();
  const janela = page.getByRole('dialog');
  await janela.getByText('Conectar pelo QR Code').click();
  await janela.getByRole('button', { name: 'Continuar' }).click();

  await janela.getByLabel(/Nome do número/).fill('WhatsApp Vendas Centro');
  await expect(janela.getByTestId('nome-no-servidor-gerado')).toHaveText(
    /Nome no servidor de conexão: whatsapp_vendas_centro_[a-z0-9]{4}/,
  );

  await janela.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(criacoes).toEqual([]);
});

for (const [role, ve] of [['gestor', true], ['atendente', false]] as const) {
  test(`busca rápida: ${role} ${ve ? 'vê' : 'não vê'} o nome no servidor`, async ({ browser }) => {
    const { page } = await abrir(browser, role, '/dashboard');
    await page.locator('[data-testid="carregando-pagina"]').first().waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {});
    await page.keyboard.press('Control+k');
    const busca = page.getByRole('dialog');
    await expect(busca.getByText('WhatsApp Vendas', { exact: true })).toBeVisible();
    const linha = busca.getByText(/Nome no servidor: whatsapp_vendas_k3f9/);
    if (ve) await expect(linha).toBeVisible();
    else await expect(linha).toHaveCount(0);
    await semSegredo(page);
  });
}
