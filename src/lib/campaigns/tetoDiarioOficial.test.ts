/**
 * Teto do dia nas campanhas de número da API Oficial
 * (supabase/functions/_shared/teto-diario-oficial.ts, usado pelo
 * process-campaign-dispatch).
 */
import { describe, expect, it } from 'vitest';
import {
  limiteDaMetaEmMensagens,
  motivoDoTetoAtingido,
  tetoDiarioDoNumeroOficial,
} from '../../../supabase/functions/_shared/teto-diario-oficial.ts';

const AGORA = Date.parse('2026-11-11T15:00:00Z');
const diasAtras = (d: number) => new Date(AGORA - d * 86_400_000 - 60_000).toISOString();

describe('número novo: aquecimento da primeira semana (o de sempre)', () => {
  it.each([
    [0, 50],
    [1, 50],
    [2, 250],
    [3, 250],
    [4, 1000],
    [6, 1000],
  ])('registrado há %i dia(s): até %i', (dias, teto) => {
    expect(tetoDiarioDoNumeroOficial({ registeredAt: diasAtras(dias), agoraMs: AGORA })).toMatchObject({
      teto,
      motivo: 'aquecimento',
      dias,
    });
  });

  it('do sétimo dia em diante, sem teto do ConvoFlow', () => {
    expect(tetoDiarioDoNumeroOficial({ registeredAt: diasAtras(7), agoraMs: AGORA })).toMatchObject({ teto: null, motivo: null });
  });

  it('sem registered_at conta da criação, como antes', () => {
    expect(tetoDiarioDoNumeroOficial({ registeredAt: null, createdAt: diasAtras(0), agoraMs: AGORA }).teto).toBe(50);
  });

  it('o limite da Meta não muda o aquecimento de número novo', () => {
    expect(
      tetoDiarioDoNumeroOficial({ registeredAt: diasAtras(0), messagingLimitTier: 'TIER_UNLIMITED', agoraMs: AGORA }).teto,
    ).toBe(50);
  });

  it('a frase do aquecimento ficou a mesma', () => {
    expect(motivoDoTetoAtingido({ teto: 50, motivo: 'aquecimento', dias: 1 })).toBe(
      'Teto de aquecimento do dia: o número foi registrado há 1 dia(s) e nesta fase manda até 50 mensagens por dia. O dia vira à meia noite de Brasília.',
    );
  });
});

describe('número que já funcionava em outra empresa: sem aquecimento, vale a Meta', () => {
  it('registrado hoje, mas com o limite da Meta, nunca o de 50', () => {
    expect(
      tetoDiarioDoNumeroOficial({
        registeredElsewhere: true,
        registeredAt: null,
        createdAt: diasAtras(0),
        messagingLimitTier: 'TIER_2K',
        agoraMs: AGORA,
      }),
    ).toMatchObject({ teto: 2000, motivo: 'limite_da_meta' });
  });

  it('limite ilimitado ou desconhecido: sem teto do ConvoFlow', () => {
    expect(tetoDiarioDoNumeroOficial({ registeredElsewhere: true, messagingLimitTier: 'TIER_UNLIMITED', agoraMs: AGORA }).teto).toBeNull();
    expect(tetoDiarioDoNumeroOficial({ registeredElsewhere: true, messagingLimitTier: null, agoraMs: AGORA }).teto).toBeNull();
  });

  it('a frase diz que o limite é o da Meta, sem hífen nem travessão', () => {
    const t = motivoDoTetoAtingido({ teto: 250, motivo: 'limite_da_meta', dias: 999 });
    expect(t).toMatch(/Meta informa/);
    expect(t).toMatch(/até 250 mensagens/);
    expect(t).not.toMatch(/[-‐‑‒–—―−]/);
  });
});

describe('limite da Meta em mensagens', () => {
  it.each([
    ['TIER_250', 250],
    ['TIER_1K', 1000],
    ['TIER_2K', 2000],
    ['TIER_10K', 10000],
    ['TIER_100K', 100000],
    ['tier_2k', 2000],
  ])('%s vira %i', (tier, n) => {
    expect(limiteDaMetaEmMensagens(tier)).toBe(n);
  });

  it.each(['TIER_UNLIMITED', '', null, undefined, 'TIER_0', 'outro'])('%s: sem número', (tier) => {
    expect(limiteDaMetaEmMensagens(tier as string | null | undefined)).toBeNull();
  });
});
