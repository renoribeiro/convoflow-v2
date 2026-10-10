import { describe, expect, it } from 'vitest';
import { formatFullPtBR, formatRelativePtBR } from './relativeTime';

// Horário local do aparelho, como a tela mostra.
const AGORA = new Date(2026, 9, 10, 14, 0, 0); // 10/10/2026 14:00
const antes = (ms: number) => new Date(AGORA.getTime() - ms);
const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

describe('formatRelativePtBR', () => {
  it.each([
    [antes(30_000), 'agora mesmo'],
    [antes(1 * MIN), 'há 1 minuto'],
    [antes(5 * MIN), 'há 5 minutos'],
    [antes(1 * HORA), 'há 1 hora'],
    [antes(2 * HORA), 'há 2 horas'],
    [antes(23 * HORA), 'há 23 horas'],
    [new Date(2026, 9, 9, 8, 0), 'ontem'],
    [antes(9 * DIA), 'há 9 dias'],
    [antes(29 * DIA), 'há 29 dias'],
    [antes(45 * DIA), 'há 1 mês'],
    [antes(100 * DIA), 'há 3 meses'],
    [antes(400 * DIA), 'há 1 ano'],
    [antes(800 * DIA), 'há 2 anos'],
  ])('%s → %s', (data, esperado) => {
    expect(formatRelativePtBR(data, AGORA)).toBe(esperado);
  });

  it('menos de 24 h passando a meia-noite ainda é em horas, não "ontem"', () => {
    const meiaNoiteEMeia = new Date(2026, 9, 10, 0, 30);
    expect(formatRelativePtBR(new Date(2026, 9, 9, 22, 30), meiaNoiteEMeia)).toBe('há 2 horas');
  });

  it('data no futuro (relógio adiantado) vira "agora mesmo"', () => {
    expect(formatRelativePtBR(new Date(AGORA.getTime() + 5 * MIN), AGORA)).toBe('agora mesmo');
  });

  it('aceita ISO', () => {
    expect(formatRelativePtBR(antes(2 * HORA).toISOString(), AGORA)).toBe('há 2 horas');
  });
});

describe('formatFullPtBR', () => {
  it('data completa para o passar o mouse', () => {
    expect(formatFullPtBR(AGORA)).toBe('10/10/2026 às 14:00');
  });
});
