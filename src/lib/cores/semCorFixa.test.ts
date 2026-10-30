import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { acharCores } from '../../../eslint-rules/sem-cor-fixa.js';

/**
 * Regra "cores/sem-cor-fixa" (lote 7 do checkup, "Cores e tema escuro"): o
 * lint reprova cor escrita à mão fora dos tokens. As exceções moram SÓ em
 * ARQUIVOS_LIBERADOS no eslint.config.js; desligar a regra com comentário no
 * meio do código esconderia a exceção da revisão.
 */
describe('regra cores/sem-cor-fixa', () => {
  const valores = (t: string) => acharCores(t).map((a) => a.valor);

  it('acha classe da paleta, branco e preto, valor arbitrário e cor em código', () => {
    expect(valores('p-2 bg-blue-500 text-gray-600/80 dark:border-red-900')).toEqual(['bg-blue-500', 'text-gray-600/80', 'border-red-900']);
    expect(valores('bg-white text-black/60')).toEqual(['bg-white', 'text-black/60']);
    expect(valores('bg-[#25D366] text-[rgb(0,0,0)]')).toEqual(['bg-[#25D366]', 'text-[rgb(0,0,0)]']);
    expect(valores('#DAE27C')).toEqual(['#DAE27C']);
    expect(valores('#fff')).toEqual(['#fff']);
    expect(valores('rgba(0, 0, 0, .5)')).toHaveLength(1);
    expect(valores('shadow-[0_0_0_3px_rgba(16,185,129,0.15)]')).toHaveLength(1);
  });

  it('deixa passar os tokens', () => {
    for (const ok of [
      'bg-card text-foreground border-border',
      'bg-success/10 text-success border-success/30',
      'text-destructive-foreground bg-overlay/80 bg-papel',
      'hsl(var(--primary))',
      'bg-[hsl(var(--unread-bg))] text-[var(--tinta-clara)]',
      'shadow-[0_0_0_3px_hsl(var(--success)/0.15)]',
      '/dashboard/help#page:conversations',
      'text-white-space',
    ]) {
      expect(valores(ok), ok).toEqual([]);
    }
  });

  it('ninguém desliga a regra com comentário no código', () => {
    const raiz = path.resolve(__dirname, '../..');
    const achados: string[] = [];
    const varrer = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) varrer(p);
        else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) && /eslint-disable[^\n]*sem-cor-fixa/.test(fs.readFileSync(p, 'utf8'))) achados.push(p);
      }
    };
    varrer(raiz);
    expect(achados, 'exceção vai em ARQUIVOS_LIBERADOS (eslint.config.js)').toEqual([]);
  });
});
