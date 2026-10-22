/**
 * Envio de mídia do provider Meta do servidor (campanhas): o objeto `audio`
 * da Graph API só aceita `link`/`id` e `voice`. Legenda ou `filename` nele
 * fazem a Meta recusar o envio, e a campanha com texto + áudio falhava.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MetaProvider } from '../../../supabase/functions/_shared/whatsapp-providers/meta.ts';

const fetchMock = vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: 'wamid.FAKE' }] }), { status: 200 }));

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const provider = () =>
  new MetaProvider({ phoneNumberId: '100000000000001', accessToken: 'token-falso' } as never);
const corpo = () => JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));

describe('MetaProvider.sendMedia', () => {
  it('áudio com texto: vai só o link (sem caption, sem filename)', async () => {
    await provider().sendMedia('5511999990000', 'https://exemplo.com.br/a.mp3', {
      mediaType: 'audio',
      caption: 'Olá {{nome}}',
      fileName: 'a.mp3',
    });
    expect(corpo()).toMatchObject({ type: 'audio', audio: { link: 'https://exemplo.com.br/a.mp3' } });
    expect(Object.keys(corpo().audio)).toEqual(['link']);
  });

  it('imagem continua com legenda', async () => {
    await provider().sendMedia('5511999990000', 'https://exemplo.com.br/a.jpg', { mediaType: 'image', caption: 'oi' });
    expect(corpo().image).toEqual({ link: 'https://exemplo.com.br/a.jpg', caption: 'oi' });
  });

  it('documento continua com legenda e nome do arquivo', async () => {
    await provider().sendMedia('5511999990000', 'https://exemplo.com.br/a.pdf', {
      mediaType: 'document',
      caption: 'contrato',
      fileName: 'contrato.pdf',
    });
    expect(corpo().document).toEqual({ link: 'https://exemplo.com.br/a.pdf', caption: 'contrato', filename: 'contrato.pdf' });
  });
});
