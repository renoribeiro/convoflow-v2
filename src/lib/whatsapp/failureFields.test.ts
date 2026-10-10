/**
 * Mensagem que falha guarda o motivo (migração 20261008000001). Os dois lados
 * que gravam: o servidor (meta-webhook / whatsapp-send-message, pelo helper de
 * _shared) e o navegador (ChatWindow e sendInstagramReply, por camposDaFalha).
 */
import { describe, it, expect } from 'vitest';
import { camposDaFalha } from './failureFields';
import {
  camposDaFalhaMeta,
  camposDoStatusFalho,
} from '../../../supabase/functions/_shared/meta-error-fields.ts';

describe('servidor: erro da Meta vira código + mensagem crua', () => {
  it('status failed do webhook: primeiro erro, com o detalhe da Meta', () => {
    const status = {
      id: 'wamid.FAKE1',
      status: 'failed',
      errors: [
        {
          code: 131026,
          title: 'Message undeliverable',
          message: 'Message undeliverable',
          error_data: { details: 'Message Undeliverable.' },
        },
      ],
    };
    expect(camposDoStatusFalho(status)).toEqual({
      error_code: '131026',
      error_message: 'Message undeliverable: Message Undeliverable.',
    });
  });

  it('resposta de erro do POST /messages: mensagem sem detalhe repetido', () => {
    expect(
      camposDaFalhaMeta({ code: 132001, message: '(#132001) Template name does not exist in the translation' }),
    ).toEqual({
      error_code: '132001',
      error_message: '(#132001) Template name does not exist in the translation',
    });
  });

  it('status failed sem errors[] não inventa motivo', () => {
    expect(camposDoStatusFalho({ id: 'wamid.FAKE1', status: 'failed' })).toEqual({
      error_code: null,
      error_message: null,
    });
    expect(camposDaFalhaMeta(null)).toEqual({ error_code: null, error_message: null });
  });

  it('mensagem enorme é cortada em 1000 caracteres', () => {
    const r = camposDaFalhaMeta({ code: 131000, message: 'x'.repeat(5000) });
    expect(r.error_message).toHaveLength(1000);
  });
});

describe('navegador: resultado do adapter vira as colunas', () => {
  it('Meta: código e mensagem crua da Meta, não a frase da tela', () => {
    expect(
      camposDaFalha({
        status: 'failed',
        error: 'Fora da janela de 24 horas… (código 131047 da Meta)',
        errorCode: '131047',
        providerError: 'Re-engagement message',
      }),
    ).toEqual({ error_code: '131047', error_message: 'Re-engagement message' });
  });

  it('Instagram: o motivo estável do adapter vira o código', () => {
    expect(
      camposDaFalha({ status: 'failed', reason: 'outside_window', error: 'O cliente não escreve há mais de 24 horas.' }),
    ).toEqual({ error_code: 'outside_window', error_message: 'O cliente não escreve há mais de 24 horas.' });
  });

  it('sem nada informado, as colunas ficam nulas', () => {
    expect(camposDaFalha({ status: 'failed' })).toEqual({ error_code: null, error_message: null });
    expect(camposDaFalha(null)).toEqual({ error_code: null, error_message: null });
  });
});
