import { describe, it, expect } from 'vitest';
import {
  formatInstagramValidity,
  instagramConnectionIsUsable,
  instagramConnectionTexts,
  instagramConnectionView,
} from './connection';

const NOW = new Date('2026-10-25T12:00:00Z');
const D = 86_400_000;

const conf = (expiresInMs: number, renewal?: Record<string, unknown>, sameToken = true) => {
  const issued = '2026-09-24T00:16:36.715273+00:00';
  return {
    tokenIssuedAt: issued,
    tokenExpiresAt: new Date(NOW.getTime() + expiresInMs).toISOString(),
    ...(renewal ? { renewal: { ...renewal, forTokenIssuedAt: sameToken ? issued : 'outro' } } : {}),
  };
};

describe('instagramConnectionView — o estado do cartão', () => {
  it('válida, com a data de validade', () => {
    const v = instagramConnectionView(conf(40 * D), NOW);
    expect(v.state).toBe('valid');
    expect(v.daysLeft).toBe(40);
    expect(instagramConnectionIsUsable(v)).toBe(true);
  });

  it('vai vencer: 7 dias ou menos', () => {
    expect(instagramConnectionView(conf(7 * D), NOW).state).toBe('expiring');
    expect(instagramConnectionView(conf(7 * D + 1), NOW).state).toBe('valid');
    const v = instagramConnectionView(conf(2.5 * D), NOW);
    expect(v.state).toBe('expiring');
    expect(v.daysLeft).toBe(3);
    expect(instagramConnectionIsUsable(v)).toBe(true);
  });

  it('venceu', () => {
    const v = instagramConnectionView(conf(-1), NOW);
    expect(v.state).toBe('expired');
    expect(v.daysLeft).toBe(0);
    expect(instagramConnectionIsUsable(v)).toBe(false);
    // venceu ganha de "precisa reconectar"
    expect(instagramConnectionView(conf(-1, { status: 'needs_reconnect' }), NOW).state).toBe('expired');
  });

  it('precisa reconectar — só se o estado é do token atual', () => {
    const v = instagramConnectionView(conf(20 * D, { status: 'needs_reconnect', message: 'O Instagram não aceita mais o acesso atual desta conta.' }), NOW);
    expect(v.state).toBe('needs_reconnect');
    expect(instagramConnectionIsUsable(v)).toBe(false);
    expect(instagramConnectionView(conf(20 * D, { status: 'needs_reconnect' }, false), NOW).state).toBe('valid');
    // mais forte que "vai vencer"
    expect(instagramConnectionView(conf(3 * D, { status: 'needs_reconnect' }), NOW).state).toBe('needs_reconnect');
  });

  it('tentando de novo (falha passageira) continua válida, com o aviso', () => {
    const v = instagramConnectionView(conf(20 * D, { status: 'retrying', message: 'Não foi possível falar com o Instagram.' }), NOW);
    expect(v.state).toBe('valid');
    expect(v.retrying).toBe(true);
  });

  it('sem data: desconhecida, sem travar nada', () => {
    const v = instagramConnectionView({ igAccountId: '1' }, NOW);
    expect(v.state).toBe('unknown');
    expect(v.validUntil).toBeNull();
    expect(instagramConnectionIsUsable(v)).toBe(true);
    expect(instagramConnectionView(null, NOW).state).toBe('unknown');
  });
});

describe('textos do cartão', () => {
  it('data e hora de Brasília (o token de teste vence 23/11 00:16 UTC)', () => {
    expect(formatInstagramValidity(new Date('2026-11-23T00:16:36.715273+00:00'))).toBe('22/11/2026 às 21:16');
  });

  it('válida', () => {
    const t = instagramConnectionTexts(instagramConnectionView(conf(40 * D), NOW));
    expect(t.badge).toBe('Conectado');
    expect(t.detail).toMatch(/^Válida até \d\d\/\d\d\/\d{4} às \d\d:\d\d\. Renova sozinha antes de vencer\.$/);
  });

  it('válida, mas a última renovação falhou', () => {
    const t = instagramConnectionTexts(instagramConnectionView(conf(20 * D, { status: 'retrying' }), NOW));
    expect(t.detail).toContain('A última renovação automática falhou; o ConvoFlow tenta de novo amanhã.');
  });

  it('vai vencer', () => {
    expect(instagramConnectionTexts(instagramConnectionView(conf(3 * D), NOW)).badge).toBe('Vence em 3 dias');
    expect(instagramConnectionTexts(instagramConnectionView(conf(0.5 * D), NOW)).badge).toBe('Vence em 1 dia');
    expect(instagramConnectionTexts(instagramConnectionView(conf(3 * D), NOW)).detail).toContain('contato@convoflow.com.br');
  });

  it('venceu e precisa reconectar dizem o que fazer', () => {
    const venceu = instagramConnectionTexts(instagramConnectionView(conf(-1), NOW));
    expect(venceu.badge).toBe('Vencida');
    expect(venceu.detail).toContain('As respostas pelo Instagram estão paradas.');
    expect(venceu.detail).toContain('Para reconectar, escreva para contato@convoflow.com.br.');

    const rec = instagramConnectionTexts(
      instagramConnectionView(conf(20 * D, { status: 'needs_reconnect', message: 'A permissão dada ao ConvoFlow foi retirada no Instagram.' }), NOW),
    );
    expect(rec.badge).toBe('Reconectar');
    expect(rec.detail).toContain('(A permissão dada ao ConvoFlow foi retirada no Instagram)');
    expect(rec.detail).toContain('Para reconectar, escreva para contato@convoflow.com.br.');
  });

  it('sem jargão em nenhum estado', () => {
    const estados = [
      conf(40 * D),
      conf(20 * D, { status: 'retrying' }),
      conf(3 * D),
      conf(-1),
      conf(20 * D, { status: 'needs_reconnect' }),
      {},
    ];
    for (const c of estados) {
      const t = instagramConnectionTexts(instagramConnectionView(c, NOW));
      expect(`${t.badge} ${t.detail}`).not.toMatch(/token|oauth|\bapi\b|webhook|cron|refresh/i);
    }
  });
});

describe('com o botão Reconectar no cartão (fatia 4b)', () => {
  const opts = { canReconnectHere: true };

  it('vencida e precisa reconectar apontam para o botão, não para o e-mail', () => {
    const venceu = instagramConnectionTexts(instagramConnectionView(conf(-1), NOW), opts);
    expect(venceu.detail).toContain('Para reconectar, clique em Reconectar neste cartão.');
    expect(venceu.detail).not.toContain('contato@');

    const rec = instagramConnectionTexts(instagramConnectionView(conf(20 * D, { status: 'needs_reconnect' }), NOW), opts);
    expect(rec.detail).toContain('Para reconectar, clique em Reconectar neste cartão.');
    expect(rec.detail).not.toContain('contato@');
  });

  it('vai vencer: se o aviso continuar, o botão', () => {
    const t = instagramConnectionTexts(instagramConnectionView(conf(3 * D), NOW), opts);
    expect(t.detail).toContain('Se este aviso continuar, clique em Reconectar neste cartão.');
    expect(t.detail).not.toContain('contato@');
  });

  it('sem o botão (Loja sem a chave), o texto de antes, igual', () => {
    const t = instagramConnectionTexts(instagramConnectionView(conf(3 * D), NOW), { canReconnectHere: false });
    expect(t.detail).toMatch(/A renovação automática ainda não conseguiu renovar\. Se este aviso continuar, escreva para contato@convoflow\.com\.br\.$/);
  });
});
