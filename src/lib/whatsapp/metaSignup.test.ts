/**
 * Embedded Signup: é reconexão ou primeira conexão, e este chamador pode?
 *
 * O módulo testado vive em supabase/functions/_shared porque roda no Deno, mas
 * não importa nada do Deno — mesma convenção de `instance-access.ts`.
 *
 * O caso que estes testes existem para impedir (2026-09-19): a edge function
 * meta-oauth-exchange sempre inseria, e a gerente reconectando o número que
 * já existia batia no UNIQUE de instance_key DEPOIS de a Meta ter consumido o
 * código de autorização. A decisão aqui roda ANTES da Meta e tem que ser igual
 * à de `public.meta_signup_check` (migração 20260919000002).
 */
import { describe, it, expect } from 'vitest';

import {
  decideMetaSignup,
  metaSignupLookupFilter,
  META_PHONE_NUMBER_ID_PATTERN,
  META_SIGNUP_REFUSAL_MESSAGES,
  type MetaSignupExistingInstance,
  type MetaSignupInput,
} from '../../../supabase/functions/_shared/meta-signup.ts';
import type { InstanceAccessTenant } from '../../../supabase/functions/_shared/instance-access.ts';

const ACCOUNT = 'eeeeeeee-0000-0000-0000-000000000001';
const STORE = 'ffffffff-0000-0000-0000-000000000002';
const SIBLING_STORE = 'ffffffff-0000-0000-0000-000000000004';
const OTHER_ACCOUNT = 'abababab-0000-0000-0000-000000000003';
const PNID = '100000000000099';

const accountTenant: InstanceAccessTenant = { id: ACCOUNT, kind: 'account', parent_tenant_id: null };
const storeTenant: InstanceAccessTenant = { id: STORE, kind: 'store', parent_tenant_id: ACCOUNT };
const siblingTenant: InstanceAccessTenant = { id: SIBLING_STORE, kind: 'store', parent_tenant_id: ACCOUNT };
const otherTenant: InstanceAccessTenant = { id: OTHER_ACCOUNT, kind: 'account', parent_tenant_id: null };

const gerente = { tenant_id: ACCOUNT, role: 'gerente', status: 'active' };
const gestor = { tenant_id: STORE, role: 'gestor', status: 'active' };
const gestorIrma = { tenant_id: SIBLING_STORE, role: 'gestor', status: 'active' };
const gestorAlheio = { tenant_id: OTHER_ACCOUNT, role: 'gestor', status: 'active' };
const superadmin = { tenant_id: null, role: 'superadmin', status: 'active' };
const gerenteSuspenso = { tenant_id: ACCOUNT, role: 'gerente', status: 'suspended' };

const existing = (over: Partial<MetaSignupExistingInstance> = {}): MetaSignupExistingInstance => ({
  id: 'cdcdcdcd-0000-0000-0000-000000000009',
  tenant_id: STORE,
  provider: 'official',
  instance_key: PNID,
  registered_at: '2026-06-11T22:42:51.362Z',
  connection_config: { phoneNumberId: PNID, wabaId: '979901055032057', registerPin: '123456' },
  ...over,
});

const input = (over: Partial<MetaSignupInput>): MetaSignupInput => ({
  caller: gestor,
  phoneNumberId: PNID,
  candidates: [],
  candidateTenant: null,
  requestedTenantId: null,
  requestedTenant: null,
  ...over,
});

describe('decideMetaSignup — reconexão (linha existente)', () => {
  it('gestor da própria Loja reconecta: mesmo id, Conta da LINHA, registro pulado', () => {
    const d = decideMetaSignup(input({ candidates: [existing()], candidateTenant: storeTenant }));
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.mode).toBe('reconnect');
    expect(d.tenantId).toBe(STORE);
    expect(d.existing?.id).toBe('cdcdcdcd-0000-0000-0000-000000000009');
    expect(d.access).toBe('own_tenant');
    expect(d.skipRegister).toBe(true);
    expect(d.keyMismatch).toBe(false);
  });

  it('a Conta ativa no seletor é IGNORADA na reconexão: a Conta é a da linha', () => {
    const d = decideMetaSignup(
      input({
        candidates: [existing()],
        candidateTenant: storeTenant,
        requestedTenantId: SIBLING_STORE,
        requestedTenant: siblingTenant,
      }),
    );
    expect(d.ok && d.tenantId).toBe(STORE);
  });

  it('gerente da Conta-mãe reconecta o número da Loja filha (o caso da VagaCerta)', () => {
    const d = decideMetaSignup(input({ caller: gerente, candidates: [existing()], candidateTenant: storeTenant }));
    expect(d.ok && d.mode).toBe('reconnect');
    expect(d.ok && d.access).toBe('gerente_child_store');
  });

  it('gerente SUSPENSO não reconecta a Loja filha', () => {
    const d = decideMetaSignup(
      input({ caller: gerenteSuspenso, candidates: [existing()], candidateTenant: storeTenant }),
    );
    expect(d).toMatchObject({ ok: false, reason: 'foreign_instance', status: 403 });
  });

  it('superadmin reconecta qualquer linha, mesmo sem tenant_id próprio e sem a linha de tenants', () => {
    const d = decideMetaSignup(input({ caller: superadmin, candidates: [existing()], candidateTenant: null }));
    expect(d.ok && d.access).toBe('superadmin');
  });

  it('gestor de Loja irmã e gestor de Conta alheia: recusa sem dizer de quem é', () => {
    for (const caller of [gestorIrma, gestorAlheio]) {
      const d = decideMetaSignup(input({ caller, candidates: [existing()], candidateTenant: storeTenant }));
      expect(d).toMatchObject({ ok: false, reason: 'foreign_instance', status: 403 });
      if (d.ok) return;
      expect(d.message).toBe(META_SIGNUP_REFUSAL_MESSAGES.foreign_instance);
      expect(d.message).not.toContain(STORE);
      expect(d.message).not.toContain('VagaCerta');
    }
  });

  it('linha ainda não registrada (registered_at null): reconecta e o registro RODA', () => {
    const d = decideMetaSignup(
      input({ candidates: [existing({ registered_at: null })], candidateTenant: storeTenant }),
    );
    expect(d.ok && d.skipRegister).toBe(false);
  });

  it('identificador já usado por instância de outro provedor: provider_mismatch', () => {
    const d = decideMetaSignup(
      input({ candidates: [existing({ provider: 'evolution' })], candidateTenant: storeTenant }),
    );
    expect(d).toMatchObject({ ok: false, reason: 'provider_mismatch', status: 409 });
    // provider NULL é Evolution (o default da coluna).
    const d2 = decideMetaSignup(input({ candidates: [existing({ provider: null })], candidateTenant: storeTenant }));
    expect(d2).toMatchObject({ ok: false, reason: 'provider_mismatch' });
  });

  it('candidateTenant de OUTRA linha não conta como a linha de tenants da instância', () => {
    // A edge function passa a linha de tenants da candidata; se por engano vier
    // outra, o gerente cai em foreign_instance em vez de ganhar acesso.
    const d = decideMetaSignup(input({ caller: gerente, candidates: [existing()], candidateTenant: siblingTenant }));
    expect(d).toMatchObject({ ok: false, reason: 'foreign_instance' });
  });
});

describe('decideMetaSignup — quando as duas colunas discordam', () => {
  it('UMA linha casando só por instance_key: é ela, com keyMismatch marcado', () => {
    const d = decideMetaSignup(
      input({
        candidates: [existing({ connection_config: { phoneNumberId: '999', registerPin: '123456' } })],
        candidateTenant: storeTenant,
      }),
    );
    expect(d.ok && d.mode).toBe('reconnect');
    expect(d.ok && d.keyMismatch).toBe(true);
  });

  it('UMA linha casando só por connection_config: é ela, com keyMismatch marcado', () => {
    const d = decideMetaSignup(
      input({ candidates: [existing({ instance_key: 'outra-chave' })], candidateTenant: storeTenant }),
    );
    expect(d.ok && d.mode).toBe('reconnect');
    expect(d.ok && d.keyMismatch).toBe(true);
  });

  it('DUAS linhas (uma por cada coluna): ambiguous, ninguém adivinha', () => {
    const d = decideMetaSignup(
      input({
        candidates: [
          existing({ id: 'a', connection_config: { phoneNumberId: '999' } }),
          existing({ id: 'b', instance_key: 'outra' }),
        ],
        candidateTenant: storeTenant,
      }),
    );
    expect(d).toMatchObject({ ok: false, reason: 'ambiguous', status: 409 });
  });
});

describe('decideMetaSignup — primeira conexão (nenhuma linha)', () => {
  it('gestor conecta na própria Loja', () => {
    const d = decideMetaSignup(input({ requestedTenantId: STORE, requestedTenant: storeTenant }));
    expect(d).toMatchObject({ ok: true, mode: 'connect', tenantId: STORE, access: 'own_tenant', existing: null });
  });

  it('gerente conecta na Loja filha escolhida no seletor (não na Conta dele)', () => {
    const d = decideMetaSignup(
      input({ caller: gerente, requestedTenantId: STORE, requestedTenant: storeTenant }),
    );
    expect(d).toMatchObject({ ok: true, mode: 'connect', tenantId: STORE, access: 'gerente_child_store' });
  });

  it('gerente conecta na própria Conta', () => {
    const d = decideMetaSignup(
      input({ caller: gerente, requestedTenantId: ACCOUNT, requestedTenant: accountTenant }),
    );
    expect(d).toMatchObject({ ok: true, mode: 'connect', tenantId: ACCOUNT, access: 'own_tenant' });
  });

  it('gerente NÃO conecta em Conta alheia nem em Loja de outra Conta', () => {
    const d = decideMetaSignup(
      input({ caller: gerente, requestedTenantId: OTHER_ACCOUNT, requestedTenant: otherTenant }),
    );
    expect(d).toMatchObject({ ok: false, reason: 'forbidden_tenant', status: 403 });
    const foreignStore: InstanceAccessTenant = { id: SIBLING_STORE, kind: 'store', parent_tenant_id: OTHER_ACCOUNT };
    const d2 = decideMetaSignup(
      input({ caller: gerente, requestedTenantId: SIBLING_STORE, requestedTenant: foreignStore }),
    );
    expect(d2).toMatchObject({ ok: false, reason: 'forbidden_tenant' });
  });

  it('gestor NÃO conecta na Loja irmã, mesmo mandando o id dela', () => {
    const d = decideMetaSignup(input({ requestedTenantId: SIBLING_STORE, requestedTenant: siblingTenant }));
    expect(d).toMatchObject({ ok: false, reason: 'forbidden_tenant' });
  });

  it('Conta inexistente e Conta alheia dão a MESMA resposta', () => {
    const inexistente = decideMetaSignup(input({ requestedTenantId: OTHER_ACCOUNT, requestedTenant: null }));
    const alheia = decideMetaSignup(input({ requestedTenantId: OTHER_ACCOUNT, requestedTenant: otherTenant }));
    expect(inexistente).toEqual(alheia);
    expect(inexistente).toMatchObject({ ok: false, reason: 'forbidden_tenant' });
  });

  it('sem Conta de destino: tenant_required (superadmin sem seletor, ou perfil sem Conta)', () => {
    const d = decideMetaSignup(input({ caller: superadmin }));
    expect(d).toMatchObject({ ok: false, reason: 'tenant_required', status: 400 });
    const d2 = decideMetaSignup(input({ caller: { tenant_id: null, role: 'gestor', status: 'active' } }));
    expect(d2).toMatchObject({ ok: false, reason: 'tenant_required' });
  });

  it('superadmin conecta em qualquer Conta existente', () => {
    const d = decideMetaSignup(
      input({ caller: superadmin, requestedTenantId: OTHER_ACCOUNT, requestedTenant: otherTenant }),
    );
    expect(d).toMatchObject({ ok: true, mode: 'connect', tenantId: OTHER_ACCOUNT, access: 'superadmin' });
  });
});

describe('lookup', () => {
  it('phoneNumberId só numérico — nada de vírgula ou parêntese entra no filtro PostgREST', () => {
    expect(META_PHONE_NUMBER_ID_PATTERN.test('100000000000099')).toBe(true);
    expect(META_PHONE_NUMBER_ID_PATTERN.test('1135,instance_key.neq.x')).toBe(false);
    expect(META_PHONE_NUMBER_ID_PATTERN.test('')).toBe(false);
    expect(META_PHONE_NUMBER_ID_PATTERN.test('abc')).toBe(false);
  });

  it('o filtro procura nas DUAS colunas', () => {
    expect(metaSignupLookupFilter(PNID)).toBe(
      `instance_key.eq.${PNID},connection_config->>phoneNumberId.eq.${PNID}`,
    );
  });
});
