import { test, expect as expectBase, type Route } from '@playwright/test';
import { installSupabaseMock, IDS } from './support/supabaseMock';

/**
 * Mídia das Conversas pelo link temporário (bucket privado, 2026-10-23).
 *
 * O backend é falso (support/supabaseMock.ts): nada chega ao Supabase real. O
 * que este spec prova num navegador de verdade, contra o build que está no ar:
 *   1. a conversa pede os links à função media-links numa chamada só, com os
 *      ids das mensagens que têm arquivo (nunca as de texto);
 *   2. a foto CARREGA pelo link assinado e o áudio usa o link assinado;
 *   3. o "Baixar" da foto ampliada vem com &download=;
 *   4. o caminho gravado nunca vira endereço direto, e nada pede
 *      /object/public/ (a URL que deixa de abrir com o bucket privado).
 *
 * Contra o site no ar:
 *   E2E_BASE_URL=https://www.convoflow.com.br npx playwright test e2e/midia.spec.ts
 */

test.use({ serviceWorkers: 'block' });
const expect = expectBase.configure({ timeout: 20_000 });
test.describe.configure({ timeout: 60_000 });

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
  'access-control-expose-headers': '*',
};
// PNG de 1x1: o bastante para o navegador decodificar e dar naturalWidth > 0.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const CONTATO = 'cccccccc-0000-4000-8000-000000000000';
const FOTO = 'eeeeeeee-0000-4000-8000-0000000000e1';
const AUDIO = 'eeeeeeee-0000-4000-8000-0000000000e2';
const TEXTO = 'eeeeeeee-0000-4000-8000-0000000000e3';
const CAMINHO_FOTO = `${IDS.tenant}/inbound/wamid.E2EFOTO.jpg`;
const CAMINHO_AUDIO = `${IDS.tenant}/inbound/wamid.E2EAUDIO.ogg`;
const assinado = (origem: string, caminho: string) =>
  `${origem}/storage/v1/object/sign/whatsapp-media/${caminho}?token=e2e-falso`;

const mensagem = (id: string, extra: Record<string, unknown>) => ({
  id,
  content: '',
  created_at: new Date(Date.now() - 60_000).toISOString(),
  direction: 'inbound',
  status: 'delivered',
  message_type: 'text',
  media_url: null,
  contact_id: CONTATO,
  tenant_id: IDS.tenant,
  whatsapp_instance_id: IDS.instance,
  evolution_message_id: `wamid.${id.slice(-3)}`,
  is_from_bot: false,
  source: null,
  campaign_id: null,
  ad_referral: null,
  ...extra,
});

test('a conversa abre foto e áudio pelo link temporário, num pedido só', async ({ context }) => {
  await installSupabaseMock(context, 'atendente');

  // Registrados DEPOIS do mock: no Playwright, a rota mais nova responde primeiro.
  await context.route(/\/rest\/v1\/messages(\?|$)/, async (route: Route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (req.method() !== 'GET' || !req.url().includes('media_url')) return route.fallback();
    return route.fulfill({
      status: 200,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify([
        mensagem(TEXTO, { content: 'Segue a foto e o áudio', message_type: 'text' }),
        mensagem(FOTO, { message_type: 'image', media_url: CAMINHO_FOTO, evolution_message_id: 'wamid.E2EFOTO' }),
        mensagem(AUDIO, { message_type: 'audio', media_url: CAMINHO_AUDIO, evolution_message_id: 'wamid.E2EAUDIO' }),
      ]),
    });
  });

  const pedidosDeLink: string[][] = [];
  let origemDoProjeto = '';
  await context.route(/\/functions\/v1\/media-links/, async (route: Route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const url = new URL(req.url());
    origemDoProjeto = url.origin;
    const ids = (req.postDataJSON() as { message_ids: string[] }).message_ids;
    pedidosDeLink.push(ids);
    const caminhos: Record<string, string> = { [FOTO]: CAMINHO_FOTO, [AUDIO]: CAMINHO_AUDIO };
    const links = Object.fromEntries(ids.filter((id) => caminhos[id]).map((id) => [id, assinado(url.origin, caminhos[id])]));
    return route.fulfill({
      status: 200,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify({ links, expires_in: 3600 }),
    });
  });

  const pedidosAoStorage: string[] = [];
  await context.route(/\/storage\/v1\/object\//, async (route: Route) => {
    const url = route.request().url();
    pedidosAoStorage.push(url);
    if (!url.includes('/object/sign/whatsapp-media/') || !url.includes('token=e2e-falso')) return route.abort();
    const ehAudio = url.includes('.ogg');
    return route.fulfill({
      status: 200,
      headers: { ...CORS, 'content-type': ehAudio ? 'audio/ogg' : 'image/png' },
      body: ehAudio ? Buffer.from('OggS') : PNG_1X1,
    });
  });
  const pedidosCrus: string[] = [];
  context.on('request', (r) => {
    if (r.url().includes('wamid.E2E') && !r.url().includes('/object/sign/')) pedidosCrus.push(r.url());
  });

  const page = await context.newPage();
  await page.goto(`/dashboard/conversations?contact=${CONTATO}`);

  // Pelo endereço, não pelo alt: a legenda vazia vira alt="" (imagem decorativa).
  const foto = page.locator('img[src*="wamid.E2EFOTO"]');
  await expect(foto).toHaveCount(1);
  await expect.poll(() => pedidosDeLink.length).toBeGreaterThan(0);
  const src = await foto.getAttribute('src');
  expect(src).toBe(assinado(origemDoProjeto, CAMINHO_FOTO));
  // A imagem veio de fato pelo link assinado (o navegador decodificou o PNG).
  await expect.poll(() => foto.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

  const audio = page.locator('audio');
  await expect(audio).toHaveAttribute('src', assinado(origemDoProjeto, CAMINHO_AUDIO));
  await expect(page.getByLabel('Mensagem de voz')).toBeVisible();

  // Um pedido só, com as duas mídias e sem a mensagem de texto.
  expect(pedidosDeLink[0]?.slice().sort()).toEqual([FOTO, AUDIO].sort());

  // "Baixar" da foto ampliada: o mesmo link, como anexo.
  await foto.click();
  await expect(page.getByRole('link', { name: /Baixar/ })).toHaveAttribute(
    'href',
    `${assinado(origemDoProjeto, CAMINHO_FOTO)}&download=`,
  );

  // A conversa atualiza a cada 10 s; o link guardado não é pedido de novo.
  await page.waitForTimeout(11_000);
  expect(pedidosDeLink).toHaveLength(1);
  expect(pedidosAoStorage.filter((u) => u.includes('/object/public/'))).toEqual([]);
  expect(pedidosCrus).toEqual([]);
});
