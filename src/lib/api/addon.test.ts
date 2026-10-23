import { describe, expect, it } from 'vitest';
import { podeLiberarApiManual, situacaoDoCartao, textoAteFimDoCiclo } from './addon';

const ativo = (motivo: 'pago' | 'ate_fim_do_ciclo' | 'manual') => ({ ativo: true, motivo, ate: null });
const desligado = { ativo: false, motivo: 'desligado' as const, ate: null };

describe('situacaoDoCartao', () => {
  const base = { status: 'active', temAssinatura: true, acessoManual: false };
  it('teste grátis', () => expect(situacaoDoCartao({ ...base, status: 'trialing', estado: desligado })).toBe('teste'));
  it('manual', () =>
    expect(situacaoDoCartao({ estado: ativo('manual'), status: null, temAssinatura: false, acessoManual: true })).toBe('manual'));
  it('sem assinatura', () =>
    expect(situacaoDoCartao({ estado: desligado, status: null, temAssinatura: false, acessoManual: false })).toBe('sem_assinatura'));
  it('cartão atrasado', () => expect(situacaoDoCartao({ ...base, status: 'past_due', estado: desligado })).toBe('past_due'));
  it('desligada', () => expect(situacaoDoCartao({ ...base, estado: desligado })).toBe('desligada'));
  it('ligada', () => expect(situacaoDoCartao({ ...base, estado: ativo('pago') })).toBe('ligada'));
  it('até o fim do ciclo', () =>
    expect(situacaoDoCartao({ ...base, estado: ativo('ate_fim_do_ciclo') })).toBe('ate_fim_do_ciclo'));
});

describe('textoAteFimDoCiclo', () => {
  it('mostra a data', () => {
    expect(textoAteFimDoCiclo('2026-11-13T15:00:00Z')).toBe('Desligada. As chaves funcionam até 13/11/2026.');
  });
});

describe('podeLiberarApiManual', () => {
  it('só com acesso manual e sem assinatura que cobra', () => {
    expect(podeLiberarApiManual({ manual_access_granted: true, subscription_status: null })).toBe(true);
    expect(podeLiberarApiManual({ manual_access_granted: true, subscription_status: 'canceled' })).toBe(true);
    for (const s of ['active', 'trialing', 'past_due']) {
      expect(podeLiberarApiManual({ manual_access_granted: true, subscription_status: s })).toBe(false);
    }
    expect(podeLiberarApiManual({ manual_access_granted: false, subscription_status: null })).toBe(false);
    expect(podeLiberarApiManual(null)).toBe(false);
  });
});
