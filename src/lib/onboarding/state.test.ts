/**
 * Estado do onboarding: a boas-vindas aparece uma vez, o "Ver tutorial de
 * novo" volta tudo, e o JSON do banco é lido sem confiança.
 */
import { describe, expect, it } from 'vitest';
import {
  hideChecklist,
  markTourDone,
  markWelcomeSeen,
  parseOnboardingState,
  resetOnboardingState,
  shouldShowWelcome,
} from './state';

const AGORA = '2026-10-21T12:00:00Z';

describe('boas-vindas aparece uma vez', () => {
  it('pessoa nova (sem linha no banco = estado vazio) vê a boas-vindas', () => {
    for (const role of ['gerente', 'gestor', 'atendente'] as const) {
      expect(shouldShowWelcome(role, {})).toBe(true);
    }
  });

  it('depois de vista, não aparece mais', () => {
    const vista = markWelcomeSeen({}, AGORA);
    expect(vista.boas_vindas_em).toBe(AGORA);
    expect(shouldShowWelcome('gerente', vista)).toBe(false);
  });

  it('veterano do backfill não vê', () => {
    const veterano = parseOnboardingState({ v: 1, boas_vindas_em: AGORA, veterano: true });
    expect(shouldShowWelcome('gestor', veterano)).toBe(false);
  });

  it('superadmin e cargo desconhecido nunca veem', () => {
    expect(shouldShowWelcome('superadmin', {})).toBe(false);
    expect(shouldShowWelcome(null, {})).toBe(false);
  });

  it('estado ainda não lido (ou erro na leitura) não mostra nada', () => {
    expect(shouldShowWelcome('gerente', null)).toBe(false);
    expect(shouldShowWelcome('gerente', undefined)).toBe(false);
  });
});

describe('Ver tutorial de novo', () => {
  it('zera tudo: a boas-vindas volta, a lista volta e o veterano vira gente nova', () => {
    const cheio = hideChecklist(
      markTourDone(markWelcomeSeen({ veterano: true }, AGORA), 'conversas', AGORA),
      AGORA,
    );
    expect(shouldShowWelcome('atendente', cheio)).toBe(false);
    const zerado = resetOnboardingState();
    expect(zerado).toEqual({});
    expect(shouldShowWelcome('atendente', zerado)).toBe(true);
  });
});

describe('marcas', () => {
  it('tour concluído entra no mapa sem apagar os outros', () => {
    const um = markTourDone({}, 'criar-loja', AGORA);
    const dois = markTourDone(um, 'conversas', '2026-10-22T08:00:00Z');
    expect(dois.tours).toEqual({ 'criar-loja': AGORA, conversas: '2026-10-22T08:00:00Z' });
  });

  it('esconder a lista guarda quando', () => {
    expect(hideChecklist({}, AGORA).lista_escondida_em).toBe(AGORA);
  });
});

describe('leitura do JSON do banco', () => {
  it('lixo vira estado vazio', () => {
    for (const lixo of [null, undefined, 'x', 3, [], [1, 2]]) {
      expect(parseOnboardingState(lixo)).toEqual({});
    }
  });

  it('campo de tipo errado é ignorado', () => {
    expect(
      parseOnboardingState({
        boas_vindas_em: 123,
        lista_escondida_em: '',
        veterano: 'sim',
        tours: { a: AGORA, b: 7, c: '' },
      }),
    ).toEqual({ tours: { a: AGORA } });
  });
});
