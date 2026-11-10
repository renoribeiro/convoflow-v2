import { test, expect as expectBase, type Route } from '@playwright/test';
import { installSupabaseMock } from './support/supabaseMock';

/**
 * A tela Admin › Limites de uso, quadro "Teste grátis e cadastro pelo site"
 * (sessão 2, 2026-11-09), no navegador de verdade: o superadmin lê os números,
 * muda um e salva; vai ao banco só o que mudou, por definir_limites_da_plataforma.
 *
 * O backend é o falso de e2e/support/supabaseMock.ts: nada sai para o Supabase real.
 *
 * COMO RODAR
 *   npx playwright test e2e/limitesDoTeste.spec.ts
 *   E2E_BASE_URL=https://www.convoflow.com.br npx playwright test e2e/limitesDoTeste.spec.ts
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

const LINHA = {
  id: true,
  teste_lojas: 2,
  teste_numeros: 2,
  teste_numeros_qr: 1,
  teste_mensagens_dia: 300,
  teste_contatos_campanha: 100,
  cadastro_por_hora: 20,
  cadastro_por_dia: 100,
  atualizado_em: '2026-11-09T12:00:00Z',
  atualizado_por: null,
};

for (const largura of [1440, 375]) {
  test(`superadmin muda um limite do teste e salva (${largura} px)`, async ({ context }) => {
    await installSupabaseMock(context, 'superadmin');
    const salvos: unknown[] = [];
    await context.route(/\/rest\/v1\/limites_da_plataforma/, (route) =>
      route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers: CORS }) : json(route, LINHA),
    );
    await context.route(/\/rest\/v1\/rpc\/definir_limites_da_plataforma/, (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      salvos.push(route.request().postDataJSON());
      return json(route, { ...LINHA, teste_numeros: 3 });
    });

    const page = await context.newPage();
    await page.setViewportSize({ width: largura, height: 900 });
    await page.goto('/dashboard/admin/usage-limits');

    const quadro = page.getByTestId('limites-do-teste-card');
    await expect(quadro).toContainText('Teste grátis e cadastro pelo site');
    await expect(quadro.getByRole('spinbutton', { name: 'Lojas por Conta' })).toHaveValue('2');
    await expect(quadro.getByRole('spinbutton', { name: 'Mensagens enviadas por dia' })).toHaveValue('300');
    await expect(quadro.getByRole('spinbutton', { name: 'Cadastros por dia' })).toHaveValue('100');

    const salvar = quadro.getByRole('button', { name: 'Salvar limites' });
    await expect(salvar).toBeDisabled();
    await quadro.getByRole('spinbutton', { name: 'Números de WhatsApp por Conta' }).fill('3');
    await expect(salvar).toBeEnabled();
    await salvar.click();

    await expect(page.getByText('Limites salvos. Valem a partir de agora.')).toBeVisible();
    expect(salvos).toEqual([{ p_limites: { teste_numeros: 3 } }]);

    // Sem rolagem lateral no celular.
    const sobra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(sobra).toBeLessThanOrEqual(0);
  });
}
