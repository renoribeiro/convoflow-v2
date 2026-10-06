import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SLA_THRESHOLDS,
  formatWaitingTime,
  normalizeSlaThresholds,
  resolveSlaLevel,
  validateSlaThresholds,
  type SlaInput,
  type SlaThresholds,
} from './slaLevels';

const NOW = new Date('2026-08-13T15:00:00.000Z');

/** Conversa em que o cliente falou por último — o caso que o SLA mede. */
function conv(overrides: Partial<SlaInput> = {}): SlaInput {
  return {
    unread_count: 1,
    last_message_direction: 'inbound',
    last_message_at: NOW.toISOString(),
    sla_muted_at: null,
    ...overrides,
  };
}

/** Horas antes de NOW, em ISO. */
function horasAtras(hours: number): string {
  return new Date(NOW.getTime() - hours * 3_600_000).toISOString();
}

describe('resolveSlaLevel', () => {
  it('devolve ok quando a conversa está silenciada, por mais antiga que seja', () => {
    expect(
      resolveSlaLevel(
        conv({ last_message_at: horasAtras(200), sla_muted_at: '2026-08-10T10:00:00.000Z' }),
        DEFAULT_SLA_THRESHOLDS,
        NOW,
      ),
    ).toBe('ok');
  });

  it('devolve ok quando nós falamos por último e não há não lidas', () => {
    expect(
      resolveSlaLevel(
        conv({ last_message_direction: 'outbound', unread_count: 0, last_message_at: horasAtras(72) }),
        DEFAULT_SLA_THRESHOLDS,
        NOW,
      ),
    ).toBe('ok');
  });

  it('sinaliza mesmo com a última mensagem nossa quando ainda há não lidas', () => {
    // Cenário real: o cliente respondeu, ninguém abriu a conversa e um disparo
    // automático saiu depois. A pendência continua sendo nossa.
    expect(
      resolveSlaLevel(
        conv({ last_message_direction: 'outbound', unread_count: 3, last_message_at: horasAtras(6) }),
        DEFAULT_SLA_THRESHOLDS,
        NOW,
      ),
    ).toBe('atrasada');
  });

  it('devolve ok enquanto a espera é menor que o limite de atenção', () => {
    expect(resolveSlaLevel(conv({ last_message_at: horasAtras(0.5) }), DEFAULT_SLA_THRESHOLDS, NOW)).toBe('ok');
  });

  it('vira atenção exatamente na borda de 1h', () => {
    expect(resolveSlaLevel(conv({ last_message_at: horasAtras(1) }), DEFAULT_SLA_THRESHOLDS, NOW)).toBe('atencao');
  });

  it('continua em atenção logo antes da borda de atrasada', () => {
    expect(resolveSlaLevel(conv({ last_message_at: horasAtras(3.99) }), DEFAULT_SLA_THRESHOLDS, NOW)).toBe('atencao');
  });

  it('vira atrasada exatamente na borda de 4h', () => {
    expect(resolveSlaLevel(conv({ last_message_at: horasAtras(4) }), DEFAULT_SLA_THRESHOLDS, NOW)).toBe('atrasada');
  });

  it('continua atrasada logo antes da borda crítica', () => {
    expect(resolveSlaLevel(conv({ last_message_at: horasAtras(19.99) }), DEFAULT_SLA_THRESHOLDS, NOW)).toBe('atrasada');
  });

  it('vira crítica exatamente na borda de 20h', () => {
    expect(resolveSlaLevel(conv({ last_message_at: horasAtras(20) }), DEFAULT_SLA_THRESHOLDS, NOW)).toBe('critica');
  });

  it('segue crítica depois de estourar a janela de 24h', () => {
    expect(resolveSlaLevel(conv({ last_message_at: horasAtras(40) }), DEFAULT_SLA_THRESHOLDS, NOW)).toBe('critica');
  });

  it('devolve ok quando last_message_at é nulo ou inválido', () => {
    expect(resolveSlaLevel(conv({ last_message_at: null }), DEFAULT_SLA_THRESHOLDS, NOW)).toBe('ok');
    expect(resolveSlaLevel(conv({ last_message_at: 'nao-e-data' }), DEFAULT_SLA_THRESHOLDS, NOW)).toBe('ok');
  });

  it('trata sla_muted_at ausente como não silenciada', () => {
    const semCampo: SlaInput = {
      unread_count: 1,
      last_message_direction: 'inbound',
      last_message_at: horasAtras(5),
    };
    expect(resolveSlaLevel(semCampo, DEFAULT_SLA_THRESHOLDS, NOW)).toBe('atrasada');
  });

  it('usa os limites da Loja em vez dos padrões', () => {
    const apertado: SlaThresholds = { atencao: 0.25, atrasada: 0.5, critica: 1 };
    expect(resolveSlaLevel(conv({ last_message_at: horasAtras(0.3) }), apertado, NOW)).toBe('atencao');
    expect(resolveSlaLevel(conv({ last_message_at: horasAtras(0.75) }), apertado, NOW)).toBe('atrasada');
    expect(resolveSlaLevel(conv({ last_message_at: horasAtras(2) }), apertado, NOW)).toBe('critica');
  });

  it('cai nos limites padrão quando nenhum é informado', () => {
    expect(resolveSlaLevel(conv({ last_message_at: horasAtras(4) }), undefined, NOW)).toBe('atrasada');
  });
});

describe('formatWaitingTime', () => {
  it('descreve menos de um minuto como "há instantes"', () => {
    expect(formatWaitingTime(new Date(NOW.getTime() - 30_000).toISOString(), NOW)).toBe('há instantes');
  });

  it('usa minutos abaixo de uma hora', () => {
    expect(formatWaitingTime(horasAtras(0.2), NOW)).toBe('há 12 min');
    expect(formatWaitingTime(horasAtras(0.983), NOW)).toBe('há 58 min');
  });

  it('usa horas abaixo de um dia', () => {
    expect(formatWaitingTime(horasAtras(3), NOW)).toBe('há 3h');
    expect(formatWaitingTime(horasAtras(23.5), NOW)).toBe('há 23h');
  });

  it('usa dias a partir de 24h, no singular e no plural', () => {
    expect(formatWaitingTime(horasAtras(24), NOW)).toBe('há 1 dia');
    expect(formatWaitingTime(horasAtras(50), NOW)).toBe('há 2 dias');
  });

  it('não quebra com data ausente ou inválida', () => {
    expect(formatWaitingTime(null, NOW)).toBe('há instantes');
    expect(formatWaitingTime(undefined, NOW)).toBe('há instantes');
    expect(formatWaitingTime('nao-e-data', NOW)).toBe('há instantes');
  });
});

describe('normalizeSlaThresholds', () => {
  it('devolve os padrões quando não há nada salvo', () => {
    expect(normalizeSlaThresholds(undefined)).toEqual(DEFAULT_SLA_THRESHOLDS);
    expect(normalizeSlaThresholds(null)).toEqual(DEFAULT_SLA_THRESHOLDS);
    expect(normalizeSlaThresholds({})).toEqual(DEFAULT_SLA_THRESHOLDS);
  });

  it('completa apenas os campos ausentes', () => {
    expect(normalizeSlaThresholds({ atrasada: 6 })).toEqual({
      atencao: 1,
      atrasada: 6,
      critica: 20,
    });
  });

  it('descarta valores inválidos campo a campo', () => {
    expect(normalizeSlaThresholds({ atencao: 0, atrasada: -3, critica: 'abc' })).toEqual(
      DEFAULT_SLA_THRESHOLDS,
    );
  });

  it('aceita número em texto (vem assim do JSONB quando digitado no input)', () => {
    expect(normalizeSlaThresholds({ atencao: '2', atrasada: '8', critica: '18' })).toEqual({
      atencao: 2,
      atrasada: 8,
      critica: 18,
    });
  });
});

describe('validateSlaThresholds', () => {
  it('aceita limites crescentes', () => {
    expect(validateSlaThresholds({ atencao: 1, atrasada: 4, critica: 20 })).toEqual({});
  });

  it('recusa valores zerados ou negativos', () => {
    const errors = validateSlaThresholds({ atencao: 0, atrasada: -1, critica: 20 });
    expect(errors.atencao).toBeTruthy();
    expect(errors.atrasada).toBeTruthy();
  });

  it('recusa atrasada menor ou igual a atenção', () => {
    expect(validateSlaThresholds({ atencao: 4, atrasada: 4, critica: 20 }).atrasada).toBeTruthy();
    expect(validateSlaThresholds({ atencao: 5, atrasada: 2, critica: 20 }).atrasada).toBeTruthy();
  });

  it('recusa crítica menor ou igual a atrasada', () => {
    expect(validateSlaThresholds({ atencao: 1, atrasada: 8, critica: 8 }).critica).toBeTruthy();
    expect(validateSlaThresholds({ atencao: 1, atrasada: 8, critica: 3 }).critica).toBeTruthy();
  });

  it('não acusa ordem quando o campo anterior já está inválido', () => {
    // Sem isso o usuário veria dois erros para o mesmo engano.
    const errors = validateSlaThresholds({ atencao: 0, atrasada: -2, critica: 20 });
    expect(errors.critica).toBeUndefined();
  });
});
