import { describe, expect, it } from 'vitest';
import { contraste, fundosDoSelo, tintaLegivel } from './tintaLegivel';

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];

describe('tintaLegivel (lote 5, contraste AA das etiquetas)', () => {
  it.each(['#16a34a', '#f59e0b', '#eab308', '#3b82f6', '#ec4899', '#ffffff', '#000000', '#aabbcc'])(
    '%s fica legível sobre o fundo do selo, no claro e no escuro',
    (cor) => {
      const t = tintaLegivel(cor)!;
      const fundo = fundosDoSelo(cor)!;
      expect(contraste(rgb(t.clara), fundo.claro)).toBeGreaterThanOrEqual(4.5);
      expect(contraste(rgb(t.clara), [1, 1, 1])).toBeGreaterThanOrEqual(4.5);
      expect(contraste(rgb(t.escura), fundo.escuro)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('cor que já passa não muda', () => {
    expect(tintaLegivel('#1e3a8a')!.clara).toBe('#1e3a8a');
  });

  it('valor que não é código de cor devolve null', () => {
    expect(tintaLegivel('blue')).toBeNull();
    expect(tintaLegivel(null)).toBeNull();
  });
});
