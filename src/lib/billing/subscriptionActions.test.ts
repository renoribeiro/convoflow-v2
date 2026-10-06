/**
 * O que a aba Assinatura mostra e o que a confirmação de cancelamento diz
 * (teste grátis, entrega 3).
 */
import { describe, expect, it } from 'vitest';

import { cancelConfirmation, dataCurta, subscriptionActions } from './subscriptionActions';

describe('subscriptionActions — quem vê o quê', () => {
  it.each(['trialing', 'active', 'past_due'])('não-gerente não vê botão nenhum (%s)', (status) => {
    expect(subscriptionActions({ isGerente: false, status, willCancel: false })).toEqual({
      cancel: false,
      undo: false,
      updateCard: false,
    });
    expect(subscriptionActions({ isGerente: false, status, willCancel: true })).toEqual({
      cancel: false,
      undo: false,
      updateCard: false,
    });
  });

  it('gerente no teste, sem agendamento: cancelar e trocar cartão', () => {
    expect(subscriptionActions({ isGerente: true, status: 'trialing', willCancel: false })).toEqual({
      cancel: true,
      undo: false,
      updateCard: true,
    });
  });

  it('gerente no teste com cancelamento agendado: só desfazer (o cartão fica sem uso)', () => {
    expect(subscriptionActions({ isGerente: true, status: 'trialing', willCancel: true })).toEqual({
      cancel: false,
      undo: true,
      updateCard: false,
    });
  });

  it('gerente pagante: cancelar e trocar cartão; agendado: desfazer e trocar cartão', () => {
    expect(subscriptionActions({ isGerente: true, status: 'active', willCancel: false })).toEqual({
      cancel: true,
      undo: false,
      updateCard: true,
    });
    expect(subscriptionActions({ isGerente: true, status: 'active', willCancel: true })).toEqual({
      cancel: false,
      undo: true,
      updateCard: true,
    });
  });

  it('pagamento pendente: sem cancelar, com trocar cartão', () => {
    expect(subscriptionActions({ isGerente: true, status: 'past_due', willCancel: false })).toEqual({
      cancel: false,
      undo: false,
      updateCard: true,
    });
  });

  it('"Desfazer" só aparece enquanto há cancelamento agendado', () => {
    for (const status of ['trialing', 'active', 'past_due']) {
      expect(subscriptionActions({ isGerente: true, status, willCancel: false }).undo).toBe(false);
      expect(subscriptionActions({ isGerente: true, status, willCancel: true }).undo).toBe(true);
    }
  });

  it.each([null, 'canceled', 'unpaid', 'incomplete'])('sem assinatura viva (%s): nada', (status) => {
    expect(subscriptionActions({ isGerente: true, status, willCancel: true })).toEqual({
      cancel: false,
      undo: false,
      updateCard: false,
    });
  });
});

describe('cancelConfirmation — o aviso diz o que acontece e quando', () => {
  const FIM = '2026-10-05T12:00:00.000Z';

  it('no teste: nada é cobrado, usa até a data, e dá para desfazer', () => {
    const c = cancelConfirmation('trial', FIM);
    const texto = c.paragraphs.join(' ');
    expect(c.title).toBe('Cancelar o teste grátis?');
    expect(texto).toContain('até 05/10/2026, quando o teste termina');
    expect(texto).toContain('nada é cobrado no seu cartão');
    expect(texto).toContain('Depois de 05/10/2026, o sistema fica bloqueado');
    expect(texto).toContain('Até 05/10/2026, dá para desfazer');
    expect(texto).not.toMatch(/reembolso/i);
    expect(c.confirmLabel).toBe('Cancelar o teste');
    expect(c.keepLabel).toBe('Manter o teste');
  });

  it('pago: usa até o fim do período, sem nova cobrança, sem reembolso proporcional', () => {
    const c = cancelConfirmation('paid', '2026-10-20T12:00:00.000Z');
    const texto = c.paragraphs.join(' ');
    expect(c.title).toBe('Cancelar a assinatura?');
    expect(texto).toContain('Você já pagou até 20/10/2026 e continua usando o ConvoFlow até essa data.');
    expect(texto).toContain('Não haverá nova cobrança.');
    expect(texto).toContain('Não há reembolso proporcional');
    expect(texto).toContain('Até 20/10/2026, dá para desfazer');
    expect(texto).not.toMatch(/nada é cobrado/i);
    expect(c.confirmLabel).toBe('Cancelar a assinatura');
  });

  it('os dois textos são diferentes', () => {
    expect(cancelConfirmation('trial', FIM).paragraphs).not.toEqual(cancelConfirmation('paid', FIM).paragraphs);
  });

  it('sem data, não inventa uma', () => {
    expect(cancelConfirmation('trial', null).paragraphs.join(' ')).toContain('até o fim do teste');
    expect(cancelConfirmation('paid', undefined).paragraphs.join(' ')).toContain('até o fim do período já pago');
    expect(cancelConfirmation('paid', null).paragraphs.join(' ')).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  it('a data sai no fuso de Brasília', () => {
    // 01h UTC do dia 6 ainda é dia 5 em Brasília.
    expect(dataCurta('2026-10-06T01:00:00Z')).toBe('05/10/2026');
    expect(dataCurta('lixo')).toBeNull();
  });
});
