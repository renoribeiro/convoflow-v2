/**
 * Regras das vagas de Loja extras (edge function `update-store-slots` e o
 * `stripe-webhook`).
 *
 * O módulo testado vive em supabase/functions/_shared porque roda no Deno, mas
 * não importa nada do Deno — mesma convenção de `store-creation.ts`.
 *
 * O caso que estes testes existem para impedir: a Conta PERDER capacidade. O
 * webhook antigo atribuía `store_slots_extra` a partir do metadata da sessão,
 * então um segundo checkout de "+1" gravava 1 por cima de um 3 e a Conta ficava
 * com Lojas acima do teto, em silêncio.
 */
import { describe, it, expect } from 'vitest';

import {
  authorizeSlotChange,
  checkCapacityFits,
  findSlotItem,
  planSlotChange,
  slotIdempotencyKey,
  slotQuantityFromSubscription,
  validateSlotQuantity,
  SLOT_MAX,
  SLOT_PURCHASE_CAPABILITY,
  type SlotAccountRow,
  type SlotCaller,
  type SubscriptionLike,
} from '../../../supabase/functions/_shared/store-slots.ts';

const PRICE_SLOT = 'price_slot_123';
const PRICE_PLANO = 'price_plano_999';

const assinatura = (qtd: number | null | undefined, comItem = true): SubscriptionLike => ({
  items: {
    data: [
      { id: 'si_plano', quantity: 1, price: { id: PRICE_PLANO } },
      ...(comItem ? [{ id: 'si_slot', quantity: qtd as number, price: { id: PRICE_SLOT } }] : []),
    ],
  },
});

const gerente: SlotCaller = {
  role: 'gerente',
  tenant_id: 'conta-1',
  status: 'active',
  capabilities: null,
};

const conta: SlotAccountRow = {
  id: 'conta-1',
  kind: 'account',
  subscription_id: 'sub_1',
  subscription_status: 'active',
  store_slots_included: 5,
  store_slots_extra: 2,
};

describe('quem pode mexer nas vagas', () => {
  it('gerente com assinatura ativa pode', () => {
    expect(authorizeSlotChange(gerente, conta)).toEqual({ ok: true });
  });

  it('a capability é billing.view, não billing.manage', () => {
    // billing.manage é verdadeira para o GESTOR (sobrou do modelo antigo, em
    // que a Loja assinava). Usar ela aqui deixaria o gestor mexer na conta.
    expect(SLOT_PURCHASE_CAPABILITY).toBe('billing.view');
  });

  it.each(['gestor', 'atendente'])('%s não pode', (papel) => {
    const r = authorizeSlotChange({ ...gerente, role: papel }, conta);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });

  it('perfil suspenso não pode', () => {
    const r = authorizeSlotChange({ ...gerente, status: 'suspended' }, conta);
    expect(r.ok).toBe(false);
  });

  it('Loja não contrata vaga — só a Conta', () => {
    const r = authorizeSlotChange(gerente, { ...conta, kind: 'store' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/pela Conta, não pela Loja/i);
  });

  it('sem assinatura ativa, manda assinar primeiro', () => {
    const r = authorizeSlotChange(gerente, { ...conta, subscription_status: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(409);
  });

  it('assinatura ativa sem id também é recusada', () => {
    const r = authorizeSlotChange(gerente, { ...conta, subscription_id: null });
    expect(r.ok).toBe(false);
  });

  // Teste grátis (2026-09-26): quem está no teste já tem assinatura e pode
  // contratar Loja adicional (o item também fica sem custo até o fim do teste).
  it('Conta no teste grátis pode contratar', () => {
    expect(authorizeSlotChange(gerente, { ...conta, subscription_status: 'trialing' })).toEqual({ ok: true });
  });

  it('pagamento pendente (past_due): recusa e manda atualizar o cartão', () => {
    const r = authorizeSlotChange(gerente, { ...conta, subscription_status: 'past_due' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(409);
      expect(r.error).toMatch(/Atualize o cartão/);
    }
  });

  it.each(['canceled', 'unpaid', 'incomplete', 'paused'])('assinatura %s não contrata', (status) => {
    const r = authorizeSlotChange(gerente, { ...conta, subscription_status: status });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(409);
  });
});

describe('quantidade pedida', () => {
  it('aceita inteiro dentro da faixa', () => {
    expect(validateSlotQuantity(3)).toEqual({ ok: true, value: 3 });
    expect(validateSlotQuantity(0)).toEqual({ ok: true, value: 0 });
    expect(validateSlotQuantity(SLOT_MAX)).toEqual({ ok: true, value: SLOT_MAX });
  });

  it.each([-1, 1.5, NaN, 'abc', SLOT_MAX + 1])('recusa %p', (v) => {
    expect(validateSlotQuantity(v).ok).toBe(false);
  });

  it('recusa o que Number() converteria para 0 por descuido', () => {
    // null, '', false e [] viram 0 no Number(). Aceitar isso significaria
    // "apague todas as vagas extras" por omissao de campo -- exatamente o tipo
    // de perda de capacidade que este modulo existe para impedir.
    for (const v of [null, undefined, '', '   ', false, [], {}]) {
      expect(validateSlotQuantity(v as unknown).ok, `${JSON.stringify(v)}`).toBe(false);
    }
  });

  it('aceita string numerica, que e o que chega de um <input type=number>', () => {
    expect(validateSlotQuantity('4')).toEqual({ ok: true, value: 4 });
  });
});

describe('não deixar a Conta perder capacidade', () => {
  it('reduzir abaixo das Lojas em uso é recusado', () => {
    // 5 incluídas + 0 extras = 5 vagas, mas há 8 Lojas.
    const r = checkCapacityFits(0, 5, 8);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/8 Lojas em uso/);
  });

  it('reduzir até o exato número de Lojas em uso é permitido', () => {
    expect(checkCapacityFits(0, 5, 5)).toEqual({ ok: true });
  });

  it('aumentar sempre cabe', () => {
    expect(checkCapacityFits(10, 5, 8)).toEqual({ ok: true });
  });

  it('trata included nulo como zero', () => {
    expect(checkCapacityFits(2, null, 3).ok).toBe(false);
    expect(checkCapacityFits(3, null, 3).ok).toBe(true);
  });
});

describe('derivar a quantidade da assinatura (fim da atribuição por metadata)', () => {
  it('lê a quantidade do item de vaga', () => {
    expect(slotQuantityFromSubscription(assinatura(3), PRICE_SLOT)).toBe(3);
  });

  it('assinatura sem item de vaga vale zero, não erro', () => {
    expect(slotQuantityFromSubscription(assinatura(0, false), PRICE_SLOT)).toBe(0);
  });

  it('ignora o item do plano', () => {
    expect(findSlotItem(assinatura(3), PRICE_SLOT)?.id).toBe('si_slot');
    expect(slotQuantityFromSubscription(assinatura(3), PRICE_PLANO)).toBe(1);
  });

  it('quantidade ausente, negativa ou não numérica vira zero', () => {
    expect(slotQuantityFromSubscription(assinatura(null), PRICE_SLOT)).toBe(0);
    expect(slotQuantityFromSubscription(assinatura(-2), PRICE_SLOT)).toBe(0);
    expect(slotQuantityFromSubscription(undefined, PRICE_SLOT)).toBe(0);
  });

  it('derivar é idempotente: o mesmo evento duas vezes dá o mesmo número', () => {
    const sub = assinatura(4);
    expect(slotQuantityFromSubscription(sub, PRICE_SLOT)).toBe(4);
    expect(slotQuantityFromSubscription(sub, PRICE_SLOT)).toBe(4);
  });
});

describe('o que fazer no Stripe', () => {
  it('sem item e querendo vagas: cria', () => {
    expect(planSlotChange(assinatura(0, false), PRICE_SLOT, 2)).toEqual({
      acao: 'criar',
      quantidade: 2,
    });
  });

  it('com item e quantidade diferente: atualiza', () => {
    expect(planSlotChange(assinatura(2), PRICE_SLOT, 5)).toEqual({
      acao: 'atualizar',
      itemId: 'si_slot',
      quantidade: 5,
    });
  });

  it('zerar remove o item em vez de deixar quantidade zero na fatura', () => {
    expect(planSlotChange(assinatura(2), PRICE_SLOT, 0)).toEqual({
      acao: 'remover',
      itemId: 'si_slot',
    });
  });

  it('pedir o que já existe não mexe em nada', () => {
    expect(planSlotChange(assinatura(3), PRICE_SLOT, 3)).toEqual({ acao: 'nada' });
    expect(planSlotChange(assinatura(0, false), PRICE_SLOT, 0)).toEqual({ acao: 'nada' });
  });

  it('o pedido é um TOTAL, não um incremento — 3 para quem tem 3 é no-op', () => {
    // A confusão entre "somar 3" e "ficar com 3" foi a origem do defeito de
    // atribuição no webhook. Aqui o contrato é explícito: total.
    expect(planSlotChange(assinatura(3), PRICE_SLOT, 3).acao).toBe('nada');
    expect(planSlotChange(assinatura(3), PRICE_SLOT, 6)).toMatchObject({ quantidade: 6 });
  });
});

describe('idempotência do pedido', () => {
  it('o mesmo pedido gera a mesma chave', () => {
    expect(slotIdempotencyKey('t1', 'sub_1', 3)).toBe(slotIdempotencyKey('t1', 'sub_1', 3));
  });

  it('pedidos diferentes geram chaves diferentes', () => {
    expect(slotIdempotencyKey('t1', 'sub_1', 3)).not.toBe(slotIdempotencyKey('t1', 'sub_1', 4));
    expect(slotIdempotencyKey('t1', 'sub_1', 3)).not.toBe(slotIdempotencyKey('t2', 'sub_1', 3));
  });
});
