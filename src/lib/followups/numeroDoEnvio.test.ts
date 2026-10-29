import { describe, it, expect } from 'vitest';
import { ehNumeroOficial, numeroDoEnvio } from './numeroDoEnvio';

const QR = { id: 'qr', provider: 'evolution', is_active: true, created_at: '2026-01-01T00:00:00Z' };
const OFICIAL = { id: 'oficial', provider: 'official', is_active: true, created_at: '2026-02-01T00:00:00Z' };
const INSTAGRAM = { id: 'ig', provider: 'instagram', is_active: true, created_at: '2025-12-01T00:00:00Z' };
const DESLIGADO = { id: 'off', provider: 'evolution', is_active: false, created_at: '2025-11-01T00:00:00Z' };

describe('numeroDoEnvio (a regra do servidor)', () => {
  it('usa o número preferido quando ele existe', () => {
    expect(numeroDoEnvio([QR, OFICIAL], [null, 'oficial'])?.id).toBe('oficial');
  });

  it('sem preferido, o WhatsApp ativo mais antigo (Instagram e desligado ficam de fora)', () => {
    expect(numeroDoEnvio([OFICIAL, INSTAGRAM, DESLIGADO, QR], [undefined])?.id).toBe('qr');
  });

  it('preferido que não existe mais cai na regra geral', () => {
    expect(numeroDoEnvio([OFICIAL], ['apagado'])?.id).toBe('oficial');
    expect(numeroDoEnvio([], ['apagado'])).toBeNull();
  });

  it('só a API Oficial é oficial', () => {
    expect(ehNumeroOficial(OFICIAL)).toBe(true);
    expect(ehNumeroOficial(QR)).toBe(false);
    expect(ehNumeroOficial(null)).toBe(false);
  });
});
