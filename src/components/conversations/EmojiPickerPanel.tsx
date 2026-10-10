/**
 * Seletor de emoji do compositor de Conversas (emoji-picker-element).
 *
 * Este módulo só é baixado no primeiro clique no botão de emoji: o ChatWindow
 * o importa com React.lazy. Nada daqui entra no carregamento da tela.
 *
 * Três decisões que não devem ser desfeitas sem querer:
 *  - A lista de emojis vem do NOSSO site, não de CDN. O `?url` faz o Vite
 *    copiar o JSON do pacote emoji-picker-element-data para /assets/ no build
 *    (com hash no nome). O padrão da biblioteca é buscar no jsDelivr.
 *  - Português nas duas pontas: `pt/cldr-native` traz nomes e palavras-chave
 *    em português ("sorriso" acha 😊, "aperto" acha 🤝) e `pt_BR` traduz os
 *    rótulos da caixa. A lista é baixada uma vez por aparelho e fica guardada
 *    no navegador (IndexedDB), junto com os "Favoritos" (os mais usados) e o
 *    tom de pele escolhido.
 *  - O emoji enviado é `detail.unicode`, que já vem com o tom de pele. O
 *    `detail.emoji.unicode` é sempre o amarelo padrão.
 */
import React, { useEffect, useRef } from 'react';
import { Picker } from 'emoji-picker-element';
import type { EmojiClickEvent } from 'emoji-picker-element/shared';
import ptBR from 'emoji-picker-element/i18n/pt_BR.js';
import emojiDataUrl from 'emoji-picker-element-data/pt/cldr-native/data.json?url';

export const EMOJI_LOCALE = 'pt';
export const EMOJI_DATA_URL = emojiDataUrl;

interface EmojiPickerPanelProps {
  onEmojiSelect: (emoji: string) => void;
}

export default function EmojiPickerPanel({ onEmojiSelect }: EmojiPickerPanelProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  // O elemento é criado uma vez; o callback muda a cada render (lê o texto atual).
  const onSelectRef = useRef(onEmojiSelect);
  onSelectRef.current = onEmojiSelect;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const picker = new Picker({ locale: EMOJI_LOCALE, dataSource: EMOJI_DATA_URL, i18n: ptBR });
    picker.classList.add('cf-emoji-picker');
    const handleClick = (event: Event) => {
      const unicode = (event as EmojiClickEvent).detail?.unicode;
      if (unicode) onSelectRef.current(unicode);
    };
    picker.addEventListener('emoji-click', handleClick);
    host.appendChild(picker);
    return () => {
      picker.removeEventListener('emoji-click', handleClick);
      picker.remove();
    };
  }, []);

  return <div ref={hostRef} data-testid="emoji-picker-host" />;
}
