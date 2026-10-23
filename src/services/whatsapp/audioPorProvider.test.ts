/**
 * Áudio por provider: mensagem de VOZ (gravada) x ARQUIVO de áudio (anexado),
 * e a citação de resposta com o id do WhatsApp.
 *
 *  - Meta (oficial): edge function `whatsapp-send-message` monta
 *    `audio: { link, voice: true }` só para OGG/Opus gravado; nada de legenda.
 *  - Evolution: voz → /message/sendWhatsAppAudio (encoding); arquivo →
 *    /message/sendMedia com mediatype 'audio'.
 *  - WAHA: voz → /api/sendVoice (convert só se não for OGG/Opus); arquivo →
 *    /api/sendFile. /api/sendAudio não existe no WAHA.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---- Meta: invoke da edge function -------------------------------------------
const invoke = vi.fn(async () => ({ data: { ok: true, messageId: 'wamid.FAKE_SAIDA' }, error: null }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invoke(...(a as [])) } },
}));

// ---- Evolution: serviço falso --------------------------------------------------
const evo = {
  sendMessage: vi.fn(async () => ({ key: { id: 'EVO_FAKE_SAIDA' } })),
  sendAudioMessage: vi.fn(async () => ({ key: { id: 'EVO_FAKE_VOZ' } })),
  sendAudioFileMessage: vi.fn(async () => ({ key: { id: 'EVO_FAKE_ARQ' } })),
  sendImageMessage: vi.fn(async () => ({ key: { id: 'EVO_FAKE_IMG' } })),
  sendVideoMessage: vi.fn(async () => ({ key: { id: 'EVO_FAKE_VID' } })),
  sendDocumentMessage: vi.fn(async () => ({ key: { id: 'EVO_FAKE_DOC' } })),
  sendStickerMessage: vi.fn(async () => ({ key: { id: 'EVO_FAKE_STK' } })),
};
vi.mock('@/services/evolutionApi', () => ({
  EvolutionApiService: class {},
  createEvolutionApiService: () => evo,
}));

import { MetaAdapter } from './meta.adapter';
import { EvolutionAdapter } from './evolution.adapter';
import { WahaAdapter } from './waha.adapter';
import type { ProviderInstance } from './types';
import {
  ERRO_FORMATO_AUDIO_META,
  montarAudioMeta,
} from '../../../supabase/functions/whatsapp-send-message/audio.ts';

const URL_VOZ = 'https://projeto.supabase.co/storage/v1/object/public/whatsapp-media/t/1-voz-1.ogg';
const URL_MP3 = 'https://projeto.supabase.co/storage/v1/object/public/whatsapp-media/t/1-recado.mp3';
const FONE = '5511999990000';

const instancia = (provider: ProviderInstance['provider'], connectionConfig: Record<string, unknown>): ProviderInstance => ({
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  tenantId: 'aaaaaaaa-0000-4000-8000-000000000002',
  name: 'Número Teste',
  instanceKey: 'teste',
  provider,
  status: 'open',
  connectionConfig,
});

beforeEach(() => {
  invoke.mockClear();
  Object.values(evo).forEach((f) => f.mockClear());
});

// =============================================================================
describe('Meta (oficial): montarAudioMeta, o objeto audio da Graph API', () => {
  it('gravação OGG/Opus com ptt vira mensagem de voz (voice: true)', () => {
    expect(montarAudioMeta({ media_url: URL_VOZ, mime_type: 'audio/ogg', ptt: true })).toEqual({
      ok: true,
      audio: { link: URL_VOZ, voice: true },
    });
  });

  it('aceita o tipo com parâmetros (audio/ogg; codecs=opus)', () => {
    const r = montarAudioMeta({ media_url: URL_VOZ, mime_type: 'audio/ogg; codecs=opus', ptt: true });
    expect(r).toEqual({ ok: true, audio: { link: URL_VOZ, voice: true } });
  });

  it('arquivo anexado (sem ptt) vai como áudio comum, mesmo sendo OGG', () => {
    expect(montarAudioMeta({ media_url: URL_VOZ, mime_type: 'audio/ogg', ptt: false })).toEqual({
      ok: true,
      audio: { link: URL_VOZ },
    });
  });

  it('ptt com MP3 ou M4A NÃO marca voice (a Meta só aceita voz em OGG/Opus)', () => {
    for (const mime of ['audio/mpeg', 'audio/mp4', 'audio/aac']) {
      expect(montarAudioMeta({ media_url: URL_MP3, mime_type: mime, ptt: true })).toEqual({
        ok: true,
        audio: { link: URL_MP3 },
      });
    }
  });

  it('WebM e WAV são recusados antes de chamar a Meta, com frase em pt-BR', () => {
    for (const mime of ['audio/webm', 'audio/webm;codecs=opus', 'audio/wav']) {
      expect(montarAudioMeta({ media_url: URL_VOZ, mime_type: mime, ptt: true })).toEqual({
        ok: false,
        error: ERRO_FORMATO_AUDIO_META,
      });
    }
  });

  it('sem media_url é erro', () => {
    expect(montarAudioMeta({ mime_type: 'audio/ogg' })).toEqual({ ok: false, error: 'media_url obrigatório' });
  });

  it('nunca leva legenda nem nome de arquivo (o objeto audio da Meta não tem)', () => {
    const r = montarAudioMeta({ media_url: URL_MP3, mime_type: 'audio/mpeg', ...({ caption: 'oi', file_name: 'x.mp3' } as object) });
    expect(r.ok && Object.keys(r.audio).sort()).toEqual(['link']);
  });
});

describe('Meta (oficial): o adapter repassa voz, tipo e citação', () => {
  const meta = () => new MetaAdapter(instancia('official', { phoneNumberId: '100000000000001' }));

  it('mensagem de voz: type audio, ptt true, tipo audio/ogg, sem legenda', async () => {
    await meta().sendMedia(FONE, { mediaUrl: URL_VOZ, mediaType: 'audio', mimeType: 'audio/ogg', ptt: true });
    expect(invoke).toHaveBeenCalledWith('whatsapp-send-message', {
      body: expect.objectContaining({ type: 'audio', ptt: true, mime_type: 'audio/ogg', media_url: URL_VOZ }),
    });
    const corpo = (invoke.mock.calls[0] as unknown as [string, { body: Record<string, unknown> }])[1].body;
    expect(corpo.caption).toBeUndefined();
  });

  it('anexo do chat (bucket privado): manda o caminho, e o servidor assina com o token de quem envia', async () => {
    await meta().sendMedia(FONE, {
      mediaUrl: 'https://projeto.supabase.co/storage/v1/object/sign/whatsapp-media/t/1-voz-1.ogg?token=FAKE',
      mediaPath: 't/1-voz-1.ogg',
      mediaType: 'audio',
      mimeType: 'audio/ogg',
      ptt: true,
    });
    const corpo = (invoke.mock.calls[0] as unknown as [string, { body: Record<string, unknown> }])[1].body;
    expect(corpo.media_path).toBe('t/1-voz-1.ogg');
  });

  it('citação vai com o wamid', async () => {
    await meta().sendText(FONE, 'resposta', { quotedMessageId: 'wamid.FAKE_CLIENTE' });
    const corpo = (invoke.mock.calls[0] as unknown as [string, { body: Record<string, unknown> }])[1].body;
    expect(corpo.quoted_message_id).toBe('wamid.FAKE_CLIENTE');
  });
});

// =============================================================================
describe('Evolution', () => {
  const evolution = () => new EvolutionAdapter(instancia('evolution', { baseUrl: 'https://evo.exemplo.com.br', apiKey: 'chave-falsa' }));

  it('gravação vai como mensagem de voz (sendWhatsAppAudio com encoding)', async () => {
    const r = await evolution().sendMedia(FONE, { mediaUrl: URL_VOZ, mediaType: 'audio', mimeType: 'audio/ogg', ptt: true });
    expect(evo.sendAudioMessage).toHaveBeenCalledWith('teste', FONE, URL_VOZ, { encoding: true });
    expect(evo.sendAudioFileMessage).not.toHaveBeenCalled();
    expect(r).toEqual({ providerMessageId: 'EVO_FAKE_VOZ', status: 'sent' });
  });

  it('arquivo anexado vai como ARQUIVO de áudio (sendMedia mediatype audio), com citação', async () => {
    await evolution().sendMedia(FONE, {
      mediaUrl: URL_MP3,
      mediaType: 'audio',
      mimeType: 'audio/mpeg',
      fileName: 'recado.mp3',
      quotedMessageId: 'EVO_FAKE_CLIENTE',
    });
    expect(evo.sendAudioMessage).not.toHaveBeenCalled();
    expect(evo.sendAudioFileMessage).toHaveBeenCalledWith('teste', FONE, URL_MP3, {
      mimetype: 'audio/mpeg',
      fileName: 'recado.mp3',
      quoted: { key: { id: 'EVO_FAKE_CLIENTE' } },
    });
  });

  it('texto respondendo cita pelo key.id do WhatsApp', async () => {
    await evolution().sendText(FONE, 'resposta', { quotedMessageId: 'EVO_FAKE_CLIENTE' });
    expect(evo.sendMessage).toHaveBeenCalledWith('teste', FONE, 'resposta', {
      quoted: { key: { id: 'EVO_FAKE_CLIENTE' } },
      linkPreview: undefined,
    });
  });

  it('texto sem resposta não manda quoted', async () => {
    await evolution().sendText(FONE, 'oi');
    expect(evo.sendMessage).toHaveBeenCalledWith('teste', FONE, 'oi', { quoted: undefined, linkPreview: undefined });
  });
});

// =============================================================================
describe('WAHA', () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'true_5511999990000@c.us_FAKE' }), { status: 200 }));
  beforeEach(() => {
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const waha = () =>
    new WahaAdapter(instancia('waha', { baseUrl: 'https://waha.exemplo.com.br', apiKey: 'chave-falsa', sessionName: 'default' }));
  const chamada = (i = 0) => {
    const [url, init] = fetchMock.mock.calls[i] as unknown as [string, RequestInit];
    return { url, body: JSON.parse(String(init.body)) };
  };

  it('gravação OGG/Opus vai por /api/sendVoice sem conversão', async () => {
    await waha().sendMedia(FONE, { mediaUrl: URL_VOZ, mediaType: 'audio', mimeType: 'audio/ogg', ptt: true });
    const { url, body } = chamada();
    expect(url).toBe('https://waha.exemplo.com.br/api/sendVoice');
    expect(body.file).toEqual({ url: URL_VOZ, mimetype: 'audio/ogg; codecs=opus' });
    expect(body.convert).toBe(false);
    expect(body.caption).toBeUndefined();
  });

  it('voz em outro formato pede conversão ao WAHA (convert: true)', async () => {
    await waha().sendMedia(FONE, { mediaUrl: URL_MP3, mediaType: 'audio', mimeType: 'audio/mpeg', ptt: true });
    const { url, body } = chamada();
    expect(url).toBe('https://waha.exemplo.com.br/api/sendVoice');
    expect(body.convert).toBe(true);
    expect(body.file.mimetype).toBe('audio/mpeg');
  });

  it('arquivo anexado vai por /api/sendFile (não existe /api/sendAudio)', async () => {
    await waha().sendMedia(FONE, {
      mediaUrl: URL_MP3,
      mediaType: 'audio',
      mimeType: 'audio/mpeg',
      fileName: 'recado.mp3',
      quotedMessageId: 'false_5511999990000@c.us_FAKE',
    });
    const { url, body } = chamada();
    expect(url).toBe('https://waha.exemplo.com.br/api/sendFile');
    expect(body.file).toEqual({ url: URL_MP3, filename: 'recado.mp3', mimetype: 'audio/mpeg' });
    expect(body.convert).toBeUndefined();
    expect(body.reply_to).toBe('false_5511999990000@c.us_FAKE');
    expect(fetchMock.mock.calls.some((c) => String((c as unknown as [string])[0]).includes('/api/sendAudio'))).toBe(false);
  });
});
