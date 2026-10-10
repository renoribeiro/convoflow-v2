/**
 * Quem vê o lápis de renomear Loja — espelho de `public.rename_store`
 * (docs/teste_renomear_loja.sql prova o lado do banco com os mesmos casos).
 */
import { describe, it, expect } from 'vitest';
import { canRenameStore, STORE_RENAME_ROLES } from './storeRename';

const CONTA = 'aaaaaaaa-0000-4000-8000-000000000001';
const OUTRA_CONTA = 'aaaaaaaa-0000-4000-8000-000000000009';
const LOJA = { id: 'bbbbbbbb-0000-4000-8000-000000000001', parent_tenant_id: CONTA, kind: 'store' };
const IRMA = { id: 'bbbbbbbb-0000-4000-8000-000000000002', parent_tenant_id: CONTA, kind: 'store' };
const DE_FORA = { id: 'bbbbbbbb-0000-4000-8000-000000000003', parent_tenant_id: OUTRA_CONTA, kind: 'store' };

const superadmin = { role: 'superadmin', tenant_id: null };
const gerente = { role: 'gerente', tenant_id: CONTA };
const gestor = { role: 'gestor', tenant_id: LOJA.id };
const atendente = { role: 'atendente', tenant_id: LOJA.id };

describe('canRenameStore', () => {
  it('cargos que renomeiam: superadmin, gerente e gestor', () => {
    expect([...STORE_RENAME_ROLES]).toEqual(['superadmin', 'gerente', 'gestor']);
  });

  it('superadmin renomeia Loja de qualquer Conta', () => {
    expect(canRenameStore(superadmin, LOJA)).toBe(true);
    expect(canRenameStore(superadmin, DE_FORA)).toBe(true);
  });

  it('gerente renomeia as Lojas da própria Conta, e só elas', () => {
    expect(canRenameStore(gerente, LOJA)).toBe(true);
    expect(canRenameStore(gerente, IRMA)).toBe(true);
    expect(canRenameStore(gerente, DE_FORA)).toBe(false);
  });

  it('gestor renomeia a própria Loja, não a irmã nem a de outra Conta', () => {
    expect(canRenameStore(gestor, LOJA)).toBe(true);
    expect(canRenameStore(gestor, IRMA)).toBe(false);
    expect(canRenameStore(gestor, DE_FORA)).toBe(false);
  });

  it('atendente nunca — nem com store.admin concedido à mão', () => {
    expect(canRenameStore(atendente, LOJA)).toBe(false);
    expect(canRenameStore({ ...atendente, capabilities: { 'store.admin': true } }, LOJA)).toBe(false);
  });

  it('quem teve store.admin retirado não renomeia', () => {
    expect(canRenameStore({ ...gestor, capabilities: { 'store.admin': false } }, LOJA)).toBe(false);
    expect(canRenameStore({ ...gerente, capabilities: { 'store.admin': false } }, LOJA)).toBe(false);
  });

  it('cargo legado é normalizado como no banco (agencia → gerente, loja → gestor)', () => {
    expect(canRenameStore({ role: 'agencia', tenant_id: CONTA }, LOJA)).toBe(true);
    expect(canRenameStore({ role: 'loja', tenant_id: LOJA.id }, LOJA)).toBe(true);
  });

  it('Conta não se renomeia por aqui', () => {
    const conta = { id: CONTA, parent_tenant_id: null, kind: 'account' };
    expect(canRenameStore(superadmin, conta)).toBe(false);
    expect(canRenameStore(gerente, conta)).toBe(false);
  });

  it('sem perfil, cargo desconhecido ou sem Conta: não', () => {
    expect(canRenameStore(null, LOJA)).toBe(false);
    expect(canRenameStore({ role: null, tenant_id: CONTA }, LOJA)).toBe(false);
    expect(canRenameStore({ role: 'visitante', tenant_id: CONTA }, LOJA)).toBe(false);
    expect(canRenameStore({ role: 'gerente', tenant_id: null }, LOJA)).toBe(false);
    expect(canRenameStore(gerente, null)).toBe(false);
  });
});
