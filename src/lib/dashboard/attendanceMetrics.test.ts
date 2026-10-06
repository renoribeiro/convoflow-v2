import { describe, it, expect } from 'vitest';
import { buildAttendanceCards, fasterPct, formatMinutes, sharePct } from './attendanceMetrics';
import type { LojaConversationMetricsRow } from '@/hooks/useLojaStats';

/** Índice por chave com todos os seis cartões garantidos (o teste falha alto se faltar um). */
const byKeyOf = (cards: ReturnType<typeof buildAttendanceCards>) => {
  const find = (key: (typeof cards)[number]['key']) => {
    const c = cards.find((x) => x.key === key);
    if (!c) throw new Error(`cartão ${key} ausente`);
    return c;
  };
  return {
    bot: find('bot'), human: find('human'), waiting: find('waiting'),
    noHuman: find('noHuman'), botTouched: find('botTouched'), duration: find('duration'),
  };
};

// A linha real da VagaCerta em 2026-09-21 (todo o histórico), medida pela RPC.
const VAGA_CERTA: LojaConversationMetricsRow = {
  n_conversations: 168,
  n_bot_touched: 160,
  n_no_human_reply: 68,
  n_waiting_human: 92,
  n_waiting_human_unowned: 92,
  n_first_human: 100,
  median_first_human_minutes: 448.2,
  n_first_bot: 160,
  median_first_bot_minutes: 0.1035,
  median_messages: 16,
  median_duration_minutes: 233.3,
};

describe('formatMinutes — a unidade que cabe no número', () => {
  it('segundos abaixo de 1 min, minutos abaixo de 1 h, horas com resto, dias', () => {
    expect(formatMinutes(0.1035)).toBe('6 s');
    expect(formatMinutes(12.4)).toBe('12 min');
    expect(formatMinutes(448.2)).toBe('7 h 28 min');
    expect(formatMinutes(120)).toBe('2 h');
    expect(formatMinutes(3112)).toBe('2 d 3 h');
  });
  it('sem número vira travessão, nunca "0"', () => {
    expect(formatMinutes(null)).toBe('—');
    expect(formatMinutes(undefined)).toBe('—');
    expect(formatMinutes(Number.NaN)).toBe('—');
  });
});

describe('fasterPct / sharePct', () => {
  it('positivo = ficou mais rápido; sem base = null', () => {
    expect(fasterPct(50, 100)).toBe(50);
    expect(fasterPct(150, 100)).toBe(-50);
    expect(fasterPct(null, 100)).toBeNull();
    expect(fasterPct(10, 0)).toBeNull();
  });
  it('percentual inteiro; sem conversas = null', () => {
    expect(sharePct(160, 168)).toBe(95);
    expect(sharePct(0, 0)).toBeNull();
  });
});

describe('buildAttendanceCards — bot e pessoa são dois números, em mediana', () => {
  it('a VagaCerta sai como 6 s para o bot e 7 h 28 min para uma pessoa', () => {
    const cards = buildAttendanceCards(VAGA_CERTA, null);
    const byKey = byKeyOf(cards);
    expect(byKey.bot.value).toBe('6 s');
    expect(byKey.human.value).toBe('7 h 28 min');
    // Cada um diz o que NÃO conta.
    expect(byKey.bot.description).toMatch(/Não conta pessoa/);
    expect(byKey.human.description).toMatch(/Não conta bot/);
    // "na metade das conversas" é a mediana explicada para leigo.
    expect(byKey.human.description).toMatch(/Na metade das 100 conversas/);
  });

  it('esperando agora traz o número sem responsável na própria frase', () => {
    const cards = buildAttendanceCards(VAGA_CERTA, null);
    const waiting = cards.find((c) => c.key === 'waiting')!;
    expect(waiting.value).toBe('92');
    expect(waiting.description).toMatch(/92 sem responsável/);
  });

  it('os outros três: sem resposta de pessoa, bot participou (%), duração', () => {
    const byKey = byKeyOf(buildAttendanceCards(VAGA_CERTA, null));
    expect(byKey.noHuman.value).toBe('68');
    expect(byKey.botTouched.value).toBe('95%');
    expect(byKey.duration.value).toBe('3 h 53 min');
    expect(byKey.duration.description).toMatch(/16 mensagens por conversa/);
  });

  it('variação só nas duas medianas, no sentido "positivo = mais rápido"', () => {
    const prev = { ...VAGA_CERTA, median_first_human_minutes: 896.4, median_first_bot_minutes: 0.1035 };
    const byKey = byKeyOf(buildAttendanceCards(VAGA_CERTA, prev));
    expect(byKey.human.deltaPct).toBeCloseTo(50, 5);
    expect(byKey.bot.deltaPct).toBeCloseTo(0, 5);
    expect(byKey.waiting.deltaPct).toBeNull();
    expect(byKey.noHuman.deltaPct).toBeNull();
  });

  it('RPC sem linha (fora do alcance): tudo "—", nunca zero falso', () => {
    const cards = buildAttendanceCards(null, null);
    expect(cards).toHaveLength(6);
    for (const c of cards) expect(c.value).toBe('—');
  });

  it('todos os cartões são da Loja inteira (etiqueta "Toda a Loja")', () => {
    for (const c of buildAttendanceCards(VAGA_CERTA, null)) expect(c.lojaWide).toBe(true);
  });
});
