import { describe, it, expect } from 'vitest';
import { insertAtSelection } from './composerInsert';

describe('insertAtSelection — emoji onde está o cursor', () => {
  it('entra no meio do texto e o cursor fica logo depois do emoji', () => {
    expect(insertAtSelection('Obrigado pela visita', '😊', 8, 8)).toEqual({
      text: 'Obrigado😊 pela visita',
      caret: 10, // 😊 ocupa 2 unidades UTF-16, como o selectionStart do navegador conta
    });
  });

  it('substitui o trecho selecionado', () => {
    expect(insertAtSelection('Fechado, combinado', '🤝', 9, 18)).toEqual({ text: 'Fechado, 🤝', caret: 11 });
  });

  it('no começo e no fim', () => {
    expect(insertAtSelection('Oi', '👋', 0, 0)).toEqual({ text: '👋Oi', caret: 2 });
    expect(insertAtSelection('Oi', '👋', 2, 2)).toEqual({ text: 'Oi👋', caret: 4 });
  });

  it('sem seleção conhecida, vai para o fim', () => {
    expect(insertAtSelection('Oi', '😊', undefined, undefined)).toEqual({ text: 'Oi😊', caret: 4 });
    expect(insertAtSelection('', '😊', null, null)).toEqual({ text: '😊', caret: 2 });
  });

  it('seleção fora da faixa (campo esvaziado depois do envio) é trazida para dentro', () => {
    expect(insertAtSelection('', '😊', 15, 15)).toEqual({ text: '😊', caret: 2 });
    expect(insertAtSelection('abc', '😊', -3, 99)).toEqual({ text: '😊', caret: 2 });
  });

  it('vários seguidos, usando o cursor devolvido, ficam na ordem em que foram escolhidos', () => {
    let state = { text: 'Bom dia pessoal', caret: 7 };
    for (const e of ['☀️', '😊', '🤝🏽']) state = insertAtSelection(state.text, e, state.caret, state.caret);
    expect(state.text).toBe('Bom dia☀️😊🤝🏽 pessoal');
    expect(state.text.slice(0, state.caret)).toBe('Bom dia☀️😊🤝🏽');
  });
});
