import { test, expect as expectBase, type BrowserContext, type Route } from '@playwright/test';
import { IDS, installSupabaseMock, type MockRole } from './support/supabaseMock';

/**
 * Complemento "API e integrações" no navegador de verdade, com a chave do site
 * LIGADA: o cartão da Assinatura com o preço e a confirmação, a aba "Chaves de
 * API" (criar chave, mídia só com histórico, chave mostrada uma vez), o
 * interruptor do superadmin numa Conta de acesso manual, a página /api e a
 * entrada da Ajuda.
 *
 * O backend é o falso de e2e/support/supabaseMock.ts; as chamadas da API
 * (rpc e update-api-addon) são respondidas aqui. Nada sai para o Supabase
 * real nem para o Stripe. Chave inventada.
 *
 * COMO RODAR
 *   npx playwright test e2e/apiAddon.spec.ts
 *   E2E_BASE_URL=https://www.convoflow.com.br npx playwright test e2e/apiAddon.spec.ts
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
const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });

/** Chave inventada (só letras: a checagem de dado pessoal não a confunde com uma de verdade). */
const CHAVE_FALSA = 'cf_live_' + 'EXEMPLO'.repeat(4) + 'ABCD';

/** Responde uma rota e guarda o corpo de cada pedido. */
async function responder(context: BrowserContext, padrao: RegExp, corpo: unknown, pedidos: unknown[] = []) {
  await context.route(padrao, (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    try {
      pedidos.push(req.postDataJSON());
    } catch {
      pedidos.push(null);
    }
    return json(route, corpo);
  });
  return pedidos;
}

async function abrirComo(context: BrowserContext, role: MockRole) {
  await installSupabaseMock(context, role);
  return context.newPage();
}

test('Assinatura: cartão "API e integrações" com R$ 99,90 e a confirmação; contratar chama update-api-addon', async ({ context }) => {
  const page = await abrirComo(context, 'gerente');
  await responder(context, /\/rest\/v1\/rpc\/api_addon_estado/, [{ ativo: false, motivo: 'desligado', ate: null }]);
  const pedidos = await responder(context, /\/functions\/v1\/update-api-addon/, {
    success: true, cobrado: true, ate: null, estado: { ativo: true, motivo: 'pago', ate: null },
  });
  await page.goto('/dashboard/settings?tab=subscription');

  const cartao = page.getByTestId('cartao-api');
  await expect(cartao).toBeVisible();
  await expect(cartao).toContainText('R$ 99,90');
  await expect(page.getByText('API e integrações por R$ 99,90/mês')).toBeVisible();

  await cartao.getByRole('button', { name: /Ligar a API por R\$ 99,90\/mês/ }).click();
  const confirmacao = page.getByTestId('api-confirmacao');
  await expect(confirmacao).toContainText('R$ 99,90 por mês');
  await expect(confirmacao).toContainText('sem crédito');
  await page.getByRole('button', { name: /Contratar por R\$ 99,90\/mês/ }).click();
  await expect.poll(() => pedidos.length).toBe(1);
  expect(pedidos[0]).toEqual({ ligar: true });
});

test('Chaves de API: mídia só com histórico; a chave aparece uma vez, com o aceite gravado', async ({ context }) => {
  const page = await abrirComo(context, 'gerente');
  await responder(context, /\/rest\/v1\/rpc\/api_addon_estado/, [{ ativo: true, motivo: 'pago', ate: null }]);
  await responder(context, /\/rest\/v1\/rpc\/api_chaves_listar/, []);
  const criadas = await responder(context, /\/rest\/v1\/rpc\/api_chave_criar/, [
    { id: 'aaaaaaaa-0000-4000-8000-0000000000c9', chave: CHAVE_FALSA, prefixo: CHAVE_FALSA.slice(0, 14), expira_em: '2027-01-23T00:00:00Z' },
  ]);
  await page.goto('/dashboard/settings?tab=api');

  await expect(page.getByRole('tab', { name: /Chaves de API/ })).toBeVisible();
  await expect(page.getByTestId('api-endereco')).toContainText('https://api.convoflow.com.br');
  await page.getByRole('button', { name: /Nova chave/ }).click();
  await page.getByLabel('Nome da chave').fill('n8n da loja');

  const midia = page.locator('#api-escopo-midia');
  await expect(midia).toBeDisabled();
  await page.locator('#api-escopo-mensagens').click();
  await expect(midia).toBeEnabled();
  await midia.click();

  // Sem a caixa de responsabilidade, não cria: avisa e não chama o servidor.
  const criar = page.getByRole('button', { name: /^Criar chave$/ });
  await criar.click();
  await expect(page.getByText('Marque a confirmação para criar a chave.')).toBeVisible();
  expect(criadas).toHaveLength(0);
  await page.locator('#api-aceite').click();
  await criar.click();

  await expect(page.getByTestId('api-chave-secreta')).toHaveText(CHAVE_FALSA);
  await expect.poll(() => criadas.length).toBe(1);
  expect(criadas[0]).toMatchObject({
    p_nome: 'n8n da loja',
    p_lojas: null,
    p_validade_dias: 90,
    p_aceite_versao: 'api-chave-2026-10-24',
  });
  expect((criadas[0] as { p_escopos: string[] }).p_escopos).toEqual(expect.arrayContaining(['mensagens', 'midia']));

  await page.getByRole('button', { name: /Já guardei a chave/ }).click();
  await expect(page.getByTestId('api-chave-secreta')).toHaveCount(0);
});

test('superadmin: "Liberar API" numa Conta de acesso manual chama api_addon_liberar_manual', async ({ context }) => {
  const page = await abrirComo(context, 'superadmin');
  const conta = {
    id: IDS.tenant, name: 'Conta Manual Exemplo', kind: 'account', parent_tenant_id: null,
    subscription_status: null, trial_ends_at: null, subscription_will_cancel: false, subscription_cancel_at: null,
    manual_access_granted: true, manual_access_granted_at: '2026-10-01T12:00:00Z', api_addon_manual: false,
  };
  await context.route(/\/rest\/v1\/tenants/, (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const objeto = (req.headers()['accept'] ?? '').includes('pgrst.object');
    return json(route, objeto ? conta : [conta]);
  });
  const liberacoes = await responder(context, /\/rest\/v1\/rpc\/api_addon_liberar_manual/, null);
  await page.goto('/dashboard/admin');
  await page.getByRole('tab', { name: 'Usuários' }).click();

  const botao = page.getByRole('button', { name: /^Liberar API$/ }).first();
  await expect(botao).toBeVisible();
  await botao.click();
  await expect.poll(() => liberacoes.length).toBeGreaterThan(0);
  expect(liberacoes[0]).toEqual({ p_conta: IDS.tenant, p_ligar: true });
});

test('/api abre a documentação sem login', async ({ context }) => {
  await installSupabaseMock(context, 'gerente', { sessao: false });
  const page = await context.newPage();
  await page.goto('/api');
  await expect(page).toHaveURL(/\/api$/);
  await expect(page.getByText('https://api.convoflow.com.br').first()).toBeVisible();
  await expect(page.getByText('/v1/contatos').first()).toBeVisible();
  await expect(page.getByText(/n8n/).first()).toBeVisible();
});

test('Ajuda: a entrada "Chaves de API" aparece para o gerente', async ({ context }) => {
  const page = await abrirComo(context, 'gerente');
  await page.goto('/dashboard/help#page:settings-api');
  await expect(page.getByText('Configurações › Chaves de API').first()).toBeVisible();
});
