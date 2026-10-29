import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
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
 * Falha quando:
 *   1. a página rola para o lado (scrollWidth maior que a janela);
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
 */

test.use({ serviceWorkers: 'block' });
test.describe.configure({ timeout: 300_000 });

const LARGURAS = [375, 768, 1440] as const;
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
for (const d of [DESTINO_FOTOS, DESTINO_MEDIDAS]) if (d) fs.mkdirSync(d, { recursive: true });

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

interface Medida {
  largura: number;
  rolagemLateral: number | null;
  contraste: string[];
  semNome: string[];
  outrasRegras: string[];
  toquePequeno: string[];
}

/** Regras do axe que reprovam a tela; o resto entra só no relatório. */
const REGRAS_QUE_REPROVAM = new Set(['color-contrast', 'button-name', 'link-name', 'label', 'select-name', 'aria-input-field-name', 'aria-toggle-field-name']);

async function medirTela(page: Page, papel: Papel, tela: Tela): Promise<Medida[]> {
  const medidas: Medida[] = [];
  for (const largura of LARGURAS) {
    await page.setViewportSize({ width: largura, height: largura < 500 ? 812 : 900 });
    await page.goto(tela.caminho, { waitUntil: 'domcontentloaded' });
    await esperar(page);

    const m = await page.evaluate(MEDIR, TOQUE_MINIMO);
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .exclude('[data-sonner-toaster]')
      .analyze();
    const contraste: string[] = await page.evaluate(TEXTO_SOBRE_DEGRADE);
    const semNome: string[] = [];
    const outrasRegras: string[] = [];
    for (const v of axe.violations) {
      for (const n of v.nodes) {
        const alvo = n.target.join(' ');
        const linha = `${v.id}: ${alvo} ${n.any[0]?.message ?? n.failureSummary ?? ''}`.replace(/\s+/g, ' ').slice(0, 260);
        if (v.id === 'color-contrast') contraste.push(linha);
        else if (REGRAS_QUE_REPROVAM.has(v.id)) semNome.push(linha);
        else outrasRegras.push(linha);
      }
    }
    medidas.push({
      largura,
      rolagemLateral: m.scrollWidth > largura + 1 ? m.scrollWidth : null,
      contraste,
      semNome,
      outrasRegras,
      toquePequeno: largura < 500 ? m.pequenos : [],
    });

    if (DESTINO_FOTOS) {
      await page.screenshot({ path: path.join(DESTINO_FOTOS, `${largura}__${papel}__${tela.nome}.png`), fullPage: true });
    }
  }
  if (DESTINO_MEDIDAS) {
    fs.writeFileSync(path.join(DESTINO_MEDIDAS, `${papel}__${tela.nome}.json`), JSON.stringify(medidas, null, 2));
  }
  return medidas;
}

function conferir(papel: Papel, tela: Tela, medidas: Medida[]) {
  const problemas: string[] = [];
  for (const m of medidas) {
    if (m.rolagemLateral) problemas.push(`[${m.largura}] rola para o lado: ${m.rolagemLateral}px`);
    for (const c of m.contraste) problemas.push(`[${m.largura}] ${c}`);
    for (const c of m.semNome) problemas.push(`[${m.largura}] ${c}`);
    for (const c of m.toquePequeno) problemas.push(`[${m.largura}] toque menor que ${TOQUE_MINIMO}px: ${c}`);
  }
  if (SO_MEDIR) return;
  expect(problemas, `${papel} ${tela.caminho}:\n${problemas.join('\n')}`).toEqual([]);
}

test.describe('visual: páginas públicas', () => {
  for (const tela of PUBLICAS) {
    test(`publico ${tela.nome}`, async ({ context }) => {
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
          return { sobra: document.scrollingElement!.scrollHeight - innerHeight, janela: innerHeight, rodapes };
        });
        if (DESTINO_FOTOS) {
          await page.screenshot({ path: path.join(DESTINO_FOTOS, `fixa__${tela.nome}__${largura}x${altura}.png`) });
        }
        if (SO_MEDIR) return;
        expect(m.sobra, `${tela.nome}: a página passa ${m.sobra} px da janela`).toBeLessThanOrEqual(1);
        expect(m.rodapes.length, `${tela.nome}: nenhum rodapé [data-rodape-fixo] à vista`).toBeGreaterThan(0);
        for (const r of m.rodapes) {
          expect(r.base, `${tela.nome}: rodapé termina em ${r.base} px, a janela tem ${m.janela}`).toBeLessThanOrEqual(m.janela);
          expect(r.topo).toBeGreaterThanOrEqual(0);
        }
      });
    }
  }
});

for (const papel of ['superadmin', 'gerente', 'gestor', 'atendente'] as MockRole[]) {
  test.describe(`visual: ${papel}`, () => {
    for (const tela of telasDoPainel(papel)) {
      test(`${papel} ${tela.nome}`, async ({ context }) => {
        await installSupabaseMock(context, papel);
        const page = await context.newPage();
        conferir(papel, tela, await medirTela(page, papel, tela));
      });
    }
  });
}
