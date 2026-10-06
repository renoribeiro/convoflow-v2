import { describe, it, expect } from 'vitest';
import {
  accountStatePatch,
  canAccessApp,
  checkboxValueFor,
  deriveIsActive,
  profileStatusOf,
} from './accountStatus';

/**
 * Estas regras precisam bater com o que o banco faz (migração
 * 20260813000004): trigger sync_profile_is_active / force_profile_is_active
 * derivando is_active de status, e on_auth_user_confirmed aplicando a
 * intenção do convite.
 */
describe('deriveIsActive — is_active é espelho de status', () => {
  it('só active liga o espelho', () => {
    expect(deriveIsActive('active')).toBe(true);
  });

  it.each(['pending', 'suspended', 'deleted'])('%s desliga o espelho', (status) => {
    expect(deriveIsActive(status)).toBe(false);
  });

  it('status ausente não é ativo (fecha por padrão)', () => {
    expect(deriveIsActive(null)).toBe(false);
    expect(deriveIsActive(undefined)).toBe(false);
    expect(deriveIsActive('')).toBe(false);
  });

  it('valor desconhecido nunca vira ativo', () => {
    expect(deriveIsActive('inactive')).toBe(false);
    expect(deriveIsActive('ACTIVE')).toBe(false);
  });
});

describe('canAccessApp — só active usa o sistema', () => {
  it('active passa', () => {
    expect(canAccessApp('active')).toBe(true);
  });

  it.each(['pending', 'suspended', 'deleted', null, undefined])(
    '%s é bloqueado',
    (status) => {
      expect(canAccessApp(status as string | null | undefined)).toBe(false);
    },
  );
});

describe('profileStatusOf — exibição, com fallback pré-migração', () => {
  it('usa status quando a view já o expõe', () => {
    expect(profileStatusOf({ status: 'pending', is_active: false })).toBe('pending');
    expect(profileStatusOf({ status: 'suspended', is_active: false })).toBe('suspended');
    expect(profileStatusOf({ status: 'deleted', is_active: false })).toBe('deleted');
    expect(profileStatusOf({ status: 'active', is_active: true })).toBe('active');
  });

  it('status ganha de is_active se os dois discordarem (status é a fonte da verdade)', () => {
    expect(profileStatusOf({ status: 'suspended', is_active: true })).toBe('suspended');
  });

  it('sem status, cai para is_active', () => {
    expect(profileStatusOf({ is_active: true })).toBe('active');
    expect(profileStatusOf({ is_active: false })).toBe('suspended');
    expect(profileStatusOf({ status: null, is_active: true })).toBe('active');
  });

  it('valor desconhecido não é tratado como ativo', () => {
    expect(profileStatusOf({ status: 'inactive', is_active: false })).toBe('suspended');
  });
});

describe('accountStatePatch — o que o modal de edição grava', () => {
  it('marcado num usuário ativo mantém active', () => {
    expect(accountStatePatch(true, 'active')).toEqual({ status: 'active' });
  });

  it('desmarcado suspende', () => {
    expect(accountStatePatch(false, 'active')).toEqual({ status: 'suspended' });
  });

  it('marcado num suspenso reativa', () => {
    expect(accountStatePatch(true, 'suspended')).toEqual({ status: 'active' });
  });

  it('convite pendente grava a INTENÇÃO, não o status', () => {
    expect(accountStatePatch(true, 'pending')).toEqual({ invite_intent_active: true });
    expect(accountStatePatch(false, 'pending')).toEqual({ invite_intent_active: false });
  });

  it('nunca grava is_active — ele é derivado pelo banco', () => {
    for (const current of ['active', 'suspended', 'pending', 'deleted', null, undefined]) {
      for (const checked of [true, false]) {
        expect(accountStatePatch(checked, current)).not.toHaveProperty('is_active');
      }
    }
  });

  it('sem status conhecido, grava status (caminho pré-migração)', () => {
    expect(accountStatePatch(true, null)).toEqual({ status: 'active' });
  });
});

describe('checkboxValueFor — estado inicial da caixa "Usuário ativo"', () => {
  it('ativo entra marcado', () => {
    expect(checkboxValueFor({ status: 'active', is_active: true })).toBe(true);
  });

  it('suspenso e excluído entram desmarcados', () => {
    expect(checkboxValueFor({ status: 'suspended', is_active: false })).toBe(false);
    expect(checkboxValueFor({ status: 'deleted', is_active: false })).toBe(false);
  });

  it('convite pendente entra MARCADO — editar o cadastro não cancela o convite', () => {
    expect(checkboxValueFor({ status: 'pending', is_active: false })).toBe(true);
  });

  it('abrir e salvar um convite pendente sem tocar na caixa não muda nada', () => {
    const row = { status: 'pending', is_active: false };
    const patch = accountStatePatch(checkboxValueFor(row), row.status);
    expect(patch).toEqual({ invite_intent_active: true });
  });
});
