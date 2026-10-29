/**
 * Trava da troca de cargo no Admin (lote 6e, decisão D2 parcial).
 *
 * Até o redesenho da hierarquia, só Gestor e Atendente trocam entre si, dentro
 * da Loja. Gestor virando Gerente numa Loja (ou Gerente rebaixado preso à
 * Conta) mostra a frase combinada com o dono e o "Salvar Alterações" fica
 * cinza; Gestor para Atendente segue com a confirmação do lote 2.
 *
 * Backend falso (e2e/support/supabaseMock.ts): nada chega ao Supabase real.
 * Também roda contra o site publicado: E2E_BASE_URL=<site>.
 */
import { test, expect as expectBase, type BrowserContext, type Route } from '@playwright/test';
import { installSupabaseMock } from './support/supabaseMock';

test.use({ serviceWorkers: 'block' });
const expect = expectBase.configure({ timeout: 20_000 });
test.describe.configure({ timeout: 60_000 });

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
  'access-control-expose-headers': '*',
};
const json = (route: Route, body: unknown) =>
  route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });

const LOJA = 'aaaaaaaa-0000-4000-8000-0000000000a2';
const CONTA = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const FRASE = 'Essa troca de cargo ainda não está disponível. Fale com o suporte do ConvoFlow.';

const pessoa = (id: string, nome: string, role: string, tenant: string) => ({
  id,
  email: `${nome.toLowerCase()}@exemplo.com.br`,
  first_name: nome,
  last_name: 'Exemplo',
  role,
  is_active: true,
  status: 'active',
  phone: null,
  created_at: '2026-10-01T12:00:00Z',
  profile_updated_at: '2026-10-01T12:00:00Z',
  tenant_id: tenant,
});

async function abrirAdmin(context: BrowserContext) {
  await installSupabaseMock(context, 'superadmin');
  const lugares = [
    { id: CONTA, name: 'Conta Exemplo', kind: 'account', parent_tenant_id: null, subscription_status: 'active', manual_access_granted: false },
    { id: LOJA, name: 'Loja Exemplo', kind: 'store', parent_tenant_id: CONTA, subscription_status: null, manual_access_granted: false },
  ];
  const usuarios = [
    pessoa('aaaaaaaa-0000-4000-8000-0000000000b1', 'Gisele', 'gestor', LOJA),
    pessoa('aaaaaaaa-0000-4000-8000-0000000000b2', 'Gustavo', 'gerente', CONTA),
  ];
  await context.route(/\/rest\/v1\/admin_users_view/, (route) =>
    route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers: CORS }) : json(route, usuarios),
  );
  await context.route(/\/rest\/v1\/tenants/, (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const objeto = (req.headers()['accept'] ?? '').includes('pgrst.object');
    return json(route, objeto ? lugares[0] : lugares);
  });
  const page = await context.newPage();
  await page.goto('/dashboard/admin');
  await page.getByRole('tab', { name: 'Usuários' }).click();
  return page;
}

async function editarCargo(page: import('@playwright/test').Page, quem: string, cargo: string) {
  await page.getByRole('button', { name: `Editar ${quem} Exemplo` }).click();
  const janela = page.getByRole('dialog');
  await janela.getByRole('combobox').click();
  await page.getByRole('option', { name: cargo, exact: true }).click();
  return janela;
}

test('Gestor numa Loja não vira Gerente: a frase aparece e salvar fica cinza', async ({ context }) => {
  const page = await abrirAdmin(context);
  const janela = await editarCargo(page, 'Gisele', 'Gerente');
  await expect(janela.getByRole('alert')).toHaveText(FRASE);
  await expect(janela.getByRole('button', { name: 'Salvar Alterações' })).toBeDisabled();
});

test('Gerente preso à Conta não é rebaixado a Gestor', async ({ context }) => {
  const page = await abrirAdmin(context);
  const janela = await editarCargo(page, 'Gustavo', 'Gestor');
  await expect(janela.getByRole('alert')).toHaveText(FRASE);
  await expect(janela.getByRole('button', { name: 'Salvar Alterações' })).toBeDisabled();
});

test('Gestor para Atendente na mesma Loja segue liberado, com a confirmação', async ({ context }) => {
  const page = await abrirAdmin(context);
  const janela = await editarCargo(page, 'Gisele', 'Atendente');
  await expect(janela.getByText(FRASE)).toHaveCount(0);
  await janela.getByRole('button', { name: 'Salvar Alterações' }).click();
  await expect(page.getByText(/O cargo muda de Gestor para Atendente/)).toBeVisible();
});
