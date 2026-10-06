/**
 * Toda função de `_shared/*.ts` que uma edge function CHAMA precisa estar
 * IMPORTADA por ela.
 *
 * Por que: em f53a4a1 (2026-08-18) o stripe-webhook passou a chamar
 * `slotQuantityFromSubscription` sem importar de `_shared/store-slots.ts`. O
 * deploy pelo CLI empacota sem checar tipos, então a função subiu; em runtime
 * o `ReferenceError` caía no try/catch de `extrasDaAssinatura`, que devolvia
 * null — e `tenants.store_slots_extra` nunca mais foi escrito pelo webhook.
 * Só apareceu numa auditoria de 2026-09-16, num log de 2026-09-08 que ninguém
 * leu. Nenhum teste via isso; este vê.
 *
 * O que ele faz: para cada edge function, lista as funções exportadas por cada
 * módulo de `_shared` e, para cada uma que aparece chamada no `index.ts`
 * (`nome(`), exige que o nome esteja em algum `import { ... } from '../_shared/...'`.
 * Não é um type-checker; é a rede mínima para o defeito acima não voltar.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FUNCTIONS_DIR = path.resolve(HERE, '..', '..', '..', 'supabase', 'functions');
const SHARED_DIR = path.join(FUNCTIONS_DIR, '_shared');

/** `export function nome(` e `export async function nome(` de um módulo. */
function exportedFunctions(source: string): string[] {
  return [...source.matchAll(/^export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm)].map((m) => m[1]);
}

/** Todos os nomes importados de qualquer `'../_shared/<x>.ts'` por uma edge function. */
function importedFromShared(source: string): Set<string> {
  const names = new Set<string>();
  const re = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"]\.\.\/_shared\/[^'"]+['"]/g;
  for (const m of source.matchAll(re)) {
    for (const raw of m[1].split(',')) {
      const name = raw.replace(/^\s*type\s+/, '').split(/\s+as\s+/)[0].trim();
      if (name) names.add(name);
    }
  }
  return names;
}

/** Remove comentários para não confundir "citado num comentário" com "chamado". */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const sharedModules = fs
  .readdirSync(SHARED_DIR)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  .map((file) => ({
    file,
    functions: exportedFunctions(fs.readFileSync(path.join(SHARED_DIR, file), 'utf8')),
  }))
  .filter((m) => m.functions.length > 0);

const edgeFunctions = fs
  .readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
  .map((d) => d.name)
  .filter((name) => fs.existsSync(path.join(FUNCTIONS_DIR, name, 'index.ts')));

describe('edge functions importam o que chamam de _shared', () => {
  it('a varredura encontrou funções e módulos (o teste em si funciona)', () => {
    expect(edgeFunctions).toContain('stripe-webhook');
    expect(sharedModules.map((m) => m.file)).toContain('store-slots.ts');
    expect(sharedModules.find((m) => m.file === 'store-slots.ts')?.functions).toContain(
      'slotQuantityFromSubscription',
    );
  });

  it.each(edgeFunctions)('%s: toda função de _shared chamada está importada', (fn) => {
    const source = stripComments(fs.readFileSync(path.join(FUNCTIONS_DIR, fn, 'index.ts'), 'utf8'));
    const missing: string[] = [];
    // Um mesmo nome pode ser exportado por mais de um módulo (substituteVariables
    // vive em três); importado de qualquer um deles conta.
    const imported = importedFromShared(source);

    for (const mod of sharedModules) {
      for (const name of mod.functions) {
        // Chamada direta: `nome(`, não precedida de `.` (método) nem de letra
        // (outro identificador que só termina igual).
        const called = new RegExp(`(?<![\\w$.])${name}\\s*\\(`).test(source);
        if (called && !imported.has(name)) {
          // Definida localmente com o mesmo nome? Então não é a de _shared.
          const definedLocally = new RegExp(`function\\s+${name}\\s*\\(|const\\s+${name}\\s*=`).test(source);
          if (!definedLocally) missing.push(`${name} (de _shared/${mod.file})`);
        }
      }
    }

    expect(
      missing,
      `${fn}/index.ts chama função de _shared sem importar. O CLI empacota assim mesmo e o erro só aparece em runtime.`,
    ).toEqual([]);
  });
});
