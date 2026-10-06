/**
 * O erro do servidor tem que chegar na tela.
 *
 * Duas vezes em 2026-08-18 a mensagem real morreu no caminho e virou
 * "Edge Function returned a non-2xx status code" — que não diz nada e custou
 * horas de investigação. Estes testes travam o comportamento.
 */

import { describe, it, expect } from 'vitest';
import { mensagemDaEdgeFunction } from './edgeFunctionError';

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

  it('sem erro reconhecível, usa o fallback', async () => {
    expect(await mensagemDaEdgeFunction(null, 'fallback')).toBe('fallback');
    expect(await mensagemDaEdgeFunction({ context: {} }, 'fallback')).toBe('fallback');
  });
});
