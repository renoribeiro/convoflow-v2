/**
 * O que a tela de Assinatura e a lista do superadmin dizem em cada situação da
 * assinatura. (Teste grátis, entrega 1.)
 */
import { describe, expect, it } from 'vitest';

import { adminAccessLabel, describeSubscription } from './subscriptionView';
import { PLAN_NAME, PLAN_PRICE_LABEL, SUPORTE_EMAIL } from './checkout';

const FIM_DO_TESTE = '2026-10-03T15:00:00.000Z'; // 03/10/2026 em qualquer fuso do Brasil

describe('tela de Assinatura', () => {
  it('em teste: mostra a data de fim do teste e que nada foi cobrado', () => {
    const v = describeSubscription({ subscription_status: 'trialing', trial_ends_at: FIM_DO_TESTE });
    expect(v.hasSubscription).toBe(true);
    expect(v.badge).toEqual({ tone: 'teste', label: 'EM TESTE' });
    expect(v.title).toBe(PLAN_NAME);
    expect(v.description).toBe('Você está no teste grátis até 03/10/2026.');
    expect(v.alert?.title).toBe('Teste grátis até 03/10/2026');
    expect(v.alert?.description).toContain('Nada foi cobrado ainda');
    expect(v.alert?.description).toContain(PLAN_PRICE_LABEL);
    expect(v.alert?.tone).toBe('default');
  });

  it('cancelou durante o teste: acesso até o fim do teste e nada será cobrado', () => {
    const v = describeSubscription({
      subscription_status: 'trialing',
      trial_ends_at: FIM_DO_TESTE,
      subscription_will_cancel: true,
      subscription_cancel_at: FIM_DO_TESTE,
    });
    expect(v.hasSubscription).toBe(true);
    expect(v.alert).toMatchObject({ title: 'Cancelamento agendado', tone: 'default' });
    expect(v.alert?.description).toContain('Nada será cobrado');
    expect(v.alert?.description).toContain('03/10/2026');
  });

  it('pagamento pendente: aviso vermelho para atualizar o cartão, sistema ainda liberado', () => {
    const v = describeSubscription({ subscription_status: 'past_due', trial_ends_at: FIM_DO_TESTE });
    expect(v.hasSubscription).toBe(true);
    expect(v.badge).toEqual({ tone: 'pendente', label: 'PAGAMENTO PENDENTE' });
    expect(v.alert?.tone).toBe('destructive');
    expect(v.alert?.title).toMatch(/Atualize o cartão/);
    expect(v.alert?.description).toContain('continua liberado');
    expect(v.alert?.description).toContain('bloqueada');
    expect(v.alert?.description).toContain(SUPORTE_EMAIL);
  });

  it('ativa: sem aviso; com cancelamento agendado, avisa até quando', () => {
    expect(describeSubscription({ subscription_status: 'active' })).toMatchObject({
      hasSubscription: true,
      badge: { tone: 'ativo', label: 'ATIVO' },
      alert: null,
    });
    const agendada = describeSubscription({
      subscription_status: 'active',
      subscription_will_cancel: true,
      subscription_cancel_at: FIM_DO_TESTE,
    });
    expect(agendada.alert?.title).toBe('Cancelamento agendado');
    expect(agendada.alert?.description).toContain('Não há novas cobranças');
  });

  it.each([
    [null, 'Você ainda não tem uma assinatura ativa.'],
    ['canceled', 'A assinatura foi cancelada.'],
    ['unpaid', 'A assinatura foi suspensa porque o pagamento não foi concluído.'],
    ['incomplete', 'Você ainda não tem uma assinatura ativa.'],
  ])('%s: sem assinatura, com o motivo', (status, motivo) => {
    const v = describeSubscription({ subscription_status: status });
    expect(v.hasSubscription).toBe(false);
    expect(v.title).toBe('Sem assinatura ativa');
    expect(v.alert).toEqual({ tone: 'destructive', title: 'Nenhuma assinatura', description: motivo });
  });

  it('trial_ends_at velho numa Conta sem assinatura não vira "teste" (a linha legada da Conta Teste)', () => {
    const v = describeSubscription({ subscription_status: null, trial_ends_at: '2026-08-26T20:47:32Z' });
    expect(v.hasSubscription).toBe(false);
    expect(v.alert?.title).toBe('Nenhuma assinatura');
  });

  it('cancelamento com a data faltando não inventa data', () => {
    const v = describeSubscription({ subscription_status: 'trialing', subscription_will_cancel: true });
    expect(v.alert?.title).not.toBe('Cancelamento agendado');
  });
});

describe('selo de acesso na lista do superadmin', () => {
  it('teste grátis NÃO aparece como Bloqueado', () => {
    expect(adminAccessLabel({ subscription_status: 'trialing', trial_ends_at: FIM_DO_TESTE })).toEqual({
      tone: 'teste',
      label: 'Em teste até 03/10/2026',
      note: null,
    });
  });

  it('pago, pendente, manual e bloqueado', () => {
    expect(adminAccessLabel({ subscription_status: 'active' }).label).toBe('Pago');
    expect(adminAccessLabel({ subscription_status: 'past_due' }).label).toBe('Pagamento pendente');
    expect(adminAccessLabel({ subscription_status: null, manual_access_granted: true }).label).toBe('Manual (Liberado)');
    expect(adminAccessLabel({ subscription_status: 'canceled' }).tone).toBe('bloqueado');
    expect(adminAccessLabel({ subscription_status: 'unpaid' }).tone).toBe('bloqueado');
    expect(adminAccessLabel(null).tone).toBe('bloqueado');
  });

  it('assinatura ganha de liberação manual, como na trava', () => {
    expect(adminAccessLabel({ subscription_status: 'trialing', manual_access_granted: true }).tone).toBe('teste');
    expect(adminAccessLabel({ subscription_status: 'canceled', manual_access_granted: true }).tone).toBe('manual');
  });

  it('cancelamento agendado vira nota', () => {
    expect(
      adminAccessLabel({
        subscription_status: 'trialing',
        trial_ends_at: FIM_DO_TESTE,
        subscription_will_cancel: true,
        subscription_cancel_at: FIM_DO_TESTE,
      }).note,
    ).toBe('cancela em 03/10/2026');
  });
});
