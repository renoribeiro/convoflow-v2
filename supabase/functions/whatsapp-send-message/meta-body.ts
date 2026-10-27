/**
 * O corpo que vai para a Graph API da Meta, montado a partir do pedido da tela.
 *
 * Saiu do index.ts em 2026-10-26 (sessão 2 do
 * docs/RUNBOOK_segredos_das_instancias.md) SEM MUDAR NADA, só para o Vitest
 * provar que o envio da Meta continua igual
 * (src/lib/whatsapp/metaSendRegression.test.ts). Antes de alterar, consulte
 * .agent/skills/meta-cloud-api/SKILL.md.
 */
import { montarAudioMeta } from './audio.ts';

export type CorpoMeta =
  | { ok: true; metaBody: Record<string, any> }
  | { ok: false; resposta: Record<string, any>; status: number };

const falha = (resposta: Record<string, any>, status: number): CorpoMeta => ({ ok: false, resposta, status });

// deno-lint-ignore no-explicit-any
export function montarCorpoMeta(body: any): CorpoMeta {
  // Monta payload da Graph API conforme o tipo
  const normalizedTo = body.to.startsWith('+')
    ? body.to
    : `+${body.to.replace(/\D/g, '')}`;

  const metaBody: Record<string, any> = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normalizedTo,
  };

  if (body.quoted_message_id) {
    metaBody.context = { message_id: body.quoted_message_id };
  }

  switch (body.type) {
    case 'text':
      if (!body.text) return falha({ ok: false, error: 'text obrigatório' }, 400);
      metaBody.type = 'text';
      metaBody.text = { body: body.text, preview_url: body.preview_url ?? true };
      break;

    case 'image':
      if (!body.media_url) return falha({ ok: false, error: 'media_url obrigatório' }, 400);
      metaBody.type = 'image';
      metaBody.image = { link: body.media_url, ...(body.caption ? { caption: body.caption } : {}) };
      break;

    case 'video':
      if (!body.media_url) return falha({ ok: false, error: 'media_url obrigatório' }, 400);
      metaBody.type = 'video';
      metaBody.video = { link: body.media_url, ...(body.caption ? { caption: body.caption } : {}) };
      break;

    case 'audio': {
      // ptt + OGG/Opus → `voice: true` (mensagem de voz). Sem legenda nem
      // nome de arquivo: o objeto audio da Meta não tem esses campos.
      const audio = montarAudioMeta(body);
      if (!audio.ok) return falha({ ok: false, error: audio.error }, 400);
      metaBody.type = 'audio';
      metaBody.audio = audio.audio;
      break;
    }

    case 'document':
      if (!body.media_url) return falha({ ok: false, error: 'media_url obrigatório' }, 400);
      metaBody.type = 'document';
      metaBody.document = {
        link: body.media_url,
        ...(body.file_name ? { filename: body.file_name } : {}),
        ...(body.caption ? { caption: body.caption } : {}),
      };
      break;

    case 'location':
      if (typeof body.latitude !== 'number' || typeof body.longitude !== 'number') {
        return falha({ ok: false, error: 'latitude/longitude numéricos obrigatórios' }, 400);
      }
      metaBody.type = 'location';
      metaBody.location = {
        latitude: body.latitude,
        longitude: body.longitude,
        ...(body.name ? { name: body.name } : {}),
        ...(body.address ? { address: body.address } : {}),
      };
      break;

    case 'reaction':
      if (!body.message_id) return falha({ ok: false, error: 'message_id obrigatório' }, 400);
      metaBody.type = 'reaction';
      metaBody.reaction = { message_id: body.message_id, emoji: body.emoji ?? '' };
      break;

    case 'template': {
      // Template messages — SKILL.md §2.12.
      // Bypass the 24h window check (handled above by exclusion from the gate).
      // The template must be APPROVED on the WABA before sending.
      if (!body.template_name) {
        return falha({ ok: false, error: 'template_name obrigatório para type=template' }, 400);
      }
      const tplLanguage = body.template_language || 'pt_BR';

      let tplComponents: Record<string, any>[];
      if (Array.isArray(body.template_components) && body.template_components.length > 0) {
        // Caller supplied a full components array (header, body, buttons, etc.)
        tplComponents = body.template_components;
      } else if (Array.isArray(body.template_body_params) && body.template_body_params.length > 0) {
        // Shorthand: build a body component from the ordered param strings
        tplComponents = [
          {
            type: 'body',
            parameters: body.template_body_params.map((t: string) => ({ type: 'text', text: t })),
          },
        ];
      } else {
        tplComponents = [];
      }

      metaBody.type = 'template';
      metaBody.template = {
        name: body.template_name,
        language: { code: tplLanguage },
        components: tplComponents,
      };
      break;
    }

    default:
      return falha({ ok: false, error: `Tipo "${body.type}" não suportado` }, 501);
  }

  return { ok: true, metaBody };
}
