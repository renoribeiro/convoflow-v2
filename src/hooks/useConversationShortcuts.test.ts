import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { useConversationShortcuts } from './useConversationShortcuts';

/**
 * Achado 27 (lote 6a, B11, decisão D8): Ctrl+K abria duas coisas em Conversas,
 * a busca geral do topo e a busca da lista. Agora Ctrl+K é só da busca geral
 * (Navbar) e a busca da lista usa a tecla "/".
 */
const opcoes = () => ({
  enabled: true,
  isSearchOpen: false,
  isPanelOpen: false,
  hasSelection: false,
  closeSearch: vi.fn(),
  closePanel: vi.fn(),
  deselect: vi.fn(),
  focusListSearch: vi.fn(),
  openChatSearch: vi.fn(),
  openNewConversation: vi.fn(),
  navigateList: vi.fn(),
});

describe('atalhos de Conversas', () => {
  let o: ReturnType<typeof opcoes>;
  beforeEach(() => {
    o = opcoes();
    document.body.innerHTML = '';
  });

  it('Ctrl+K não mexe na busca da lista (é da busca geral)', () => {
    renderHook(() => useConversationShortcuts(o));
    const ev = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(ev);
    expect(o.focusListSearch).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(false);
  });

  it('"/" fora de um campo foca a busca da lista', () => {
    renderHook(() => useConversationShortcuts(o));
    fireEvent.keyDown(document.body, { key: '/' });
    expect(o.focusListSearch).toHaveBeenCalledTimes(1);
  });

  it('"/" dentro do campo de mensagem não rouba o foco (lá ele abre as respostas rápidas)', () => {
    renderHook(() => useConversationShortcuts(o));
    const campo = document.createElement('textarea');
    document.body.appendChild(campo);
    fireEvent.keyDown(campo, { key: '/' });
    expect(o.focusListSearch).not.toHaveBeenCalled();
  });

  it('com uma janela aberta, "/" fica com ela', () => {
    renderHook(() => useConversationShortcuts(o));
    const janela = document.createElement('div');
    janela.setAttribute('role', 'dialog');
    document.body.appendChild(janela);
    fireEvent.keyDown(document.body, { key: '/' });
    expect(o.focusListSearch).not.toHaveBeenCalled();
  });
});
