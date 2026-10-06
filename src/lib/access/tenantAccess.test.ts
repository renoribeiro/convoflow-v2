/**
 * A regra de herança de acesso, nas formas de linha que existem em produção.
 *
 * Este arquivo é o espelho em teste da função SQL
 * `public.tenant_access_state(uuid)` (migração 20260818000001). Se um destes
 * casos mudar, a função SQL tem que mudar junto.
 */

import { describe, it, expect } from 'vitest';
import {
  billingRowFor,
  resolveTenantAccess,
  normalizeAccessDecision,
  type AccessRow,
} from './tenantAccess';

// ---------------------------------------------------------------------------
// As QUATRO formas de linha que `tenants` admite, uma fixture para cada:
// Conta liberada, Loja com pai liberado, Loja com pai que nada tem na própria
// linha, e Loja órfã (sem pai) nos dois estados.
//
// Elas nasceram copiadas da produção de 2026-08-18, mas o que o teste protege é
// a FORMA, não o conteúdo do banco: as duas órfãs reais foram removidas em
// 2026-08-20 (`docs/remover_lojas_orfas.sql`) e estes casos seguem valendo,
// porque nada no schema impede uma Loja com `parent_tenant_id` nulo de aparecer
// de novo. Teste que assertasse nome de Loja de produção viraria lixo a cada
// faxina — este assertaria errado.
// ---------------------------------------------------------------------------
const CONTA_MARCIO: AccessRow = {
  kind: 'account',
  parent_tenant_id: null,
  subscription_status: null,
  manual_access_granted: true,
};

const CONTA_TESTE: AccessRow = {
  kind: 'account',
  parent_tenant_id: null,
  subscription_status: null,
  manual_access_granted: true,
};

const VAGACERTA: AccessRow = {
  kind: 'store',
  parent_tenant_id: 'aaaa0000-conta-marcio',
  subscription_status: null,
  manual_access_granted: true, // flag na própria Loja — vira dado morto
};

const LOJA_TESTE: AccessRow = {
  kind: 'store',
  parent_tenant_id: 'aaaaaaaa-conta-teste',
  subscription_status: null,
  manual_access_granted: false, // o defeito: nasce assim pelo create-store
};

/** Órfã COM liberação na própria linha. É esta que um JOIN comum trancaria. */
const ORFA_LIBERADA: AccessRow = {
  kind: 'store',
  parent_tenant_id: null,
  subscription_status: null,
  manual_access_granted: true,
};

/** Órfã SEM liberação: sem pai para herdar e sem marca própria, fica trancada. */
const ORFA_SEM_LIBERACAO: AccessRow = {
  kind: 'store',
  parent_tenant_id: null,
  subscription_status: null,
  manual_access_granted: false,
};

describe('Loja órfã responde por si mesma', () => {
  // Não existe nenhuma órfã em produção desde 2026-08-20. Estes casos ficam
  // porque a FORMA continua possível: `tenants.parent_tenant_id` é nullable e
  // nenhuma trava impede criar uma Loja sem pai. Sem este caminho, a próxima
  // órfã nasce trancada e sem como ser liberada.
  it('órfã com liberação manual continua liberada', () => {
    expect(resolveTenantAccess(ORFA_LIBERADA, null)).toEqual({
      unlocked: true,
      source: 'manual',
    });
  });

  it('a órfã não some quando não existe Conta pai para consultar', () => {
    // O erro que este teste trava: tratar a subida como join obrigatório.
    expect(billingRowFor(ORFA_LIBERADA, null)).toBe(ORFA_LIBERADA);
  });

  it('órfã sem liberação segue trancada', () => {
    expect(resolveTenantAccess(ORFA_SEM_LIBERACAO, null)).toEqual({
      unlocked: false,
      source: 'locked',
    });
  });

  it('passar um pai por engano não muda a órfã: ela não tem pai', () => {
    const contaPaga: AccessRow = { kind: 'account', subscription_status: 'active' };
    expect(resolveTenantAccess(ORFA_SEM_LIBERACAO, contaPaga)).toEqual({
      unlocked: false,
      source: 'locked',
    });
  });

  it('órfã com assinatura ativa na própria linha entra como paga', () => {
    // Hoje nada cria esta linha (só Conta assina), mas a regra é "órfã responde
    // por si" — e responder por si inclui a assinatura, não só a marca manual.
    expect(resolveTenantAccess({ ...ORFA_SEM_LIBERACAO, subscription_status: 'active' }, null))
      .toEqual({ unlocked: true, source: 'paid' });
  });
});

describe('Loja com pai herda da Conta', () => {
  it('Conta paga libera a Loja, mesmo com a Loja sem nada na própria linha', () => {
    const contaPaga: AccessRow = {
      kind: 'account',
      parent_tenant_id: null,
      subscription_status: 'active',
      manual_access_granted: false,
    };
    expect(resolveTenantAccess(LOJA_TESTE, contaPaga)).toEqual({
      unlocked: true,
      source: 'paid',
    });
  });

  it('Conta liberada manualmente libera a Loja — é o defeito do Blocker 1', () => {
    expect(resolveTenantAccess(LOJA_TESTE, CONTA_TESTE)).toEqual({
      unlocked: true,
      source: 'manual',
    });
  });

  it('Conta trancada tranca a Loja', () => {
    const contaTrancada: AccessRow = {
      kind: 'account',
      parent_tenant_id: null,
      subscription_status: null,
      manual_access_granted: false,
    };
    expect(resolveTenantAccess(LOJA_TESTE, contaTrancada)).toEqual({
      unlocked: false,
      source: 'locked',
    });
  });

  it('a flag na Loja NÃO destrava quando a Conta está trancada: não há acesso por Loja', () => {
    const contaTrancada: AccessRow = {
      kind: 'account',
      parent_tenant_id: null,
      subscription_status: null,
      manual_access_granted: false,
    };
    // VagaCerta tem manual=true na própria linha; com pai, quem manda é o pai.
    expect(resolveTenantAccess(VAGACERTA, contaTrancada)).toEqual({
      unlocked: false,
      source: 'locked',
    });
  });

  it('VagaCerta continua liberada pela Conta Márcio Tavares', () => {
    expect(resolveTenantAccess(VAGACERTA, CONTA_MARCIO)).toEqual({
      unlocked: true,
      source: 'manual',
    });
  });

  it('pai não carregado cai na própria linha em vez de trancar', () => {
    expect(resolveTenantAccess(VAGACERTA, null)).toEqual({
      unlocked: true,
      source: 'manual',
    });
  });
});

describe('Conta avalia a si mesma', () => {
  it('Conta liberada manualmente', () => {
    expect(resolveTenantAccess(CONTA_MARCIO, null)).toEqual({
      unlocked: true,
      source: 'manual',
    });
  });

  it('Conta paga', () => {
    const conta: AccessRow = { kind: 'account', subscription_status: 'active' };
    expect(resolveTenantAccess(conta, null)).toEqual({ unlocked: true, source: 'paid' });
  });

  it('Conta sem nada fica trancada', () => {
    const conta: AccessRow = { kind: 'account', subscription_status: null };
    expect(resolveTenantAccess(conta, null)).toEqual({ unlocked: false, source: 'locked' });
  });

  it('Conta nunca sobe: mesmo com um pai à mão, ela responde por si', () => {
    const contaPaga: AccessRow = { kind: 'account', subscription_status: 'active' };
    const contaTrancada: AccessRow = { kind: 'account', subscription_status: null };
    expect(resolveTenantAccess(contaTrancada, contaPaga)).toEqual({
      unlocked: false,
      source: 'locked',
    });
  });
});

describe('pago ganha de liberação manual', () => {
  it('assinatura ativa devolve paid mesmo com manual também ligado', () => {
    const conta: AccessRow = {
      kind: 'account',
      subscription_status: 'active',
      manual_access_granted: true,
    };
    expect(resolveTenantAccess(conta, null).source).toBe('paid');
  });

  it('assinatura cancelada não libera nada', () => {
    const conta: AccessRow = { kind: 'account', subscription_status: 'canceled' };
    expect(resolveTenantAccess(conta, null)).toEqual({ unlocked: false, source: 'locked' });
  });
});

describe('bordas', () => {
  it('sem linha nenhuma, trancado', () => {
    expect(resolveTenantAccess(null, null)).toEqual({ unlocked: false, source: 'locked' });
    expect(billingRowFor(null, CONTA_MARCIO)).toBeNull();
  });

  it('manual_access_granted nulo não é verdadeiro', () => {
    const conta: AccessRow = { kind: 'account', manual_access_granted: null };
    expect(resolveTenantAccess(conta, null)).toEqual({ unlocked: false, source: 'locked' });
  });
});

describe('normalizeAccessDecision', () => {
  it('aceita o que a RPC devolve', () => {
    expect(normalizeAccessDecision({ unlocked: true, source: 'paid' })).toEqual({
      unlocked: true,
      source: 'paid',
    });
    expect(normalizeAccessDecision({ unlocked: true, source: 'manual' })).toEqual({
      unlocked: true,
      source: 'manual',
    });
    expect(normalizeAccessDecision({ unlocked: false, source: 'locked' })).toEqual({
      unlocked: false,
      source: 'locked',
    });
  });

  it('texto inesperado no source não vira acesso indevido', () => {
    expect(normalizeAccessDecision({ unlocked: false, source: 'paid' })).toEqual({
      unlocked: false,
      source: 'locked',
    });
    expect(normalizeAccessDecision({ unlocked: true, source: 'qualquer-coisa' })).toEqual({
      unlocked: true,
      source: 'manual',
    });
  });

  it('unlocked que não é booleano true não libera', () => {
    expect(normalizeAccessDecision({ unlocked: 'true', source: 'paid' }).unlocked).toBe(false);
    expect(normalizeAccessDecision({}).unlocked).toBe(false);
  });
});
