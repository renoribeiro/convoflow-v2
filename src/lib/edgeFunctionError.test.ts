/**
 * O erro do servidor tem que chegar na tela.
 *
 * Duas vezes em 2026-08-18 a mensagem real morreu no caminho e virou
 * "Edge Function returned a non-2xx status code" — que não diz nada e custou
 * horas de investigação. Estes testes travam o comportamento.
 */

import { describe, it, expect } from 'vitest';
import { corpoDaEdgeFunction, mensagemDaEdgeFunction } from './edgeFunctionError';

/** Imita o FunctionsHttpError do supabase-js: Response original em `context`. */
function erroHttp(body: unknown) {
  return {
    message: 'Edge Function returned a non-2xx status code',
    context: { json: () => Promise.resolve(body) } as unknown as Response,
  };
}

describe('mensagemDaEdgeFunction', () => {
  it('abre o corpo e devolve a frase do createErrorResponse', async () => {
    const erro = erroHttp({
      error: { message: 'Limite de envio de e-mail atingido.', code: 'EMAIL_RATE_LIMIT' },
    });
    expect(await mensagemDaEdgeFunction(erro, 'fallback')).toBe(
      'Limite de envio de e-mail atingido.',
    );
  });

  it('aceita o formato antigo, com error como string', async () => {
    const erro = erroHttp({ error: 'Esta loja não pertence à sua conta.' });
    expect(await mensagemDaEdgeFunction(erro, 'fallback')).toBe(
      'Esta loja não pertence à sua conta.',
    );
  });

  it('NUNCA deixa passar a frase genérica do supabase-js', async () => {
    const erro = { message: 'Edge Function returned a non-2xx status code' };
    expect(await mensagemDaEdgeFunction(erro, 'Não foi possível concluir a ação.')).toBe(
      'Não foi possível concluir a ação.',
    );
  });

  it('corpo vazio ou ilegível cai no fallback, não estoura', async () => {
    const erro = {
      message: 'Edge Function returned a non-2xx status code',
      context: { json: () => Promise.reject(new Error('not json')) } as unknown as Response,
    };
    expect(await mensagemDaEdgeFunction(erro, 'fallback')).toBe('fallback');
  });

  it('erro comum de rede mantém a própria mensagem', async () => {
    const erro = new Error('Failed to fetch');
    expect(await mensagemDaEdgeFunction(erro, 'fallback')).toBe('Failed to fetch');
  });

  it('com soDoServidor, erro de rede do supabase-js cai no fallback (sem inglês)', async () => {
    const erro = new Error('Failed to send a request to the Edge Function');
    expect(await mensagemDaEdgeFunction(erro, 'fallback', { soDoServidor: true })).toBe('fallback');
  });

  it('com soDoServidor, a frase do servidor continua passando', async () => {
    const erro = Object.assign(new Error('Edge Function returned a non-2xx status code'), {
      context: new Response(JSON.stringify({ error: { message: 'Limite de envio de e-mail atingido.' } })),
    });
    expect(await mensagemDaEdgeFunction(erro, 'fallback', { soDoServidor: true })).toBe(
      'Limite de envio de e-mail atingido.',
    );
  });

  it('sem erro reconhecível, usa o fallback', async () => {
    expect(await mensagemDaEdgeFunction(null, 'fallback')).toBe('fallback');
    expect(await mensagemDaEdgeFunction({ context: {} }, 'fallback')).toBe('fallback');
  });
});

describe('corpoDaEdgeFunction', () => {
  it('devolve o corpo inteiro, com os campos além da frase (ex.: o código da Meta)', async () => {
    const erro = erroHttp({ ok: false, code: 131047, error: 'Fora da janela de 24h.' });
    expect(await corpoDaEdgeFunction(erro)).toEqual({
      ok: false,
      code: 131047,
      error: 'Fora da janela de 24h.',
    });
  });

  it('sem corpo legível, devolve null em vez de estourar', async () => {
    const ilegivel = {
      message: 'Edge Function returned a non-2xx status code',
      context: { json: () => Promise.reject(new Error('not json')) } as unknown as Response,
    };
    expect(await corpoDaEdgeFunction(ilegivel)).toBeNull();
    expect(await corpoDaEdgeFunction(new Error('Failed to fetch'))).toBeNull();
    expect(await corpoDaEdgeFunction(null)).toBeNull();
  });
});
