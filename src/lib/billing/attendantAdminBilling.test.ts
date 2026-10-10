/**
 * Faturamento: concedido × cobrado dos atendentes extras (entrega 2).
 * Regras puras de src/lib/billing/adminBilling.ts.
 */
import { describe, expect, it } from 'vitest';
import {
  attendantBillingCheck,
  attendantBillingIssues,
  centsToReaisInput,
  grantedAttendantsByConta,
  parseReaisToCents,
  type ContaBillingRow,
} from './adminBilling';

const conta = (o: Partial<ContaBillingRow> = {}): ContaBillingRow => ({
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  name: 'Conta Exemplo',
  kind: 'account',
  subscription_id: 'sub_FAKE1',
  subscription_status: 'active',
  trial_ends_at: null,
  subscription_will_cancel: false,
  subscription_cancel_at: null,
  store_slots_extra: 0,
  manual_access_granted: false,
  atendente_extra_preco_centavos: 4990,
  atendentes_extra_cobrados: 3,
  ...o,
});

describe('soma das vagas extras por Conta', () => {
  it('só Loja, só extras positivos', () => {
    expect(
      grantedAttendantsByConta([
        { kind: 'store', parent_tenant_id: 'c1', atendentes_extra: 2 },
        { kind: 'store', parent_tenant_id: 'c1', atendentes_extra: 1 },
        { kind: 'store', parent_tenant_id: 'c2', atendentes_extra: 0 },
        { kind: 'account', parent_tenant_id: null, atendentes_extra: 9 },
        { kind: 'store', parent_tenant_id: null, atendentes_extra: 4 },
      ]),
    ).toEqual({ c1: 3, c2: 0 });
    expect(grantedAttendantsByConta(null)).toEqual({});
  });
});

describe('situação da cobrança de uma Conta', () => {
  it('em dia, diferença, sem preço', () => {
    expect(attendantBillingCheck(conta(), 3).state).toBe('em_dia');
    expect(attendantBillingCheck(conta(), 4)).toEqual({ state: 'diferenca', concedidos: 4, cobrados: 3 });
    expect(attendantBillingCheck(conta({ atendente_extra_preco_centavos: null, atendentes_extra_cobrados: 0 }), 2).state).toBe('sem_preco');
    expect(attendantBillingCheck(conta({ atendentes_extra_cobrados: null }), 0).state).toBe('sem_extras');
  });

  it('em teste e com pagamento pendente também comparam', () => {
    expect(attendantBillingCheck(conta({ subscription_status: 'trialing' }), 2).state).toBe('diferenca');
    expect(attendantBillingCheck(conta({ subscription_status: 'past_due' }), 3).state).toBe('em_dia');
  });

  it('acesso manual / sem assinatura: sem cobrança, nunca diferença', () => {
    const manual = conta({ subscription_id: null, subscription_status: null, manual_access_granted: true, atendentes_extra_cobrados: null });
    expect(attendantBillingCheck(manual, 5)).toEqual({ state: 'sem_cobranca', concedidos: 5, cobrados: 0 });
    expect(attendantBillingCheck(conta({ subscription_status: 'canceled' }), 2).state).toBe('sem_cobranca');
  });

  it('Conta da conta antiga do Stripe fica de fora', () => {
    const c = conta();
    expect(attendantBillingCheck(c, 9, new Set([c.id])).state).toBe('conta_antiga');
  });

  it('a lista do aviso tem só diferença e sem preço', () => {
    const a = conta({ id: 'a', name: 'A' });
    const b = conta({ id: 'b', name: 'B' });
    const c = conta({ id: 'c', name: 'C', atendente_extra_preco_centavos: null, atendentes_extra_cobrados: 0 });
    const d = conta({ id: 'd', name: 'D', subscription_id: null, subscription_status: null });
    const lista = attendantBillingIssues([a, b, c, d], { a: 3, b: 1, c: 2, d: 4 });
    expect(lista.map((x) => [x.conta.name, x.check.state])).toEqual([
      ['B', 'diferenca'],
      ['C', 'sem_preco'],
    ]);
  });
});

describe('preço em reais no campo', () => {
  it('lê vírgula, ponto e sem centavos', () => {
    expect(parseReaisToCents('49,90')).toBe(4990);
    expect(parseReaisToCents('49.9')).toBe(4990);
    expect(parseReaisToCents('R$ 120')).toBe(12000);
    expect(parseReaisToCents('0,5')).toBe(50);
  });
  it('recusa o que não é valor', () => {
    expect(parseReaisToCents('')).toBeNull();
    expect(parseReaisToCents('abc')).toBeNull();
    expect(parseReaisToCents('1.000,00')).toBeNull();
    expect(parseReaisToCents('-5')).toBeNull();
  });
  it('escreve de volta no formato do campo', () => {
    expect(centsToReaisInput(4990)).toBe('49,90');
    expect(centsToReaisInput(null)).toBe('');
  });
});
