import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Evolution e WAHA pela tela: tudo vai para o servidor
 * (`whatsapp-send-message`), nada vai direto ao Evolution ou ao WAHA. Valores
 * inventados.
 */

const invoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } },
}));

import { EvolutionAdapter } from './evolution.adapter';
import { WahaAdapter } from './waha.adapter';
import { DESCONECTADO } from './serverSend.adapter';
import type { ProviderInstance } from './types';

const FONE = '5585999990201';
const ID = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const CAMINHO = 'aaaaaaaa-0000-4000-8000-000000000002/1761480000000-foto.jpg';

const instancia = (provider: 'evolution' | 'waha', status = 'open'): ProviderInstance => ({
  id: ID,
  tenantId: 'aaaaaaaa-0000-4000-8000-000000000002',
  name: 'Comercial',
  instanceKey: 'comercial-exemplo',
  provider,
  status,
  connectionConfig: provider === 'waha' ? { sessionName: 'sessao-exemplo' } : {},
});

const corpo = (i = 0) => (invoke.mock.calls[i] as [string, { body: Record<string, unknown> }]);
const fetchSpy = vi.fn();

beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue({ data: { ok: true, messageId: 'EVO_FAKE_SAIDA' }, error: null });
  fetchSpy.mockReset();
  vi.stubGlobal('fetch', fetchSpy);
});
afterEach(() => {
  // O navegador nunca chama o provedor direto: fetch (fora do supabase-js, que
  // está falso aqui) jamais é usado.
  expect(fetchSpy).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe.each(['evolution', 'waha'] as const)('%s pelo servidor', (provider) => {
  const adapter = (status?: string) =>
    provider === 'evolution' ? new EvolutionAdapter(instancia(provider, status)) : new WahaAdapter(instancia(provider, status ?? 'connected'));

  it('monta sem chave nenhuma e diz que o envio é do servidor', () => {
    const a = adapter();
    expect(a.getCapabilities().serverSideOnlySend).toBe(true);
    expect(a.getCapabilities().fetchHistory).toBe(false);
    expect(a.isReadyToSend()).toBe(true);
    expect(a.notReadyReason).toBeUndefined();
  });

  it('texto: o pedido vai para whatsapp-send-message com o id do número', async () => {
    const r = await adapter().sendText(FONE, 'Olá', { quotedMessageId: 'Q1' });
    expect(r).toEqual({ status: 'sent', providerMessageId: 'EVO_FAKE_SAIDA' });
    const [fn, { body }] = corpo();
    expect(fn).toBe('whatsapp-send-message');
    expect(body).toEqual({ instance_id: ID, type: 'text', to: FONE, text: 'Olá', preview_url: true, quoted_message_id: 'Q1' });
  });

  it('mídia: manda o caminho do bucket, nunca o link', async () => {
    await adapter().sendMedia(FONE, {
      mediaUrl: 'https://projeto.supabase.co/storage/v1/object/sign/whatsapp-media/x?token=FAKE',
      mediaPath: CAMINHO,
      mediaType: 'image',
      mimeType: 'image/jpeg',
      fileName: 'foto.jpg',
      caption: 'Veja',
    });
    const { body } = corpo()[1];
    expect(body).toMatchObject({ type: 'image', media_path: CAMINHO, mime_type: 'image/jpeg', file_name: 'foto.jpg', caption: 'Veja' });
    expect(JSON.stringify(body)).not.toContain('token=FAKE');
  });

  it('voz e arquivo de áudio: ptt decide', async () => {
    await adapter().sendMedia(FONE, { mediaUrl: '', mediaPath: CAMINHO, mediaType: 'audio', mimeType: 'audio/webm', ptt: true });
    await adapter().sendMedia(FONE, { mediaUrl: '', mediaPath: CAMINHO, mediaType: 'audio', mimeType: 'audio/mpeg', ptt: false });
    expect(corpo(0)[1].body).toMatchObject({ type: 'audio', ptt: true });
    expect(corpo(1)[1].body).toMatchObject({ type: 'audio', ptt: false });
  });

  it('mídia sem caminho do bucket não sai', async () => {
    const r = await adapter().sendMedia(FONE, { mediaUrl: 'https://exemplo.com/a.jpg', mediaType: 'image' });
    expect(r.status).toBe('failed');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('localização e reação', async () => {
    await adapter().sendLocation(FONE, { latitude: -3.73, longitude: -38.52, name: 'Loja' });
    await adapter().sendReaction(FONE, { messageId: 'Q1', emoji: '👍', fromMe: true });
    expect(corpo(0)[1].body).toMatchObject({ type: 'location', latitude: -3.73, longitude: -38.52, name: 'Loja' });
    expect(corpo(1)[1].body).toMatchObject({ type: 'reaction', message_id: 'Q1', emoji: '👍', from_me: true });
  });

  it('digitando, lida e arquivar', async () => {
    await adapter().setTyping(FONE, true);
    await adapter().markRead(FONE, ['Q0', 'Q1']);
    await adapter().archiveChat(FONE, true);
    expect(corpo(0)[1].body).toMatchObject({ type: 'typing', on: true });
    expect(corpo(1)[1].body).toMatchObject({ type: 'mark_read', message_id: 'Q1', message_ids: ['Q0', 'Q1'] });
    expect(corpo(2)[1].body).toMatchObject({ type: 'archive', archive: true });
  });

  it('foto de perfil e "tem WhatsApp?"', async () => {
    invoke.mockResolvedValueOnce({ data: { ok: true, url: 'https://pps.whatsapp.net/v/FAKE.jpg' }, error: null });
    invoke.mockResolvedValueOnce({ data: { ok: true, exists: true }, error: null });
    expect(await adapter().getProfilePicture(FONE)).toBe('https://pps.whatsapp.net/v/FAKE.jpg');
    expect(await adapter().checkNumberExists(FONE)).toBe(true);
  });

  it('recusa do servidor: a frase em pt-BR do corpo chega na tela', async () => {
    const context = new Response(JSON.stringify({ ok: false, reason: 'no_credentials', error: 'Este número não tem a chave salva no ConvoFlow.' }), { status: 409 });
    invoke.mockResolvedValueOnce({ data: null, error: Object.assign(new Error('Edge Function returned a non-2xx status code'), { context }) });
    const r = await adapter().sendText(FONE, 'oi');
    expect(r).toMatchObject({ status: 'failed', error: 'Este número não tem a chave salva no ConvoFlow.', reason: 'no_credentials' });
  });

  it('desconectado: não chama o servidor e diz o que fazer', async () => {
    const a = adapter(provider === 'evolution' ? 'close' : 'disconnected');
    expect(a.isReadyToSend()).toBe(false);
    expect(a.notReadyReason).toBe(DESCONECTADO);
    expect(DESCONECTADO).toBe('Este número está desconectado. Peça ao Gestor da Loja para reconectar.');
    expect((await a.sendText(FONE, 'oi')).error).toBe(DESCONECTADO);
    await a.setTyping(FONE, true);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('arquivar recusado vira erro (a tela mantém o estado local)', async () => {
    invoke.mockResolvedValueOnce({ data: { ok: false, error: 'falhou' }, error: null });
    await expect(adapter().archiveChat(FONE, true)).rejects.toThrow('falhou');
  });
});
