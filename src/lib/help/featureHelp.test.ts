/**
 * Garantias do conteúdo de ajuda contextual.
 *
 * O <FeatureHelp /> não renderiza nada quando a chave não existe, então um typo
 * em `helpKey` desaparece em silêncio na tela. Estes testes são a rede: eles
 * varrem o src/ atrás de chaves usadas e quebram se alguma não tiver conteúdo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  FEATURE_HELP,
  HELP_CATEGORIES,
  SCREEN_AREAS,
  getAllHelpKeys,
  getFeatureHelp,
  getHelpByCategory,
  getHelpEntries,
  helpEntryMatches,
  normalizeForSearch,
  type FeatureHelpEntry,
  type HelpCategory,
} from './featureHelp';
import { BLOCK_BY_TYPE } from '@/lib/chatbot/flowConstants';
import { ALL_ENTRIES } from '@/components/automation/automationCatalog';
import { ROLE_ORDER } from '@/types/userHierarchy';

// ---------------------------------------------------------------------------
// Varredura do src/ atrás de chaves de ajuda
// ---------------------------------------------------------------------------

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(HERE, '..', '..');

/** O próprio arquivo de definições: as chaves dele são a fonte, não uso. */
const DEFINITIONS_FILE = path.join(SRC_DIR, 'lib', 'help', 'featureHelp.ts');

/** `helpKey="x"`, `helpKey='x'`, `helpKey={'x'}` e `helpKey: 'x'`. */
const HELP_KEY_LITERAL = /helpKey\s*[=:]\s*[{(]?\s*['"]([^'"]+)['"]/g;

/**
 * Qualquer literal com um dos prefixos de ajuda, em qualquer contexto — pega
 * mapas auxiliares (ex.: TAB_HELP_KEYS em Settings.tsx) que a regex acima não vê.
 */
const PREFIXED_LITERAL = /['"]((?:page|concept|trigger|action|condition):[a-z0-9_-]+)['"]/g;

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      collectSourceFiles(full, out);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(item.name)) continue;
    if (/\.(test|spec)\.tsx?$/.test(item.name)) continue;
    if (full === DEFINITIONS_FILE) continue;
    out.push(full);
  }
  return out;
}

interface KeyUsage {
  key: string;
  file: string;
}

function collectKeyUsages(): KeyUsage[] {
  const usages: KeyUsage[] = [];

  for (const file of collectSourceFiles(SRC_DIR)) {
    const source = fs.readFileSync(file, 'utf8');
    const relative = path.relative(SRC_DIR, file).replace(/\\/g, '/');

    for (const regex of [HELP_KEY_LITERAL, PREFIXED_LITERAL]) {
      regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(source)) !== null) {
        const key = match[1];
        if (key) usages.push({ key, file: `src/${relative}` });
      }
    }
  }

  return usages;
}

describe('cobertura das chaves de ajuda', () => {
  const usages = collectKeyUsages();

  it('encontra chaves usadas no src/ (a varredura em si funciona)', () => {
    // Se a varredura parar de achar nada, os testes abaixo passariam vazios e
    // deixariam de proteger qualquer coisa.
    expect(usages.length).toBeGreaterThan(20);
  });

  it('toda helpKey usada no src/ tem conteúdo em FEATURE_HELP', () => {
    const missing = usages
      .filter((usage) => !getFeatureHelp(usage.key))
      .map((usage) => `${usage.key} (usada em ${usage.file})`);

    expect(
      missing,
      'Chaves de ajuda sem entrada em src/lib/help/featureHelp.ts',
    ).toEqual([]);
  });

  it('todo tipo de nó do chatbot tem conteúdo', () => {
    // NodeConfigPanel passa `helpKey={node.type}`, que a varredura estática não
    // resolve — a garantia tem de vir da lista de blocos.
    const missing = Object.keys(BLOCK_BY_TYPE).filter((type) => !getFeatureHelp(type));
    expect(missing, 'Tipos de nó sem entrada de ajuda').toEqual([]);
  });

  it('toda entrada do catálogo de automações com helpKey tem conteúdo', () => {
    // StepConfigPanel passa `helpKey={entry.helpKey}`, também dinâmico.
    const missing = ALL_ENTRIES.filter(
      (entry) => entry.helpKey && !getFeatureHelp(entry.helpKey),
    ).map((entry) => `${entry.key} → ${entry.helpKey}`);
    expect(missing, 'Entradas do catálogo apontando para chave inexistente').toEqual([]);
  });

  it('nenhuma entrada de ajuda ficou órfã (sem ponto de uso)', () => {
    const used = new Set(usages.map((usage) => usage.key));
    // Nós do chatbot e etapas de automação são montados dinamicamente.
    for (const type of Object.keys(BLOCK_BY_TYPE)) used.add(type);
    for (const entry of ALL_ENTRIES) if (entry.helpKey) used.add(entry.helpKey);

    const orphans = getAllHelpKeys().filter((key) => !used.has(key));
    expect(
      orphans,
      'Entradas escritas mas inalcançáveis — monte um <FeatureHelp /> ou remova',
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Forma das entradas
// ---------------------------------------------------------------------------

describe('forma das entradas de ajuda', () => {
  const entries = getHelpEntries();

  it('existe pelo menos uma entrada', () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it.each(entries.map((entry) => [entry.key, entry] as const))(
    '%s tem título, descrição, passos e categoria válidos',
    (key, entry) => {
      expect(entry.title.trim(), `${key}: title vazio`).not.toBe('');
      expect(entry.whatItDoes.trim(), `${key}: whatItDoes vazio`).not.toBe('');

      expect(Array.isArray(entry.howToConfigure), `${key}: howToConfigure não é lista`).toBe(true);
      expect(entry.howToConfigure.length, `${key}: howToConfigure vazio`).toBeGreaterThan(0);
      for (const step of entry.howToConfigure) {
        expect(step.trim(), `${key}: passo vazio em howToConfigure`).not.toBe('');
      }

      expect(HELP_CATEGORIES, `${key}: category inválida`).toContain(entry.category as HelpCategory);

      if (entry.example !== undefined) {
        expect(entry.example.trim(), `${key}: example vazio`).not.toBe('');
      }
      if (entry.tips !== undefined) {
        expect(entry.tips.length, `${key}: tips declarado mas vazio`).toBeGreaterThan(0);
        for (const tip of entry.tips) {
          expect(tip.trim(), `${key}: dica vazia`).not.toBe('');
        }
      }
    },
  );

  it('entradas de tela usam uma área do menu lateral', () => {
    const invalid = entries
      .filter((entry) => entry.category === 'tela')
      .filter((entry) => !entry.area || !SCREEN_AREAS.includes(entry.area as never))
      .map((entry) => `${entry.key} (area: ${entry.area ?? 'ausente'})`);

    expect(invalid, `Áreas válidas: ${SCREEN_AREAS.join(', ')}`).toEqual([]);
  });

  it('o prefixo da chave combina com a categoria declarada', () => {
    const expected: Record<string, HelpCategory> = {
      'page:': 'tela',
      'concept:': 'conceito',
      'trigger:': 'automacao',
      'action:': 'automacao',
      'condition:': 'automacao',
    };

    const mismatched = entries
      .filter((entry) => {
        const prefix = Object.keys(expected).find((p) => entry.key.startsWith(p));
        // Chave sem prefixo é nó do chatbot (ex.: 'ask_question').
        if (!prefix) return entry.category !== 'chatbot';
        return entry.category !== expected[prefix];
      })
      .map((entry) => `${entry.key} → ${entry.category}`);

    expect(mismatched).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Agrupamento consumido pela página de Ajuda
// ---------------------------------------------------------------------------

describe('getHelpByCategory', () => {
  it('devolve todas as entradas da categoria, sem repetir', () => {
    for (const category of HELP_CATEGORIES) {
      const grouped = getHelpByCategory(category).flatMap((group) => group.entries);
      const direct = getHelpEntries().filter((entry) => entry.category === category);

      expect(grouped).toHaveLength(direct.length);
      expect(new Set(grouped.map((entry) => entry.key)).size).toBe(grouped.length);
    }
  });

  it('cobre todas as entradas somando as categorias', () => {
    const total = HELP_CATEGORIES.reduce(
      (sum, category) => sum + getHelpByCategory(category).flatMap((g) => g.entries).length,
      0,
    );
    expect(total).toBe(Object.keys(FEATURE_HELP).length);
  });

  it('agrupa as telas na ordem do menu lateral', () => {
    const areas = getHelpByCategory('tela').map((group) => group.area);
    expect(areas).toEqual([...SCREEN_AREAS]);
  });

  it('cada grupo carrega a chave junto da entrada', () => {
    for (const group of getHelpByCategory('tela')) {
      for (const entry of group.entries) {
        expect(entry.key).toBeTruthy();
        expect(FEATURE_HELP[entry.key]).toBeDefined();
        expect(entry.area).toBe(group.area);
      }
    }
  });

  it('devolve lista vazia para categoria sem entradas', () => {
    expect(getHelpByCategory('inexistente' as HelpCategory)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Metadados de acesso das telas (usados pela página de Ajuda)
// ---------------------------------------------------------------------------

describe('metadados de acesso das telas', () => {
  const entries = getHelpEntries();

  it('todo moduleName declarado existe como ModuleGuard em App.tsx', () => {
    // Guarda contra deriva: se a rota trocar de módulo e a ajuda não, a tela
    // some (ou aparece) para o cargo errado na página de Ajuda.
    const appSource = fs.readFileSync(path.join(SRC_DIR, 'App.tsx'), 'utf8');
    const guarded = new Set(
      [...appSource.matchAll(/moduleName=["']([^"']+)["']/g)].map((m) => m[1]),
    );

    const unknown = entries
      .filter((entry) => entry.moduleName && !guarded.has(entry.moduleName))
      .map((entry) => `${entry.key} → ${entry.moduleName}`);

    expect(
      unknown,
      `Módulos usados em App.tsx: ${[...guarded].sort().join(', ')}`,
    ).toEqual([]);
  });

  it('todo minRole declarado é um cargo válido', () => {
    const invalid = entries
      .filter((entry) => entry.minRole && !(entry.minRole in ROLE_ORDER))
      .map((entry) => `${entry.key} → ${entry.minRole}`);
    expect(invalid).toEqual([]);
  });

  it('moduleName e minRole só aparecem em entradas de tela', () => {
    const misplaced = entries
      .filter((entry) => entry.category !== 'tela' && (entry.moduleName || entry.minRole))
      .map((entry) => entry.key);
    expect(misplaced).toEqual([]);
  });

  it('as telas de Admin exigem superadmin', () => {
    for (const key of ['page:admin', 'page:admin-users', 'page:admin-usage-limits']) {
      expect(FEATURE_HELP[key]?.minRole, `${key} sem minRole`).toBe('superadmin');
    }
  });
});

// ---------------------------------------------------------------------------
// Busca
// ---------------------------------------------------------------------------

/** Entrada por chave, falhando o teste se ela não existir. */
function entryOf(key: string): FeatureHelpEntry {
  const entry = FEATURE_HELP[key];
  if (!entry) throw new Error(`entrada de ajuda ausente: ${key}`);
  return entry;
}

describe('normalizeForSearch', () => {
  it('remove acento e caixa', () => {
    expect(normalizeForSearch('Automação')).toBe('automacao');
    expect(normalizeForSearch('VARIÁVEL')).toBe('variavel');
    expect(normalizeForSearch('  Instâncias e APIs  ')).toBe('instancias e apis');
  });

  it('deixa texto sem acento intacto', () => {
    expect(normalizeForSearch('webhook')).toBe('webhook');
  });
});

describe('helpEntryMatches', () => {
  const entry = entryOf('page:automation');

  it('casa sem acento com conteúdo acentuado', () => {
    expect(helpEntryMatches(entry, 'automacao')).toBe(true);
  });

  it('casa com acento também', () => {
    expect(helpEntryMatches(entry, 'Automação')).toBe(true);
  });

  it('ignora a caixa', () => {
    expect(helpEntryMatches(entry, 'AuToMaCaO')).toBe(true);
  });

  it('busca vazia casa com tudo', () => {
    for (const item of getHelpEntries()) {
      expect(helpEntryMatches(item, '')).toBe(true);
      expect(helpEntryMatches(item, '   ')).toBe(true);
    }
  });

  it('exige todos os termos', () => {
    expect(helpEntryMatches(entry, 'gatilho acoes')).toBe(true);
    expect(helpEntryMatches(entry, 'gatilho jamaisexistente')).toBe(false);
  });

  it('procura fora do título (passos, exemplo e dicas)', () => {
    // "plantão" só aparece no exemplo de page:chatbots.
    expect(helpEntryMatches(entryOf('page:chatbots'), 'plantao')).toBe(true);
    // "spam" só aparece nas dicas de page:campaigns.
    expect(helpEntryMatches(entryOf('page:campaigns'), 'spam')).toBe(true);
  });

  it('toda entrada é encontrável pelo próprio título', () => {
    const unreachable = getHelpEntries()
      .filter((item) => !helpEntryMatches(item, item.title))
      .map((item) => item.key);
    expect(unreachable).toEqual([]);
  });
});

describe('getFeatureHelp', () => {
  it('devolve null para chave ausente, vazia ou nula', () => {
    expect(getFeatureHelp('page:nao-existe')).toBeNull();
    expect(getFeatureHelp('')).toBeNull();
    expect(getFeatureHelp(null)).toBeNull();
    expect(getFeatureHelp(undefined)).toBeNull();
  });

  it('devolve a entrada existente', () => {
    expect(getFeatureHelp('page:conversations')?.title).toBe('Conversas');
    expect(getFeatureHelp('ask_question')?.title).toBe('Fazer Pergunta');
  });
});
