import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CAPABILITIES,
  ROLE_LABELS,
  type UserRole,
} from '@/types/userHierarchy';
import {
  ROLE_DESCRIPTIONS,
  STORE_CAP_ITEMS,
  getRoleDescription,
} from './roleDescriptions';

const ROLES = Object.keys(DEFAULT_CAPABILITIES) as UserRole[];

/**
 * O texto que explica uma função é escrito à mão — nenhum teste consegue provar
 * que a frase descreve o booleano certo. O que dá para garantir é que ninguém
 * acrescente uma função à matriz e a coloque no ar sem explicação nenhuma.
 */
describe('toda função da matriz tem descrição', () => {
  it('ROLE_DESCRIPTIONS cobre exatamente as funções de DEFAULT_CAPABILITIES', () => {
    expect(Object.keys(ROLE_DESCRIPTIONS).sort()).toEqual([...ROLES].sort());
  });

  it.each(ROLES)('%s tem descrição preenchida', (role) => {
    const entry = ROLE_DESCRIPTIONS[role];
    expect(entry).toBeDefined();
    expect(entry.summary.trim().length).toBeGreaterThan(0);
    // `can` nunca é vazio: toda função faz alguma coisa. `cannot` pode ser
    // vazio — é o caso do superadmin.
    expect(entry.can.length).toBeGreaterThan(0);
    expect(entry.can.every((item) => item.trim().length > 0)).toBe(true);
    expect(entry.cannot.every((item) => item.trim().length > 0)).toBe(true);
  });

  it.each(ROLES)('%s usa o mesmo rótulo de ROLE_LABELS', (role) => {
    expect(ROLE_DESCRIPTIONS[role].label).toBe(ROLE_LABELS[role]);
  });
});

/**
 * O cartão esconde estas frases no formulário que já mostra o limite por loja.
 * Se alguém reescrever a frase em ROLE_DESCRIPTIONS e esquecer daqui, o filtro
 * deixaria de casar e o texto voltaria a aparecer duplicado — sem erro nenhum.
 */
describe('STORE_CAP_ITEMS aponta para frases que existem', () => {
  it('cada frase listada está em can ou cannot da mesma função', () => {
    for (const [role, items] of Object.entries(STORE_CAP_ITEMS)) {
      const entry = ROLE_DESCRIPTIONS[role as UserRole];
      expect(entry, `função desconhecida em STORE_CAP_ITEMS: ${role}`).toBeDefined();
      for (const item of items ?? []) {
        expect([...entry.can, ...entry.cannot]).toContain(item);
      }
    }
  });
});

describe('getRoleDescription', () => {
  it.each(ROLES)('encontra %s', (role) => {
    expect(getRoleDescription(role)).toBe(ROLE_DESCRIPTIONS[role]);
  });

  // Busca exata, sem normalizeRole(): quando o formulário carrega um cargo
  // legado, o <Select> mostra o placeholder e o cartão precisa sumir junto.
  it.each(['user', 'loja', 'agencia', 'tenant_admin', 'super_admin'])(
    'devolve null para o cargo legado %s',
    (legacy) => {
      expect(getRoleDescription(legacy)).toBeNull();
    },
  );

  it('devolve null para vazio, null e undefined', () => {
    expect(getRoleDescription('')).toBeNull();
    expect(getRoleDescription(null)).toBeNull();
    expect(getRoleDescription(undefined)).toBeNull();
  });
});
