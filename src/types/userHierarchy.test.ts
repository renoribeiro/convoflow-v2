import { describe, it, expect } from 'vitest';
import {
  normalizeRole,
  roleAtLeast,
  ROLE_ORDER,
  hasFullPower,
  hasGroupScope,
  can,
  resolveCapabilities,
  ALL_CAPABILITIES,
  type UserRole,
} from './userHierarchy';

describe('normalizeRole', () => {
  it.each([
    ['agencia', 'gerente'],
    ['loja', 'gestor'],
    ['account_manager', 'gerente'],
    ['enterprise', 'gestor'],
    ['tenant_user', 'gestor'],
    ['user', 'gestor'],
    ['super_admin', 'superadmin'],
    ['tenant_admin', 'gestor'],
  ] as const)('maps legacy role %s -> %s', (legacy, expected) => {
    expect(normalizeRole(legacy)).toBe(expected);
  });

  it.each(['superadmin', 'gerente', 'gestor', 'atendente'] as const)(
    'passes current role %s through unchanged',
    (role) => {
      expect(normalizeRole(role)).toBe(role);
    },
  );

  it('returns null for an unknown string', () => {
    expect(normalizeRole('lixo' as never)).toBeNull();
  });

  it('returns null for null', () => {
    expect(normalizeRole(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(normalizeRole(undefined)).toBeNull();
  });
});

describe('roleAtLeast', () => {
  it('gerente is at least gestor', () => {
    expect(roleAtLeast('gerente', 'gestor')).toBe(true);
  });

  it('atendente is not at least gestor', () => {
    expect(roleAtLeast('atendente', 'gestor')).toBe(false);
  });

  it('superadmin is at least gerente', () => {
    expect(roleAtLeast('superadmin', 'gerente')).toBe(true);
  });

  it('accepts legacy input (agencia at least gestor)', () => {
    expect(roleAtLeast('agencia', 'gestor')).toBe(true);
  });

  it('returns false when actual role is null', () => {
    expect(roleAtLeast(null, 'gestor')).toBe(false);
  });
});

describe('ROLE_ORDER', () => {
  it('orders roles atendente < gestor < gerente < superadmin', () => {
    expect(ROLE_ORDER.atendente).toBeLessThan(ROLE_ORDER.gestor);
    expect(ROLE_ORDER.gestor).toBeLessThan(ROLE_ORDER.gerente);
    expect(ROLE_ORDER.gerente).toBeLessThan(ROLE_ORDER.superadmin);
  });
});

describe('hasFullPower', () => {
  it.each(['gerente', 'gestor', 'superadmin'] as const)(
    '%s has full power',
    (role) => {
      expect(hasFullPower(role)).toBe(true);
    },
  );

  it('atendente does not have full power', () => {
    expect(hasFullPower('atendente')).toBe(false);
  });
});

describe('hasGroupScope', () => {
  it('gerente has group scope', () => {
    expect(hasGroupScope('gerente')).toBe(true);
  });

  it('superadmin has group scope (platform counts as group-or-wider)', () => {
    expect(hasGroupScope('superadmin')).toBe(true);
  });

  it('gestor does not have group scope', () => {
    expect(hasGroupScope('gestor')).toBe(false);
  });

  it('atendente does not have group scope', () => {
    expect(hasGroupScope('atendente')).toBe(false);
  });
});

describe('capabilities via can()/resolveCapabilities()', () => {
  describe('atendente', () => {
    it('can view campaign conversations', () => {
      expect(can('atendente', 'campaigns.view_convos')).toBe(true);
    });

    it('cannot see/edit campaign budget', () => {
      expect(can('atendente', 'campaigns.budget')).toBe(false);
    });

    it('cannot trigger campaign dispatch', () => {
      expect(can('atendente', 'campaigns.dispatch')).toBe(false);
    });

    it('cannot administer the store', () => {
      expect(can('atendente', 'store.admin')).toBe(false);
    });

    it('cannot view billing', () => {
      expect(can('atendente', 'billing.view')).toBe(false);
    });
  });

  describe('gestor', () => {
    it('can dispatch campaigns', () => {
      expect(can('gestor', 'campaigns.dispatch')).toBe(true);
    });

    it('can administer the store', () => {
      expect(can('gestor', 'store.admin')).toBe(true);
    });

    it('cannot view billing', () => {
      expect(can('gestor', 'billing.view')).toBe(false);
    });

    it('cannot switch stores', () => {
      expect(can('gestor', 'stores.switch')).toBe(false);
    });
  });

  describe('gerente', () => {
    it('can switch stores', () => {
      expect(can('gerente', 'stores.switch')).toBe(true);
    });

    it('can compare stores', () => {
      expect(can('gerente', 'stores.compare')).toBe(true);
    });

    it('cannot access platform ops', () => {
      expect(can('gerente', 'platform.ops')).toBe(false);
    });

    it('can dispatch campaigns', () => {
      expect(can('gerente', 'campaigns.dispatch')).toBe(true);
    });
  });

  describe('superadmin', () => {
    it('can access platform ops', () => {
      expect(can('superadmin', 'platform.ops')).toBe(true);
    });
  });

  it('overrides win over the role default', () => {
    expect(
      can('atendente', 'campaigns.dispatch', { 'campaigns.dispatch': true }),
    ).toBe(true);
  });

  it('unknown/invalid role resolves to the most restrictive (atendente) set', () => {
    expect(can('lixo' as unknown as UserRole, 'store.admin')).toBe(false);
  });

  it('resolveCapabilities returns all 13 capability keys for atendente', () => {
    const result = resolveCapabilities('atendente');
    expect(Object.keys(result)).toHaveLength(13);
    expect(Object.keys(result).sort()).toEqual([...ALL_CAPABILITIES].sort());
  });
});
