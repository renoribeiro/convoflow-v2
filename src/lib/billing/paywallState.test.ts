/**
 * Qual tela de bloqueio cada pessoa vê (teste grátis, entrega 2).
 *
 * A regra que importa: o teste grátis só é PROMETIDO quando (a) a oferta está
 * ligada e (b) se sabe que a Conta nunca assinou. Na dúvida, "Assinar agora" —
 * prometer "você não paga nada hoje" e o Stripe cobrar seria enganar o cliente.
 */
import { describe, expect, it } from 'vitest';

import {
  checkoutReturnFrom,
  CONFIRMACAO_INTERVALO_MS,
  CONFIRMACAO_LIMITE_MS,
  paywallVariant,
  type PaywallInputs,
} from './paywallState';
import { TRIAL_DAYS, TRIAL_OFFER_ENABLED, trialChargeDateLabel } from './trialOffer';
import { PUBLIC_SIGNUP_ENABLED } from '@/lib/signup/release';

const base: PaywallInputs = {
  role: 'gerente',
  checkoutEnabled: true,
  trialOfferEnabled: true,
  contaNuncaAssinou: true,
  retorno: null,
};

describe('paywallVariant', () => {
  it('gerente de Conta nova, oferta ligada → teste grátis', () => {
    expect(paywallVariant(base)).toBe('teste-gratis');
  });

  it('gerente de Conta que já assinou → assinar (sem novo teste)', () => {
    expect(paywallVariant({ ...base, contaNuncaAssinou: false })).toBe('assinar');
  });

  it('não se sabe se a Conta já assinou (carregando/erro) → assinar, nunca promete teste', () => {
    expect(paywallVariant({ ...base, contaNuncaAssinou: null })).toBe('assinar');
  });

  it('oferta desligada → assinar, mesmo para Conta nova (a tela de hoje)', () => {
    expect(paywallVariant({ ...base, trialOfferEnabled: false })).toBe('assinar');
  });

  it('voltou do Stripe com sucesso → confirmando, para Conta nova ou antiga', () => {
    expect(paywallVariant({ ...base, retorno: 'success' })).toBe('confirmando');
    expect(paywallVariant({ ...base, contaNuncaAssinou: false, retorno: 'success' })).toBe('confirmando');
    expect(paywallVariant({ ...base, trialOfferEnabled: false, retorno: 'success' })).toBe('confirmando');
  });

  it('voltou do Stripe sem concluir → a oferta de novo (não confirmando)', () => {
    expect(paywallVariant({ ...base, retorno: 'cancel' })).toBe('teste-gratis');
    expect(paywallVariant({ ...base, contaNuncaAssinou: false, retorno: 'cancel' })).toBe('assinar');
  });

  it.each(['gestor', 'atendente', null])('%s → sem pagamento, mesmo com tudo ligado', (role) => {
    expect(paywallVariant({ ...base, role })).toBe('sem-pagamento');
    expect(paywallVariant({ ...base, role, retorno: 'success' })).toBe('sem-pagamento');
  });

  it('checkout desligado → sem pagamento, até para o gerente', () => {
    expect(paywallVariant({ ...base, checkoutEnabled: false })).toBe('sem-pagamento');
  });
});

describe('checkoutReturnFrom', () => {
  it.each([
    ['?checkout=success', 'success'],
    ['?checkout=cancel', 'cancel'],
    ['?checkout=outra', null],
    ['?foo=1', null],
    ['', null],
    [undefined, null],
    [null, null],
  ])('%s → %s', (search, esperado) => {
    expect(checkoutReturnFrom(search as string | null | undefined)).toBe(esperado);
  });
});

describe('a data da primeira cobrança', () => {
  it('é hoje + dias de teste, no fuso de Brasília', () => {
    // 26/09/2026 23:30 em Brasília = 27/09 02:30 UTC. + 7 dias → 03/10/2026.
    expect(trialChargeDateLabel(new Date('2026-09-27T02:30:00Z'), 7)).toBe('03/10/2026');
  });

  it('usa os dias de teste da constante por padrão', () => {
    const agora = new Date('2026-01-10T15:00:00Z');
    expect(trialChargeDateLabel(agora)).toBe(trialChargeDateLabel(agora, TRIAL_DAYS));
  });
});

describe('a confirmação', () => {
  it('pergunta de novo a cada poucos segundos e desiste com aviso em 2 minutos', () => {
    expect(CONFIRMACAO_INTERVALO_MS).toBeLessThanOrEqual(5_000);
    expect(CONFIRMACAO_LIMITE_MS).toBe(120_000);
  });
});

describe('as chaves de lançamento', () => {
  it('o cadastro pelo site exige a oferta do teste ligada', () => {
    // Quem se cadastra pelo site lê "7 dias grátis"; sem a oferta ligada, a tela
    // seguinte pediria "Assinar agora" e cobraria no mesmo dia.
    if (PUBLIC_SIGNUP_ENABLED) expect(TRIAL_OFFER_ENABLED).toBe(true);
  });

  it('hoje as duas estão desligadas (entregas 3 e 4 ainda não saíram)', () => {
    // Quando ligar, troque este teste junto — é a lembrança de que ligar é uma
    // decisão, não um detalhe.
    expect(PUBLIC_SIGNUP_ENABLED).toBe(false);
    expect(TRIAL_OFFER_ENABLED).toBe(false);
  });
});
