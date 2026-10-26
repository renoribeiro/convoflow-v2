/**
 * A confirmação de "Contratar N lojas" soma em centavos; a tela escreve o
 * rótulo. Os dois têm de ser o mesmo preço.
 */
import { describe, expect, it } from 'vitest';
import { SLOT_PRICE_CENTAVOS, SLOT_PRICE_LABEL, emReais } from './checkout';

describe('preço da loja extra', () => {
  it('centavos e rótulo dizem o mesmo valor', () => {
    expect(emReais(SLOT_PRICE_CENTAVOS)).toBe(SLOT_PRICE_LABEL);
  });

  it('soma de 2 lojas sai no formato da tela', () => {
    expect(emReais(2 * SLOT_PRICE_CENTAVOS)).toBe('R$ 199,80');
  });
});
