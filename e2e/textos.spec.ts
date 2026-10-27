import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { installSupabaseMock, type MockRole } from './support/supabaseMock';

/**
 * Lote 3 do checkup de usabilidade ("Textos"), no navegador: nenhuma tela que o
 * cliente vê, em nenhum cargo, mostra palavra que o glossário proíbe
 * (docs/GLOSSARIO_UX.md) nem linguagem de programador (nome de tabela,
 * "Mutação", "undefined", "[object Object]"...).
 *
 * Lê o texto visível, os placeholders, os títulos e os rótulos acessíveis de
 * cada tela do painel (com cada aba de Configurações), da página de vendas, do
 * login, da troca de senha e das páginas legais. Backend falso
 * (e2e/support/supabaseMock.ts): nada chega ao Supabase.
 *
 * COMO RODAR
 *   npx playwright test e2e/textos.spec.ts
 *   TEXTOS_DUMP=<pasta> npx playwright test e2e/textos.spec.ts   (grava o texto de cada tela)
 */

test.use({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
test.describe.configure({ timeout: 240_000 });

/** Palavra proibida → por que (o glossário diz o que usar no lugar). */
export const PROIBIDAS: Array<[RegExp, string]> = [
  [/\binst[âa]ncias?\b/i, 'use "número de WhatsApp"'],
  [/\bAPIs\b/, '"Instâncias e APIs" virou "Números de WhatsApp"'],
  [/muta[çc][ãa]o/i, 'linguagem de programador'],
  [/\bTabela:/, 'nome de tabela na tela'],
  [/\b(whatsapp_instances|contact_tags|funnel_stages|profiles|tenants|bug_reports)\b/, 'nome de tabela na tela'],
  [/\best[áa]gios?\b/i, 'use "etapa"'],
  [/\bTags?\b/, 'use "etiqueta"'],
  [/\bfun[çc][ãa]o\b/i, 'use "cargo"'],
  [/\boperador(es|a)?\b/i, 'use "atendente"'],
  [/\bagentes?\b/i, 'use "atendente"'],
  [/follow-ups?/i, '"Follow up" sem hífen'],
  [/\be-mails?\b/i, '"email" sem hífen'],
  [/\b(undefined|NaN)\b|\[object Object\]/, 'valor cru do programa'],
  [/\bpayloads?\b/i, 'linguagem de programador'],
  [/\b(open|close|connecting|qrcode)\b(?![-_])/, 'estado do número em inglês'],
  [/\bleads?\b/i, 'use "contato" (lead só dentro do funil)'],
  [/(^|[^A-Za-zÀ-ú])lojas?\b/, '"Loja" com maiúscula'],
];

/**
 * O que vale numa tela e não nas outras. Nas páginas legais, "operador" e
 * "loja cliente" são termos da LGPD e do contrato, e "agentes de inteligência
 * artificial" é o nome da cláusula 8.3. No funil, "lead" pode ficar (glossário).
 */
const PERMITIDAS: Array<[RegExp, RegExp]> = [
  [/^público \/(privacy-policy|terms-of-service|exclusao-de-dados)$/, /operador|loja|agentes?|lead/i],
  [/\/dashboard\/funnel$/, /\blead/i],
];

function permitida(tela: string, achado: string): boolean {
  return PERMITIDAS.some(([t, a]) => t.test(tela) && a.test(achado));
}

const ROTAS_PAINEL = [
  '', 'conversations', 'contacts', 'funnel', 'tracking', 'reports', 'chatbots',
  'campaigns', 'templates', 'followups', 'automation', 'whatsapp-numbers', 'team',
  'store-comparison', 'profile', 'notifications', 'help',
];
const ABAS = ['profile', 'attendance', 'visibility', 'quick-replies', 'followups', 'subscription', 'security', 'integrations', 'api'];
const PUBLICAS = ['/', '/auth', '/definir-senha', '/terms-of-service', '/privacy-policy', '/exclusao-de-dados', '/pagina-que-nao-existe'];

const DUMP = process.env.TEXTOS_DUMP;
if (DUMP) fs.mkdirSync(DUMP, { recursive: true });

async function esperar(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page.locator('[data-testid="carregando-pagina"]').first().waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 6_000 }).catch(() => {});
  await page.waitForTimeout(500);
}

/** Texto que a pessoa lê: o visível, mais placeholder, title e aria-label. */
async function textoDaTela(page: Page): Promise<string> {
  return page.evaluate(() => {
    const extras: string[] = [];
    document.querySelectorAll('[placeholder],[title],[aria-label]').forEach((el) => {
      for (const a of ['placeholder', 'title', 'aria-label']) {
        const v = el.getAttribute(a);
        if (v) extras.push(v);
      }
    });
    return `${document.body.innerText}\n${extras.join('\n')}`;
  });
}

function achados(texto: string, tela: string): string[] {
  const out: string[] = [];
  for (const linha of texto.split('\n')) {
    for (const [re, porque] of PROIBIDAS) {
      const m = re.exec(linha);
      if (m && !permitida(tela, m[0])) out.push(`"${m[0]}" (${porque}) em: ${linha.trim().slice(0, 140)}`);
    }
  }
  return [...new Set(out)];
}

async function conferir(page: Page, nome: string, todos: Record<string, string[]>) {
  await esperar(page);
  const texto = await textoDaTela(page);
  if (DUMP) fs.writeFileSync(path.join(DUMP, `${nome.replace(/[^a-z0-9]+/gi, '_')}.txt`), texto);
  const a = achados(texto, nome);
  if (a.length) todos[nome] = a;
}

for (const papel of ['gerente', 'gestor', 'atendente'] as MockRole[]) {
  test(`painel do ${papel}: nenhum texto proibido`, async ({ context }) => {
    await installSupabaseMock(context, papel);
    const page = await context.newPage();
    const todos: Record<string, string[]> = {};
    for (const r of ROTAS_PAINEL) {
      await page.goto(`/dashboard/${r}`);
      await conferir(page, `${papel} /dashboard/${r}`, todos);
    }
    for (const aba of ABAS) {
      await page.goto(`/dashboard/settings?tab=${aba}`);
      await conferir(page, `${papel} configurações ${aba}`, todos);
    }
    expect(todos, JSON.stringify(todos, null, 2)).toEqual({});
  });
}

test('páginas públicas: nenhum texto proibido', async ({ context }) => {
  await installSupabaseMock(context, 'gerente', { sessao: false });
  const page = await context.newPage();
  const todos: Record<string, string[]> = {};
  for (const r of PUBLICAS) {
    await page.goto(r);
    await conferir(page, `público ${r}`, todos);
  }
  expect(todos, JSON.stringify(todos, null, 2)).toEqual({});
});
