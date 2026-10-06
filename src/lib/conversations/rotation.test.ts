/**
 * Rodízio de conversas novas — as regras puras (migração 20260915000001).
 *
 * O escolhedor de verdade é `rotation_pick` no banco; `pickNext` é o mesmo
 * algoritmo em TS, e estes números são os MESMOS que a suíte SQL
 * (docs/teste_rotacao_conversas.sql, R1/R2/R6b3) afirma contra o Postgres.
 * Se um dos dois mudar de opinião, um dos dois testes quebra.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROTATION_TIMING,
  countIneligibleConversations,
  ineligibleReasonLabel,
  parseRotationSettings,
  pickNext,
  rebalanceEvenly,
  simulateRotation,
  validatePercentages,
  type RotationState,
} from './rotation';

const ANA = 'ana';
const BRUNO = 'bruno';
const CARLA = 'carla';

const estado = (pairs: Array<[string, number]>): RotationState[] =>
  pairs.map(([profile_id, percent]) => ({ profile_id, percent, credit: 0 }));

describe('pickNext / simulateRotation — round-robin ponderado suave', () => {
  it('70/30 em 100 escolhas dá EXATAMENTE 70 e 30, e os créditos voltam a zero', () => {
    const { counts, state } = simulateRotation(estado([[ANA, 70], [BRUNO, 30]]), 100);
    expect(counts).toEqual({ [ANA]: 70, [BRUNO]: 30 });
    expect(state.reduce((acc, s) => acc + s.credit, 0)).toBe(0);
  });

  it('70/30 nas 10 primeiras dá 7/3 e nas 7 primeiras 5/2 (o mais perto possível)', () => {
    expect(simulateRotation(estado([[ANA, 70], [BRUNO, 30]]), 10).counts).toEqual({ [ANA]: 7, [BRUNO]: 3 });
    expect(simulateRotation(estado([[ANA, 70], [BRUNO, 30]]), 7).counts).toEqual({ [ANA]: 5, [BRUNO]: 2 });
  });

  it('50/30/20 em 10 dá 5/3/2', () => {
    expect(simulateRotation(estado([[ANA, 50], [BRUNO, 30], [CARLA, 20]]), 10).counts).toEqual({
      [ANA]: 5,
      [BRUNO]: 3,
      [CARLA]: 2,
    });
  });

  it('a sequência não é uma rajada: 70/30 alterna, não manda 7 seguidas para a Ana', () => {
    let state = estado([[ANA, 70], [BRUNO, 30]]);
    const ordem: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      const r = pickNext(state);
      state = r.state;
      ordem.push(r.winner!);
    }
    expect(ordem).toEqual([ANA, BRUNO, ANA, ANA, ANA, BRUNO, ANA, ANA, BRUNO, ANA]);
  });

  it('0 % nunca recebe — e a linha continua existindo no estado', () => {
    const { counts, state } = simulateRotation(estado([[ANA, 100], [BRUNO, 0]]), 20);
    expect(counts).toEqual({ [ANA]: 20, [BRUNO]: 0 });
    expect(state.find((s) => s.profile_id === BRUNO)).toEqual({ profile_id: BRUNO, percent: 0, credit: 0 });
  });

  it('ninguém participando: winner null e nada muda', () => {
    const r = pickNext(estado([[ANA, 0], [BRUNO, 0]]));
    expect(r.winner).toBeNull();
    expect(r.state).toEqual(estado([[ANA, 0], [BRUNO, 0]]));
  });

  it('não muta a entrada', () => {
    const before = estado([[ANA, 60], [BRUNO, 40]]);
    const copia = JSON.parse(JSON.stringify(before));
    pickNext(before);
    expect(before).toEqual(copia);
  });

  it('empate de crédito: quem vem primeiro na lista vence (= quem entrou primeiro)', () => {
    const r = pickNext(estado([[BRUNO, 50], [ANA, 50]]));
    expect(r.winner).toBe(BRUNO);
  });
});

describe('validatePercentages — a regra de salvar', () => {
  it('soma 100 com inteiros 0..100 é ok', () => {
    expect(validatePercentages({ [ANA]: 70, [BRUNO]: 30 })).toEqual({ ok: true, sum: 100 });
    expect(validatePercentages({ [ANA]: 100, [BRUNO]: 0 })).toEqual({ ok: true, sum: 100 });
  });

  it('diz quanto FALTA sem corrigir nada', () => {
    expect(validatePercentages({ [ANA]: 60, [BRUNO]: 30 })).toEqual({
      ok: false, sum: 90, missing: 10, excess: 0, reason: 'sum',
    });
  });

  it('diz quanto SOBRA sem corrigir nada', () => {
    expect(validatePercentages({ [ANA]: 60, [BRUNO]: 50 })).toEqual({
      ok: false, sum: 110, missing: 0, excess: 10, reason: 'sum',
    });
  });

  it('decimal, negativo e acima de 100 são inválidos, apontando a pessoa', () => {
    expect(validatePercentages({ [ANA]: 50.5, [BRUNO]: 49.5 })).toMatchObject({ ok: false, reason: 'invalid', profileId: ANA });
    expect(validatePercentages({ [ANA]: 150, [BRUNO]: -50 })).toMatchObject({ ok: false, reason: 'invalid', profileId: ANA });
    expect(validatePercentages({ [ANA]: 50, [BRUNO]: -1 })).toMatchObject({ ok: false, reason: 'invalid', profileId: BRUNO });
  });

  it('mapa vazio soma 0: faltam 100', () => {
    expect(validatePercentages({})).toEqual({ ok: false, sum: 0, missing: 100, excess: 0, reason: 'sum' });
  });
});

describe('rebalanceEvenly — a mesma regra de rotation_rebalance', () => {
  it('três pessoas: 34/33/33, resto para quem vem primeiro', () => {
    expect(
      rebalanceEvenly(
        [{ profile_id: ANA, percent: 70 }, { profile_id: BRUNO, percent: 30 }, { profile_id: CARLA, percent: 0 }],
        new Set([CARLA]),
      ),
    ).toEqual({ [ANA]: 34, [BRUNO]: 33, [CARLA]: 33 });
  });

  it('0 % é preservado quando não é recém-chegado', () => {
    expect(
      rebalanceEvenly(
        [{ profile_id: ANA, percent: 0 }, { profile_id: BRUNO, percent: 100 }, { profile_id: CARLA, percent: 0 }],
        new Set([CARLA]),
      ),
    ).toEqual({ [ANA]: 0, [BRUNO]: 50, [CARLA]: 50 });
  });

  it('todo mundo em 0 e ninguém novo: participam todos (o rodízio não fica sem ninguém)', () => {
    expect(rebalanceEvenly([{ profile_id: ANA, percent: 0 }, { profile_id: BRUNO, percent: 0 }])).toEqual({
      [ANA]: 50,
      [BRUNO]: 50,
    });
  });

  it('uma pessoa só: 100; ninguém: {}', () => {
    expect(rebalanceEvenly([{ profile_id: ANA, percent: 0 }])).toEqual({ [ANA]: 100 });
    expect(rebalanceEvenly([])).toEqual({});
  });

  it('sempre soma 100, para qualquer tamanho de time', () => {
    for (let k = 1; k <= 7; k += 1) {
      const entries = Array.from({ length: k }, (_, i) => ({ profile_id: `p${i}`, percent: 1 }));
      const out = rebalanceEvenly(entries);
      expect(Object.values(out).reduce((a, b) => a + b, 0)).toBe(100);
    }
  });
});

describe('parseRotationSettings — a forma de tenants.settings', () => {
  it('sem nada gravado: desligado, sem gestor, na primeira mensagem', () => {
    expect(parseRotationSettings({})).toEqual({
      rotation_enabled: false,
      rotation_includes_gestor: false,
      rotation_timing: 'immediate',
    });
    expect(parseRotationSettings(null)).toEqual(parseRotationSettings(undefined));
    expect(DEFAULT_ROTATION_TIMING).toBe('immediate');
  });

  it('lê as três chaves', () => {
    expect(
      parseRotationSettings({ rotation_enabled: true, rotation_includes_gestor: true, rotation_timing: 'after_bot' }),
    ).toEqual({ rotation_enabled: true, rotation_includes_gestor: true, rotation_timing: 'after_bot' });
  });

  it('valor estranho cai no padrão em vez de quebrar', () => {
    expect(parseRotationSettings({ rotation_enabled: 'sim', rotation_timing: 'bogus', rotation_includes_gestor: 1 })).toEqual({
      rotation_enabled: false,
      rotation_includes_gestor: false,
      rotation_timing: 'immediate',
    });
  });

  it('não confunde com as chaves do passo 2 no mesmo JSON', () => {
    expect(parseRotationSettings({ atendente_visibility: 'own', atendente_can_transfer: false }).rotation_enabled).toBe(false);
  });
});

describe('responsável indisponível', () => {
  it('rótulos em pt-BR, e motivo desconhecido passa como está', () => {
    expect(ineligibleReasonLabel('suspended')).toBe('suspenso');
    expect(ineligibleReasonLabel('zero_percent')).toBe('em 0 %');
    expect(ineligibleReasonLabel('moved')).toBe('fora da Loja');
    expect(ineligibleReasonLabel('deleted')).toBe('excluído');
    expect(ineligibleReasonLabel('pending')).toBe('convite pendente');
    expect(ineligibleReasonLabel('outro')).toBe('outro');
  });

  it('soma as conversas presas', () => {
    expect(
      countIneligibleConversations([
        { profile_id: ANA, first_name: 'Ana', last_name: null, reason: 'suspended', n_conversations: 6 },
        { profile_id: BRUNO, first_name: 'Bruno', last_name: null, reason: 'zero_percent', n_conversations: 2 },
      ]),
    ).toBe(8);
    expect(countIneligibleConversations([])).toBe(0);
  });
});
