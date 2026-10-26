/**
 * Garantias dos tours do onboarding.
 *
 * O balão aponta para `[data-tour="..."]`. Se alguém mexe na tela e a marca
 * some, o tour não quebra na hora: ele cai no cartão do centro, em silêncio, e
 * o destaque some sem ninguém perceber. Este teste é a rede: varre o src/ atrás
 * das marcas e QUEBRA quando um passo aponta para uma que não existe mais.
 * Mesmo modelo de src/lib/help/featureHelp.test.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ROLE_ORDER } from '@/types/userHierarchy';
import { TELAS } from '@/lib/access/telas';
import { TOURS, getTour, menuCardBody, routeMatches } from './tours';
import { CHECKLISTS, PRIORITY_LABELS } from './checklist';
import {
  CHECKLIST_DONE_BODY,
  CHECKLIST_DONE_TITLE,
  CHECKLIST_SUBTITLE,
  WELCOME_COPY,
  WELCOME_FOOTNOTE,
  welcomeTitle,
} from './welcome';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(HERE, '..', '..');

/** `data-tour="x"`, `data-tour={'x'}` e `dataTour: 'x'` (itens do menu). */
const MARCA = /data-?[tT]our\s*[=:]\s*\{?\s*['"]([a-z0-9-]+)['"]/g;

function arquivosDoSrc(dir: string, out: string[] = []): string[] {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      arquivosDoSrc(full, out);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(item.name) || /\.(test|spec)\.tsx?$/.test(item.name)) continue;
    out.push(full);
  }
  return out;
}

interface Marca {
  nome: string;
  arquivo: string;
}

function marcasNoSrc(): Marca[] {
  const marcas: Marca[] = [];
  for (const arquivo of arquivosDoSrc(SRC_DIR)) {
    const fonte = fs.readFileSync(arquivo, 'utf8');
    const rel = `src/${path.relative(SRC_DIR, arquivo).replace(/\\/g, '/')}`;
    MARCA.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = MARCA.exec(fonte)) !== null) if (m[1]) marcas.push({ nome: m[1], arquivo: rel });
  }
  return marcas;
}

const MARCAS = marcasNoSrc();
const NOMES = new Set(MARCAS.map((m) => m.nome));
const DO_MENU = new Set(MARCAS.filter((m) => m.arquivo === 'src/components/layout/Sidebar.tsx').map((m) => m.nome));

function rotasDoDashboard(): string[] {
  const fonte = fs.readFileSync(path.join(SRC_DIR, 'App.tsx'), 'utf8');
  const rotas = new Set<string>(['/dashboard']);
  for (const m of fonte.matchAll(/<Route\s+path="([^"]+)"/g)) {
    const raw = m[1] ?? '';
    if (!raw || raw.startsWith('/') || raw === '*' || raw.includes(':')) continue;
    rotas.add(`/dashboard/${raw}`);
  }
  return [...rotas];
}

// ---------------------------------------------------------------------------
describe('marcas data-tour', () => {
  it('a varredura acha as marcas (ela mesma funciona)', () => {
    expect(MARCAS.length).toBeGreaterThan(15);
  });

  it('todo passo de todo tour aponta para uma marca que existe no src/', () => {
    const faltando = TOURS.flatMap((t) =>
      t.steps.filter((s) => s.target && !NOMES.has(s.target)).map((s) => `${t.id} → ${s.target}`),
    );
    expect(faltando, 'Passo de tour apontando para data-tour que não existe mais').toEqual([]);
  });

  it('toda marca é usada por algum tour (marca solta é tour esquecido)', () => {
    const usadas = new Set(TOURS.flatMap((t) => t.steps.map((s) => s.target).filter(Boolean)));
    const soltas = MARCAS.filter((m) => !usadas.has(m.nome)).map((m) => `${m.nome} (${m.arquivo})`);
    expect(soltas).toEqual([]);
  });

  it('cada marca é declarada uma vez só no código (senão o balão pode achar a errada)', () => {
    const contagem = new Map<string, number>();
    for (const m of MARCAS) contagem.set(m.nome, (contagem.get(m.nome) ?? 0) + 1);
    const repetidas = [...contagem].filter(([, n]) => n > 1).map(([nome]) => nome);
    expect(repetidas).toEqual([]);
  });

  it('passo que aponta para o menu declara menuItem (no celular vira o cartão "Abra o menu")', () => {
    for (const t of TOURS) {
      for (const s of t.steps) {
        if (s.target && DO_MENU.has(s.target)) {
          expect(s.menuItem, `${t.id} → ${s.target}: aponta para o menu sem menuItem`).toBeTruthy();
        }
        if (s.menuItem) expect(DO_MENU.has(s.target ?? ''), `${t.id}: menuItem sem alvo no menu`).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
describe('integridade dos tours', () => {
  it('ids únicos, ao menos um passo cada', () => {
    const ids = TOURS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of TOURS) expect(t.steps.length, t.id).toBeGreaterThan(0);
  });

  it('a tela de todo tour é uma rota real de App.tsx', () => {
    const rotas = rotasDoDashboard();
    const quebradas = TOURS.filter((t) => !rotas.includes(new URL(t.route, 'https://x.invalid').pathname)).map(
      (t) => `${t.id} → ${t.route}`,
    );
    expect(quebradas).toEqual([]);
  });

  it('todo moduleName é módulo do registro de telas e todo minRole é cargo válido', () => {
    const guardados = new Set(TELAS.map((t) => t.modulo).filter(Boolean));
    for (const def of [...TOURS, ...Object.values(CHECKLISTS).flat()]) {
      if (def.moduleName) expect(guardados.has(def.moduleName), `${def.id} → ${def.moduleName}`).toBe(true);
      if (def.minRole) expect(Object.keys(ROLE_ORDER)).toContain(def.minRole);
    }
  });

  it('o tour de Conversas do atendente tem 4 passos', () => {
    expect(getTour('conversas')?.steps).toHaveLength(4);
  });

  it('todo tour pedido pela lista ou pela boas-vindas existe', () => {
    const pedidos = new Set(['primeiros-passos', 'conversas', 'escolher-loja', 'criar-loja']);
    for (const def of Object.values(CHECKLISTS).flat()) if (def.tourId) pedidos.add(def.tourId);
    for (const id of pedidos) expect(getTour(id), id).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
describe('texto do onboarding', () => {
  // Hífen, hífen inseparável, travessões e afins. Pedido do dono: nada disso no
  // texto que a pessoa lê.
  const TRACO = /[-‐‑‒–—―−]/;

  const textos: Array<[string, string]> = [
    ...TOURS.flatMap((t) => t.steps.flatMap((s, i): Array<[string, string]> => [
      [`${t.id}#${i} título`, s.title],
      [`${t.id}#${i} texto`, s.body],
      ...(s.menuItem ? [[`${t.id}#${i} menu`, menuCardBody(s.menuItem)] as [string, string]] : []),
    ])),
    ...Object.values(CHECKLISTS).flat().flatMap((d): Array<[string, string]> => [
      [`${d.id} título`, d.title],
      [`${d.id} descrição`, d.description],
    ]),
    ...Object.entries(PRIORITY_LABELS).map(([k, v]): [string, string] => [`prioridade ${k}`, v]),
    ...Object.entries(WELCOME_COPY).flatMap(([papel, c]): Array<[string, string]> => [
      [`boas-vindas ${papel}`, c.intro],
      ...c.bullets.map((b, i): [string, string] => [`boas-vindas ${papel} #${i}`, b]),
    ]),
    ...Object.entries(CHECKLIST_SUBTITLE).map(([k, v]): [string, string] => [`subtítulo ${k}`, v]),
    ['rodapé da boas-vindas', WELCOME_FOOTNOTE],
    ['lista pronta (título)', CHECKLIST_DONE_TITLE],
    ['lista pronta (texto)', CHECKLIST_DONE_BODY],
    ['título da boas-vindas', welcomeTitle('Ana')],
  ];

  it('sem hífen nem travessão', () => {
    const comTraco = textos.filter(([, t]) => TRACO.test(t)).map(([onde, t]) => `${onde}: ${t}`);
    expect(comTraco).toEqual([]);
  });

  it('nada vazio, e frases curtas (balão de celular)', () => {
    for (const [onde, t] of textos) {
      expect(t.trim(), onde).not.toBe('');
      expect(t.length, `${onde} passou de 200 caracteres`).toBeLessThanOrEqual(200);
    }
  });

  it('cartão do menu no celular', () => {
    expect(menuCardBody('Ajuda')).toBe('Abra o menu ☰ no topo e toque em Ajuda.');
  });
});

// ---------------------------------------------------------------------------
describe('routeMatches', () => {
  it('compara caminho e os parâmetros exigidos pela rota do tour', () => {
    expect(routeMatches('/dashboard/team', '/dashboard/team', '')).toBe(true);
    expect(routeMatches('/dashboard/team', '/dashboard/team/', '?x=1')).toBe(true);
    expect(routeMatches('/dashboard/settings?tab=quick-replies', '/dashboard/settings', '?tab=quick-replies')).toBe(true);
    expect(routeMatches('/dashboard/settings?tab=quick-replies', '/dashboard/settings', '?tab=profile')).toBe(false);
    expect(routeMatches('/dashboard/settings?tab=quick-replies', '/dashboard/settings', '')).toBe(false);
    expect(routeMatches('/dashboard', '/dashboard/team', '')).toBe(false);
  });
});
