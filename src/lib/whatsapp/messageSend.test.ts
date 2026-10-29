import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  runProviderSend,
  rotaDoEnvio,
  messageIdFrom,
  SEND_MESSAGES,
  MEDIA_LIMIT_BYTES,
  type SendDeps,
  type ProviderSendBody,
} from '../../../supabase/functions/_shared/message-send.ts';
import type { ProviderRequest, ProviderResponse } from '../../../supabase/functions/_shared/instance-control.ts';
import { callProvider } from '../../../supabase/functions/_shared/provider-call.ts';

/**
 * Envio das Conversas por número Evolution ou WAHA, feito pelo servidor
 * (whatsapp-send-message → _shared/message-send.ts). As respostas dos
 * provedores imitam as documentadas (SKILL evolution-v2 e waha, e o código
 * oficial do Evolution conferido em 2026-10-26). Valores inventados.
 */

const LOJA = 'aaaaaaaa-0000-4000-8000-000000000002';
const CONTA = 'aaaaaaaa-0000-4000-8000-000000000001';
const OUTRA = 'aaaaaaaa-0000-4000-8000-000000000009';
const CHAVE = 'chave-da-instancia-FAKE-1234';
const EVO = 'https://evolution.exemplo.com.br';
const WAHA = 'https://waha.exemplo.com.br';
const FONE = '5585999990201';
const ANEXO = `${LOJA}/1761480000000-foto.jpg`;
const BASE64 = 'QUJDREVGRw=='; // "ABCDEFG"

const atendente = { tenant_id: LOJA, role: 'atendente', status: 'active' };
const gerenteDaConta = { tenant_id: CONTA, role: 'gerente', status: 'active' };
const lojaTenant = { id: LOJA, kind: 'store', parent_tenant_id: CONTA };

const evolution = {
  id: 'aaaaaaaa-0000-4000-8000-0000000000a1',
  tenant_id: LOJA,
  instance_key: 'loja-exemplo',
  provider: 'evolution',
  status: 'open',
  connection_config: {},
};
const waha = {
  ...evolution,
  id: 'aaaaaaaa-0000-4000-8000-0000000000a2',
  provider: 'waha',
  instance_key: 'loja-exemplo-waha',
  status: 'connected',
  connection_config: { sessionName: 'sessao-exemplo' },
};

type Deps = SendDeps & { calls: ProviderRequest[] };

function deps(over: Partial<SendDeps> & { responses?: ProviderResponse[]; baseUrl?: string } = {}): Deps {
  const calls: ProviderRequest[] = [];
  const responses = [...(over.responses ?? [])];
  const inst = (over.instance ?? evolution) as typeof evolution;
  const baseUrl = over.baseUrl ?? (inst.provider === 'waha' ? WAHA : EVO);
  return {
    caller: atendente,
    instance: inst,
    instanceTenant: lojaTenant,
    loadCredentials: vi.fn(async () => ({ source: 'vault' as const, credentials: { baseUrl, apiKey: CHAVE } })),
    canReadMedia: vi.fn(async () => true),
    readMedia: vi.fn(async () => ({ base64: BASE64, contentType: 'image/jpeg', size: 7 })),
    callProvider: vi.fn(async (req: ProviderRequest) => {
      calls.push(req);
      return responses.shift() ?? { status: 201, json: { key: { id: 'EVO_FAKE_SAIDA' } } };
    }),
    ...over,
    calls,
  };
}

const semSegredo = (body: unknown) => {
  const txt = JSON.stringify(body);
  expect(txt).not.toContain(CHAVE);
  expect(txt).not.toContain(EVO);
  expect(txt).not.toContain(WAHA);
};

// ============================================================================
describe('rota: Meta continua no caminho dela', () => {
  it('official e instagram vão pelo caminho da Meta; evolution, waha e vazio, pelo novo', () => {
    expect(rotaDoEnvio('official')).toBe('meta');
    expect(rotaDoEnvio('instagram')).toBe('meta');
    expect(rotaDoEnvio('evolution')).toBe('provider');
    expect(rotaDoEnvio('waha')).toBe('provider');
    expect(rotaDoEnvio(null)).toBe('provider');
  });
});

// ============================================================================
describe('quem pode enviar', () => {
  it('atendente da própria Loja envia', async () => {
    const d = deps();
    const r = await runProviderSend({ type: 'text', to: FONE, text: 'oi' }, d);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, messageId: 'EVO_FAKE_SAIDA' });
  });

  it('Gerente da Conta envia por número de Loja filha', async () => {
    const r = await runProviderSend({ type: 'text', to: FONE, text: 'oi' }, deps({ caller: gerenteDaConta }));
    expect(r.status).toBe(200);
  });

  it('pessoa de outra Conta: recusado, sem ler o cofre, o arquivo nem chamar o provedor', async () => {
    for (const instance of [evolution, waha]) {
      for (const type of ['text', 'image', 'typing', 'archive', 'profile_picture']) {
        const d = deps({ caller: { ...atendente, tenant_id: OUTRA }, instance });
        const r = await runProviderSend({ type, to: FONE, text: 'oi', media_path: ANEXO }, d);
        expect(r.status).toBe(403);
        expect(r.body.reason).toBe('forbidden');
        expect(r.body.error).toBe(SEND_MESSAGES.forbidden);
        expect(d.loadCredentials).not.toHaveBeenCalled();
        expect(d.readMedia).not.toHaveBeenCalled();
        expect(d.callProvider).not.toHaveBeenCalled();
      }
    }
  });

  it('Gestor de outra Loja da MESMA Conta não envia (só o Gerente alcança as filhas)', async () => {
    const r = await runProviderSend(
      { type: 'text', to: FONE, text: 'oi' },
      deps({ caller: { tenant_id: 'aaaaaaaa-0000-4000-8000-000000000003', role: 'gestor', status: 'active' } }),
    );
    expect(r.status).toBe(403);
  });

  it('perfil suspenso não envia', async () => {
    const d = deps({ caller: { ...atendente, status: 'suspended' } });
    const r = await runProviderSend({ type: 'text', to: FONE, text: 'oi' }, d);
    expect(r.status).toBe(403);
    expect(r.body.reason).toBe('inactive');
    expect(d.callProvider).not.toHaveBeenCalled();
  });

  it('número de outro provider não entra neste caminho', async () => {
    const r = await runProviderSend({ type: 'text', to: FONE, text: 'oi' }, deps({ instance: { ...evolution, provider: 'official' } }));
    expect(r.status).toBe(400);
    expect(r.body.reason).toBe('unsupported_provider');
  });
});

// ============================================================================
describe('número desconectado e sem chave', () => {
  it('desconectado: frase pronta para a tela, sem chamar o provedor', async () => {
    for (const instance of [{ ...evolution, status: 'close' }, { ...waha, status: 'qrcode' }]) {
      const d = deps({ instance });
      const r = await runProviderSend({ type: 'text', to: FONE, text: 'oi' }, d);
      expect(r.status).toBe(409);
      expect(r.body.error).toBe('Este número está desconectado. Peça ao Gestor da Loja para reconectar.');
      expect(d.callProvider).not.toHaveBeenCalled();
    }
  });

  it('sem chave no cofre: diz o que fazer', async () => {
    const d = deps({ loadCredentials: vi.fn(async () => ({ source: 'none' as const, credentials: null })) });
    const r = await runProviderSend({ type: 'text', to: FONE, text: 'oi' }, d);
    expect(r.status).toBe(409);
    expect(r.body.reason).toBe('no_credentials');
    expect(r.body.error).toContain('Substituir chave');
  });

  it('nenhuma resposta leva a chave ou o endereço do servidor', async () => {
    for (const res of [{ status: 401 }, { status: 500 }, { status: 0, networkError: true }, { status: 201, json: { key: { id: 'X' }, apikey: CHAVE } }]) {
      semSegredo((await runProviderSend({ type: 'text', to: FONE, text: 'oi' }, deps({ responses: [res as ProviderResponse] }))).body);
    }
  });
});

// ============================================================================
describe('Evolution: cada tipo', () => {
  const call = async (body: ProviderSendBody, over: Partial<SendDeps> = {}, responses?: ProviderResponse[]) => {
    const d = deps({ ...over, responses });
    const r = await runProviderSend({ to: FONE, ...body }, d);
    return { r, req: d.calls[0]!, d };
  };
  const headers = { 'Content-Type': 'application/json', apikey: CHAVE };

  it('texto: /message/sendText com a chave da instância', async () => {
    const { r, req } = await call({ type: 'text', text: 'Olá' });
    expect(req).toEqual({
      method: 'POST',
      url: `${EVO}/message/sendText/loja-exemplo`,
      headers,
      body: { number: FONE, text: 'Olá', linkPreview: true },
      customerServer: false,
    });
    expect(r.body.messageId).toBe('EVO_FAKE_SAIDA');
  });

  it('texto respondendo: citação pelo key.id do WhatsApp', async () => {
    const { req } = await call({ type: 'text', text: 'ok', quoted_message_id: 'EVO_FAKE_CLIENTE' });
    expect((req.body as Record<string, unknown>).quoted).toEqual({ key: { id: 'EVO_FAKE_CLIENTE' } });
  });

  it('texto vazio não sai', async () => {
    const { r, d } = await call({ type: 'text', text: '   ' });
    expect(r.status).toBe(400);
    expect(d.callProvider).not.toHaveBeenCalled();
  });

  it('imagem: /message/sendMedia com os bytes lidos pelo servidor (nunca um link)', async () => {
    const { req, d } = await call({ type: 'image', media_path: ANEXO, mime_type: 'image/jpeg', file_name: 'foto.jpg', caption: 'Veja' });
    expect(d.canReadMedia).toHaveBeenCalledWith(ANEXO);
    expect(d.readMedia).toHaveBeenCalledWith(ANEXO, MEDIA_LIMIT_BYTES.image);
    expect(req.url).toBe(`${EVO}/message/sendMedia/loja-exemplo`);
    expect(req.body).toEqual({
      number: FONE,
      mediatype: 'image',
      mimetype: 'image/jpeg',
      media: BASE64,
      fileName: 'foto.jpg',
      caption: 'Veja',
    });
    expect(JSON.stringify(req.body)).not.toMatch(/https?:\/\//);
  });

  it('vídeo e documento: mesmo endpoint, mediatype certo, legenda e citação', async () => {
    for (const type of ['video', 'document'] as const) {
      const { req } = await call({ type, media_path: ANEXO, mime_type: type === 'video' ? 'video/mp4' : 'application/pdf', file_name: 'a.bin', caption: 'c', quoted_message_id: 'Q1' });
      expect(req.url).toBe(`${EVO}/message/sendMedia/loja-exemplo`);
      expect(req.body).toMatchObject({ mediatype: type, media: BASE64, caption: 'c', quoted: { key: { id: 'Q1' } } });
    }
  });

  it('arquivo de áudio: sendMedia com mediatype audio, sem legenda e sem virar voz', async () => {
    const { req } = await call({ type: 'audio', ptt: false, media_path: ANEXO, mime_type: 'audio/mpeg', file_name: 'recado.mp3', caption: 'x', quoted_message_id: 'Q1' });
    expect(req.url).toBe(`${EVO}/message/sendMedia/loja-exemplo`);
    expect(req.body).toEqual({
      number: FONE,
      mediatype: 'audio',
      mimetype: 'audio/mpeg',
      media: BASE64,
      fileName: 'recado.mp3',
      quoted: { key: { id: 'Q1' } },
    });
  });

  it('mensagem de voz: sendWhatsAppAudio com encoding (o Evolution converte para OGG/Opus)', async () => {
    const { req } = await call({ type: 'audio', ptt: true, media_path: ANEXO, mime_type: 'audio/webm' });
    expect(req.url).toBe(`${EVO}/message/sendWhatsAppAudio/loja-exemplo`);
    expect(req.body).toEqual({ number: FONE, audio: BASE64, encoding: true });
  });

  it('localização: name e address sempre presentes (o schema do Evolution exige)', async () => {
    const { req } = await call({ type: 'location', latitude: -3.73, longitude: -38.52 });
    expect(req.url).toBe(`${EVO}/message/sendLocation/loja-exemplo`);
    expect(req.body).toEqual({ number: FONE, latitude: -3.73, longitude: -38.52, name: 'Localização', address: '' });
  });

  it('localização inválida não sai', async () => {
    const { r } = await call({ type: 'location', latitude: 200, longitude: 0 });
    expect(r.status).toBe(400);
  });

  it('reação: key com remoteJid, fromMe e id', async () => {
    const { req } = await call({ type: 'reaction', message_id: 'EVO_FAKE_CLIENTE', emoji: '👍' });
    expect(req.url).toBe(`${EVO}/message/sendReaction/loja-exemplo`);
    expect(req.body).toEqual({ key: { remoteJid: `${FONE}@s.whatsapp.net`, fromMe: false, id: 'EVO_FAKE_CLIENTE' }, reaction: '👍' });
  });

  it('digitando: POST /chat/sendPresence (composing e paused)', async () => {
    const on = await call({ type: 'typing', on: true });
    expect(on.req).toMatchObject({ method: 'POST', url: `${EVO}/chat/sendPresence/loja-exemplo` });
    expect(on.req.body).toEqual({ number: FONE, presence: 'composing', delay: 3000 });
    expect(on.r.body).toEqual({ ok: true });
    const off = await call({ type: 'typing', on: false });
    expect(off.req.body).toEqual({ number: FONE, presence: 'paused', delay: 0 });
  });

  it('lida: POST /chat/markMessageAsRead com readMessages', async () => {
    const { req } = await call({ type: 'mark_read', message_id: 'EVO_FAKE_CLIENTE' });
    expect(req).toMatchObject({ method: 'POST', url: `${EVO}/chat/markMessageAsRead/loja-exemplo` });
    expect(req.body).toEqual({ readMessages: [{ remoteJid: `${FONE}@s.whatsapp.net`, fromMe: false, id: 'EVO_FAKE_CLIENTE' }] });
  });

  it('lida ao abrir (D4): um recibo para cada mensagem do cliente vista, até 50', async () => {
    const { req } = await call({ type: 'mark_read', message_id: 'EVO_FAKE_2', message_ids: ['EVO_FAKE_1', 'EVO_FAKE_2', 'EVO_FAKE_1', 7] });
    expect(req.body).toEqual({
      readMessages: [
        { remoteJid: `${FONE}@s.whatsapp.net`, fromMe: false, id: 'EVO_FAKE_1' },
        { remoteJid: `${FONE}@s.whatsapp.net`, fromMe: false, id: 'EVO_FAKE_2' },
      ],
    });
    const muitos = Array.from({ length: 70 }, (_, i) => `EVO_FAKE_${i}`);
    const { req: r50 } = await call({ type: 'mark_read', message_ids: muitos });
    const lidos = (r50.body as { readMessages: Array<{ id: string }> }).readMessages;
    expect(lidos).toHaveLength(50);
    expect(lidos.at(-1)!.id).toBe('EVO_FAKE_69');
  });

  it('lida sem id de mensagem não chama o Evolution', async () => {
    const { r, d } = await call({ type: 'mark_read' });
    expect(r.body).toEqual({ ok: true, skipped: true });
    expect(d.callProvider).not.toHaveBeenCalled();
  });

  it('arquivar e desarquivar: POST /chat/archiveChat com o chat', async () => {
    const a = await call({ type: 'archive', archive: true }, {}, [{ status: 201, json: { chatId: `${FONE}@s.whatsapp.net`, archived: true } }]);
    expect(a.req).toMatchObject({ method: 'POST', url: `${EVO}/chat/archiveChat/loja-exemplo` });
    expect(a.req.body).toEqual({ chat: `${FONE}@s.whatsapp.net`, archive: true });
    const d = await call({ type: 'archive', archive: false });
    expect((d.req.body as Record<string, unknown>).archive).toBe(false);
  });

  it('foto de perfil e "tem WhatsApp?"', async () => {
    const foto = await call({ type: 'profile_picture' }, {}, [{ status: 200, json: { wuid: `${FONE}@s.whatsapp.net`, profilePictureUrl: 'https://pps.whatsapp.net/v/FAKE.jpg' } }]);
    expect(foto.req.url).toBe(`${EVO}/chat/fetchProfilePictureUrl/loja-exemplo`);
    expect(foto.r.body).toEqual({ ok: true, url: 'https://pps.whatsapp.net/v/FAKE.jpg' });
    const num = await call({ type: 'check_number' }, {}, [{ status: 200, json: [{ exists: true, jid: `${FONE}@s.whatsapp.net`, number: FONE }] }]);
    expect(num.req.body).toEqual({ numbers: [FONE] });
    expect(num.r.body).toEqual({ ok: true, exists: true });
  });

  it('número sem WhatsApp (400 com exists:false): frase própria', async () => {
    const { r } = await call({ type: 'text', text: 'oi' }, {}, [{ status: 400, json: { status: 400, error: 'Bad Request', response: { message: [{ exists: false, jid: `${FONE}@s.whatsapp.net`, number: FONE }] } } }]);
    expect(r.body.reason).toBe('number_not_on_whatsapp');
  });

  it('chave recusada (401) e instância apagada (404): frases para o Gestor', async () => {
    const a = await call({ type: 'text', text: 'oi' }, {}, [{ status: 401, json: { status: 401, error: 'Unauthorized' } }]);
    expect(a.r.body.reason).toBe('provider_auth');
    const b = await call({ type: 'text', text: 'oi' }, {}, [{ status: 404, json: { status: 404, error: 'Not Found' } }]);
    expect(b.r.body.reason).toBe('provider_not_found');
  });
});

// ============================================================================
describe('WAHA: cada tipo', () => {
  const call = async (body: ProviderSendBody, responses?: ProviderResponse[]) => {
    const d = deps({ instance: waha, responses: responses ?? [{ status: 201, json: { id: 'true_5585999990201@c.us_FAKE' } }] });
    const r = await runProviderSend({ to: FONE, ...body }, d);
    return { r, req: d.calls[0]!, d };
  };
  const chatId = `${FONE}@c.us`;

  it('toda chamada é marcada como servidor do cliente (passa pelo bloqueio de endereço)', async () => {
    for (const type of ['text', 'image', 'typing', 'mark_read', 'archive', 'profile_picture', 'check_number']) {
      const { req } = await call({ type, text: 'oi', media_path: ANEXO });
      expect(req.customerServer).toBe(true);
      expect(req.headers['X-Api-Key']).toBe(CHAVE);
    }
  });

  it('texto: /api/sendText com a sessão no corpo e reply_to', async () => {
    const { r, req } = await call({ type: 'text', text: 'Olá', quoted_message_id: 'false_5585999990201@c.us_Q1' });
    expect(req).toMatchObject({ method: 'POST', url: `${WAHA}/api/sendText` });
    expect(req.body).toEqual({ session: 'sessao-exemplo', chatId, text: 'Olá', linkPreview: true, reply_to: 'false_5585999990201@c.us_Q1' });
    expect(r.body.messageId).toBe('true_5585999990201@c.us_FAKE');
  });

  it('imagem, vídeo e documento: file.data com os bytes', async () => {
    const rotas = { image: '/api/sendImage', video: '/api/sendVideo', document: '/api/sendFile' } as const;
    for (const [type, path] of Object.entries(rotas)) {
      const { req } = await call({ type, media_path: ANEXO, mime_type: 'image/jpeg', file_name: 'foto.jpg', caption: 'Veja' });
      expect(req.url).toBe(`${WAHA}${path}`);
      expect(req.body).toEqual({
        session: 'sessao-exemplo',
        chatId,
        file: { data: BASE64, filename: 'foto.jpg', mimetype: 'image/jpeg' },
        caption: 'Veja',
      });
    }
  });

  it('arquivo de áudio: /api/sendFile (não existe /api/sendAudio), sem legenda', async () => {
    const { req } = await call({ type: 'audio', ptt: false, media_path: ANEXO, mime_type: 'audio/mpeg', file_name: 'recado.mp3', caption: 'x' });
    expect(req.url).toBe(`${WAHA}/api/sendFile`);
    expect((req.body as Record<string, unknown>).caption).toBeUndefined();
  });

  it('voz OGG/Opus: /api/sendVoice sem conversão; outro formato pede convert', async () => {
    const ogg = await call({ type: 'audio', ptt: true, media_path: ANEXO, mime_type: 'audio/ogg' });
    expect(ogg.req.url).toBe(`${WAHA}/api/sendVoice`);
    expect(ogg.req.body).toEqual({ session: 'sessao-exemplo', chatId, file: { data: BASE64, mimetype: 'audio/ogg; codecs=opus' }, convert: false });
    const webm = await call({ type: 'audio', ptt: true, media_path: ANEXO, mime_type: 'audio/webm' });
    expect(webm.req.body).toMatchObject({ file: { mimetype: 'audio/webm' }, convert: true });
  });

  it('localização, reação (PUT), digitando, lida, arquivar', async () => {
    expect((await call({ type: 'location', latitude: -3.73, longitude: -38.52, name: 'Loja' })).req.body).toEqual({
      session: 'sessao-exemplo', chatId, latitude: -3.73, longitude: -38.52, title: 'Loja',
    });
    const reacao = (await call({ type: 'reaction', message_id: 'false_5585999990201@c.us_Q1', emoji: '❤️' })).req;
    expect(reacao).toMatchObject({ method: 'PUT', url: `${WAHA}/api/reaction` });
    expect(reacao.body).toEqual({ session: 'sessao-exemplo', messageId: 'false_5585999990201@c.us_Q1', reaction: '❤️' });
    expect((await call({ type: 'typing', on: true })).req.url).toBe(`${WAHA}/api/startTyping`);
    expect((await call({ type: 'typing', on: false })).req.url).toBe(`${WAHA}/api/stopTyping`);
    const lida = (await call({ type: 'mark_read' })).req;
    expect(lida.url).toBe(`${WAHA}/api/sendSeen`);
    expect(lida.body).toEqual({ session: 'sessao-exemplo', chatId });
    expect((await call({ type: 'archive', archive: true })).req.url).toBe(`${WAHA}/api/sessao-exemplo/chats/${encodeURIComponent(chatId)}/archive`);
    expect((await call({ type: 'archive', archive: false })).req.url).toBe(`${WAHA}/api/sessao-exemplo/chats/${encodeURIComponent(chatId)}/unarchive`);
  });

  it('foto e "tem WhatsApp?": GET com os formatos documentados', async () => {
    const foto = await call({ type: 'profile_picture' }, [{ status: 200, json: { profilePictureURL: 'https://pps.whatsapp.net/v/FAKE.jpg' } }]);
    expect(foto.req).toMatchObject({ method: 'GET', url: `${WAHA}/api/sessao-exemplo/contacts/profile-picture?contactId=${encodeURIComponent(chatId)}` });
    expect(foto.r.body.url).toBe('https://pps.whatsapp.net/v/FAKE.jpg');
    const num = await call({ type: 'check_number' }, [{ status: 200, json: { numberExists: true, chatId } }]);
    expect(num.req.url).toBe(`${WAHA}/api/sessao-exemplo/contacts/check-exists?phone=${FONE}`);
    expect(num.r.body.exists).toBe(true);
  });

  it('id da mensagem: texto ou objeto com _serialized', () => {
    expect(messageIdFrom('waha', { id: 'true_x@c.us_A' })).toBe('true_x@c.us_A');
    expect(messageIdFrom('waha', { id: { _serialized: 'true_x@c.us_B' } })).toBe('true_x@c.us_B');
    expect(messageIdFrom('evolution', { key: { id: 'C' } })).toBe('C');
  });

  it('servidor fora do ar: frase sobre o servidor WAHA do cliente', async () => {
    const { r } = await call({ type: 'text', text: 'oi' }, [{ status: 0, networkError: true }]);
    expect(r.body.error).toBe(SEND_MESSAGES.unreachableWaha);
  });
});

// ============================================================================
describe('mídia do bucket privado', () => {
  it('caminho de outra Loja, de inbound/ ou torto nem chega ao Storage', async () => {
    for (const media_path of [`${OUTRA}/1-foto.jpg`, `${LOJA}/inbound/wamid.jpg`, `${LOJA}/../x.jpg`, 'https://exemplo.com/foto.jpg']) {
      const d = deps();
      const r = await runProviderSend({ type: 'image', to: FONE, media_path }, d);
      expect(r.status).toBe(400);
      expect(r.body.error).toBe(SEND_MESSAGES.invalidMedia);
      expect(d.canReadMedia).not.toHaveBeenCalled();
      expect(d.readMedia).not.toHaveBeenCalled();
    }
  });

  it('a regra do Storage nega a quem envia: o servidor não lê o arquivo', async () => {
    const d = deps({ canReadMedia: vi.fn(async () => false) });
    const r = await runProviderSend({ type: 'image', to: FONE, media_path: ANEXO }, d);
    expect(r.status).toBe(403);
    expect(d.readMedia).not.toHaveBeenCalled();
    expect(d.callProvider).not.toHaveBeenCalled();
  });

  it('arquivo grande demais: recusa com o limite, sem chamar o provedor', async () => {
    const d = deps({ readMedia: vi.fn(async () => 'too_large' as const) });
    const r = await runProviderSend({ type: 'video', to: FONE, media_path: ANEXO }, d);
    expect(r.status).toBe(400);
    expect(r.body.error).toBe(SEND_MESSAGES.mediaTooLarge(16));
    expect(d.callProvider).not.toHaveBeenCalled();
  });

  it('documento grande demais: a frase de documento, com o limite de 30 MB', async () => {
    const d = deps({ readMedia: vi.fn(async () => 'too_large' as const) });
    const r = await runProviderSend({ type: 'document', to: FONE, media_path: ANEXO }, d);
    expect(d.readMedia).toHaveBeenCalledWith(ANEXO, 30 * 1024 * 1024);
    expect(r.body.error).toBe('Este arquivo passa de 30 MB e não pode ser enviado por este número. Envie um link para o arquivo.');
  });

  it('arquivo sumiu do bucket: pede para anexar de novo', async () => {
    const r = await runProviderSend({ type: 'document', to: FONE, media_path: ANEXO }, deps({ readMedia: vi.fn(async () => null) }));
    expect(r.body.error).toBe(SEND_MESSAGES.mediaNotFound);
  });
});

// ============================================================================
describe('WAHA: bloqueio de endereço interno no envio (chamada de verdade, sem rede)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('endereço interno é recusado antes de qualquer fetch, com a frase para o Gestor', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    for (const baseUrl of ['http://169.254.169.254', 'http://127.0.0.1:3000', 'http://10.0.0.5', 'http://localhost:3000', 'http://[::1]:3000']) {
      const d = deps({ instance: waha, baseUrl, callProvider });
      const r = await runProviderSend({ type: 'text', to: FONE, text: 'oi' }, d);
      expect(r.status).toBe(400);
      expect(r.body.reason).toBe('blocked_address');
      expect(r.body.error).toBe(SEND_MESSAGES.blockedAddress);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('redirecionamento não é seguido: o 302 vira recusa', async () => {
    const fetchSpy = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.redirect).toBe('manual');
      return new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } });
    });
    vi.stubGlobal('fetch', fetchSpy);
    // IP público literal: não precisa de DNS.
    const d = deps({ instance: waha, baseUrl: 'https://1.1.1.1', callProvider });
    const r = await runProviderSend({ type: 'text', to: FONE, text: 'oi' }, d);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(r.body.reason).toBe('blocked_address');
  });

  it('o Evolution (servidor da plataforma) não passa pelo bloqueio, e nunca segue sem prazo', async () => {
    const fetchSpy = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.signal).toBeDefined();
      return new Response(JSON.stringify({ key: { id: 'EVO_FAKE' } }), { status: 201, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchSpy);
    const r = await runProviderSend({ type: 'text', to: FONE, text: 'oi' }, deps({ callProvider }));
    expect(r.body).toEqual({ ok: true, messageId: 'EVO_FAKE' });
  });
});
