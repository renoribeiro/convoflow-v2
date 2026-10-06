import { describe, it, expect, vi, beforeEach } from 'vitest';

// `invoke` só REGISTRA as chamadas; o comportamento vem de `impl`. Separados
// de propósito: no Vitest 4, um vi.fn que lança/rejeita depois de mockReset é
// reportado como erro do teste mesmo quando o código o trata.
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

import { InstagramAdapter } from './instagram.adapter';
import { adapterFor } from './factory';
import { WhatsAppAdapterError, type ProviderInstance } from './types';

const base: ProviderInstance = {
  id: 'cccccccc-0000-4000-8000-000000000003',
  tenantId: 't-1',
  name: 'Instagram Teste',
  instanceKey: 'instagram_17841419262135883',
  provider: 'instagram',
  status: 'connected',
  connectionConfig: { igAccountId: '17841419262135883', tokenExpiresAt: '2099-01-01T00:00:00Z' },
};

beforeEach(() => {
  invoke.mockReset();
  impl = async () => ({ data: null, error: null });
});

describe('fábrica', () => {
  it('provider instagram vira InstagramAdapter (nunca o default de Evolution)', () => {
    const a = adapterFor(base);
    expect(a).toBeInstanceOf(InstagramAdapter);
    expect(a.type).toBe('instagram');
  });

  it('sem igAccountId, o construtor lança (e a conversa fica sem instância)', () => {
    expect(() => adapterFor({ ...base, connectionConfig: {} })).toThrow(WhatsAppAdapterError);
  });
});

describe('capacidades', () => {
  it('só texto: nada de template, mídia, histórico, digitação', () => {
    const c = new InstagramAdapter(base).getCapabilities();
    expect(c.templates).toBe(false);
    expect(c.requiresTemplateOutsideWindow).toBe(false);
    expect(c.fetchHistory).toBe(false);
    expect(c.typingIndicator).toBe(false);
    expect(c.serverSideOnlySend).toBe(true);
  });
});

describe('sendText', () => {
  it('chama instagram-send-message (e não o whatsapp-send-message) com IGSID e texto', async () => {
    impl = async () => ({ data: { ok: true, messageId: 'mid.X' }, error: null });
    const r = await new InstagramAdapter(base).sendText('978239761327698', 'Olá!');
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('instagram-send-message', {
      body: { instance_id: base.id, to: '978239761327698', text: 'Olá!' },
    });
    expect(r).toEqual({ status: 'sent', providerMessageId: 'mid.X' });
  });

  it('recusa da função vira failed com reason e a mensagem pt-BR', async () => {
    impl = async () => ({
      data: { ok: false, reason: 'outside_window', error: 'O cliente não escreve há mais de 24 horas.' },
      error: null,
    });
    const r = await new InstagramAdapter(base).sendText('978239761327698', 'oi');
    expect(r.status).toBe('failed');
    expect(r.reason).toBe('outside_window');
    expect(r.error).toContain('24 horas');
  });

  it('não-2xx: lê o corpo da função quando dá', async () => {
    const context = new Response(JSON.stringify({ reason: 'forbidden', error: 'Você não tem acesso.' }), { status: 403 });
    impl = async () => ({ data: null, error: { message: 'non-2xx', context } });
    const r = await new InstagramAdapter(base).sendText('978239761327698', 'oi');
    expect(r).toMatchObject({ status: 'failed', reason: 'forbidden', error: 'Você não tem acesso.' });
  });

  it('mais de 1000 bytes: recusa sem chamar a função', async () => {
    const r = await new InstagramAdapter(base).sendText('978239761327698', 'á'.repeat(501));
    expect(invoke).not.toHaveBeenCalled();
    expect(r).toMatchObject({ status: 'failed', reason: 'too_long' });
  });

  it('instância inativa: recusa sem chamar a função', async () => {
    const r = await new InstagramAdapter({ ...base, status: 'disconnected' }).sendText('1', 'oi');
    expect(invoke).not.toHaveBeenCalled();
    expect(r.status).toBe('failed');
  });

  it('exceção de rede vira failed, não estoura', async () => {
    impl = () => Promise.reject(new TypeError('Failed to fetch'));
    const r = await new InstagramAdapter(base).sendText('978239761327698', 'oi');
    expect(r).toMatchObject({ status: 'failed', reason: 'network_error' });
  });
});

describe('o que o Instagram não faz por aqui', () => {
  it('mídia, localização e reação são recusadas', async () => {
    const a = new InstagramAdapter(base);
    await expect(a.sendMedia()).rejects.toMatchObject({ code: 'CAPABILITY_UNSUPPORTED' });
    await expect(a.sendLocation()).rejects.toMatchObject({ code: 'CAPABILITY_UNSUPPORTED' });
    await expect(a.sendReaction()).rejects.toMatchObject({ code: 'CAPABILITY_UNSUPPORTED' });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('digitação, leitura e foto de perfil não chamam nada', async () => {
    const a = new InstagramAdapter(base);
    await a.setTyping();
    await a.markRead();
    expect(await a.getProfilePicture()).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });
});
