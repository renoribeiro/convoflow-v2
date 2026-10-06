/**
 * Quem pode USAR uma instância de WhatsApp pelo inbox (edge functions
 * `whatsapp-send-message`, `list-whatsapp-templates` e `instagram-send-message`).
 *
 * O módulo testado vive em supabase/functions/_shared porque roda no Deno, mas
 * não importa nada do Deno — mesma convenção de `store-slots.ts`.
 *
 * O caso que estes testes existem para impedir (2026-09-14): o banco deixa o
 * gerente GRAVAR na Loja filha (migração 20260909000004), mas a edge function
 * devolvia 403 — a mensagem ficava `failed` e o cliente não recebia nada.
 * A regra aqui tem que ser igual à de `public.gerente_child_store_ids()`.
 *
 * Item 14, lote 4 (H5): só perfil ATIVO passa, em qualquer caminho. Status
 * ausente conta como inativo.
 */
import { describe, it, expect } from 'vitest';

import {
  decideInstanceAccess,
  type InstanceAccessTenant,
} from '../../../supabase/functions/_shared/instance-access.ts';

const ACCOUNT = 'eeeeeeee-0000-0000-0000-000000000001';
const STORE = 'ffffffff-0000-0000-0000-000000000002';
const OTHER_ACCOUNT = 'abababab-0000-0000-0000-000000000003';

const storeTenant: InstanceAccessTenant = { id: STORE, kind: 'store', parent_tenant_id: ACCOUNT };
const storeInstance = { tenant_id: STORE };
const ATIVO = { status: 'active' } as const;

describe('decideInstanceAccess', () => {
  it('nega quem não tem Conta no perfil', () => {
    expect(decideInstanceAccess({ tenant_id: null, role: 'gerente', ...ATIVO }, storeInstance, storeTenant))
      .toEqual({ allowed: false, reason: 'no_tenant' });
  });

  it('superadmin passa em qualquer instância, mesmo sem a linha de tenants', () => {
    expect(decideInstanceAccess({ tenant_id: OTHER_ACCOUNT, role: 'superadmin', ...ATIVO }, storeInstance, null))
      .toEqual({ allowed: true, reason: 'superadmin' });
    // grafia legada
    expect(decideInstanceAccess({ tenant_id: OTHER_ACCOUNT, role: 'super_admin', ...ATIVO }, storeInstance, null).allowed)
      .toBe(true);
  });

  it('qualquer cargo passa na própria Conta/Loja', () => {
    for (const role of ['gerente', 'gestor', 'atendente']) {
      expect(decideInstanceAccess({ tenant_id: STORE, role, ...ATIVO }, storeInstance, storeTenant))
        .toEqual({ allowed: true, reason: 'own_tenant' });
    }
  });

  it('gerente ativo da Conta-mãe usa a instância da Loja filha (caso da Helena)', () => {
    expect(decideInstanceAccess({ tenant_id: ACCOUNT, role: 'gerente', ...ATIVO }, storeInstance, storeTenant))
      .toEqual({ allowed: true, reason: 'gerente_child_store' });
  });

  it('gerente de OUTRA Conta não passa', () => {
    expect(decideInstanceAccess({ tenant_id: OTHER_ACCOUNT, role: 'gerente', ...ATIVO }, storeInstance, storeTenant))
      .toEqual({ allowed: false, reason: 'foreign_tenant' });
  });

  it('gestor e atendente da Conta-mãe não passam — só o gerente escreve na filha', () => {
    for (const role of ['gestor', 'atendente']) {
      expect(decideInstanceAccess({ tenant_id: ACCOUNT, role, ...ATIVO }, storeInstance, storeTenant).allowed)
        .toBe(false);
    }
  });

  it('gerente suspenso/inativo não passa (is_gerente_safe exige status=active)', () => {
    for (const status of ['suspended', 'inactive', 'pending']) {
      expect(decideInstanceAccess({ tenant_id: ACCOUNT, role: 'gerente', status }, storeInstance, storeTenant).allowed)
        .toBe(false);
    }
  });

  it('lote 4: suspenso não passa em NENHUM caminho — nem na própria Loja, nem superadmin', () => {
    for (const status of ['suspended', 'deleted', 'pending']) {
      for (const role of ['atendente', 'gestor', 'gerente']) {
        expect(decideInstanceAccess({ tenant_id: STORE, role, status }, storeInstance, storeTenant))
          .toEqual({ allowed: false, reason: 'inactive' });
      }
      expect(decideInstanceAccess({ tenant_id: OTHER_ACCOUNT, role: 'superadmin', status }, storeInstance, null))
        .toEqual({ allowed: false, reason: 'inactive' });
    }
  });

  it('lote 4: status ausente conta como inativo (quem chama tem de buscar o campo)', () => {
    expect(decideInstanceAccess({ tenant_id: STORE, role: 'atendente' }, storeInstance, storeTenant))
      .toEqual({ allowed: false, reason: 'inactive' });
    expect(decideInstanceAccess({ tenant_id: STORE, role: 'atendente', status: null }, storeInstance, storeTenant))
      .toEqual({ allowed: false, reason: 'inactive' });
  });

  it('só Loja filha DIRETA: neta, Conta irmã ou tenant sem kind=store ficam de fora', () => {
    const grandchild: InstanceAccessTenant = { id: STORE, kind: 'store', parent_tenant_id: OTHER_ACCOUNT };
    expect(decideInstanceAccess({ tenant_id: ACCOUNT, role: 'gerente', ...ATIVO }, storeInstance, grandchild).allowed).toBe(false);

    const accountKind: InstanceAccessTenant = { id: STORE, kind: 'account', parent_tenant_id: ACCOUNT };
    expect(decideInstanceAccess({ tenant_id: ACCOUNT, role: 'gerente', ...ATIVO }, storeInstance, accountKind).allowed).toBe(false);

    const orphan: InstanceAccessTenant = { id: STORE, kind: 'store', parent_tenant_id: null };
    expect(decideInstanceAccess({ tenant_id: ACCOUNT, role: 'gerente', ...ATIVO }, storeInstance, orphan).allowed).toBe(false);
  });

  it('a linha de tenants precisa ser a da instância (não confia num id trocado)', () => {
    const wrongRow: InstanceAccessTenant = { id: 'outra', kind: 'store', parent_tenant_id: ACCOUNT };
    expect(decideInstanceAccess({ tenant_id: ACCOUNT, role: 'gerente', ...ATIVO }, storeInstance, wrongRow).allowed).toBe(false);
  });

  it('sem a linha de tenants, gerente de Conta cai em foreign_tenant', () => {
    expect(decideInstanceAccess({ tenant_id: ACCOUNT, role: 'gerente', ...ATIVO }, storeInstance, null))
      .toEqual({ allowed: false, reason: 'foreign_tenant' });
  });

  it('as três edge functions buscam o status do perfil antes de decidir', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    for (const fn of ['whatsapp-send-message', 'list-whatsapp-templates', 'instagram-send-message']) {
      const src = readFileSync(resolve(__dirname, `../../../supabase/functions/${fn}/index.ts`), 'utf-8');
      expect(src, fn).toMatch(/from\('profiles'\)\s*\.select\('[^']*\bstatus\b[^']*'\)/);
      expect(src, fn).toContain('decideInstanceAccess(');
    }
  });
});
