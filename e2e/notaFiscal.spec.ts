import { test, expect as expectBase, type BrowserContext, type Page, type Route } from '@playwright/test';
import { IDS, installSupabaseMock, type MockRole } from './support/supabaseMock';

/**
 * Nota fiscal, parte 1, no navegador de verdade: os "Dados para a nota fiscal"
 * antes de assinar (tela de bloqueio e aba Assinatura), a lista de Cobranças
 * da Conta e a aba Cobranças do superadmin.
 *
 * O backend é o falso de e2e/support/supabaseMock.ts, e a busca de CEP também
 * é respondida aqui: nada sai para o Supabase real nem para o ViaCEP.
 * Documento e endereço inventados.
 *
 * COMO RODAR
 *   npx playwright test e2e/notaFiscal.spec.ts
 *   E2E_BASE_URL=https://www.convoflow.com.br npx playwright test e2e/notaFiscal.spec.ts
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

const DADOS = {
  tenant_id: IDS.tenant,
  person_type: 'cnpj',
  tax_id: '11222333000181',
  legal_name: 'Fulano Comércio Ltda',
  cep: '60000000',
  street: 'Rua Exemplo',
  number: '100',
  complement: null,
  district: 'Centro',
  city: 'Fortaleza',
  city_ibge_code: '2304400',
  state: 'CE',
  invoice_email: 'nota@exemplo.com.br',
  created_at: '2026-10-13T12:00:00Z',
  updated_at: '2026-10-13T12:00:00Z',
  updated_by: IDS.user,
};

const COBRANCAS = [
  {
    id: 'aaaaaaaa-0000-4000-8000-0000000000c1', stripe_invoice_id: 'in_FAKE1', tenant_id: IDS.tenant,
    amount_paid_cents: 49990, currency: 'brl', paid_at: '2026-10-13T15:00:00Z',
    period_start: '2026-10-13T15:00:00Z', period_end: '2026-11-13T15:00:00Z',
    hosted_invoice_url: 'https://invoice.stripe.com/i/FAKE1', amount_refunded_cents: 0, refunded_at: null,
    nota_status: 'aguardando_emissao', conta: { name: 'Conta Matriz' },
  },
  {
    id: 'aaaaaaaa-0000-4000-8000-0000000000c2', stripe_invoice_id: 'in_FAKE2', tenant_id: IDS.tenant,
    amount_paid_cents: 49990, currency: 'brl', paid_at: '2026-09-13T15:00:00Z', period_start: null, period_end: null,
    hosted_invoice_url: 'https://invoice.stripe.com/i/FAKE2', amount_refunded_cents: 49990,
    refunded_at: '2026-09-15T15:00:00Z', nota_status: 'aguardando_emissao', conta: { name: 'Conta Matriz' },
  },
];

async function abrirComo(context: BrowserContext, role: MockRole): Promise<Page> {
  await installSupabaseMock(context, role);
  // Busca de CEP (ViaCEP) respondida aqui.
  await context.route(/viacep\.com\.br\/ws\/\d{8}\/json/, (route) =>
    json(route, { cep: '60000-000', logradouro: 'Rua Exemplo', bairro: 'Centro', localidade: 'Fortaleza', uf: 'CE', ibge: '2304400' }),
  );
  await context.route(/brasilapi\.com\.br|servicodados\.ibge\.gov\.br/, (route) => route.abort());
  return context.newPage();
}

/** tenant_billing_details: `linha` (ou nada) na leitura; a gravação devolve o que foi enviado. */
async function dadosFiscais(context: BrowserContext, linha: Record<string, unknown> | null, gravados: unknown[] = []) {
  await context.route(/\/rest\/v1\/tenant_billing_details/, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const objeto = (req.headers()['accept'] ?? '').includes('pgrst.object');
    if (req.method() === 'GET') {
      if (objeto) return linha ? json(route, linha) : json(route, { code: 'PGRST116', message: 'no rows' }, 406);
      return json(route, linha ? [linha] : []);
    }
    const corpo = req.postDataJSON();
    gravados.push(corpo);
    const salvo = { ...DADOS, ...(Array.isArray(corpo) ? corpo[0] : corpo) };
    return json(route, objeto ? salvo : [salvo]);
  });
}

async function cobrancas(context: BrowserContext) {
  await context.route(/\/rest\/v1\/billing_charges/, (route) =>
    route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers: CORS }) : json(route, COBRANCAS),
  );
}

async function contaBloqueada(context: BrowserContext) {
  await context.route(/\/rest\/v1\/rpc\/tenant_access_state/, (route) =>
    route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers: CORS }) : json(route, [{ unlocked: false, source: 'locked' }]),
  );
}

test('tela de bloqueio: sem os dados o botão trava; preenchidos (CEP preenche o endereço), ele libera', async ({ context }) => {
  const page = await abrirComo(context, 'gerente');
  await contaBloqueada(context);
  const gravados: unknown[] = [];
  await dadosFiscais(context, null, gravados);
  await page.goto('/dashboard');

  const form = page.getByRole('form', { name: 'Dados para a nota fiscal' });
  await expect(form).toBeVisible();
  const assinar = page.getByRole('button', { name: /Assinar agora|Começar teste grátis/ });
  await expect(assinar).toBeDisabled();
  await expect(page.getByTestId('assinar-precisa-dados')).toBeVisible();

  await page.getByLabel('CNPJ').fill('11222333000181');
  await expect(page.getByLabel('CNPJ')).toHaveValue('11.222.333/0001-81');
  await page.getByLabel('Razão social').fill('Fulano Comércio Ltda');
  await page.getByLabel('CEP').fill('60000000');
  await expect(page.getByLabel('Cidade')).toHaveValue('Fortaleza');
  await expect(page.getByLabel('Rua, avenida ou logradouro')).toHaveValue('Rua Exemplo');
  await expect(page.getByLabel('UF')).toHaveValue('CE');
  await page.getByLabel('Número').fill('100');
  await page.getByLabel('Email para receber a nota').fill('nota@exemplo.com.br');
  await page.getByRole('button', { name: 'Salvar dados' }).click();

  await expect(page.getByTestId('dados-fiscais-resumo')).toContainText('CNPJ ••.•••.•••/••••-81');
  await expect(assinar).toBeEnabled();
  // gravou sem pontuação, com o código IBGE do CEP
  expect(gravados).toHaveLength(1);
  expect(gravados[0]).toMatchObject({ tax_id: '11222333000181', cep: '60000000', city_ibge_code: '2304400', state: 'CE', person_type: 'cnpj' });
});

test('aba Assinatura: resumo dos dados e a lista de Cobranças', async ({ context }) => {
  const page = await abrirComo(context, 'gerente');
  await dadosFiscais(context, DADOS);
  await cobrancas(context);
  await page.goto('/dashboard/settings?tab=subscription');

  await expect(page.getByTestId('dados-fiscais-resumo')).toContainText('Fulano Comércio Ltda');
  await expect(page.getByTestId('dados-fiscais-resumo')).not.toContainText('11222333');
  const lista = page.getByLabel('Cobranças da Conta');
  await expect(lista).toContainText('13/10/2026');
  await expect(lista).toContainText('Reembolsada');
  await expect(page.getByRole('link', { name: /Ver no Stripe/ }).first()).toHaveAttribute('href', 'https://invoice.stripe.com/i/FAKE1');
  // coluna da nota fiscal escondida até a parte 2
  await expect(lista).not.toContainText('Aguardando emissão');
});

test('superadmin: Faturamento › Cobranças', async ({ context }) => {
  const page = await abrirComo(context, 'superadmin');
  await cobrancas(context);
  // O backend falso genérico não monta o billing_overview do stripe-admin
  // (o painel do Faturamento quebraria antes das abas): um vazio de verdade.
  await context.route(/\/functions\/v1\/stripe-admin/, (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: CORS })
      : json(route, {
          generatedAt: '2026-10-13T12:00:00Z', mode: 'live', currency: 'brl',
          mrr: { net: 0, gross: 0, plan: 0, extraStores: 0, extraAttendants: 0, other: 0, discounts: 0, subscriptions: 0 },
          upcoming: [], revenueByMonth: [], failedPayments: [], legacy: [], warnings: [],
        }),
  );
  await page.goto('/dashboard/admin');
  await page.getByRole('tab', { name: 'Faturamento' }).click();
  await page.getByRole('tab', { name: 'Cobranças' }).click();
  const lista = page.getByLabel('Cobranças de todas as Contas');
  await expect(lista).toContainText('Conta Matriz');
  await expect(page.getByTestId('totais-cobrancas')).toContainText('2 cobranças');
});
