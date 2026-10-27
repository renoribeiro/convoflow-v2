import { describe, expect, it } from 'vitest';
import { TELAS } from './telas';
import { ICONES_DAS_TELAS } from './iconesDasTelas';

describe('um ícone por tela', () => {
  it('toda tela do registro tem ícone', () => {
    const faltando = TELAS.filter((t) => !ICONES_DAS_TELAS[t.chave]).map((t) => t.chave || '(dashboard)');
    expect(faltando).toEqual([]);
  });

  it('duas telas não dividem o mesmo ícone', () => {
    const porIcone = new Map<unknown, string[]>();
    for (const [chave, icone] of Object.entries(ICONES_DAS_TELAS)) {
      porIcone.set(icone, [...(porIcone.get(icone) ?? []), chave]);
    }
    const repetidos = [...porIcone.values()].filter((chaves) => chaves.length > 1);
    expect(repetidos).toEqual([]);
  });
});
