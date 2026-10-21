/**
 * Espera um elemento VISÍVEL aparecer na página.
 *
 * As telas do dashboard são carregadas sob demanda (React.lazy) e muitas
 * mostram um esqueleto antes dos botões. Um tour que procurasse o alvo uma vez
 * só, logo depois de navegar, não o acharia. Este helper observa a página e
 * devolve o primeiro elemento que casa com o seletor e está de fato na tela
 * (com tamanho, sem display:none nem visibility:hidden), ou `null` quando o
 * tempo acaba — e quem chama decide o que fazer (o tour mostra o balão no
 * centro, nunca trava).
 *
 * É o único ponto que sabe "esperar elemento"; a biblioteca de tour não
 * precisa saber disso (ver TourHost).
 */

export interface WaitOptions {
  /** Tempo máximo, em ms. Padrão: 5000. */
  timeout?: number;
  /** Raiz da busca. Padrão: document. */
  root?: ParentNode;
  /** Para teste: decide se o elemento conta como visível. */
  isVisible?: (el: HTMLElement) => boolean;
}

export function isElementVisible(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  const style = window.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

/** Primeiro elemento visível que casa com o seletor, ou null. */
export function findVisibleElement(
  selector: string,
  root: ParentNode = document,
  isVisible: (el: HTMLElement) => boolean = isElementVisible,
): HTMLElement | null {
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(selector))) {
    if (isVisible(el)) return el;
  }
  return null;
}

export function waitForElement(selector: string, options: WaitOptions = {}): Promise<HTMLElement | null> {
  const { timeout = 5000, root = document, isVisible = isElementVisible } = options;

  const achado = findVisibleElement(selector, root, isVisible);
  if (achado) return Promise.resolve(achado);

  return new Promise((resolve) => {
    let terminou = false;
    const procurar = () => findVisibleElement(selector, root, isVisible);

    const terminar = (el: HTMLElement | null) => {
      if (terminou) return;
      terminou = true;
      observer.disconnect();
      clearInterval(sondagem);
      clearTimeout(limite);
      resolve(el);
    };

    // Mudança no DOM: elemento novo, classe trocada, esqueleto que sai.
    const observer = new MutationObserver(() => {
      const el = procurar();
      if (el) terminar(el);
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });

    // Animação de entrada muda a posição sem mexer no DOM: uma sondagem leve
    // pega o elemento que já existia e só ficou visível depois.
    const sondagem = setInterval(() => {
      const el = procurar();
      if (el) terminar(el);
    }, 200);

    const limite = setTimeout(() => terminar(null), timeout);
  });
}

/** Seletor CSS da marca de tour. */
export const tourSelector = (target: string) => `[data-tour="${target}"]`;
