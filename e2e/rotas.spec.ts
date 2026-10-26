import { test, expect as expectBase, type BrowserContext, type Page, type Route } from '@playwright/test';
import { installSupabaseMock, sessionFor, type MockRole } from './support/supabaseMock';
import { API_ADDON_RELEASED } from '../src/lib/api/release';

/**
 * Rotas no navegador de verdade: guardas, 404, links que chegam de fora e
 * troca de tela com a rede lenta.
 *
 * POR QUE EXISTE. Protege as atualizações do React Router e do Vite. O teste
 * de unidade (src/test/appRoutes.test.tsx) confere a árvore de rotas com telas
 * falsas; aqui as telas são as reais, o JavaScript é o que o navegador baixa e
 * o backend é o falso de e2e/support/supabaseMock.ts — nada chega ao Supabase.
 *
 * COMO RODAR
 *   npx playwright test e2e/rotas.spec.ts                       contra o Vite local
 *   E2E_BASE_URL=https://www.convoflow.com.br npx playwright test e2e/rotas.spec.ts
 * (ver playwright.config.ts para Preview do Vercel, que exige login).
 *
 * Service worker bloqueado: o PWA do build de produção guardaria respostas do
 * Supabase em cache e misturaria uma sessão de teste com a próxima.
 */

test.use({ serviceWorkers: 'block' });

// O Vite local compila cada tela na primeira visita: 5 s não bastam. E com
// vários navegadores abertos ao mesmo tempo, 30 s por teste também não.
const expect = expectBase.configure({ timeout: 20_000 });
test.describe.configure({ timeout: 60_000 });

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
  'access-control-expose-headers': '*',
};

const responderJson = (route: Route, body: unknown) =>
  route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });

async function abrirComo(context: BrowserContext, role: MockRole, opcoes?: { sessao?: boolean }): Promise<Page> {
  await installSupabaseMock(context, role, opcoes);
  return context.newPage();
}

/**
 * Conta sem acesso liberado: o mesmo "não" que o servidor daria. Chame DEPOIS
 * de `abrirComo`: no Playwright a rota registrada por último responde primeiro.
 */
async function contaBloqueada(context: BrowserContext) {
  await context.route(/\/rest\/v1\/rpc\/tenant_access_state/, (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: CORS })
      : responderJson(route, [{ unlocked: false, source: 'locked' }]),
  );
}

/** Guarda os pedidos de nova senha e de verificação que a tela faz ao Supabase. */
async function registrarPedidosDeAuth(page: Page) {
  const pedidos = { recover: [] as Array<{ url: string }>, verify: [] as Array<{ corpo: unknown }> };
  page.on('request', (r) => {
    if (r.method() !== 'POST') return;
    if (r.url().includes('/auth/v1/recover')) pedidos.recover.push({ url: r.url() });
    if (r.url().includes('/auth/v1/verify')) pedidos.verify.push({ corpo: r.postDataJSON() });
  });
  return pedidos;
}

/** O /verify do Supabase falso: devolve uma sessão, ou o erro de link já usado. */
async function respostaDoVerify(context: BrowserContext, como: 'sessao' | 'gasto') {
  await context.route(/\/auth\/v1\/verify/, (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (como === 'gasto') {
      return route.fulfill({
        status: 403,
        headers: { ...CORS, 'content-type': 'application/json' },
        body: JSON.stringify({ code: 403, error_code: 'otp_expired', msg: 'Email link is invalid or has expired' }),
      });
    }
    return responderJson(route, sessionFor('gerente'));
  });
}

const titulo = (page: Page) => page.locator('main h1').first();
const naoEncontrada = (page: Page) => page.getByRole('heading', { name: 'Página não encontrada' });

// ----------------------------------------------------------------- 404 --
test.describe('404', () => {
  test('endereço que não existe mostra "Página não encontrada", e "Voltar" volta', async ({ context }) => {
    const page = await abrirComo(context, 'gerente', { sessao: false });
    await page.goto('/terms-of-service');
    await page.goto('/rota-que-nao-existe');
    await expect(naoEncontrada(page)).toBeVisible();
    await expect(page).toHaveURL(/\/rota-que-nao-existe$/);
    await page.getByRole('button', { name: 'Voltar' }).click();
    await expect(page).toHaveURL(/\/terms-of-service$/);
  });

  test('endereço inexistente dentro do dashboard também cai no 404', async ({ context }) => {
    const page = await abrirComo(context, 'gerente');
    await page.goto('/dashboard/rota-que-nao-existe');
    await expect(naoEncontrada(page)).toBeVisible();
  });
});

// -------------------------------------------------------------- guardas --
test.describe('guardas', () => {
  test('sem sessão, o dashboard manda para /auth', async ({ context }) => {
    const page = await abrirComo(context, 'gerente', { sessao: false });
    await page.goto('/dashboard/conversations');
    await expect(page).toHaveURL(/\/auth$/);
  });

  // Segue a chave API_ADDON_RELEASED (src/lib/api/release.ts): ligada desde
  // 2026-10-25, /api é a documentação pública (e2e/apiAddon.spec.ts confere o
  // conteúdo); desligada, /api volta para a página inicial.
  test('/api segue a chave do complemento', async ({ context }) => {
    const page = await abrirComo(context, 'gerente', { sessao: false });
    await page.goto('/api');
    if (API_ADDON_RELEASED) await expect(page).toHaveURL(/\/api$/);
    else await expect(page).toHaveURL(/\/$/);
  });

  test('/register leva ao login', async ({ context }) => {
    const page = await abrirComo(context, 'gerente', { sessao: false });
    await page.goto('/register');
    await expect(page).toHaveURL(/\/auth$/);
  });

  // Desde 2026-10-26 (lote 2 do checkup) a guarda é a TelaGuard: quem não
  // alcança a tela vê "Você não tem acesso a esta tela" no mesmo endereço, em
  // vez de ser jogado para o Dashboard.
  for (const [papel, caminho] of [
    ['atendente', '/dashboard/admin'],
    ['atendente', '/dashboard/team'],
    ['gestor', '/dashboard/store-comparison'],
  ] as const) {
    test(`TelaGuard: ${papel} em ${caminho} vê o aviso de sem acesso`, async ({ context }) => {
      const page = await abrirComo(context, papel);
      await page.goto(caminho);
      await expect(page.getByTestId('sem-acesso')).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`${caminho.replace(/\//g, '\\/')}$`));
      await expect(naoEncontrada(page)).toHaveCount(0);
    });
  }

  test('TelaGuard: gerente abre a Comparação de Lojas', async ({ context }) => {
    const page = await abrirComo(context, 'gerente');
    await page.goto('/dashboard/store-comparison');
    await expect(titulo(page)).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard\/store-comparison$/);
  });

  test('TelaGuard: módulo desligado mostra o aviso no mesmo endereço', async ({ context }) => {
    const page = await abrirComo(context, 'gerente');
    const modulos = ['conversations', 'contacts', 'funnel', 'tracking', 'reports', 'chatbots', 'followups', 'automation', 'whatsapp-numbers'];
    await context.route(/\/rest\/v1\/module_settings/, (route) =>
      route.request().method() === 'OPTIONS'
        ? route.fulfill({ status: 204, headers: CORS })
        : responderJson(
            route,
            modulos.map((m, i) => ({
              id: `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, '0')}`,
              module_name: m, display_name: m, route_path: `/dashboard/${m}`, is_enabled: true, sort_order: i,
            })),
          ),
    );
    await page.goto('/dashboard/campaigns');
    await expect(page.getByTestId('sem-acesso')).toBeVisible();
    await expect(page.getByText(/não está ligada na sua Conta/)).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard\/campaigns$/);
    await page.goto('/dashboard/contacts');
    await expect(page).toHaveURL(/\/dashboard\/contacts$/);
    await expect(titulo(page)).toBeVisible();
  });

  test('paywall: Conta sem acesso vê o bloqueio em qualquer tela do dashboard', async ({ context }) => {
    const page = await abrirComo(context, 'atendente');
    await contaBloqueada(context);
    for (const caminho of ['/dashboard', '/dashboard/conversations', '/dashboard/settings']) {
      await page.goto(caminho);
      await expect(page.getByText('Acesso bloqueado')).toBeVisible();
      await expect(page.locator('main')).toHaveCount(0);
    }
  });
});

// --------------------------------------------------- links que chegam de fora --
test.describe('links que chegam de fora', () => {
  test('/definir-senha com o link ANTIGO do e-mail (sessão no fragmento) pede a senha nova', async ({ context }) => {
    const page = await abrirComo(context, 'gerente', { sessao: false });
    const s = sessionFor('gerente');
    const fragmento = new URLSearchParams({
      access_token: s.access_token,
      refresh_token: s.refresh_token,
      expires_in: String(s.expires_in),
      expires_at: String(s.expires_at),
      token_type: 'bearer',
      type: 'invite',
    });
    await page.goto(`/definir-senha#${fragmento}`);
    await expect(page.getByText('Escolha sua nova senha')).toBeVisible();
    await expect(page.getByLabel('Nova senha')).toBeVisible();
    // O token não pode ficar exposto na barra de endereço.
    await expect.poll(() => new URL(page.url()).hash).not.toContain('access_token');
  });

  test('/definir-senha com link vencido explica o erro e limpa o endereço', async ({ context }) => {
    const page = await abrirComo(context, 'gerente', { sessao: false });
    await page.goto('/definir-senha#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
    await expect(page.getByText('Peça um código novo', { exact: true })).toBeVisible();
    await expect(page.getByText(/expirou ou já foi usado/)).toBeVisible();
    await expect(page).toHaveURL(/\/definir-senha$/);
  });

  test('"Esqueci minha senha": sem alerta, envia o código e aceita o código digitado', async ({ context }) => {
    const page = await abrirComo(context, 'gerente', { sessao: false });
    const pedidos = await registrarPedidosDeAuth(page);
    await respostaDoVerify(context, 'sessao');
    await page.goto('/auth');
    await page.getByText('Esqueci minha senha').click();
    await expect(page).toHaveURL(/\/definir-senha$/);
    await expect(page.getByText('Esqueci minha senha')).toBeVisible();
    await expect(page.getByText('Não deu para usar este link')).toHaveCount(0);

    await page.getByLabel('Seu e-mail').fill('pessoa@exemplo.com.br');
    await page.getByRole('button', { name: 'Enviar código' }).click();
    await expect(page.getByLabel('Código recebido por e-mail')).toBeVisible();
    expect(pedidos.recover).toHaveLength(1);
    expect(pedidos.recover[0].url).toContain(encodeURIComponent('/definir-senha'));

    await page.getByLabel('Código recebido por e-mail').fill('123456');
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByLabel('Nova senha')).toBeVisible();
    expect(pedidos.verify).toHaveLength(1);
    expect(pedidos.verify[0].corpo).toMatchObject({ email: 'pessoa@exemplo.com.br', token: '123456', type: 'email' });
  });

  for (const tipo of ['recovery', 'invite'] as const) {
    test(`link NOVO (${tipo}): abrir não usa o acesso; só "Continuar" usa`, async ({ context }) => {
      const page = await abrirComo(context, 'gerente', { sessao: false });
      const pedidos = await registrarPedidosDeAuth(page);
      await respostaDoVerify(context, 'sessao');
      await page.goto(`/definir-senha?token_hash=hash-falso-${tipo}&type=${tipo}`);
      await expect(page.getByRole('button', { name: 'Continuar' })).toBeVisible();
      await expect(page.getByText(tipo === 'invite' ? 'Aceite seu convite' : 'Crie sua nova senha')).toBeVisible();
      // Tempo de sobra para um robô (ou um efeito da tela) gastar o link.
      await page.waitForTimeout(2500);
      expect(pedidos.verify).toHaveLength(0);

      await page.getByRole('button', { name: 'Continuar' }).click();
      await expect(page.getByLabel('Nova senha')).toBeVisible();
      expect(pedidos.verify).toHaveLength(1);
      // O supabase-js acrescenta gotrue_meta_security; com token_hash o Supabase
      // recusa e-mail junto, então ele não pode ir.
      expect(pedidos.verify[0].corpo).toMatchObject({ token_hash: `hash-falso-${tipo}`, type: tipo });
      expect(pedidos.verify[0].corpo).not.toHaveProperty('email');
      await expect(page).toHaveURL(/\/definir-senha$/);
    });
  }

  test('link NOVO já usado: explica e oferece código novo', async ({ context }) => {
    const page = await abrirComo(context, 'gerente', { sessao: false });
    await respostaDoVerify(context, 'gasto');
    await page.goto('/definir-senha?token_hash=hash-falso&type=invite');
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByText('Não deu para usar este link')).toBeVisible();
    await expect(page.getByText(/expirou ou já foi usado/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enviar código' })).toBeVisible();
    await expect(page).toHaveURL(/\/definir-senha$/);
  });

  test('Ajuda: /dashboard/help#page:conversations abre e mostra o tópico', async ({ context }) => {
    const page = await abrirComo(context, 'gerente');
    await page.goto('/dashboard/help#page:conversations');
    const topico = page.locator('[id="page:conversations"]');
    await expect(topico).toHaveAttribute('data-state', 'open');
    await expect(topico).toBeInViewport();
  });

  test('Stripe ?checkout=success com a Conta ainda bloqueada mostra "Confirmando seu pagamento"', async ({ context }) => {
    const page = await abrirComo(context, 'gerente');
    await contaBloqueada(context);
    await page.goto('/dashboard/settings?checkout=success');
    await expect(page.getByText('Confirmando seu pagamento')).toBeVisible();
  });

  test('Stripe ?checkout=cancel avisa que nada foi cobrado', async ({ context }) => {
    const page = await abrirComo(context, 'gerente');
    await contaBloqueada(context);
    await page.goto('/dashboard/settings?checkout=cancel');
    await expect(page.getByText('Você saiu do pagamento antes de terminar. Nada foi cobrado.')).toBeVisible();
  });

  test('Stripe ?checkout=success com a Conta já liberada abre Configurações normalmente', async ({ context }) => {
    const page = await abrirComo(context, 'gerente');
    await page.goto('/dashboard/settings?checkout=success');
    await expect(titulo(page)).toHaveText('Configurações');
  });

  test('?tab=subscription abre a aba Assinatura para o gerente', async ({ context }) => {
    const page = await abrirComo(context, 'gerente');
    await page.goto('/dashboard/settings?tab=subscription');
    await expect(page.getByRole('tab', { name: 'Assinatura' })).toHaveAttribute('aria-selected', 'true');
  });

  test('?tab=subscription digitado por um atendente cai no Perfil', async ({ context }) => {
    const page = await abrirComo(context, 'atendente');
    await page.goto('/dashboard/settings?tab=subscription');
    await expect(titulo(page)).toHaveText('Configurações');
    await expect(page.getByRole('tab', { name: 'Assinatura' })).toHaveCount(0);
  });

  test('volta do Instagram com erro: avisa e tira os parâmetros do endereço', async ({ context }) => {
    const page = await abrirComo(context, 'gerente');
    await page.goto('/dashboard/whatsapp-numbers?ig_error=access_denied&ig_error_description=negado');
    await expect(page.getByText('Conexão cancelada').first()).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard\/whatsapp-numbers$/);
  });

  test('volta do Instagram com código: conclui no servidor uma vez e limpa o endereço', async ({ context }) => {
    const page = await abrirComo(context, 'gerente');
    const pedidos: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().includes('/functions/v1/instagram-connect')) pedidos.push(r.postData() ?? '');
    });
    await page.goto('/dashboard/whatsapp-numbers?ig_state=estado-falso&ig_code=codigo-falso');
    await expect(page).toHaveURL(/\/dashboard\/whatsapp-numbers$/);
    await expect.poll(() => pedidos.length).toBe(1);
    expect(pedidos[0]).toContain('codigo-falso');
    // Um F5 depois não repete o pedido: os parâmetros já saíram.
    await page.reload();
    await expect(titulo(page)).toBeVisible();
    expect(pedidos).toHaveLength(1);
  });
});

// ------------------------------------------------------------- rede lenta --
/** Segura o arquivo da tela de Contatos (dev: o .tsx; build: o chunk). */
const CHUNK_CONTATOS = /\/(src\/pages\/Contacts\.tsx|assets\/Contacts-[\w-]+\.js)(\?|$)/;

async function atrasar(context: BrowserContext, padrao: RegExp, ms: number) {
  await context.route(padrao, async (route) => {
    await new Promise((r) => setTimeout(r, ms));
    await route.continue();
  });
}

test.describe('rede lenta', () => {
  test('primeira carga de uma tela mostra o carregando e depois a tela', async ({ context }) => {
    await atrasar(context, CHUNK_CONTATOS, 2500);
    const page = await abrirComo(context, 'gerente');
    await page.goto('/dashboard/contacts');
    await expect(page.getByTestId('carregando-pagina')).toBeVisible();
    await expect(titulo(page)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('carregando-pagina')).toHaveCount(0);
  });

  test('trocar de tela pelo menu com a tela nova lenta: nunca fica em branco e chega lá', async ({ context }) => {
    const page = await abrirComo(context, 'gerente');
    await page.goto('/dashboard');
    const tituloInicio = await titulo(page).textContent({ timeout: 20_000 });
    await atrasar(context, CHUNK_CONTATOS, 2500);

    await page.locator('a[href="/dashboard/contacts"]').first().click();

    // Durante a espera: ou a tela anterior continua (React Router com
    // startTransition) ou aparece o carregando (sem). Nunca tela vazia ou 404.
    const visto = new Set<string>();
    const fim = Date.now() + 2000;
    while (Date.now() < fim) {
      // Uma foto só da tela por amostra: olhar o esqueleto e depois o título
      // em duas idas ao navegador pega a troca no meio e acusa "vazio" à toa.
      const foto = await page.evaluate(() => ({
        carregando: !!document.querySelector('[data-testid="carregando-pagina"]'),
        h1: document.querySelector('main h1')?.textContent ?? '',
        naoEncontrada: document.body.innerText.includes('Página não encontrada'),
      }));
      if (foto.carregando) visto.add('carregando');
      else if (foto.h1 && foto.h1 === tituloInicio) visto.add('tela anterior');
      else if (foto.h1) visto.add('tela nova');
      else visto.add('vazio');
      expect(foto.naoEncontrada).toBe(false);
      await page.waitForTimeout(50);
    }
    test.info().annotations.push({ type: 'durante a espera', description: [...visto].join(', ') });
    console.log(`ROTAS-ESPERA | ${[...visto].join(', ')}`);
    expect(visto.has('vazio')).toBe(false);

    await expect(page).toHaveURL(/\/dashboard\/contacts$/, { timeout: 20_000 });
    await expect(titulo(page)).not.toHaveText(tituloInicio ?? '', { timeout: 20_000 });
    await expect(page.getByTestId('carregando-pagina')).toHaveCount(0);
  });

  test('rede de celular ruim: navegar por três telas pelo menu funciona', async ({ context, browserName }) => {
    test.skip(browserName !== 'chromium', 'limite de rede só no Chromium');
    test.setTimeout(180_000);
    const page = await abrirComo(context, 'gerente');
    const erros: string[] = [];
    page.on('pageerror', (e) => erros.push(e.message));
    await page.goto('/dashboard');
    await expect(titulo(page)).toBeVisible({ timeout: 30_000 });

    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 300,
      downloadThroughput: (1.5 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });

    for (const destino of ['/dashboard/contacts', '/dashboard/funnel', '/dashboard/help']) {
      await page.locator(`a[href="${destino}"]`).first().click();
      await expect(page).toHaveURL(new RegExp(`${destino}$`), { timeout: 60_000 });
      await expect(page.getByTestId('carregando-pagina')).toHaveCount(0, { timeout: 60_000 });
      await expect(titulo(page)).toBeVisible({ timeout: 60_000 });
      await expect(naoEncontrada(page)).toHaveCount(0);
    }
    expect(erros).toEqual([]);
  });
});
