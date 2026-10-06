import { describe, it, expect } from 'vitest';
// Parte pura do instagram-send-message (fatia 3), compartilhada com o Deno.
import {
  buildGraphRequest,
  INSTAGRAM_GRAPH_HOST,
  INSTAGRAM_TEXT_MAX_BYTES as SERVER_MAX,
  isTokenExpired,
  mapMetaError,
  reasonMessage,
  REASON_MESSAGES,
  utf8ByteLength as serverBytes,
  validateSendRequest,
} from '../../supabase/functions/instagram-send-message/logic';
import {
  INSTAGRAM_COMPOSER_TEXT,
  INSTAGRAM_TEXT_MAX_BYTES as CLIENT_MAX,
  instagramWindowState,
  isInstagramConnectionExpired,
  utf8ByteLength as clientBytes,
} from '@/lib/instagram/reply';

const INST = 'cccccccc-0000-4000-8000-000000000003';
const IGSID = '978239761327698';

describe('limite de 1000 BYTES (não caracteres)', () => {
  it('servidor e navegador têm o mesmo limite e contam igual', () => {
    expect(SERVER_MAX).toBe(1000);
    expect(CLIENT_MAX).toBe(SERVER_MAX);
    for (const t of ['abc', 'ação', '🙂', 'olá 👋🏽 tudo bem?', 'x'.repeat(1000)]) {
      expect(clientBytes(t)).toBe(serverBytes(t));
    }
  });

  it('1000 letras sem acento passam; 1001 não', () => {
    expect(validateSendRequest({ instance_id: INST, to: IGSID, text: 'a'.repeat(1000) }).ok).toBe(true);
    expect(validateSendRequest({ instance_id: INST, to: IGSID, text: 'a'.repeat(1001) })).toEqual({
      ok: false,
      reason: 'too_long',
    });
  });

  it('acento ocupa 2 bytes: 500 "á" passam, 501 não — mesmo com só 501 caracteres', () => {
    expect(serverBytes('á')).toBe(2);
    expect(validateSendRequest({ instance_id: INST, to: IGSID, text: 'á'.repeat(500) }).ok).toBe(true);
    const r = validateSendRequest({ instance_id: INST, to: IGSID, text: 'á'.repeat(501) });
    expect(r).toEqual({ ok: false, reason: 'too_long' });
  });

  it('emoji ocupa 4 bytes: 250 passam, 251 não', () => {
    expect(serverBytes('🙂')).toBe(4);
    expect(validateSendRequest({ instance_id: INST, to: IGSID, text: '🙂'.repeat(250) }).ok).toBe(true);
    expect(validateSendRequest({ instance_id: INST, to: IGSID, text: '🙂'.repeat(251) }).ok).toBe(false);
  });

  it('a mensagem da tela diz os bytes e o limite', () => {
    expect(INSTAGRAM_COMPOSER_TEXT.tooLong(1002)).toContain('1002 de 1000 bytes');
  });
});

describe('validateSendRequest', () => {
  it('recusa corpo malformado', () => {
    for (const bad of [null, 'x', [], {}, { instance_id: 'nao-uuid', to: IGSID, text: 'oi' },
      { instance_id: INST, to: 978239761327698, text: 'oi' }, { instance_id: INST, to: '+55 11', text: 'oi' }]) {
      expect(validateSendRequest(bad)).toEqual({ ok: false, reason: 'bad_request' });
    }
  });

  it('texto vazio ou só espaço é "empty"', () => {
    expect(validateSendRequest({ instance_id: INST, to: IGSID, text: '   ' })).toEqual({ ok: false, reason: 'empty' });
  });

  it('não altera o texto (o eco é casado pelo texto)', () => {
    const r = validateSendRequest({ instance_id: INST, to: IGSID, text: ' oi \n' });
    expect(r.ok && r.value.text).toBe(' oi \n');
  });
});

describe('validade da conexão (tokenExpiresAt)', () => {
  const now = new Date('2026-11-23T00:16:36Z');
  it('vencida no instante exato e depois', () => {
    expect(isTokenExpired('2026-11-23T00:16:36Z', now)).toBe(true);
    expect(isTokenExpired('2026-11-22T00:00:00Z', now)).toBe(true);
    expect(isInstagramConnectionExpired({ tokenExpiresAt: '2026-11-22T00:00:00Z' }, now)).toBe(true);
  });
  it('válida antes', () => {
    expect(isTokenExpired('2026-11-24T00:00:00Z', now)).toBe(false);
    expect(isInstagramConnectionExpired({ tokenExpiresAt: '2026-11-24T00:00:00Z' }, now)).toBe(false);
  });
  it('sem data ou data ilegível: não afirma que venceu (a Meta decide)', () => {
    for (const v of [undefined, null, '', 'amanhã', 42]) {
      expect(isTokenExpired(v, now)).toBe(false);
      expect(isInstagramConnectionExpired({ tokenExpiresAt: v }, now)).toBe(false);
    }
    expect(isInstagramConnectionExpired(null, now)).toBe(false);
  });
});

describe('chamada à Meta', () => {
  it('graph.instagram.com, v25.0, /<IG_ID>/messages, recipient + message.text', () => {
    const r = buildGraphRequest('17841419262135883', IGSID, 'Olá!');
    expect(INSTAGRAM_GRAPH_HOST).toBe('https://graph.instagram.com');
    expect(r.url).toBe('https://graph.instagram.com/v25.0/17841419262135883/messages');
    expect(r.body).toEqual({ recipient: { id: IGSID }, message: { text: 'Olá!' } });
  });
});

describe('mapMetaError', () => {
  it('fora da janela: 10/2534022, ou pelo texto', () => {
    expect(mapMetaError(400, { error: { code: 10, error_subcode: 2534022 } }).reason).toBe('outside_window');
    expect(
      mapMetaError(400, { error: { code: 10, message: 'This message is sent outside of allowed window.' } }).reason,
    ).toBe('outside_window');
  });
  it('token: 190 (qualquer subcódigo) e 401 OAuthException', () => {
    expect(mapMetaError(400, { error: { code: 190, error_subcode: 463 } }).reason).toBe('token_expired');
    expect(mapMetaError(401, { error: { type: 'OAuthException' } }).reason).toBe('token_expired');
  });
  it('destinatário: 100/2534014 e 551', () => {
    expect(mapMetaError(400, { error: { code: 100, error_subcode: 2534014 } }).reason).toBe('invalid_recipient');
    expect(mapMetaError(400, { error: { code: 551 } }).reason).toBe('invalid_recipient');
  });
  it('limite: 4, 17, 32, 613, 80002, 80006 e HTTP 429', () => {
    for (const code of [4, 17, 32, 613, 80002, 80006]) {
      expect(mapMetaError(400, { error: { code } }).reason).toBe('rate_limited');
    }
    expect(mapMetaError(429, null).reason).toBe('rate_limited');
  });
  it('o resto vira genérico com o código; corpo ilegível não quebra', () => {
    const info = mapMetaError(400, { error: { code: 100, message: 'Invalid parameter' } });
    expect(info.reason).toBe('meta_error');
    expect(reasonMessage(info)).toBe(`${REASON_MESSAGES.meta_error} (código 100)`);
    expect(mapMetaError(500, 'html').reason).toBe('meta_error');
    expect(reasonMessage(mapMetaError(500, null))).toBe(REASON_MESSAGES.meta_error);
  });
  it('a mensagem de janela é a mesma no servidor e no compositor', () => {
    expect(REASON_MESSAGES.outside_window).toBe(INSTAGRAM_COMPOSER_TEXT.windowClosed);
  });
});

describe('instagramWindowState', () => {
  const now = new Date('2026-09-23T12:00:00Z');
  it('aberta antes de closes_at, fechada depois', () => {
    expect(instagramWindowState('2026-09-23T13:00:00Z', now).open).toBe(true);
    expect(instagramWindowState('2026-09-23T12:00:00Z', now).open).toBe(false);
    expect(instagramWindowState('2026-09-23T11:00:00Z', now).open).toBe(false);
  });
  it('cliente que nunca escreveu: fechada, sem data', () => {
    expect(instagramWindowState(null, now)).toEqual({ open: false, closesAt: null });
    expect(instagramWindowState('lixo', now)).toEqual({ open: false, closesAt: null });
  });
});
