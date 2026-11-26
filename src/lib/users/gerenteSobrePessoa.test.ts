/**
 * manage-user, ramo do Gerente (revisão de 2026-11-26): a árvore de pessoas
 * sozinha não basta. A pessoa também tem de estar na Conta do Gerente ou numa
 * Loja dela. Antes, alguém movido de Conta pelo superadmin sem trocar o
 * responsável seguia nas mãos do Gerente antigo.
 *
 * A regra pura mora em supabase/functions/_shared/gerente-sobre-pessoa.ts; o
 * index.ts do manage-user é lido como texto (mesma convenção de
 * storeSeats.test.ts) para garantir que o ramo do Gerente usa a regra. A pasta
 * supabase/functions vai para a cópia pública, então este teste roda lá também.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  decidirGerenteSobrePessoa,
  PESSOA_FORA_DA_CONTA,
} from '../../../supabase/functions/_shared/gerente-sobre-pessoa';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MANAGE_USER = fs
  .readFileSync(path.resolve(HERE, '../../../supabase/functions/manage-user/index.ts'), 'utf8')
  .replace(/\r\n/g, '\n');

const CONTA = 'aaaaaaaa-0000-4000-8000-000000000001';
const LOJA = 'aaaaaaaa-0000-4000-8000-000000000002';
const OUTRA_CONTA = 'aaaaaaaa-0000-4000-8000-000000000003';
const LOJA_DA_OUTRA = 'aaaaaaaa-0000-4000-8000-000000000004';
const PESSOA = 'aaaaaaaa-1111-4000-8000-000000000001';

const gerente = { tenant_id: CONTA, role: 'gerente', status: 'active' };
const naArvore = [PESSOA, 'aaaaaaaa-1111-4000-8000-000000000002'];

describe('Gerente sobre uma pessoa (manage-user)', () => {
  it('pessoa da árvore na própria Conta: pode', () => {
    expect(
      decidirGerenteSobrePessoa({ caller: gerente, alvoId: PESSOA, descendentes: naArvore, alvoTenantId: CONTA, alvoTenant: null }),
    ).toEqual({ ok: true });
  });

  it('pessoa da árvore numa Loja da Conta: pode', () => {
    expect(
      decidirGerenteSobrePessoa({
        caller: gerente,
        alvoId: PESSOA,
        descendentes: naArvore,
        alvoTenantId: LOJA,
        alvoTenant: { id: LOJA, kind: 'store', parent_tenant_id: CONTA },
      }),
    ).toEqual({ ok: true });
  });

  it('pessoa da árvore do Gerente, mas em OUTRA Conta: 403', () => {
    const d = decidirGerenteSobrePessoa({
      caller: gerente,
      alvoId: PESSOA,
      descendentes: naArvore,
      alvoTenantId: OUTRA_CONTA,
      alvoTenant: { id: OUTRA_CONTA, kind: 'account', parent_tenant_id: null },
    });
    expect(d).toEqual({ ok: false, status: 403, message: PESSOA_FORA_DA_CONTA });
  });

  it('pessoa da árvore numa Loja de outra Conta: 403', () => {
    const d = decidirGerenteSobrePessoa({
      caller: gerente,
      alvoId: PESSOA,
      descendentes: naArvore,
      alvoTenantId: LOJA_DA_OUTRA,
      alvoTenant: { id: LOJA_DA_OUTRA, kind: 'store', parent_tenant_id: OUTRA_CONTA },
    });
    expect(d.ok).toBe(false);
    expect(d.ok === false && d.status).toBe(403);
  });

  it('Loja que não foi achada: 403', () => {
    const d = decidirGerenteSobrePessoa({ caller: gerente, alvoId: PESSOA, descendentes: naArvore, alvoTenantId: LOJA, alvoTenant: null });
    expect(d.ok).toBe(false);
  });

  it('pessoa da Conta que não está na árvore: 403', () => {
    const d = decidirGerenteSobrePessoa({ caller: gerente, alvoId: PESSOA, descendentes: [], alvoTenantId: CONTA, alvoTenant: null });
    expect(d).toEqual({ ok: false, status: 403, message: PESSOA_FORA_DA_CONTA });
  });

  it('pessoa sem Conta (superadmin): 403', () => {
    const d = decidirGerenteSobrePessoa({ caller: gerente, alvoId: PESSOA, descendentes: naArvore, alvoTenantId: null, alvoTenant: null });
    expect(d.ok).toBe(false);
  });

  it('Gerente que não está ativo: 403', () => {
    const d = decidirGerenteSobrePessoa({
      caller: { ...gerente, status: 'suspended' },
      alvoId: PESSOA,
      descendentes: naArvore,
      alvoTenantId: CONTA,
      alvoTenant: null,
    });
    expect(d.ok).toBe(false);
  });

  it('o ramo do Gerente em ensureCanManage usa a regra, não só a árvore', () => {
    const inicio = MANAGE_USER.indexOf("if (papel === 'gerente') {");
    const fim = MANAGE_USER.indexOf("if (papel === 'gestor') {", inicio);
    expect(inicio).toBeGreaterThan(0);
    const ramo = MANAGE_USER.slice(inicio, fim);
    expect(ramo).toContain('decidirGerenteSobrePessoa(');
    expect(ramo).not.toMatch(/idsDeDescendentes\(data\)\.includes\(targetId\)\)\s*return/);
    expect(MANAGE_USER).toContain("from '../_shared/gerente-sobre-pessoa.ts'");
  });
});
