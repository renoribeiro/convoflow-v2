/**
 * O painel que monta o emoji-picker-element.
 *
 * O que precisa continuar verdadeiro:
 *  - a lista de emojis vem do nosso site, nunca de CDN (decisão do dono);
 *  - busca e rótulos em português;
 *  - cada clique num emoji chega ao compositor, já com o tom de pele, quantas
 *    vezes a pessoa clicar (o painel não fecha nem para de ouvir);
 *  - ao fechar, o elemento sai da página.
 *
 * A biblioteca de verdade precisa de IndexedDB e de fetch, que o jsdom não tem:
 * aqui ela é trocada por um elemento falso que só guarda as opções recebidas.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const created = vi.hoisted(() => ({ pickers: [] as Array<{ el: HTMLElement; options: Record<string, any> }> }));

vi.mock('emoji-picker-element', () => {
  class FakePicker extends HTMLElement {
    constructor(options: Record<string, any>) {
      super();
      created.pickers.push({ el: this, options });
    }
  }
  customElements.define('fake-emoji-picker', FakePicker);
  return { Picker: FakePicker };
});

import EmojiPickerPanel, { EMOJI_DATA_URL } from './EmojiPickerPanel';

function clicarEmoji(el: HTMLElement, unicode: string | undefined) {
  el.dispatchEvent(new CustomEvent('emoji-click', { detail: { unicode, emoji: { unicode: '🤝' } } }));
}

beforeEach(() => {
  created.pickers.length = 0;
});

describe('EmojiPickerPanel', () => {
  it('busca a lista de emojis no nosso site, em português, e não em CDN', () => {
    render(<EmojiPickerPanel onEmojiSelect={() => {}} />);
    expect(created.pickers).toHaveLength(1);
    const { options } = created.pickers[0]!;

    expect(options.locale).toBe('pt');
    expect(options.dataSource).toBe(EMOJI_DATA_URL);
    // Caminho do próprio site: nada de "https://..." nem "//cdn...".
    expect(options.dataSource).not.toMatch(/^(https?:)?\/\//);
    expect(options.dataSource).not.toMatch(/jsdelivr|unpkg|cdn/i);
    expect(options.dataSource).toMatch(/pt\/cldr-native\/data\.json/);

    expect(options.i18n.searchLabel).toBe('Procurar');
    expect(options.i18n.categories['smileys-emotion']).toBe('Carinhas e emoticons');
  });

  it('entrega cada emoji clicado, com o tom de pele, sem parar depois do primeiro', () => {
    const onEmojiSelect = vi.fn();
    render(<EmojiPickerPanel onEmojiSelect={onEmojiSelect} />);
    const { el } = created.pickers[0]!;

    clicarEmoji(el, '😊');
    clicarEmoji(el, '🤝🏽');
    clicarEmoji(el, '😊');

    expect(onEmojiSelect.mock.calls.map((c) => c[0])).toEqual(['😊', '🤝🏽', '😊']);
  });

  it('ignora clique sem unicode (emoji personalizado, que não usamos)', () => {
    const onEmojiSelect = vi.fn();
    render(<EmojiPickerPanel onEmojiSelect={onEmojiSelect} />);
    clicarEmoji(created.pickers[0]!.el, undefined);
    expect(onEmojiSelect).not.toHaveBeenCalled();
  });

  it('usa sempre o callback mais novo (o texto do campo muda entre um emoji e outro)', () => {
    const primeiro = vi.fn();
    const segundo = vi.fn();
    const { rerender } = render(<EmojiPickerPanel onEmojiSelect={primeiro} />);
    rerender(<EmojiPickerPanel onEmojiSelect={segundo} />);

    clicarEmoji(created.pickers[0]!.el, '😊');
    expect(primeiro).not.toHaveBeenCalled();
    expect(segundo).toHaveBeenCalledWith('😊');
    // Re-render não cria outro seletor (perderia a busca digitada).
    expect(created.pickers).toHaveLength(1);
  });

  it('ao fechar, tira o seletor da página', () => {
    const { unmount } = render(<EmojiPickerPanel onEmojiSelect={() => {}} />);
    const { el } = created.pickers[0]!;
    expect(el.isConnected).toBe(true);
    unmount();
    expect(el.isConnected).toBe(false);
  });
});
