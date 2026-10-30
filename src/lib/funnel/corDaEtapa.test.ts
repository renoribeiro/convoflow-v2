import { describe, expect, it } from 'vitest';
import { corDaEtapa } from './corDaEtapa';

describe('corDaEtapa (achado 54)', () => {
  it('nome gravado por "Configurar etapas" pinta pela cor dele, com o ajuste de contraste (lote 7)', () => {
    const p = corDaEtapa('blue');
    expect(p.style).toMatchObject({ backgroundColor: '#3b82f626', borderColor: '#3b82f6' });
    expect(p.style?.['--tinta-clara']).toMatch(/^#[0-9a-f]{6}$/);
    expect(p.className).toContain('var(--tinta-clara)');
  });

  it('código de cor pinta por estilo, nunca monta "blue20"', () => {
    const p = corDaEtapa('#3b82f6');
    expect(p.style).toMatchObject({ backgroundColor: '#3b82f626', borderColor: '#3b82f6' });
    expect(p.style?.['--tinta-clara']).toMatch(/^#[0-9a-f]{6}$/);
    expect(corDaEtapa('#abc').style?.borderColor).toBe('#aabbcc');
  });

  it('classe antiga do quadro continua valendo', () => {
    expect(corDaEtapa('bg-gray-100 text-gray-800').className).toBe('bg-gray-100 text-gray-800');
  });

  it('vazio ou desconhecido fica neutro', () => {
    expect(corDaEtapa(null).className).toContain('bg-muted');
    expect(corDaEtapa('azul-piscina').className).toContain('bg-muted');
  });
});
