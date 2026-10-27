/**
 * TourRunner — o ÚNICO arquivo que conhece a biblioteca de tour (driver.js).
 *
 * Trocar de biblioteca é trocar `startTour` aqui; o resto do produto só fala em
 * `Tour` (src/lib/onboarding/tours.ts) e em `requestTour` (a fila).
 *
 * A biblioteca e o CSS dela são importados sob demanda, no primeiro tour: quem
 * nunca clica em "Fazer agora" ou "Começar" não baixa nada disso.
 */
import type { Tour } from '@/lib/onboarding/tours';
import { menuCardBody } from '@/lib/onboarding/tours';
import { findVisibleElement, tourSelector, waitForElement } from '@/lib/onboarding/waitForElement';

/** Abaixo disto o menu lateral é gaveta (Tailwind `md`, o mesmo do Sidebar). */
export const MOBILE_QUERY = '(max-width: 767px)';

/**
 * O primeiro alvo pode estar numa tela que ainda carrega (React.lazy, rede
 * lenta de celular). Passou disto, o balão aparece no centro.
 */
const ESPERA_PRIMEIRO_MS = 15000;
/** Os seguintes já estão na mesma tela: espera curta. */
const ESPERA_DEMAIS_MS = 2500;

export interface ResolvedStep {
  title: string;
  body: string;
  /** Seletor do alvo achado, ou null para o cartão no centro. */
  selector: string | null;
  element: HTMLElement | null;
}

/**
 * Decide, para cada passo, onde o balão vai: no alvo (se ele aparecer a
 * tempo) ou no centro. No celular, passo cujo alvo é item do menu vira o
 * cartão "Abra o menu ☰ e toque em X" — nunca apontamos para a gaveta.
 */
export async function resolveTourSteps(
  tour: Tour,
  opts: { mobile: boolean; wait?: typeof waitForElement },
): Promise<ResolvedStep[]> {
  const wait = opts.wait ?? waitForElement;
  const resolver = async (step: Tour['steps'][number], prazo: number): Promise<ResolvedStep> => {
    if (opts.mobile && step.menuItem) {
      return { title: step.title, body: `${menuCardBody(step.menuItem)} ${step.body}`, selector: null, element: null };
    }
    if (!step.target || (opts.mobile && step.soNoComputador)) {
      return { title: step.title, body: step.body, selector: null, element: null };
    }
    const selector = tourSelector(step.target);
    const element = await wait(selector, { timeout: prazo });
    return { title: step.title, body: step.body, selector: element ? selector : null, element };
  };
  // O primeiro antes, sozinho: enquanto a tela ainda carrega, a espera curta
  // dos outros passos acabaria antes de a tela existir.
  const [primeiro, ...demais] = tour.steps;
  if (!primeiro) return [];
  const um = await resolver(primeiro, ESPERA_PRIMEIRO_MS);
  const resto = await Promise.all(demais.map((s) => resolver(s, ESPERA_DEMAIS_MS)));
  return [um, ...resto];
}

export interface TourHandle {
  destroy: () => void;
}

export async function startTour(tour: Tour, opts: { onFinish: () => void }): Promise<TourHandle | null> {
  const mobile = typeof window !== 'undefined' && window.matchMedia?.(MOBILE_QUERY).matches === true;
  const reduzirMovimento =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

  const [{ driver }] = await Promise.all([
    import('driver.js'),
    import('driver.js/dist/driver.css'),
    import('./tour.css'),
  ]);

  const passos = await resolveTourSteps(tour, { mobile });
  if (passos.length === 0) return null;

  let terminou = false;
  // Clicar no botão destacado é fazer o passo: o tour sai da frente (senão a
  // janela que o botão abre ficaria por baixo da camada escura). O ouvinte é
  // da página inteira, em captura, e confere pelo SELETOR do passo atual: a
  // tela pode redesenhar o botão depois do destaque (dado que chega), e um
  // ouvinte preso ao nó antigo nunca dispararia.
  let seletorAtual: string | null = null;
  const aoClicar = (e: MouseEvent) => {
    if (!seletorAtual) return;
    const alvo = e.target as Element | null;
    if (alvo && typeof alvo.closest === 'function' && alvo.closest(seletorAtual)) d.destroy();
  };
  document.addEventListener('click', aoClicar, true);

  const d = driver({
    animate: !reduzirMovimento,
    smoothScroll: !reduzirMovimento,
    allowClose: true,
    allowKeyboardControl: true,
    overlayOpacity: 0.55,
    stagePadding: 6,
    stageRadius: 8,
    popoverClass: 'convoflow-tour',
    showProgress: passos.length > 1,
    progressText: '{{current}} de {{total}}',
    nextBtnText: 'Próximo',
    prevBtnText: 'Voltar',
    doneBtnText: 'Entendi',
    closeBtnLabel: 'Fechar',
    steps: passos.map((p) => ({
      // Função, não o nó guardado: se a tela redesenhar o botão, o balão
      // procura de novo e não aponta para um nó que saiu da página.
      element: p.selector && p.element
        ? () => findVisibleElement(p.selector as string) ?? (p.element as HTMLElement)
        : undefined,
      popover: { title: p.title, description: p.body },
    })),
    // No COMEÇO do destaque, não no fim: o fim vem depois da animação, e um
    // clique rápido no botão (já destacado) passaria sem fechar o tour.
    onHighlightStarted: (_el, _step, { index }) => {
      seletorAtual = index !== undefined ? (passos[index]?.selector ?? null) : null;
    },
    onDestroyed: () => {
      seletorAtual = null;
      document.removeEventListener('click', aoClicar, true);
      if (terminou) return;
      terminou = true;
      opts.onFinish();
    },
  });

  d.drive();
  return { destroy: () => d.destroy() };
}
