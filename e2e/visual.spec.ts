import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installSupabaseMock, type MockRole } from './support/supabaseMock';
import { TELAS, TELAS_SO_DE_LOJA, caminhoDaTela } from '../src/lib/access/telas';
import { ABAS_DE_CONFIGURACOES } from '../src/lib/access/abasConfiguracoes';
import { DEFAULT_CAPABILITIES } from '../src/types/userHierarchy';

/**
 * Lote 5 do checkup de usabilidade ("Visual"), no navegador: TODA tela do
 * painel e TODA aba de Configurações que cada cargo alcança, mais as páginas
 * públicas, em três larguras (375 celular, 768 tablet, 1440 computador).
 *
 * Desde o lote 7 cada tela passa nos DOIS temas (claro a 375, 768 e 1440;
 * escuro a 375 e 1440), e as janelas principais (criar contato, campanha,
 * conectar número, detalhes da campanha...) são abertas e medidas também.
 *
 * Falha quando:
 *   1. a página rola para o lado (scrollWidth maior que a janela);
 *   1b. texto ou botão sai cortado de uma caixa que esconde o que passa da
 *      borda (overflow hidden), sem reticências. Rolagem lateral não pega esse
 *      caso: a caixa esconde o pedaço e a página não rola;
 *   2. o axe acha contraste abaixo do AA (regra color-contrast), ou botão,
 *      link ou campo sem nome que o leitor de tela consiga ler; e texto sobre
 *      fundo em degradê (que o axe não mede) fica abaixo do AA contra alguma
 *      cor do degradê;
 *   3. no celular, um alvo de toque (botão, aba, chave, caixa de marcar,
 *      campo) tem menos de 44 pixels de altura ou de largura. Link no meio de
 *      um parágrafo fica de fora, como manda a WCAG.
 *
 * As telas saem do registro (src/lib/access/telas.ts) e da matriz de cargos
 * (DEFAULT_CAPABILITIES), as abas de src/lib/access/abasConfiguracoes.ts:
 * tela nova entra aqui sozinha.
 *
 * Backend falso (e2e/support/supabaseMock.ts): nada chega ao Supabase real e
 * nenhum dado de cliente aparece nas fotos.
 *
 * COMO RODAR
 *   npx playwright test e2e/visual.spec.ts --workers=4
 *   npx playwright test e2e/visual.spec.ts -g "atendente"         só um cargo
 *   VISUAL_FOTOS=<pasta> ...      grava a foto da página inteira de cada tela
 *   VISUAL_MEDIDAS=<pasta> ...    grava um JSON por tela com tudo o que mediu
 *   VISUAL_SO_MEDIR=1 ...         mede e grava, mas não falha (para o "antes")
 *   VISUAL_TEMA=escuro ...        só um tema
 *
 * Corte de propósito (faixa que desliza, prévia que termina em degradê) leva
 * `data-corte-intencional` na caixa que corta.
 */

test.use({ serviceWorkers: 'block' });
test.describe.configure({ timeout: 300_000 });

/**
 * Lote 7 ("Cores e tema escuro"): cada tela passa também pelo tema escuro, a
 * 375 e a 1440. O tema claro continua nas três larguras do lote 5.
 */
type Tema = 'claro' | 'escuro';
interface Vista { tema: Tema; largura: number }
const VISTAS: Vista[] = [
  { tema: 'claro', largura: 375 },
  { tema: 'claro', largura: 768 },
  { tema: 'claro', largura: 1440 },
  { tema: 'escuro', largura: 375 },
  { tema: 'escuro', largura: 1440 },
];
const VISTAS_DAS_JANELAS: Vista[] = VISTAS.filter((v) => v.largura !== 768);
const TOQUE_MINIMO = 44;

type Papel = MockRole | 'publico';
interface Tela { nome: string; caminho: string }

const PUBLICAS: Tela[] = [
  { nome: 'inicio', caminho: '/' },
  { nome: 'entrar', caminho: '/auth' },
  { nome: 'definir-senha', caminho: '/definir-senha' },
  { nome: 'termos', caminho: '/terms-of-service' },
  { nome: 'privacidade', caminho: '/privacy-policy' },
  { nome: 'exclusao-de-dados', caminho: '/exclusao-de-dados' },
  { nome: 'nao-encontrada', caminho: '/pagina-que-nao-existe' },
  { nome: 'documentacao-api', caminho: '/api' },
];

function telasDoPainel(papel: MockRole): Tela[] {
  const caps = DEFAULT_CAPABILITIES[papel];
  const out: Tela[] = [];
  for (const t of TELAS) {
    if (t.capacidade && !caps[t.capacidade]) continue;
    if (papel === 'superadmin' && TELAS_SO_DE_LOJA.includes(t.chave)) continue;
    if (t.chave === 'settings') continue; // abas abaixo
    out.push({ nome: t.chave ? t.chave.replace(/\//g, '-') : 'dashboard', caminho: caminhoDaTela(t) });
  }
  for (const aba of ABAS_DE_CONFIGURACOES) {
    if (aba.requer && !caps[aba.requer]) continue;
    if (aba.soGerenteComApi && papel !== 'gerente') continue;
    out.push({ nome: `settings-${aba.value}`, caminho: `/dashboard/settings?tab=${aba.value}` });
  }
  return out;
}

const DESTINO_FOTOS = process.env.VISUAL_FOTOS;
const DESTINO_MEDIDAS = process.env.VISUAL_MEDIDAS;
const SO_MEDIR = !!process.env.VISUAL_SO_MEDIR;
const SO_TEMA = process.env.VISUAL_TEMA as Tema | undefined;
for (const d of [DESTINO_FOTOS, DESTINO_MEDIDAS]) if (d) fs.mkdirSync(d, { recursive: true });
const filtrarTema = (vs: Vista[]) => (SO_TEMA ? vs.filter((v) => v.tema === SO_TEMA) : vs);

/**
 * O tema sai de um cookie que o script de início copia para a chave do
 * next-themes antes de o app ler: o cookie muda entre uma visita e outra, o
 * script de início não.
 */
async function prepararTema(context: BrowserContext) {
  await context.addInitScript(() => {
    const m = document.cookie.match(/(?:^|; )e2e_tema=(light|dark)/);
    if (m) window.localStorage.setItem('theme', m[1]);
  });
}

async function usarTema(page: Page, tema: Tema) {
  const url = new URL(process.env.E2E_BASE_URL || 'http://localhost:8080');
  await page.context().addCookies([{ name: 'e2e_tema', value: tema === 'escuro' ? 'dark' : 'light', domain: url.hostname, path: '/' }]);
  await page.emulateMedia({ colorScheme: tema === 'escuro' ? 'dark' : 'light' });
}

async function conferirTema(page: Page, tema: Tema) {
  const escuro = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  expect(escuro, `o tema ${tema} não foi aplicado`).toBe(tema === 'escuro');
}

async function esperar(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page.locator('[data-testid="carregando-pagina"]').first().waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
  for (let i = 0; i < 15; i++) {
    const ocupada = await page.evaluate(() => !!document.querySelector('main .animate-spin, main .animate-pulse'));
    if (!ocupada) break;
    await page.waitForTimeout(400);
  }
  // Animações de entrada (fade, slide) terminam antes da foto e do contraste.
  await page.waitForTimeout(700);
}

/** Roda no navegador: rolagem lateral e alvos de toque pequenos. */
const MEDIR = (minimo: number) => {
  const vw = window.innerWidth;
  const visivel = (el: Element) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const descrever = (el: Element) => {
    const nome = el.getAttribute('aria-label') || (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40) || el.getAttribute('placeholder') || '';
    const cls = [...el.classList].slice(0, 2).join('.');
    return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''} "${nome}"`;
  };
  const pequenos: string[] = [];
  const ALVOS = 'button, a[href], [role="button"], [role="tab"], [role="switch"], [role="checkbox"], [role="radio"], [role="combobox"], input:not([type="hidden"]), select, textarea';
  for (const el of document.querySelectorAll(ALVOS)) {
    if (el.closest('[aria-hidden="true"], .react-flow, [data-sonner-toaster], [data-radix-popper-content-wrapper]')) continue;
    if (!visivel(el)) continue;
    // Caixa de marcar e chave do Radix: o alvo é o rótulo inteiro quando há <label>.
    if (el.matches('input[type="checkbox"], input[type="radio"]') && (el as HTMLElement).closest('label')) continue;
    // Link dentro de frase (WCAG 2.5.8, exceção "inline").
    if (el.tagName === 'A') {
      const pai = el.parentElement;
      const emLinha = getComputedStyle(el).display === 'inline';
      if (pai && emLinha && (pai.textContent ?? '').trim().length > (el.textContent ?? '').trim().length + 3) continue;
    }
    // Campo de arquivo escondido atrás de botão, sr-only etc.
    const r = el.getBoundingClientRect();
    if (r.width <= 2 || r.height <= 2) continue;
    // Alvo cuja área de toque foi esticada por um ::after (data-alvo-expandido,
    // chave e caixa de marcar; ver index.css). Não vale se o próprio elemento
    // corta o que passa da borda dele.
    const depois = getComputedStyle(el, '::after');
    const corta = /(hidden|clip)/.test(getComputedStyle(el).overflow);
    let w = r.width;
    let h = r.height;
    if (!corta && depois.content !== 'none' && depois.position === 'absolute') {
      w = Math.max(w, parseFloat(depois.width) || 0);
      h = Math.max(h, parseFloat(depois.height) || 0);
    }
    if (w + 0.5 < minimo || h + 0.5 < minimo) pequenos.push(`${descrever(el)} ${Math.round(w)}x${Math.round(h)}`);
  }
  return { scrollWidth: document.documentElement.scrollWidth, vw, pequenos };
};

/**
 * Roda no navegador: texto sobre fundo em degradê. O axe não mede contraste
 * sobre degradê (deixa o caso como "incompleto"), e foi assim que o destaque
 * "WhatsApp Business" da página de vendas passou o lote 5 com 1,1:1. Aqui o
 * contraste é medido contra CADA cor do degradê; vale a regra AA (4,5, ou 3
 * para texto grande).
 */
const TEXTO_SOBRE_DEGRADE = () => {
  const cor = (s: string) => {
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = '1'] = m[1].split(/[ ,/]+/).filter(Boolean);
    return { r: +r, g: +g, b: +b, a: +a };
  };
  const lum = ({ r, g, b }: { r: number; g: number; b: number }) => {
    const c = [r, g, b].map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const razao = (x: number, y: number) => (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  const falhas: string[] = [];
  for (const el of document.querySelectorAll<HTMLElement>('body *')) {
    const temTexto = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim());
    if (!temTexto || el.closest('[aria-hidden="true"]')) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || Number(cs.opacity) === 0 || el.getBoundingClientRect().width === 0) continue;
    // O fundo que pinta atrás do texto: o primeiro (dele ou de um antepassado) com degradê ou cor sólida.
    let fundo: Element | null = el;
    let degrade: string | null = null;
    while (fundo) {
      const f = getComputedStyle(fundo);
      if (f.backgroundImage.includes('gradient')) { degrade = f.backgroundImage; break; }
      const c = cor(f.backgroundColor);
      if (c && c.a >= 0.99) break;
      fundo = fundo.parentElement;
    }
    if (!degrade) continue;
    const texto = cor(cs.color);
    const paradas = (degrade.match(/rgba?\([^)]+\)/g) ?? []).map(cor).filter((c) => c && c.a >= 0.5);
    if (!texto || !paradas.length) continue;
    const tamanho = parseFloat(cs.fontSize);
    const grande = tamanho >= 24 || (tamanho >= 18.66 && Number(cs.fontWeight) >= 700);
    const minimo = grande ? 3 : 4.5;
    const pior = Math.min(...paradas.map((p) => razao(lum(texto), lum(p!))));
    if (pior < minimo) {
      falhas.push(`texto sobre degradê "${(el.textContent ?? '').trim().slice(0, 40)}" ${pior.toFixed(2)}:1 (mínimo ${minimo})`);
    }
  }
  return falhas;
};

/**
 * Roda no navegador: texto ou botão cortado por uma caixa com overflow hidden
 * (ou clip). Vale só o corte PARCIAL: o que está inteiro fora da caixa é
 * escondido de propósito (aba fechada, slide fora da vez). Reticências
 * (`truncate`) e `line-clamp` são corte assumido e passam. Uma caixa com
 * rolagem no meio do caminho encerra a busca: o resto se alcança rolando.
 */
const CORTADO = (escopo: string | null) => {
  const raiz = (escopo && document.querySelector(escopo)) || document.body;
  const ALVOS = 'button, a[href], [role="button"], [role="tab"], [role="switch"], [role="checkbox"], [role="combobox"], input:not([type="hidden"]), select, textarea';
  const esconde = (v: string) => v === 'hidden' || v === 'clip';
  const rola = (v: string) => v === 'auto' || v === 'scroll';
  const descrever = (el: Element) => {
    const nome = el.getAttribute('aria-label') || (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40) || el.getAttribute('placeholder') || '';
    const cls = [...el.classList].slice(0, 2).join('.');
    return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''} "${nome}"`;
  };
  const achados = new Set<string>();
  for (const el of raiz.querySelectorAll<HTMLElement>('*')) {
    if (achados.size >= 15) break;
    const temTexto = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim());
    if (!temTexto && !el.matches(ALVOS)) continue;
    if (el.closest('[aria-hidden="true"], .sr-only, .react-flow, [data-sonner-toaster], [data-corte-intencional], [hidden]')) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 2 || r.height <= 2) continue;
    const assumido = cs.textOverflow === 'ellipsis' || (cs.webkitLineClamp !== 'none' && cs.webkitLineClamp !== '');
    // 1. O texto não cabe na própria caixa, que esconde o resto.
    if (temTexto && !assumido) {
      if (esconde(cs.overflowX) && el.scrollWidth > el.clientWidth + 1) { achados.add(`${descrever(el)} cortado na própria caixa (${el.scrollWidth}px em ${el.clientWidth}px)`); continue; }
      if (esconde(cs.overflowY) && el.scrollHeight > el.clientHeight + 2) { achados.add(`${descrever(el)} cortado embaixo na própria caixa`); continue; }
    }
    // 2. Uma caixa de fora corta um pedaço dele.
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const pc = getComputedStyle(p);
      const hx = esconde(pc.overflowX);
      const hy = esconde(pc.overflowY);
      if (!hx && !hy) {
        if (rola(pc.overflowX) || rola(pc.overflowY)) break;
        continue;
      }
      const pr = p.getBoundingClientRect();
      if (pr.width < 4 || pr.height < 4) break; // caixa fechada (sanfona, lista recolhida)
      const esq = pr.left + p.clientLeft;
      const topo = pr.top + p.clientTop;
      const dir = esq + p.clientWidth;
      const base = topo + p.clientHeight;
      const dentro = r.right > esq && r.left < dir && r.bottom > topo && r.top < base;
      if (!dentro) break; // inteiro fora: escondido de propósito
      const cortaX = hx && (r.left < esq - 1 || r.right > dir + 1);
      const cortaY = hy && (r.top < topo - 1 || r.bottom > base + 1);
      if (cortaX || cortaY) {
        achados.add(`${descrever(el)} cortado ${cortaX ? 'dos lados' : 'em cima ou embaixo'} por ${descrever(p).split(' "')[0]}`);
        break;
      }
      if (rola(pc.overflowX) || rola(pc.overflowY)) break;
    }
  }
  return [...achados];
};

interface Medida {
  tema: Tema;
  largura: number;
  rolagemLateral: number | null;
  cortado: string[];
  contraste: string[];
  semNome: string[];
  outrasRegras: string[];
  toquePequeno: string[];
}

/** Regras do axe que reprovam a tela; o resto entra só no relatório. */
const REGRAS_QUE_REPROVAM = new Set(['color-contrast', 'button-name', 'link-name', 'label', 'select-name', 'aria-input-field-name', 'aria-toggle-field-name']);

interface Abertura {
  /** Abre a janela ou o estado a medir, já com a tela carregada. */
  abrir?: (page: Page) => Promise<void>;
  /** Mede só dentro deste seletor (a janela aberta). */
  escopo?: string;
  vistas?: Vista[];
}

async function medirTela(page: Page, papel: Papel, tela: Tela, { abrir, escopo, vistas = VISTAS }: Abertura = {}): Promise<Medida[]> {
  const medidas: Medida[] = [];
  for (const { tema, largura } of filtrarTema(vistas)) {
    await usarTema(page, tema);
    await page.setViewportSize({ width: largura, height: largura < 500 ? 812 : 900 });
    await page.goto(tela.caminho, { waitUntil: 'domcontentloaded' });
    await esperar(page);
    await conferirTema(page, tema);
    if (abrir) {
      await abrir(page);
      await page.waitForTimeout(900);
      if (escopo) await page.locator(escopo).first().waitFor({ timeout: 10_000 });
    }

    const m = await page.evaluate(MEDIR, TOQUE_MINIMO);
    const cortado = await page.evaluate(CORTADO, escopo ?? null);
    let construtor = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('[data-sonner-toaster]');
    if (escopo) construtor = construtor.include(escopo);
    const axe = await construtor.analyze();
    const contraste: string[] = escopo ? [] : await page.evaluate(TEXTO_SOBRE_DEGRADE);
    const semNome: string[] = [];
    const outrasRegras: string[] = [];
    for (const v of axe.violations) {
      for (const n of v.nodes) {
        const alvo = n.target.join(' ');
        // A mensagem antes do seletor: seletor comprido cortava o motivo.
        const linha = `${v.id}: ${n.any[0]?.message ?? n.failureSummary ?? ''} em ${alvo.slice(-140)}`.replace(/\s+/g, ' ').slice(0, 360);
        if (v.id === 'color-contrast') contraste.push(linha);
        else if (REGRAS_QUE_REPROVAM.has(v.id)) semNome.push(linha);
        else outrasRegras.push(linha);
      }
    }
    medidas.push({
      tema,
      largura,
      rolagemLateral: m.scrollWidth > largura + 1 ? m.scrollWidth : null,
      cortado,
      contraste,
      semNome,
      outrasRegras,
      toquePequeno: largura < 500 ? m.pequenos : [],
    });

    if (DESTINO_FOTOS) {
      await page.screenshot({ path: path.join(DESTINO_FOTOS, `${tema}__${largura}__${papel}__${tela.nome}.png`), fullPage: !escopo });
    }
  }
  if (DESTINO_MEDIDAS) {
    fs.writeFileSync(path.join(DESTINO_MEDIDAS, `${papel}__${tela.nome}${SO_TEMA ? '__' + SO_TEMA : ''}.json`), JSON.stringify(medidas, null, 2));
  }
  return medidas;
}

function conferir(papel: Papel, tela: Tela, medidas: Medida[]) {
  const problemas: string[] = [];
  for (const m of medidas) {
    const v = `[${m.tema} ${m.largura}]`;
    if (m.rolagemLateral) problemas.push(`${v} rola para o lado: ${m.rolagemLateral}px`);
    for (const c of m.cortado) problemas.push(`${v} ${c}`);
    for (const c of m.contraste) problemas.push(`${v} ${c}`);
    for (const c of m.semNome) problemas.push(`${v} ${c}`);
    for (const c of m.toquePequeno) problemas.push(`${v} toque menor que ${TOQUE_MINIMO}px: ${c}`);
  }
  if (SO_MEDIR) return;
  expect(problemas, `${papel} ${tela.caminho}:\n${problemas.join('\n')}`).toEqual([]);
}

test.describe('visual: páginas públicas', () => {
  for (const tela of PUBLICAS) {
    test(`publico ${tela.nome}`, async ({ context }) => {
      await prepararTema(context);
      await installSupabaseMock(context, 'gerente', { sessao: false });
      const page = await context.newPage();
      conferir('publico', tela, await medirTela(page, 'publico', tela));
    });
  }
});

/**
 * Telas de layout fixo (lote 6a, A2): a página inteira cabe na janela de um
 * notebook, sem rolagem vertical, e o rodapé de cada uma (marcado com
 * data-rodape-fixo: "Salvar" do painel do bloco, controles do desenho da
 * automação, campo de mensagem de Conversas) fica inteiro à vista. O
 * construtor de chatbot passava 96 px da janela e escondia o "Salvar".
 */
const NOTEBOOKS = [
  [1366, 768],
  [1440, 900],
] as const;

const TELAS_FIXAS: { nome: string; caminho: string; preparar: (page: Page) => Promise<void> }[] = [
  {
    nome: 'construtor-de-chatbot',
    caminho: '/dashboard/chatbots/aaaaaaaa-0000-4000-8000-000000000001/builder',
    preparar: async (page) => {
      await page.locator('.react-flow__node').first().waitFor({ timeout: 20_000 });
      // Os blocos do backend falso nascem empilhados: o de cima é o último.
      await page.locator('.react-flow__node').last().click({ force: true });
    },
  },
  {
    nome: 'construtor-de-automacao',
    caminho: '/dashboard/automation',
    preparar: async (page) => {
      await page.getByRole('button', { name: /nova automa/i }).first().click();
    },
  },
  {
    nome: 'conversas',
    caminho: '/dashboard/conversations',
    preparar: async (page) => {
      await page.locator('[data-conversation-id]').first().click();
    },
  },
];

test.describe('visual: telas de layout fixo cabem na janela', () => {
  for (const [largura, altura] of NOTEBOOKS) {
    for (const tela of TELAS_FIXAS) {
      test(`${tela.nome} ${largura}x${altura}`, async ({ context }) => {
        await installSupabaseMock(context, 'gerente');
        const page = await context.newPage();
        await page.setViewportSize({ width: largura, height: altura });
        await page.goto(tela.caminho, { waitUntil: 'domcontentloaded' });
        await esperar(page);
        await tela.preparar(page);
        await page.waitForTimeout(800);
        const m = await page.evaluate(() => {
          window.scrollTo(0, 0);
          const rodapes = [...document.querySelectorAll<HTMLElement>('[data-rodape-fixo]')]
            .filter((el) => el.getBoundingClientRect().height > 0)
            .map((el) => {
              const r = el.getBoundingClientRect();
              return { topo: Math.round(r.top), base: Math.round(r.bottom) };
            });
          const topo = document.querySelector('[data-topo-do-painel]')?.getBoundingClientRect();
          return {
            sobra: document.scrollingElement!.scrollHeight - innerHeight,
            janela: innerHeight,
            rodapes,
            topo: topo ? { topo: Math.round(topo.top), altura: Math.round(topo.height) } : null,
          };
        });
        if (DESTINO_FOTOS) {
          await page.screenshot({ path: path.join(DESTINO_FOTOS, `fixa__${tela.nome}__${largura}x${altura}.png`) });
        }
        if (SO_MEDIR) return;
        expect(m.sobra, `${tela.nome}: a página passa ${m.sobra} px da janela`).toBeLessThanOrEqual(1);
        expect(m.topo, `${tela.nome}: o topo do painel não está no alto da janela`).toEqual({ topo: 0, altura: expect.any(Number) });
        expect(m.topo!.altura).toBeGreaterThanOrEqual(48);
        expect(m.rodapes.length, `${tela.nome}: nenhum rodapé [data-rodape-fixo] à vista`).toBeGreaterThan(0);
        for (const r of m.rodapes) {
          expect(r.base, `${tela.nome}: rodapé termina em ${r.base} px, a janela tem ${m.janela}`).toBeLessThanOrEqual(m.janela);
          expect(r.topo).toBeGreaterThanOrEqual(0);
        }
      });
    }
  }
});

/**
 * Topo preso (2026-11): o topo do painel (faixa de manutenção + Navbar) fica
 * no alto da janela quando a página rola, e o menu lateral também (768 em
 * diante). Até ali o topo rolava junto e sumia em toda tela mais alta que a
 * janela; Gestão de Usuários foi onde o cliente viu.
 *
 * Um bloco alto e vazio no fim da página faz TODA tela rolar, até a que cabe
 * na janela. Rola até o fim e reprova quando o topo não está inteiro no alto,
 * quando outra coisa cobre o meio dele ou quando o menu lateral sai do alto.
 * Na Ajuda o bloco entra dentro da página (a busca presa só vale dentro dela)
 * e a busca tem de ficar inteira abaixo do topo. As telas de altura travada
 * (Conversas e os construtores) ficam no teste delas, sem o bloco.
 */
const VISTAS_DO_TOPO = [
  [375, 812],
  [768, 1024],
  [1366, 768],
  [1440, 900],
] as const;
const TELAS_DE_ALTURA_TRAVADA = ['conversations'];

/** Roda no navegador: põe o bloco alto, rola até o fim e mede o topo. */
const MEDIR_TOPO_ROLADO = async () => {
  const descrever = (el: Element | null) =>
    el ? `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 3).join('.')} "${(el.textContent ?? '').trim().slice(0, 30)}"` : 'nada';
  const busca = document.querySelector<HTMLElement>('[data-busca-da-ajuda]');
  if (!document.querySelector('[data-e2e-espaco]')) {
    const espaco = document.createElement('div');
    espaco.setAttribute('data-e2e-espaco', '');
    espaco.style.height = '3000px';
    (busca?.parentElement ?? document.querySelector('main'))?.appendChild(espaco);
  }
  const se = document.scrollingElement!;
  window.scrollTo({ top: se.scrollHeight, behavior: 'instant' });
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await new Promise((r) => setTimeout(r, 150));

  const topo = document.querySelector('[data-topo-do-painel]');
  const r = topo?.getBoundingClientRect();
  const cobertos: string[] = [];
  if (topo && r) {
    const y = r.top + r.height / 2;
    for (const f of [0.25, 0.5, 0.75]) {
      const el = document.elementFromPoint(r.left + r.width * f, y);
      // Aviso (toast) pode passar por cima do topo: ele some sozinho.
      if (el && !topo.contains(el) && !el.closest('[data-sonner-toaster]')) cobertos.push(descrever(el));
    }
  }
  const lateral = document.querySelector('[data-menu-lateral]')?.getBoundingClientRect();
  const b = busca?.getBoundingClientRect();
  const noMeioDaBusca = b ? document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2) : null;
  return {
    rolou: Math.round(se.scrollTop),
    janela: innerHeight,
    topo: r ? { topo: Math.round(r.top), base: Math.round(r.bottom), altura: Math.round(r.height) } : null,
    cobertos,
    lateral: lateral && lateral.width > 0 ? { topo: Math.round(lateral.top), base: Math.round(lateral.bottom) } : null,
    busca: b
      ? { topo: Math.round(b.top), base: Math.round(b.bottom), coberta: !!noMeioDaBusca && !busca!.contains(noMeioDaBusca) ? descrever(noMeioDaBusca) : null }
      : null,
  };
};

test.describe('visual: o topo fica no alto quando a página rola', () => {
  for (const papel of ['superadmin', 'gerente', 'gestor', 'atendente'] as MockRole[]) {
    for (const tela of telasDoPainel(papel).filter((t) => !TELAS_DE_ALTURA_TRAVADA.includes(t.nome))) {
      test(`topo ${papel} ${tela.nome}`, async ({ context }) => {
        await installSupabaseMock(context, papel);
        const page = await context.newPage();
        for (const [largura, altura] of VISTAS_DO_TOPO) {
          const onde = `${papel} ${tela.nome} ${largura}x${altura}`;
          await page.setViewportSize({ width: largura, height: altura });
          await page.goto(tela.caminho, { waitUntil: 'domcontentloaded' });
          await esperar(page);
          const m = await page.evaluate(MEDIR_TOPO_ROLADO);
          if (DESTINO_MEDIDAS) {
            fs.writeFileSync(path.join(DESTINO_MEDIDAS, `topo__${papel}__${tela.nome}__${largura}.json`), JSON.stringify(m, null, 2));
          }
          if (SO_MEDIR) continue;
          expect(m.rolou, `${onde}: a página não rolou`).toBeGreaterThan(1000);
          expect(m.topo, `${onde}: sem o topo do painel`).not.toBeNull();
          expect(m.topo!.topo, `${onde}: o topo saiu do alto da janela (está em ${m.topo!.topo} px)`).toBe(0);
          expect(m.topo!.altura).toBeGreaterThanOrEqual(48);
          expect(m.topo!.base).toBeLessThanOrEqual(m.janela);
          expect(m.cobertos, `${onde}: algo cobre o topo`).toEqual([]);
          if (largura >= 768) {
            expect(m.lateral, `${onde}: o menu lateral saiu do alto`).toEqual({ topo: 0, base: m.janela });
          }
          if (tela.nome === 'help') {
            expect(m.busca, `${onde}: sem a busca da Ajuda`).not.toBeNull();
            expect(m.busca!.topo, `${onde}: a busca da Ajuda ficou atrás do topo`).toBeGreaterThanOrEqual(m.topo!.base);
            expect(m.busca!.base).toBeLessThanOrEqual(m.janela);
            expect(m.busca!.coberta, `${onde}: algo cobre a busca da Ajuda`).toBeNull();
          }
        }
      });
    }
  }

  // Link para uma entrada da Ajuda: o título para abaixo do topo e da busca.
  for (const [largura, altura] of [[375, 667], [1440, 900]] as const) {
    test(`ajuda: link com # para abaixo do topo ${largura}x${altura}`, async ({ context }) => {
      await installSupabaseMock(context, 'gerente');
      const page = await context.newPage();
      await page.setViewportSize({ width: largura, height: altura });
      await page.goto('/dashboard/help#page:campaigns', { waitUntil: 'domcontentloaded' });
      await esperar(page);
      await page.waitForTimeout(1200); // a página rola sozinha, com animação
      const m = await page.evaluate(() => {
        const titulo = document.getElementById('page:campaigns')?.querySelector('button')?.getBoundingClientRect();
        const busca = document.querySelector('[data-busca-da-ajuda]')!.getBoundingClientRect();
        const topo = document.querySelector('[data-topo-do-painel]')!.getBoundingClientRect();
        return {
          rolou: Math.round(document.scrollingElement!.scrollTop),
          titulo: titulo ? Math.round(titulo.top) : null,
          busca: Math.round(busca.bottom),
          topo: Math.round(topo.bottom),
        };
      });
      expect(m.rolou, 'a página não rolou até a entrada').toBeGreaterThan(0);
      expect(m.titulo).not.toBeNull();
      expect(m.titulo!, `o título ficou atrás do topo (${m.topo} px)`).toBeGreaterThanOrEqual(m.topo);
      expect(m.titulo!, `o título ficou atrás da busca (${m.busca} px)`).toBeGreaterThanOrEqual(m.busca);
    });
  }

  // Campo focado depois de rolar (o teclado do celular vem com o foco): a
  // página traz o campo de volta abaixo do topo, não atrás dele.
  test('campo focado no celular para abaixo do topo', async ({ context }) => {
    await installSupabaseMock(context, 'gerente');
    const page = await context.newPage();
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/dashboard/profile', { waitUntil: 'domcontentloaded' });
    await esperar(page);
    await page.evaluate(MEDIR_TOPO_ROLADO);
    const m = await page.evaluate(async () => {
      const campo = [...document.querySelectorAll<HTMLInputElement>('main input:not([type="hidden"]):not([disabled])')]
        .find((el) => el.getBoundingClientRect().height > 0)!;
      campo.focus();
      // O ajuste do DashboardLayout (Safari) espera um quadro.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const r = campo.getBoundingClientRect();
      const topo = document.querySelector('[data-topo-do-painel]')!.getBoundingClientRect();
      return { campo: Math.round(r.top), base: Math.round(r.bottom), topo: Math.round(topo.bottom), janela: innerHeight };
    });
    expect(m.campo, `o campo focado ficou atrás do topo (${m.topo} px)`).toBeGreaterThanOrEqual(m.topo);
    expect(m.base).toBeLessThanOrEqual(m.janela);
  });
});

for (const papel of ['superadmin', 'gerente', 'gestor', 'atendente'] as MockRole[]) {
  test.describe(`visual: ${papel}`, () => {
    for (const tela of telasDoPainel(papel)) {
      test(`${papel} ${tela.nome}`, async ({ context }) => {
        await prepararTema(context);
        await installSupabaseMock(context, papel);
        const page = await context.newPage();
        conferir(papel, tela, await medirTela(page, papel, tela));
      });
    }
  });
}

/**
 * Janelas principais abertas (lote 7), do Gerente, que alcança todas. Cada
 * linha diz a tela, o botão que abre e o que medir: a janela (role dialog) ou
 * a tela inteira, quando o que abre não é janela (conversa aberta no celular).
 * Botão renomeado quebra o teste: é de propósito, para a lista não mentir.
 */
const JANELA = '[role="dialog"], [role="alertdialog"]';
const clicar = (nome: RegExp | string) => async (page: Page) => {
  await page.locator('main').getByRole('button', { name: nome }).first().click();
};
const JANELAS: { nome: string; caminho: string; abrir: (page: Page) => Promise<void>; escopo?: string }[] = [
  { nome: 'conversa-aberta', caminho: '/dashboard/conversations', abrir: async (page) => { await page.locator('[data-conversation-id]').first().click(); } },
  { nome: 'nova-conversa', caminho: '/dashboard/conversations', abrir: clicar('Nova Conversa'), escopo: JANELA },
  { nome: 'novo-contato', caminho: '/dashboard/contacts', abrir: clicar('Novo Contato'), escopo: JANELA },
  { nome: 'novo-lead', caminho: '/dashboard/funnel', abrir: clicar('Novo Lead'), escopo: JANELA },
  { nome: 'configurar-etapas', caminho: '/dashboard/funnel', abrir: clicar('Configurar etapas'), escopo: JANELA },
  { nome: 'nova-fonte', caminho: '/dashboard/tracking', abrir: clicar('Nova fonte'), escopo: JANELA },
  { nome: 'novo-relatorio', caminho: '/dashboard/reports', abrir: clicar('Novo Relatório'), escopo: JANELA },
  { nome: 'novo-chatbot', caminho: '/dashboard/chatbots', abrir: clicar('Novo Chatbot'), escopo: JANELA },
  // Nova campanha abre um cartão na própria tela, não uma janela: mede a tela inteira.
  { nome: 'nova-campanha', caminho: '/dashboard/campaigns', abrir: clicar('Nova Campanha') },
  { nome: 'relatorios-das-campanhas', caminho: '/dashboard/campaigns', abrir: clicar(/^Relatórios$/), escopo: JANELA },
  {
    nome: 'detalhes-da-campanha',
    caminho: '/dashboard/campaigns',
    abrir: async (page) => {
      await page.getByRole('button', { name: /^Mais ações da campanha/ }).first().click();
      await page.getByRole('menuitem', { name: 'Ver detalhes' }).click();
    },
    escopo: JANELA,
  },
  { nome: 'novo-follow-up', caminho: '/dashboard/followups', abrir: clicar('Novo Follow up'), escopo: JANELA },
  { nome: 'calendario-de-follow-ups', caminho: '/dashboard/followups', abrir: clicar('Calendário'), escopo: JANELA },
  { nome: 'conectar-numero', caminho: '/dashboard/whatsapp-numbers', abrir: clicar('Conectar número'), escopo: JANELA },
  { nome: 'detalhes-do-numero', caminho: '/dashboard/whatsapp-numbers', abrir: clicar('Detalhes e chave'), escopo: JANELA },
  { nome: 'qr-code', caminho: '/dashboard/whatsapp-numbers', abrir: clicar('Conectar pelo QR Code'), escopo: JANELA },
  { nome: 'convidar', caminho: '/dashboard/team', abrir: clicar('Convidar'), escopo: JANELA },
  { nome: 'nova-loja', caminho: '/dashboard/team', abrir: clicar('Nova Loja'), escopo: JANELA },
  { nome: 'nova-resposta-rapida', caminho: '/dashboard/settings?tab=quick-replies', abrir: clicar('Nova resposta'), escopo: JANELA },
  { nome: 'nova-chave-de-api', caminho: '/dashboard/settings?tab=api', abrir: clicar('Nova chave'), escopo: JANELA },
];

test.describe('visual: janelas abertas', () => {
  for (const j of JANELAS) {
    test(`janela ${j.nome}`, async ({ context }) => {
      await prepararTema(context);
      await installSupabaseMock(context, 'gerente');
      const page = await context.newPage();
      const tela = { nome: `janela-${j.nome}`, caminho: j.caminho };
      conferir('gerente', tela, await medirTela(page, 'gerente', tela, { abrir: j.abrir, escopo: j.escopo, vistas: VISTAS_DAS_JANELAS }));
    });
  }
});
