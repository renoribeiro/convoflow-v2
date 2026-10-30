import { test, expect as expectBase, type Page, type Route } from '@playwright/test';
import { installSupabaseMock, IDS } from './support/supabaseMock';

/**
 * Localização pelo clipe das Conversas (lote 6f, B5, decisão D4).
 *
 * Backend falso (support/supabaseMock.ts), GPS falso (setGeolocation) e busca
 * de endereço falsa (a rota do OpenStreetMap responde daqui): nada sai para o
 * Supabase real, nem para o OpenStreetMap, nem para um WhatsApp.
 *
 * Prova, no navegador:
 *   1. o clipe abre "Arquivo" e "Localização";
 *   2. "Usar minha localização atual" usa a permissão do navegador, a
 *      confirmação mostra o que vai sair, e só "Enviar localização" chama o
 *      servidor (whatsapp-send-message, type location) e grava a linha com o
 *      ponto em metadata;
 *   3. "Digitar endereço" busca, deixa escolher entre os lugares e confirma;
 *   4. no celular a janela cabe, sem rolagem lateral.
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
const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });

const CONTATO = 'cccccccc-0000-4000-8000-000000000000';
const MSG = 'eeeeeeee-0000-4000-8000-0000000000f1';

interface Abertura {
  page: Page;
  envios: Array<Record<string, unknown>>;
  gravacoes: Array<Record<string, unknown>>;
  buscas: string[];
}

async function abrirConversa(
  browser: import('@playwright/test').Browser,
  viewport: { width: number; height: number },
): Promise<Abertura> {
  const context = await browser.newContext({
    viewport,
    geolocation: { latitude: -3.731862, longitude: -38.526669 },
    permissions: ['geolocation'],
  });
  await installSupabaseMock(context, 'gestor');
  const envios: Array<Record<string, unknown>> = [];
  const gravacoes: Array<Record<string, unknown>> = [];
  const buscas: string[] = [];

  await context.route(/\/rest\/v1\/messages(\?|$)/, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (req.method() === 'POST') {
      const corpo = req.postDataJSON() as Record<string, unknown>;
      gravacoes.push(corpo);
      return json(route, { id: 'eeeeeeee-0000-4000-8000-0000000000f2', created_at: new Date().toISOString(), ...corpo });
    }
    if (req.method() !== 'GET' || !req.url().includes('media_url')) return route.fallback();
    return json(route, [
      {
        id: MSG,
        content: 'Onde fica a loja?',
        created_at: new Date(Date.now() - 60_000).toISOString(),
        direction: 'inbound',
        status: 'delivered',
        message_type: 'text',
        media_url: null,
        metadata: null,
        contact_id: CONTATO,
        tenant_id: IDS.tenant,
        whatsapp_instance_id: IDS.instance,
        evolution_message_id: 'wamid.E2ELOJA',
        is_from_bot: false,
        source: null,
        campaign_id: null,
        ad_referral: null,
      },
    ]);
  });
  await context.route(/\/functions\/v1\/whatsapp-send-message/, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const corpo = req.postDataJSON() as Record<string, unknown>;
    // Abrir a conversa também pede a foto e a "lida": aqui só conta a localização.
    if (corpo.type === 'location') envios.push(corpo);
    return json(route, { ok: true, messageId: 'wamid.E2ELOCAL' });
  });
  await context.route(/nominatim\.openstreetmap\.org/, async (route) => {
    buscas.push(route.request().url());
    return json(route, [
      { lat: '-23.5505', lon: '-46.6333', display_name: 'Praça da Sé, São Paulo, SP, Brasil', name: 'Praça da Sé' },
      { lat: '-22.9068', lon: '-43.1729', display_name: 'Praça da Sé, Rio de Janeiro, RJ, Brasil', name: 'Praça da Sé' },
    ]);
  });

  const page = await context.newPage();
  await page.goto(`/dashboard/conversations?contact=${CONTATO}`);
  await expect(page.getByText('Onde fica a loja?')).toBeVisible();
  return { page, envios, gravacoes, buscas };
}

async function abrirLocalizacao(page: Page) {
  await page.getByRole('button', { name: 'Anexar arquivo ou localização' }).click();
  await expect(page.getByRole('menuitem', { name: 'Arquivo' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Localização' }).click();
  const janela = page.getByTestId('janela-localizacao');
  await expect(janela.getByRole('heading', { name: 'Enviar localização' })).toBeVisible();
  return janela;
}

test('minha localização: confirma o que vai sair e só então envia pelo servidor', async ({ browser }) => {
  const { page, envios, gravacoes } = await abrirConversa(browser, { width: 1280, height: 800 });
  const janela = await abrirLocalizacao(page);

  await janela.getByRole('button', { name: 'Usar minha localização atual' }).click();
  await expect(janela.getByTestId('localizacao-escolhida')).toContainText('-3.73186, -38.52667');
  await janela.getByLabel('Nome do lugar (opcional)').fill('Loja Centro');
  await janela.getByRole('button', { name: 'Continuar' }).click();

  const confirmacao = page.getByTestId('confirmacao');
  await expect(confirmacao).toContainText('Enviar esta localização?');
  await expect(page.getByTestId('confirmacao-localizacao')).toContainText('Loja Centro');
  expect(envios).toHaveLength(0);

  await confirmacao.getByRole('button', { name: 'Enviar localização' }).click();
  await expect.poll(() => envios.length).toBe(1);
  expect(envios[0]).toMatchObject({
    type: 'location',
    latitude: -3.731862,
    longitude: -38.526669,
    name: 'Loja Centro',
  });
  await expect.poll(() => gravacoes.length).toBe(1);
  expect(gravacoes[0]).toMatchObject({
    message_type: 'location',
    status: 'sent',
    evolution_message_id: 'wamid.E2ELOCAL',
    metadata: { latitude: -3.731862, longitude: -38.526669, name: 'Loja Centro' },
  });
  await expect(page.getByTestId('janela-localizacao')).toHaveCount(0);
  await page.context().close();
});

test('digitar endereço: busca uma vez, escolhe o lugar e confirma', async ({ browser }) => {
  const { page, envios, buscas } = await abrirConversa(browser, { width: 1280, height: 800 });
  const janela = await abrirLocalizacao(page);

  await janela.getByRole('tab', { name: 'Digitar endereço' }).click();
  await janela.getByLabel('Endereço', { exact: true }).fill('Praça da Sé');
  await janela.getByRole('button', { name: 'Buscar' }).click();
  await expect(janela.getByRole('group', { name: 'Escolha o lugar' })).toBeVisible();
  expect(buscas).toHaveLength(1);
  expect(new URL(buscas[0]!).searchParams.get('countrycodes')).toBe('br');

  await janela.getByRole('button', { name: /Rio de Janeiro/ }).click();
  await janela.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByTestId('confirmacao-localizacao')).toContainText('Praça da Sé, Rio de Janeiro, RJ, Brasil');
  await page.getByTestId('confirmacao').getByRole('button', { name: 'Voltar' }).click();
  await expect(page.getByTestId('janela-localizacao')).toBeVisible();
  expect(envios).toHaveLength(0);
  await page.context().close();
});

test('celular: a janela de localização cabe na tela', async ({ browser }) => {
  const { page } = await abrirConversa(browser, { width: 390, height: 844 });
  const janela = await abrirLocalizacao(page);
  await janela.getByRole('button', { name: 'Usar minha localização atual' }).click();
  await expect(janela.getByTestId('localizacao-escolhida')).toBeVisible();
  const caixa = await janela.boundingBox();
  expect(caixa!.x).toBeGreaterThanOrEqual(0);
  expect(caixa!.x + caixa!.width).toBeLessThanOrEqual(390);
  const larguras = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, janela: window.innerWidth }));
  expect(larguras.doc).toBeLessThanOrEqual(larguras.janela);
  await page.context().close();
});
