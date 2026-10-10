import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mesmo arranjo do instagram.adapter.test: `invoke` registra, `impl` responde.
const invoke = vi.fn();
let impl: (...a: unknown[]) => unknown = async () => ({ data: null, error: null });
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: (...a: unknown[]) => {
        invoke(...a);
        return impl(...a);
      },
    },
  },
}));

import { MetaAdapter } from './meta.adapter';
import type { ProviderInstance } from './types';

const base: ProviderInstance = {
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  tenantId: 'aaaaaaaa-0000-4000-8000-000000000002',
  name: 'Número Oficial Teste',
  instanceKey: 'oficial_teste',
  provider: 'official',
  status: 'open',
  connectionConfig: { phoneNumberId: '100000000000001', wabaId: '200000000000002' },
};

/** Imita o FunctionsHttpError do supabase-js: Response original em `context`. */
function erroHttp(body: unknown) {
  return {
    message: 'Edge Function returned a non-2xx status code',
    context: { json: () => Promise.resolve(body) } as unknown as Response,
  };
}

beforeEach(() => {
  invoke.mockReset();
  impl = async () => ({ data: null, error: null });
});

describe('recusa do whatsapp-send-message', () => {
  it('mostra o motivo do servidor, não a frase genérica do supabase-js', async () => {
    impl = async () => ({
      data: null,
      error: erroHttp({
        ok: false,
        code: 131047,
        error: 'Fora da janela de 24h: este contato não te enviou mensagem nas últimas 24h.',
      }),
    });
    const r = await new MetaAdapter(base).sendText('5511999990000', 'oi');
    expect(r.status).toBe('failed');
    expect(r.error).not.toContain('non-2xx');
    expect(r.error).toContain('Fora da janela de 24 horas');
    expect(r.error).toContain('(código 131047 da Meta)');
    expect(r.errorCode).toBe('131047');
  });

  it('código que não está na skill: a frase da própria Meta, com o código', async () => {
    impl = async () => ({
      data: null,
      error: erroHttp({ ok: false, code: 131042, error: 'Business eligibility payment issue', status: 400 }),
    });
    const r = await new MetaAdapter(base).sendTemplate('5511999990000', {
      templateName: 'boas_vindas',
      language: 'pt_BR',
      bodyParams: ['Ana'],
    });
    expect(r).toMatchObject({
      status: 'failed',
      error: 'Business eligibility payment issue (código 131042 da Meta)',
      errorCode: '131042',
    });
  });

  it('recusa sem código (ex.: token ausente) mantém a frase do servidor', async () => {
    impl = async () => ({
      data: null,
      error: erroHttp({ ok: false, error: 'Token Meta não encontrado no Vault.' }),
    });
    const r = await new MetaAdapter(base).sendText('5511999990000', 'oi');
    expect(r).toEqual({
      status: 'failed',
      error: 'Token Meta não encontrado no Vault.',
      providerError: 'Token Meta não encontrado no Vault.',
    });
  });

  it('guarda a frase crua da Meta (meta_message) para gravar na linha que falhou', async () => {
    impl = async () => ({
      data: null,
      error: erroHttp({
        ok: false,
        code: 131026,
        error: 'Número não existe no WhatsApp.',
        meta_message: 'Message undeliverable: Message Undeliverable.',
      }),
    });
    const r = await new MetaAdapter(base).sendText('5511999990000', 'oi');
    expect(r.providerError).toBe('Message undeliverable: Message Undeliverable.');
    expect(r.error).toContain('(código 131026 da Meta)');
  });

  it('servidor fora do ar: aviso legível, sem instrução de desenvolvedor', async () => {
    impl = async () => {
      throw new Error('Failed to fetch');
    };
    const r = await new MetaAdapter(base).sendText('5511999990000', 'oi');
    expect(r.status).toBe('failed');
    expect(r.error).toContain('servidor de envio');
    expect(r.error).not.toContain('implemente');
  });
});

describe('envio aceito', () => {
  it('devolve o wamid e o telefone que a Meta confirmou (wa_id)', async () => {
    impl = async () => ({
      data: {
        ok: true,
        messageId: 'wamid.FAKE1',
        raw: { contacts: [{ input: '+5511999990000', wa_id: '551199990000' }], messages: [{ id: 'wamid.FAKE1' }] },
      },
      error: null,
    });
    const r = await new MetaAdapter(base).sendTemplate('5511999990000', {
      templateName: 'boas_vindas',
      language: 'pt_BR',
      bodyParams: ['Ana'],
    });
    expect(invoke).toHaveBeenCalledWith('whatsapp-send-message', {
      body: expect.objectContaining({
        instance_id: base.id,
        type: 'template',
        to: '5511999990000',
        template_name: 'boas_vindas',
        template_language: 'pt_BR',
        template_body_params: ['Ana'],
      }),
    });
    expect(r).toEqual({ status: 'sent', providerMessageId: 'wamid.FAKE1', recipientId: '551199990000' });
  });
});
