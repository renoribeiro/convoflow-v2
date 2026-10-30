import { describe, expect, it } from 'vitest';
import { contraste, estiloDoFundoCheio, fundoParaTextoBranco, fundosDoSelo, tintaLegivel } from './tintaLegivel';
import { CORES_DA_AUTOMACAO, CORES_DO_CHATBOT, pinturaDaCategoria } from './coresDeCategoria';

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

describe('cores de categoria (lote 7): chatbot e automação legíveis nos dois temas', () => {
  const hexParaRgb = (hex: string): [number, number, number] =>
    [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  const todas = { ...CORES_DO_CHATBOT, ...CORES_DA_AUTOMACAO };

  it.each(Object.entries(todas))('%s: fundo cheio com texto branco passa no AA', (_nome, cor) => {
    const fundo = fundoParaTextoBranco(cor)!;
    expect(contraste(hexParaRgb(fundo), [1, 1, 1])).toBeGreaterThanOrEqual(4.5);
    expect(estiloDoFundoCheio(cor)).toEqual({ backgroundColor: fundo, color: '#ffffff' });
  });

  it.each(Object.entries(todas))('%s: rótulo na tinta legível nos dois temas', (_nome, cor) => {
    const t = tintaLegivel(cor)!;
    const { claro, escuro } = fundosDoSelo(cor)!;
    expect(contraste(hexParaRgb(t.clara), claro)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(hexParaRgb(t.escura), escuro)).toBeGreaterThanOrEqual(4.5);
  });

  it('pintura completa da categoria', () => {
    const p = pinturaDaCategoria(CORES_DA_AUTOMACAO.trigger);
    expect(p.suave.backgroundColor).toMatch(/^#[0-9a-f]{6}14$/);
    expect(p.anel['--tw-ring-color']).toBe(CORES_DA_AUTOMACAO.trigger);
    expect(p.texto['--tinta-clara']).toBeTruthy();
  });
});
