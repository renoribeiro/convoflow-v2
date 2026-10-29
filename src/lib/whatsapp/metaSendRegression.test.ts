import { describe, it, expect } from 'vitest';
import { montarCorpoMeta, montarLidaMeta } from '../../../supabase/functions/whatsapp-send-message/meta-body.ts';

/**
 * O envio da Meta (API oficial) não mudou com a sessão 2 dos segredos das
 * instâncias (2026-10-26): o corpo que vai para a Graph API sai igual, tipo a
 * tipo. A montagem só foi movida do index.ts para meta-body.ts. Valores
 * inventados.
 */

const FONE = '5585999990201';
const LINK = 'https://projeto.supabase.co/storage/v1/object/sign/whatsapp-media/t/1-foto.jpg?token=FAKE';
const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to: `+${FONE}` };

const ok = (body: Record<string, unknown>) => {
  const r = montarCorpoMeta({ to: FONE, ...body });
  if (!r.ok) throw new Error(`esperava ok, veio ${JSON.stringify(r)}`);
  return r.metaBody;
};

describe('Meta: corpo da Graph API, tipo a tipo', () => {
  it('texto, com pré-visualização ligada por padrão', () => {
    expect(ok({ type: 'text', text: 'Olá' })).toEqual({ ...base, type: 'text', text: { body: 'Olá', preview_url: true } });
    expect(ok({ type: 'text', text: 'Olá', preview_url: false }).text).toEqual({ body: 'Olá', preview_url: false });
  });

  it('o destino ganha o + e perde o que não é dígito; com + fica como veio', () => {
    expect(ok({ type: 'text', text: 'a', to: '(85) 99999-0201' }).to).toBe('+85999990201');
    expect(ok({ type: 'text', text: 'a', to: '+5585999990201' }).to).toBe('+5585999990201');
  });

  it('citação vira context.message_id', () => {
    expect(ok({ type: 'text', text: 'ok', quoted_message_id: 'wamid.FAKE' }).context).toEqual({ message_id: 'wamid.FAKE' });
  });

  it('imagem e vídeo por link, com legenda só quando há', () => {
    expect(ok({ type: 'image', media_url: LINK, caption: 'Veja' })).toEqual({ ...base, type: 'image', image: { link: LINK, caption: 'Veja' } });
    expect(ok({ type: 'video', media_url: LINK })).toEqual({ ...base, type: 'video', video: { link: LINK } });
  });

  it('documento com filename e legenda', () => {
    expect(ok({ type: 'document', media_url: LINK, file_name: 'contrato.pdf', caption: 'Segue' })).toEqual({
      ...base,
      type: 'document',
      document: { link: LINK, filename: 'contrato.pdf', caption: 'Segue' },
    });
  });

  it('voz OGG/Opus marca voice; arquivo de áudio não', () => {
    expect(ok({ type: 'audio', media_url: LINK, mime_type: 'audio/ogg', ptt: true }).audio).toEqual({ link: LINK, voice: true });
    expect(ok({ type: 'audio', media_url: LINK, mime_type: 'audio/mpeg', ptt: false }).audio).toEqual({ link: LINK });
  });

  it('localização com nome e endereço opcionais', () => {
    expect(ok({ type: 'location', latitude: -3.73, longitude: -38.52, name: 'Loja' })).toEqual({
      ...base,
      type: 'location',
      location: { latitude: -3.73, longitude: -38.52, name: 'Loja' },
    });
  });

  it('reação pelo wamid; emoji vazio remove', () => {
    expect(ok({ type: 'reaction', message_id: 'wamid.FAKE', emoji: '👍' }).reaction).toEqual({ message_id: 'wamid.FAKE', emoji: '👍' });
    expect(ok({ type: 'reaction', message_id: 'wamid.FAKE' }).reaction).toEqual({ message_id: 'wamid.FAKE', emoji: '' });
  });

  it('template: idioma pt_BR por padrão e parâmetros do corpo', () => {
    expect(ok({ type: 'template', template_name: 'boas_vindas', template_body_params: ['Ana'] }).template).toEqual({
      name: 'boas_vindas',
      language: { code: 'pt_BR' },
      components: [{ type: 'body', parameters: [{ type: 'text', text: 'Ana' }] }],
    });
    const comps = [{ type: 'header', parameters: [] }];
    expect(ok({ type: 'template', template_name: 't', template_language: 'en_US', template_components: comps }).template).toEqual({
      name: 't',
      language: { code: 'en_US' },
      components: comps,
    });
  });

  it('lida (lote 6d, D4, SKILL §2.14): status read com o wamid, sem destinatário', () => {
    expect(montarLidaMeta('wamid.FAKE')).toEqual({
      ok: true,
      metaBody: { messaging_product: 'whatsapp', status: 'read', message_id: 'wamid.FAKE' },
    });
    expect(montarLidaMeta('  ')).toMatchObject({ ok: false, status: 400 });
    expect(montarLidaMeta(undefined)).toMatchObject({ ok: false, status: 400 });
  });

  it('as recusas de antes, com o mesmo status e a mesma frase', () => {
    expect(montarCorpoMeta({ to: FONE, type: 'text' })).toEqual({ ok: false, resposta: { ok: false, error: 'text obrigatório' }, status: 400 });
    expect(montarCorpoMeta({ to: FONE, type: 'image' })).toEqual({ ok: false, resposta: { ok: false, error: 'media_url obrigatório' }, status: 400 });
    expect(montarCorpoMeta({ to: FONE, type: 'location', latitude: '1' })).toMatchObject({ ok: false, status: 400 });
    expect(montarCorpoMeta({ to: FONE, type: 'reaction' })).toEqual({ ok: false, resposta: { ok: false, error: 'message_id obrigatório' }, status: 400 });
    expect(montarCorpoMeta({ to: FONE, type: 'template' })).toMatchObject({ ok: false, status: 400 });
    expect(montarCorpoMeta({ to: FONE, type: 'typing' })).toEqual({ ok: false, resposta: { ok: false, error: 'Tipo "typing" não suportado' }, status: 501 });
    expect(montarCorpoMeta({ to: FONE, type: 'audio', media_url: LINK, mime_type: 'audio/webm' })).toMatchObject({ ok: false, status: 400 });
  });
});
