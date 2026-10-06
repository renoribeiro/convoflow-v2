import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Guarda de integridade de rotas.
 *
 * Link interno que aponta para caminho inexistente cai no NotFound, e isso nao
 * aparece em nenhum teste de componente: o <Link> renderiza igual. Aqui a gente
 * le as rotas reais de src/App.tsx e confere todo destino estatico do produto
 * contra elas.
 *
 * So vale para arquivo alcancavel a partir de src/main.tsx — link quebrado em
 * componente orfao nao chega no usuario e nao pode reprovar o build.
 */

const ROOT = resolve(__dirname, '../..');
const SRC = join(ROOT, 'src');
const norm = (p: string) => p.split('\\').join('/');

// ---------------------------------------------------------------- rotas reais
function rotasDeclaradas(): string[] {
  const app = readFileSync(join(SRC, 'App.tsx'), 'utf8');
  const rotas: string[] = [];

  // <Route path="x"> aninhado em <Route path="/dashboard">
  const dashboardBloco = app.slice(app.indexOf('path="/dashboard"'));
  for (const m of app.matchAll(/<Route\s+path="([^"]+)"/g)) {
    const p = m[1];
    if (p === '*') continue;
    if (p.startsWith('/')) rotas.push(p);
  }
  for (const m of dashboardBloco.matchAll(/<Route\s+path="([^"]+)"/g)) {
    const p = m[1];
    if (p === '*' || p.startsWith('/')) continue;
    rotas.push(`/dashboard/${p}`);
  }
  rotas.push('/dashboard'); // <Route index>
  return [...new Set(rotas)];
}

const ROTAS = rotasDeclaradas();

function rotaExiste(destino: string): boolean {
  const caminho = destino.split('?')[0].split('#')[0].replace(/\/$/, '') || '/';
  return ROTAS.some((r) => {
    if (r === caminho) return true;
    if (!r.includes(':')) return false;
    const re = new RegExp('^' + r.replace(/:[^/]+/g, '[^/]+') + '$');
    return re.test(caminho);
  });
}

// --------------------------------------------------------------- alcancaveis
const EXTS = ['.tsx', '.ts', '/index.tsx', '/index.ts'];
function resolverImport(spec: string, de: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(de), spec);
  else return null;
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const e of EXTS) {
    const c = base + e;
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

function arquivosAlcancaveis(): Set<string> {
  const vistos = new Set<string>();
  const fila = [join(SRC, 'main.tsx'), join(SRC, 'App.tsx')].filter(existsSync);
  fila.forEach((f) => vistos.add(f));
  while (fila.length) {
    const f = fila.pop()!;
    let texto: string;
    try {
      texto = readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    for (const m of texto.matchAll(/(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g)) {
      const alvo = resolverImport(m[1], f);
      if (alvo && !vistos.has(alvo)) {
        vistos.add(alvo);
        fila.push(alvo);
      }
    }
  }
  return vistos;
}

function tsxAlcancaveis(): string[] {
  const alcancaveis = arquivosAlcancaveis();
  const todos: string[] = [];
  (function anda(dir: string) {
    for (const nome of readdirSync(dir)) {
      const p = join(dir, nome);
      if (statSync(p).isDirectory()) anda(p);
      else if (/\.tsx$/.test(nome) && !/\.(test|spec)\.tsx$/.test(nome)) todos.push(p);
    }
  })(SRC);
  return todos.filter((f) => alcancaveis.has(f));
}

// ------------------------------------------------------------------- destinos
interface Destino {
  arquivo: string;
  linha: number;
  destino: string;
  origem: string;
}

function destinosInternos(): Destino[] {
  const achados: Destino[] = [];
  for (const arquivo of tsxAlcancaveis()) {
    const texto = readFileSync(arquivo, 'utf8');
    const rel = norm(arquivo.slice(ROOT.length + 1));
    const linhaDe = (i: number) => texto.slice(0, i).split('\n').length;

    const registra = (i: number, destino: string, origem: string) => {
      if (!destino.startsWith('/')) return; // externo, ancora ou dinamico
      achados.push({ arquivo: rel, linha: linhaDe(i), destino, origem });
    };

    for (const m of texto.matchAll(/<(?:Link|NavLink)\b[^>]*?\sto="([^"]*)"/g)) {
      registra(m.index!, m[1], '<Link to>');
    }
    for (const m of texto.matchAll(/navigate\(\s*['"]([^'"]*)['"]/g)) {
      registra(m.index!, m[1], 'navigate()');
    }
    // breadcrumbs e itens de menu declarados como objeto
    for (const m of texto.matchAll(/href:\s*['"]([^'"]*)['"]/g)) {
      registra(m.index!, m[1], 'href: em objeto');
    }
  }
  return achados;
}

// ---------------------------------------------------------------------- casos
describe('integridade das rotas', () => {
  it('src/App.tsx declara as rotas esperadas', () => {
    expect(ROTAS).toContain('/');
    expect(ROTAS).toContain('/auth');
    expect(ROTAS).toContain('/dashboard');
    expect(ROTAS).toContain('/dashboard/conversations');
    expect(ROTAS.length).toBeGreaterThan(20);
  });

  it('todo destino interno estático aponta para uma rota que existe', () => {
    const quebrados = destinosInternos().filter((d) => !rotaExiste(d.destino));
    expect(
      quebrados.map((d) => `${d.arquivo}:${d.linha} ${d.origem} -> ${d.destino}`),
    ).toEqual([]);
  });

  it('nenhum link aponta para docs.convoflow.com (domínio não resolve)', () => {
    // Havia dois botões em IntegrationSettings abrindo https://docs.convoflow.com
    // numa aba nova. O domínio não tem DNS: o usuário via uma página de erro.
    // Se um dia o site existir, apague este teste junto com a volta dos links.
    // Casa a URL de verdade (entre aspas), não a menção em comentário.
    const urlMorta = /['"`]https?:\/\/docs\.convoflow\.com/;
    const encontrados: string[] = [];
    for (const arquivo of tsxAlcancaveis()) {
      const texto = readFileSync(arquivo, 'utf8');
      if (urlMorta.test(texto)) {
        encontrados.push(norm(arquivo.slice(ROOT.length + 1)));
      }
    }
    expect(encontrados).toEqual([]);
  });

  it('a migalha "Dashboard" leva ao painel, nunca à landing', () => {
    const errados: string[] = [];
    for (const arquivo of tsxAlcancaveis()) {
      const texto = readFileSync(arquivo, 'utf8');
      const rel = norm(arquivo.slice(ROOT.length + 1));
      for (const m of texto.matchAll(/label:\s*['"]Dashboard['"]\s*,\s*href:\s*['"]([^'"]*)['"]/g)) {
        if (m[1] !== '/dashboard') {
          errados.push(`${rel}: label 'Dashboard' -> ${m[1]}`);
        }
      }
    }
    expect(errados).toEqual([]);
  });
});
