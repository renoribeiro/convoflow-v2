/**
 * Garantias da matriz de cobertura da ajuda (src/lib/help/cobertura.ts).
 *
 * Quebra quando:
 *  - uma tela do registro ou uma aba de Configurações fica fora da matriz;
 *  - uma tela que algum cargo alcança não tem entrada de ajuda, ou a entrada
 *    não está montada nos arquivos da própria tela;
 *  - a página de Ajuda esconde a entrada de um cargo que alcança a tela;
 *  - uma dica "?" (<DicaDoCampo />) tem texto com hífen, travessão ou longo
 *    demais.
 *
 * VER A MATRIZ (grava um arquivo Markdown no caminho dado)
 *   IMPRIMIR_MATRIZ=matriz.md npx vitest run src/lib/help/cobertura.test.ts
 * (no PowerShell: $env:IMPRIMIR_MATRIZ='matriz.md'; npx vitest run src/lib/help/cobertura.test.ts)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TELAS } from '@/lib/access/telas';
import { ABAS_DE_CONFIGURACOES } from '@/lib/access/abasConfiguracoes';
import { getFeatureHelp } from './featureHelp';
import { PAPEIS_DA_MATRIZ, SUPERFICIES, celula, type SuperficieDeAjuda } from './cobertura';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');

function arquivosDe(fonte: string): string[] {
  const abs = path.join(ROOT, fonte);
  if (!fs.existsSync(abs)) return [];
  if (fs.statSync(abs).isFile()) return [abs];
  const out: string[] = [];
  const andar = (dir: string) => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) andar(full);
      else if (/\.tsx?$/.test(item.name) && !/\.(test|spec)\.tsx?$/.test(item.name)) out.push(full);
    }
  };
  andar(abs);
  return out;
}

const fonteDe = (sup: SuperficieDeAjuda) => sup.fontes.flatMap(arquivosDe).map((f) => fs.readFileSync(f, 'utf8')).join('\n');

const contarDicas = (sup: SuperficieDeAjuda) => (fonteDe(sup).match(/<DicaDoCampo\b/g) ?? []).length;

const ehAbaGenerica = (sup: SuperficieDeAjuda) => sup.id.startsWith('settings?tab=') && sup.id !== 'settings?tab=profile';

describe('matriz de cobertura: linhas', () => {
  it('toda tela do registro e toda aba de Configurações está na matriz', () => {
    const ids = new Set(SUPERFICIES.map((s) => s.id));
    for (const t of TELAS) expect(ids.has(t.chave || 'dashboard'), t.chave).toBe(true);
    for (const a of ABAS_DE_CONFIGURACOES) expect(ids.has(`settings?tab=${a.value}`), a.value).toBe(true);
  });

  it('as fontes declaradas existem (senão a contagem de dicas mente)', () => {
    const faltando = SUPERFICIES.flatMap((s) => s.fontes.filter((f) => !fs.existsSync(path.join(ROOT, f))).map((f) => `${s.id} → ${f}`));
    expect(faltando).toEqual([]);
  });
});

describe('matriz de cobertura: toda tela alcançável tem ajuda', () => {
  const alcancaveis = SUPERFICIES.filter((s) => s.helpKey !== null && PAPEIS_DA_MATRIZ.some((p) => s.alcance(p) !== 'nao'));

  it.each(alcancaveis.map((s) => [s.id, s] as const))('%s tem entrada de ajuda', (_id, sup) => {
    expect(getFeatureHelp(sup.helpKey), `${sup.id}: sem entrada ${sup.helpKey}`).not.toBeNull();
  });

  it.each(alcancaveis.map((s) => [s.id, s] as const))('%s monta o botão de ajuda na própria tela', (_id, sup) => {
    if (ehAbaGenerica(sup)) {
      // As abas (menos Perfil) recebem o botão do Settings.tsx, pela chave da
      // lista src/lib/access/abasConfiguracoes.ts.
      const settings = fs.readFileSync(path.join(ROOT, 'src/pages/Settings.tsx'), 'utf8');
      expect(settings).toContain('<FeatureHelp helpKey={ajudaDaAba(currentTab)');
      return;
    }
    expect(fonteDe(sup), `${sup.id}: "${sup.helpKey}" não aparece em ${sup.fontes.join(', ')}`).toContain(`'${sup.helpKey}'`.slice(1, -1));
  });

  it('a página de Ajuda oferece a entrada a todo cargo que alcança a tela', () => {
    const escondidas: string[] = [];
    for (const sup of alcancaveis) {
      if (getFeatureHelp(sup.helpKey)?.oculta) continue; // API ainda não liberada: o painel da aba basta.
      for (const papel of PAPEIS_DA_MATRIZ) {
        const c = celula(sup, papel);
        if (c.alcance !== 'nao' && !c.ajuda) escondidas.push(`${sup.id} / ${papel}`);
      }
    }
    expect(escondidas).toEqual([]);
  });
});

describe('dicas "?" dos campos (<DicaDoCampo />)', () => {
  const TRACO = /[-‐‑‒–—―−]/;
  const SRC = path.join(ROOT, 'src');
  const textos: Array<[string, string]> = [];
  for (const arquivo of arquivosDe('src')) {
    const fonte = fs.readFileSync(arquivo, 'utf8');
    for (const m of fonte.matchAll(/<DicaDoCampo\b[\s\S]*?texto=(?:"([^"]*)"|\{'([^']*)'\}|\{`([^`]*)`\}|\{"([^"]*)"\})/g)) {
      textos.push([path.relative(SRC, arquivo), m[1] ?? m[2] ?? m[3] ?? m[4] ?? '']);
    }
  }

  it('a varredura acha as dicas', () => {
    expect(textos.length).toBeGreaterThan(20);
  });

  it('sem hífen nem travessão, até 200 caracteres, nada vazio', () => {
    const ruins = textos
      .filter(([, t]) => TRACO.test(t) || t.trim() === '' || t.length > 200)
      .map(([onde, t]) => `${onde}: ${t}`);
    expect(ruins).toEqual([]);
  });
});

// ------------------------------------------------------------- impressão
if (process.env.IMPRIMIR_MATRIZ) {
  it('imprime a matriz', () => {
    const linhas: string[] = [];
    const cab = PAPEIS_DA_MATRIZ.join(' | ');
    linhas.push(`| Tela | ${cab} | Dicas |`);
    linhas.push(`|---|${PAPEIS_DA_MATRIZ.map(() => '---').join('|')}|---|`);
    for (const sup of SUPERFICIES) {
      const cels = PAPEIS_DA_MATRIZ.map((p) => {
        const c = celula(sup, p);
        if (c.alcance === 'nao') return '–';
        const partes = [
          c.alcance === 'so_de_loja' ? 'só Loja' : null,
          c.botao ? 'B' : 'b?',
          c.ajuda ? 'A' : 'a?',
          `T${c.tutoriais.length}`,
          `R${c.tours.length}`,
        ].filter(Boolean);
        return partes.join(' ');
      });
      linhas.push(`| ${sup.nome} | ${cels.join(' | ')} | ${contarDicas(sup)} |`);
    }
    linhas.push('', 'B botão de ajuda · A entrada na página de Ajuda · T tutoriais · R tours · – não alcança', '');
    for (const sup of SUPERFICIES) {
      for (const p of PAPEIS_DA_MATRIZ) {
        const c = celula(sup, p);
        if (c.alcance === 'nao' || (!c.tutoriais.length && !c.tours.length)) continue;
        linhas.push(`- ${sup.id} / ${p}: tutoriais=${c.tutoriais.map((t) => t.id).join(',')} tours=${c.tours.map((t) => t.id).join(',')}`);
      }
    }
    fs.writeFileSync(path.resolve(process.env.IMPRIMIR_MATRIZ as string), `${linhas.join('\n')}\n`);
  });
}
