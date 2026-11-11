import { test, expect as expectBase, type Browser, type Page, type Route } from '@playwright/test';
import { installSupabaseMock, IDS } from './support/supabaseMock';

/**
 * Ícone de chave "Registrar o número na API Oficial" (2026-11-11).
 *
 * Backend falso (support/supabaseMock.ts) com um número da API oficial e
 * register-meta-number respondendo como o servidor responde. Prova, no
 * navegador:
 *   1. número que veio de outra empresa, sem PIN conhecido: o servidor pede o
 *      PIN (409) e a caixa "Informe o PIN do número" ABRE com a explicação do
 *      servidor. Até 2026-11-11 o 409 virava "Não foi possível falar com o
 *      servidor" e a caixa nunca abria;
 *   2. PIN recusado: a caixa continua aberta com a frase nova;
 *   3. PIN aceito: "Número registrado", a caixa fecha e "Guarde o PIN" NÃO
 *      aparece (o PIN é da pessoa, não do ConvoFlow);
 *   4. número novo: o PIN que o ConvoFlow criou aparece em "Guarde o PIN".
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

const OFICIAL = {
  id: 'aaaaaaaa-0000-4000-8000-0000000000d1',
  tenant_id: IDS.tenant,
  name: 'Oficial da Loja',
  instance_key: '100000000000077',
  phone_number: '5585999990301',
  status: 'connected',
  provider: 'official',
  profile_name: null,
  profile_picture_url: null,
  is_active: true,
  last_connected_at: null,
  created_at: '2026-11-01T12:00:00Z',
  updated_at: '2026-11-01T12:00:00Z',
  assigned_profile_id: null,
  webhook_url: null,
  webhook_configured: true,
  cfg_phoneNumberId: '100000000000077',
  cfg_wabaId: '200000000000077',
};

const PIN_DESCONHECIDO =
  'Este número já funcionava em outra empresa quando foi conectado, e o ConvoFlow não sabe o PIN de verificação em duas etapas dele.';

type Resposta = { status: number; body: Record<string, unknown> };

async function abrir(browser: Browser, respostas: (pin: string | undefined) => Resposta) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await installSupabaseMock(context, 'gestor');
  const pinsMandados: Array<string | undefined> = [];

  await context.route(/\/rest\/v1\/whatsapp_instances(\?|$)/, async (route: Route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const um = (req.headers()['accept'] ?? '').includes('pgrst.object');
    return route.fulfill({
      status: 200,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify(um ? OFICIAL : [OFICIAL]),
    });
  });
  await context.route(/\/functions\/v1\/register-meta-number/, async (route: Route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const pin = (req.postDataJSON() as { pin?: string } | null)?.pin;
    pinsMandados.push(pin);
    const r = respostas(pin);
    return route.fulfill({
      status: r.status,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify(r.body),
    });
  });

  const page = await context.newPage();
  await page.goto('/dashboard/whatsapp-numbers');
  return { page, pinsMandados };
}

const registrar = (page: Page) =>
  page.getByRole('button', { name: 'Registrar o número na API Oficial' }).click();

test('número de outra empresa: a caixa do PIN abre com a explicação; PIN recusado mantém aberta; aceito fecha sem "Guarde o PIN"', async ({ browser }) => {
  const { page, pinsMandados } = await abrir(browser, (pin) => {
    if (!pin) return { status: 409, body: { success: false, pin_required: true, pin_desconhecido: true, error: PIN_DESCONHECIDO } };
    if (pin === '111111') {
      return { status: 409, body: { success: false, pin_required: true, error: 'A Meta não aceitou esse PIN. Confira os 6 números com quem cuida do número e tente de novo.' } };
    }
    return { status: 200, body: { success: true, registered: true } };
  });

  await registrar(page);
  const caixa = page.getByRole('dialog').filter({ hasText: 'Informe o PIN do número' });
  await expect(caixa).toBeVisible();
  await expect(caixa.getByTestId('pin-motivo')).toContainText('outra empresa');
  await expect(page.getByText('Não foi possível falar com o servidor')).toHaveCount(0);

  await caixa.getByLabel('PIN (6 dígitos)').fill('111111');
  await caixa.getByRole('button', { name: 'Registrar número' }).click();
  await expect(caixa.getByTestId('pin-motivo')).toContainText('não aceitou esse PIN');
  await expect(caixa).toBeVisible();

  await caixa.getByLabel('PIN (6 dígitos)').fill('123456');
  await caixa.getByRole('button', { name: 'Registrar número' }).click();
  await expect(caixa).toHaveCount(0);
  await expect(page.getByText('Número registrado', { exact: true })).toBeVisible();
  await expect(page.getByTestId('pin-gerado')).toHaveCount(0);

  expect(pinsMandados).toEqual([undefined, '111111', '123456']);
});

test('número novo: o PIN que o ConvoFlow criou aparece em "Guarde o PIN"', async ({ browser }) => {
  const { page } = await abrir(browser, () => ({ status: 200, body: { success: true, registered: true, pin: '654321' } }));

  await registrar(page);
  const guarde = page.getByTestId('pin-gerado');
  await expect(guarde).toBeVisible();
  await expect(guarde.getByLabel('PIN', { exact: true })).toHaveValue('654321');
  await guarde.getByRole('button', { name: 'Já guardei o PIN' }).click();
  await expect(guarde).toHaveCount(0);
});
