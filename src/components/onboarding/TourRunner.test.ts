/**
 * Onde cada balão vai: no alvo, no centro quando o alvo não aparece, e no
 * celular o passo do menu vira o cartão "Abra o menu ☰ e toque em X".
 */
import { describe, expect, it, vi } from 'vitest';
import { resolveTourSteps } from './TourRunner';
import { getTour, type Tour } from '@/lib/onboarding/tours';

const TOUR: Tour = {
  id: 'teste',
  route: '/dashboard',
  steps: [
    { target: 'existe', title: 'Um', body: 'Primeiro.' },
    { target: 'menu-ajuda', menuItem: 'Ajuda', title: 'Dois', body: 'Segundo.' },
    { target: 'sumiu', title: 'Três', body: 'Terceiro.' },
    { title: 'Quatro', body: 'Sem alvo.' },
  ],
};

function esperaFalsa(presentes: string[]) {
  return vi.fn(async (selector: string, _opts?: { timeout?: number }) => {
    const nome = selector.match(/data-tour="([^"]+)"/)?.[1] ?? '';
    if (!presentes.includes(nome)) return null;
    const el = document.createElement('button');
    el.dataset.tour = nome;
    return el;
  });
}

describe('resolveTourSteps', () => {
  it('computador: aponta para o que achou, centro para o resto', async () => {
    const wait = esperaFalsa(['existe', 'menu-ajuda']);
    const passos = await resolveTourSteps(TOUR, { mobile: false, wait });
    expect(passos.map((p) => p.selector)).toEqual([
      '[data-tour="existe"]',
      '[data-tour="menu-ajuda"]',
      null,
      null,
    ]);
    expect(passos[2]?.body).toBe('Terceiro.'); // centro, com o mesmo texto
  });

  it('celular: nunca aponta para o menu; mostra "Abra o menu ☰ e toque em Ajuda"', async () => {
    const wait = esperaFalsa(['existe', 'menu-ajuda']);
    const passos = await resolveTourSteps(TOUR, { mobile: true, wait });
    expect(passos[1]?.selector).toBeNull();
    expect(passos[1]?.body).toBe('Abra o menu ☰ no topo e toque em Ajuda. Segundo.');
    // E nem procurou o item do menu.
    expect(wait.mock.calls.map((c) => c[0])).not.toContain('[data-tour="menu-ajuda"]');
  });

  it('o primeiro alvo espera mais (tela que ainda carrega), os seguintes menos', async () => {
    const wait = esperaFalsa(['existe']);
    await resolveTourSteps(TOUR, { mobile: false, wait });
    const prazos = wait.mock.calls.map((c) => c[1]?.timeout ?? 0);
    expect(prazos[0]).toBeGreaterThan(prazos[1] as number);
  });

  it('só procura os outros alvos depois que o primeiro apareceu (a tela já carregou)', async () => {
    let liberar: (el: HTMLElement) => void = () => {};
    const wait = vi.fn((selector: string, _opts?: { timeout?: number }) => {
      if (selector.includes('existe')) return new Promise<HTMLElement | null>((r) => { liberar = r; });
      return Promise.resolve(null);
    });
    const promessa = resolveTourSteps(TOUR, { mobile: false, wait });
    await new Promise((r) => setTimeout(r, 10));
    expect(wait).toHaveBeenCalledTimes(1);
    liberar(document.createElement('button'));
    await promessa;
    expect(wait).toHaveBeenCalledTimes(3); // 'existe', 'menu-ajuda' e 'sumiu'
  });

  it('passo "só no computador": no celular vira cartão no centro sem procurar o alvo; no computador aponta', async () => {
    const tour = getTour('conversas')!;
    const presentes = ['conversas-filtros-rapidos', 'conversas-lista', 'conversas-filtros', 'conversas-janela'];
    const noCelular = esperaFalsa(presentes);
    const celular = await resolveTourSteps(tour, { mobile: true, wait: noCelular });
    expect(celular[3]?.selector).toBeNull();
    expect(celular[3]?.body).toBe(tour.steps[3]?.body);
    expect(noCelular.mock.calls.map((c) => c[0])).not.toContain('[data-tour="conversas-janela"]');
    const computador = await resolveTourSteps(tour, { mobile: false, wait: esperaFalsa(presentes) });
    expect(computador[3]?.selector).toBe('[data-tour="conversas-janela"]');
  });

  it('o tour real da boas-vindas no celular: lista destacada, Ajuda no cartão', async () => {
    const tour = getTour('primeiros-passos')!;
    const passos = await resolveTourSteps(tour, { mobile: true, wait: esperaFalsa(['primeiros-passos', 'menu-ajuda']) });
    expect(passos[0]?.selector).toBe('[data-tour="primeiros-passos"]');
    expect(passos[1]?.selector).toBeNull();
    expect(passos[1]?.body.startsWith('Abra o menu ☰')).toBe(true);
  });
});
