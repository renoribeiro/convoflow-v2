/**
 * "Esperar elemento": acha o alvo que já está na tela, espera o que chega
 * depois (tela lazy, esqueleto que sai) e desiste no prazo sem travar.
 *
 * O jsdom não calcula layout (todo getBoundingClientRect é zero), então a
 * visibilidade vem de um atributo do teste.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { findVisibleElement, tourSelector, waitForElement } from './waitForElement';

const visivelNoTeste = (el: HTMLElement) => el.isConnected && el.dataset.visivel === 'sim';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('findVisibleElement', () => {
  it('pula a cópia escondida e devolve a visível', () => {
    document.body.innerHTML = `
      <button data-tour="x" data-visivel="nao" id="escondido"></button>
      <button data-tour="x" data-visivel="sim" id="visivel"></button>`;
    expect(findVisibleElement(tourSelector('x'), document, visivelNoTeste)?.id).toBe('visivel');
  });

  it('sem nenhum visível, null', () => {
    document.body.innerHTML = '<button data-tour="x" data-visivel="nao"></button>';
    expect(findVisibleElement(tourSelector('x'), document, visivelNoTeste)).toBeNull();
  });
});

describe('waitForElement', () => {
  it('elemento que já está na tela volta na hora', async () => {
    document.body.innerHTML = '<div data-tour="pronto" data-visivel="sim"></div>';
    await expect(waitForElement(tourSelector('pronto'), { isVisible: visivelNoTeste, timeout: 50 })).resolves.toBeInstanceOf(
      HTMLElement,
    );
  });

  it('espera o elemento que chega depois (tela carregada sob demanda)', async () => {
    const espera = waitForElement(tourSelector('tarde'), { isVisible: visivelNoTeste, timeout: 2000 });
    setTimeout(() => {
      const el = document.createElement('button');
      el.dataset.tour = 'tarde';
      el.dataset.visivel = 'sim';
      document.body.appendChild(el);
    }, 30);
    const el = await espera;
    expect(el?.dataset.tour).toBe('tarde');
  });

  it('espera o elemento que já existia ficar visível', async () => {
    document.body.innerHTML = '<button data-tour="fica" data-visivel="nao"></button>';
    const espera = waitForElement(tourSelector('fica'), { isVisible: visivelNoTeste, timeout: 2000 });
    setTimeout(() => {
      (document.querySelector('[data-tour="fica"]') as HTMLElement).dataset.visivel = 'sim';
    }, 30);
    expect(await espera).not.toBeNull();
  });

  it('desiste no prazo e devolve null (o tour mostra o cartão no centro)', async () => {
    const inicio = Date.now();
    expect(await waitForElement(tourSelector('nunca'), { isVisible: visivelNoTeste, timeout: 80 })).toBeNull();
    expect(Date.now() - inicio).toBeLessThan(1500);
  });
});
