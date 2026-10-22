/**
 * Objeto `audio` da Cloud API da Meta (SKILL meta-cloud-api; docs
 * developers.facebook.com/docs/whatsapp/cloud-api/messages/audio-messages).
 *
 * - O objeto aceita só `link` (ou `id`) e `voice`. Legenda e nome de arquivo
 *   não existem em áudio: nunca vão.
 * - `voice: true` = mensagem de voz (microfone, download automático,
 *   transcrição). Exige OGG com Opus, mono. Qualquer outro formato vai como
 *   áudio comum.
 * - Formatos aceitos (16 MB): AAC, AMR, MP3, M4A (audio/mp4) e OGG/Opus.
 *   WebM e WAV a Meta recusa: barramos aqui com a frase em pt-BR, antes de
 *   gastar a chamada.
 */

export const AUDIO_META_ACEITOS = ['audio/aac', 'audio/amr', 'audio/mpeg', 'audio/mp4', 'audio/ogg'] as const;

export const ERRO_FORMATO_AUDIO_META =
  'Formato de áudio não aceito pelo WhatsApp oficial. Envie OGG (Opus), MP3, M4A, AAC ou AMR.';

export type EntradaAudioMeta = {
  media_url?: string;
  mime_type?: string;
  ptt?: boolean;
};

export type ResultadoAudioMeta =
  | { ok: true; audio: { link: string; voice?: true } }
  | { ok: false; error: string };

export function montarAudioMeta(body: EntradaAudioMeta): ResultadoAudioMeta {
  if (!body.media_url) return { ok: false, error: 'media_url obrigatório' };
  const base = ((body.mime_type ?? '').split(';')[0] ?? '').trim().toLowerCase();
  if (base && !(AUDIO_META_ACEITOS as readonly string[]).includes(base)) {
    return { ok: false, error: ERRO_FORMATO_AUDIO_META };
  }
  const voz = body.ptt === true && base === 'audio/ogg';
  return { ok: true, audio: { link: body.media_url, ...(voz ? { voice: true as const } : {}) } };
}
