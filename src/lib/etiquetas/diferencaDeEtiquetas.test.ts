import { describe, expect, it } from 'vitest';
import { diferencaDeEtiquetas } from './diferencaDeEtiquetas';

describe('diferencaDeEtiquetas', () => {
  it('nada mudou: nada a fazer', () => {
    expect(diferencaDeEtiquetas(['a', 'b'], ['b', 'a'])).toEqual({ adicionar: [], remover: [] });
  });

  it('separa o que entrou do que saiu e não toca no resto', () => {
    expect(diferencaDeEtiquetas(['a', 'b'], ['b', 'c'])).toEqual({ adicionar: ['c'], remover: ['a'] });
  });

  it('contato sem etiqueta: tudo entra', () => {
    expect(diferencaDeEtiquetas([], ['a', 'b'])).toEqual({ adicionar: ['a', 'b'], remover: [] });
  });

  it('repetição não vira duas gravações', () => {
    expect(diferencaDeEtiquetas(['a', 'a'], ['b', 'b'])).toEqual({ adicionar: ['b'], remover: ['a'] });
  });
});
