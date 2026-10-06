/**
 * `deriveExtraSlots` (edge function `stripe-webhook`): só a RELEITURA da
 * assinatura no Stripe pode virar null. A DERIVAÇÃO lança.
 *
 * O caso que estes testes existem para impedir: um defeito de código na
 * derivação ser engolido e virar "inalterado" em silêncio. Foi o que aconteceu
 * de 2026-08-18 a 2026-09-16 (função chamada sem import → ReferenceError →
 * mesmo catch da chamada ao Stripe → null → coluna nunca escrita). Com a
 * derivação fora do try, o erro sobe, o handler responde 500 e o Stripe
 * reenvia o evento.
 *
 * O módulo testado vive em supabase/functions/_shared porque roda no Deno, mas
 * não importa nada do Deno — mesma convenção de `storeSlots.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { deriveExtraSlots } from '../../../supabase/functions/_shared/stripe-slot-sync.ts';

const PRICE = 'price_vaga';
const SUB_ID = 'sub_123';

function assinaturaCom(quantidade: number) {
  return { id: SUB_ID, items: { data: [{ id: 'si_1', price: { id: PRICE }, quantity: quantidade }] } };
}

describe('deriveExtraSlots', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    consoleError.mockRestore();
  });

  describe('caminho feliz (não pode mudar)', () => {
    it('devolve a quantidade do item de vaga da assinatura', async () => {
      const fetch = vi.fn(async () => assinaturaCom(3));
      await expect(deriveExtraSlots(fetch, SUB_ID, PRICE)).resolves.toBe(3);
      expect(fetch).toHaveBeenCalledWith(SUB_ID);
      expect(consoleError).not.toHaveBeenCalled();
    });

    it('assinatura sem item de vaga é 0, não null (Conta só com o plano base)', async () => {
      const fetch = vi.fn(async () => ({ id: SUB_ID, items: { data: [] } }));
      await expect(deriveExtraSlots(fetch, SUB_ID, PRICE)).resolves.toBe(0);
    });

    it('sem Price de vaga configurado devolve null SEM consultar o Stripe', async () => {
      const fetch = vi.fn(async () => assinaturaCom(3));
      await expect(deriveExtraSlots(fetch, SUB_ID, '')).resolves.toBeNull();
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('releitura no Stripe falha (transitório → null, não lança)', () => {
    it('devolve null e não lança', async () => {
      const fetch = vi.fn(async () => {
        throw new Error('connection timed out');
      });
      await expect(deriveExtraSlots(fetch, SUB_ID, PRICE)).resolves.toBeNull();
    });

    it('registra o NOME e a mensagem do erro, com o id da assinatura', async () => {
      const err = new Error('rate limited');
      err.name = 'StripeRateLimitError';
      const fetch = vi.fn(async () => {
        throw err;
      });
      await deriveExtraSlots(fetch, SUB_ID, PRICE);

      expect(consoleError).toHaveBeenCalledTimes(1);
      const linha = String(consoleError.mock.calls[0][0]);
      expect(linha).toContain('[StripeRateLimitError]');
      expect(linha).toContain('rate limited');
      expect(linha).toContain(SUB_ID);
    });

    it('não quebra quando o que foi lançado não é um Error', async () => {
      const fetch = vi.fn(async () => {
        throw 'string solta';
      });
      await expect(deriveExtraSlots(fetch, SUB_ID, PRICE)).resolves.toBeNull();
      const linha = String(consoleError.mock.calls[0][0]);
      expect(linha).toContain('[Error]');
      expect(linha).toContain('string solta');
    });
  });

  describe('derivação lança (defeito de código → propaga, NÃO vira null)', () => {
    it('propaga o erro da derivação em vez de devolver null', async () => {
      // `items.data` como objeto em vez de array: `.find` não existe → TypeError
      // dentro de slotQuantityFromSubscription. Simula um defeito de código do
      // mesmo tipo do ReferenceError de agosto: não é falha de rede, é bug.
      const fetch = vi.fn(async () => ({ id: SUB_ID, items: { data: {} } }));
      await expect(deriveExtraSlots(fetch, SUB_ID, PRICE)).rejects.toBeInstanceOf(TypeError);
    });

    it('a falha da derivação não é registrada como se fosse falha do Stripe', async () => {
      const fetch = vi.fn(async () => ({ id: SUB_ID, items: { data: {} } }));
      await deriveExtraSlots(fetch, SUB_ID, PRICE).catch(() => {});
      // Quem loga esse erro é o catch do serve(), que também responde 500.
      expect(consoleError).not.toHaveBeenCalled();
    });
  });
});
