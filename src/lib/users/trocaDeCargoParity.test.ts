/**
 * A trava da troca de cargo (lote 6e, D2 parcial) existe em dois lugares: a
 * tela do Admin (src/lib/users/trocaDeCargo.ts) e o servidor manage-user
 * (supabase/functions/_shared/troca-de-cargo.ts). Este teste fixa a regra e
 * confere que as duas cópias respondem igual em todas as combinações.
 */
import { describe, expect, it } from 'vitest';
import { avaliarTrocaDeCargo, TROCA_DE_CARGO_EM_ESPERA, type LugarDaPessoa } from './trocaDeCargo';
import {
  avaliarTrocaDeCargo as doServidor,
  TROCA_DE_CARGO_EM_ESPERA as fraseDoServidor,
} from '../../../supabase/functions/_shared/troca-de-cargo.ts';

const CARGOS = ['superadmin', 'gerente', 'gestor', 'atendente', 'loja'];
const LUGARES: LugarDaPessoa[] = ['account', 'store', null];

describe('trava da troca de cargo', () => {
  it('a frase é a combinada com o dono', () => {
    expect(TROCA_DE_CARGO_EM_ESPERA).toBe(
      'Essa troca de cargo ainda não está disponível. Fale com o suporte do ConvoFlow.',
    );
    expect(fraseDoServidor).toBe(TROCA_DE_CARGO_EM_ESPERA);
  });

  it('Gestor e Atendente trocam entre si dentro da Loja', () => {
    expect(avaliarTrocaDeCargo('gestor', 'atendente', 'store')).toEqual({ permitida: true });
    expect(avaliarTrocaDeCargo('atendente', 'gestor', 'store')).toEqual({ permitida: true });
  });

  it('Atendente ou Gestor não vira Gerente dentro de uma Loja', () => {
    expect(avaliarTrocaDeCargo('atendente', 'gerente', 'store').permitida).toBe(false);
    expect(avaliarTrocaDeCargo('gestor', 'gerente', 'store').permitida).toBe(false);
  });

  it('Gerente preso a uma Conta não é rebaixado', () => {
    expect(avaliarTrocaDeCargo('gerente', 'gestor', 'account').permitida).toBe(false);
    expect(avaliarTrocaDeCargo('gerente', 'atendente', 'account').permitida).toBe(false);
  });

  it('nenhuma troca com Superadmin, e manter o cargo sempre passa', () => {
    expect(avaliarTrocaDeCargo('atendente', 'superadmin', 'store').permitida).toBe(false);
    expect(avaliarTrocaDeCargo('superadmin', 'gerente', null).permitida).toBe(false);
    expect(avaliarTrocaDeCargo('gerente', 'gerente', 'account')).toEqual({ permitida: true });
  });

  it('a tela e o servidor respondem igual em todas as combinações', () => {
    for (const atual of CARGOS) {
      for (const novo of CARGOS) {
        for (const lugar of LUGARES) {
          expect(doServidor(atual, novo, lugar), `${atual} → ${novo} em ${lugar}`).toEqual(
            avaliarTrocaDeCargo(atual, novo, lugar),
          );
        }
      }
    }
  });
});
