import { describe, it, expect } from 'vitest';
import {
  decideConnectTarget,
  targetTenantIdFor,
  type ConnectTargetCaller,
} from '../../../supabase/functions/_shared/connect-target.ts';

/**
 * Em que Loja um número novo nasce (lote 6b, B2; decisão D1 de 2026-10-29:
 * número de WhatsApp é sempre de uma Loja). Regra única do servidor para QR
 * Code (Evolution), WAHA, formulário manual da API Oficial e, pelo
 * meta-signup.ts, o "Conectar com a Meta". Valores inventados.
 */

const CONTA = 'aaaaaaaa-0000-4000-8000-000000000001';
const LOJA = 'aaaaaaaa-0000-4000-8000-000000000002';
const LOJA_IRMA = 'aaaaaaaa-0000-4000-8000-000000000005';
const OUTRA_CONTA = 'aaaaaaaa-0000-4000-8000-000000000003';
const LOJA_DE_OUTRA_CONTA = 'aaaaaaaa-0000-4000-8000-000000000004';

const T = {
  conta: { id: CONTA, kind: 'account', parent_tenant_id: null },
  loja: { id: LOJA, kind: 'store', parent_tenant_id: CONTA },
  irma: { id: LOJA_IRMA, kind: 'store', parent_tenant_id: CONTA },
  outraConta: { id: OUTRA_CONTA, kind: 'account', parent_tenant_id: null },
  lojaDeOutra: { id: LOJA_DE_OUTRA_CONTA, kind: 'store', parent_tenant_id: OUTRA_CONTA },
};

const gerente: ConnectTargetCaller = { tenant_id: CONTA, role: 'gerente', status: 'active', capabilities: null };
const gestor: ConnectTargetCaller = { tenant_id: LOJA, role: 'gestor', status: 'active', capabilities: null };
const atendente: ConnectTargetCaller = { tenant_id: LOJA, role: 'atendente', status: 'active', capabilities: null };
const superadmin: ConnectTargetCaller = { tenant_id: null, role: 'superadmin', status: 'active', capabilities: null };

describe('Loja permitida', () => {
  it('Gerente com a Loja filha aberta no topo: nasce na Loja', () => {
    expect(decideConnectTarget({ caller: gerente, requestedTenantId: LOJA, targetTenant: T.loja })).toEqual({
      ok: true,
      tenantId: LOJA,
      access: 'gerente_child_store',
    });
  });

  it('Gestor na própria Loja, mandando ou não o id dela', () => {
    expect(decideConnectTarget({ caller: gestor, requestedTenantId: LOJA, targetTenant: T.loja })).toMatchObject({
      ok: true,
      tenantId: LOJA,
      access: 'own_tenant',
    });
    expect(decideConnectTarget({ caller: gestor, requestedTenantId: undefined, targetTenant: T.loja })).toMatchObject({
      ok: true,
      tenantId: LOJA,
    });
  });

  it('superadmin em qualquer Loja', () => {
    expect(
      decideConnectTarget({ caller: superadmin, requestedTenantId: LOJA_DE_OUTRA_CONTA, targetTenant: T.lojaDeOutra }),
    ).toMatchObject({ ok: true, tenantId: LOJA_DE_OUTRA_CONTA, access: 'superadmin' });
  });
});

describe('outra Conta: recusado', () => {
  it('Gerente pedindo Loja de outra Conta', () => {
    expect(
      decideConnectTarget({ caller: gerente, requestedTenantId: LOJA_DE_OUTRA_CONTA, targetTenant: T.lojaDeOutra }),
    ).toMatchObject({ ok: false, reason: 'forbidden_tenant', status: 403 });
  });

  it('Gerente pedindo a outra Conta inteira', () => {
    expect(
      decideConnectTarget({ caller: gerente, requestedTenantId: OUTRA_CONTA, targetTenant: T.outraConta }),
    ).toMatchObject({ ok: false, reason: 'forbidden_tenant' });
  });

  it('Gestor pedindo a Loja irmã (mesma Conta, outra Loja)', () => {
    expect(decideConnectTarget({ caller: gestor, requestedTenantId: LOJA_IRMA, targetTenant: T.irma })).toMatchObject({
      ok: false,
      reason: 'forbidden_tenant',
    });
  });

  it('Loja inexistente e Loja alheia dão a MESMA resposta (não revela se existe)', () => {
    const alheia = decideConnectTarget({ caller: gerente, requestedTenantId: LOJA_DE_OUTRA_CONTA, targetTenant: T.lojaDeOutra });
    const inexistente = decideConnectTarget({ caller: gerente, requestedTenantId: LOJA_DE_OUTRA_CONTA, targetTenant: null });
    expect(inexistente).toEqual(alheia);
  });

  it('linha de tenants trocada (id não confere com o pedido) vale como inexistente', () => {
    expect(decideConnectTarget({ caller: gerente, requestedTenantId: LOJA, targetTenant: T.irma })).toMatchObject({
      ok: false,
      reason: 'forbidden_tenant',
    });
  });
});

describe('atendente: recusado', () => {
  it('na própria Loja, antes de olhar a Loja', () => {
    expect(decideConnectTarget({ caller: atendente, requestedTenantId: LOJA, targetTenant: T.loja })).toMatchObject({
      ok: false,
      reason: 'forbidden',
      status: 403,
    });
  });

  it('Gestor com a capacidade tirada por exceção também para aqui', () => {
    const semCapacidade = { ...gestor, capabilities: { 'whatsapp.configure': false } };
    expect(decideConnectTarget({ caller: semCapacidade, requestedTenantId: LOJA, targetTenant: T.loja })).toMatchObject({
      ok: false,
      reason: 'forbidden',
    });
  });
});

describe('Conta nunca (D1)', () => {
  it('Gerente com a Conta em foco: not_store, com a frase que manda escolher a Loja', () => {
    const d = decideConnectTarget({ caller: gerente, requestedTenantId: CONTA, targetTenant: T.conta });
    expect(d).toMatchObject({ ok: false, reason: 'not_store', status: 400 });
    if (!d.ok) expect(d.message).toMatch(/Loja/);
  });

  it('Gerente sem mandar Loja (navegador antigo): vale a do perfil, que é a Conta, e recusa', () => {
    expect(targetTenantIdFor(gerente, undefined)).toBe(CONTA);
    expect(decideConnectTarget({ caller: gerente, requestedTenantId: undefined, targetTenant: T.conta })).toMatchObject({
      ok: false,
      reason: 'not_store',
    });
  });

  it('superadmin dentro de uma Conta também não', () => {
    expect(decideConnectTarget({ caller: superadmin, requestedTenantId: CONTA, targetTenant: T.conta })).toMatchObject({
      ok: false,
      reason: 'not_store',
    });
  });
});

describe('o resto', () => {
  it('perfil inexistente, suspenso ou sem Loja', () => {
    expect(decideConnectTarget({ caller: null, requestedTenantId: LOJA, targetTenant: T.loja })).toMatchObject({ reason: 'no_profile' });
    expect(
      decideConnectTarget({ caller: { ...gestor, status: 'suspended' }, requestedTenantId: LOJA, targetTenant: T.loja }),
    ).toMatchObject({ reason: 'inactive' });
    expect(decideConnectTarget({ caller: superadmin, requestedTenantId: undefined, targetTenant: null })).toMatchObject({
      reason: 'tenant_required',
    });
  });

  it('tenant_id que não é uuid: invalid_tenant, sem buscar nada', () => {
    expect(targetTenantIdFor(gerente, 'abc')).toBeNull();
    expect(decideConnectTarget({ caller: gerente, requestedTenantId: 'abc', targetTenant: null })).toMatchObject({
      reason: 'invalid_tenant',
    });
    expect(decideConnectTarget({ caller: gerente, requestedTenantId: 42, targetTenant: null })).toMatchObject({
      reason: 'invalid_tenant',
    });
  });
});
