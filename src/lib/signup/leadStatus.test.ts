/**
 * A situação de cada ficha na aba Administração › Cadastros.
 *
 * O que importa: quem precisa de uma ligação de vendas (convite que não saiu,
 * cadastro interrompido) aparece como tal, e o motivo do convite que falhou é
 * dito em pt-BR.
 */
import { describe, expect, it } from 'vitest';

import { failureReasonLabel, formatPhoneBR, leadSituation, type LeadFailureCode } from './leadStatus';

describe('leadSituation', () => {
  it('convite enviado segue a assinatura da Conta', () => {
    const f = { status: 'invited' as const, failure_code: null };
    expect(leadSituation(f, null).label).toBe('Convite enviado');
    expect(leadSituation(f, { subscription_status: null }).label).toBe('Convite enviado');
    expect(leadSituation(f, { subscription_status: 'trialing' }).label).toBe('Em teste grátis');
    expect(leadSituation(f, { subscription_status: 'active' }).label).toBe('Assinante');
    expect(leadSituation(f, { subscription_status: 'past_due' }).label).toBe('Pagamento pendente');
    expect(leadSituation(f, { subscription_status: 'canceled' }).label).toBe('Assinatura encerrada');
  });

  it.each<LeadFailureCode>(['email_quota', 'email_not_authorized', 'invite_error', 'processing_error'])(
    'convite que não saiu por %s → vendas liga',
    (code) => {
      const s = leadSituation({ status: 'invite_failed', failure_code: code }, null);
      expect(s.label).toBe('Convite não saiu');
      expect(s.needsContact).toBe(true);
      expect(failureReasonLabel(code)).toBeTruthy();
    },
  );

  it('e-mail que já tinha login não é lead a perseguir', () => {
    expect(leadSituation({ status: 'email_exists', failure_code: 'email_exists' }, null).needsContact).toBe(false);
    expect(leadSituation({ status: 'invite_failed', failure_code: 'email_exists' }, null).needsContact).toBe(false);
  });

  it('cadastro interrompido → vendas liga', () => {
    expect(leadSituation({ status: 'abandoned', failure_code: 'processing_error' }, null).needsContact).toBe(true);
  });

  it('removidos pela limpeza dizem por quê', () => {
    expect(leadSituation({ status: 'expired_unconfirmed', failure_code: null }, null).label).toMatch(/48 h/);
    expect(leadSituation({ status: 'expired_unpaid', failure_code: null }, null).label).toMatch(/30 dias/);
  });
});

describe('formatPhoneBR', () => {
  it.each([
    ['11999990000', '(11) 99999-0000'],
    ['1133334444', '(11) 3333-4444'],
    ['5511999990000', '(11) 99999-0000'],
    ['123', '123'],
  ])('%s → %s', (entrada, saida) => {
    expect(formatPhoneBR(entrada)).toBe(saida);
  });
});
