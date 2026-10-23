import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { WHATSAPP_MEDIA_BUCKET as BUCKET } from '@/lib/media/whatsappMedia';

/** Validade do link do envio: o provedor baixa o arquivo uma vez, na hora. */
export const UPLOAD_LINK_TTL_S = 60 * 60;

export interface UploadedMedia {
  /** Caminho no bucket. É ISTO que vai para `messages.media_url`. */
  path: string;
  /**
   * Link assinado do próprio upload (1 h), para o provedor baixar no envio
   * (Evolution e WAHA). Nunca é gravado: vence.
   */
  signedUrl: string;
  mimeType: string;
  fileName: string;
  size: number;
}

/**
 * Sobe o anexo do chat para o bucket privado `whatsapp-media`, na pasta da Loja
 * (`<tenant_id>/<ms>-<arquivo>`), e assina o próprio upload para o envio. A
 * regra do Storage deixa a pessoa assinar só o que ela mesma subiu; a bolha da
 * conversa depois pede o link pela função media-links (ver useMediaLinks).
 * Runbook: docs/RUNBOOK_midia_privada.md.
 */
export async function uploadWhatsAppMedia(file: File, tenantId: string): Promise<UploadedMedia> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${tenantId}/${Date.now()}-${safeName}`;

  // Tipo sem parâmetros ("audio/webm;codecs=opus" → "audio/webm"). O
  // allowed_mime_types do bucket comparava o texto inteiro até a correção do
  // Storage de 2026-09-15 (supabase/storage#1382), e o supabase-js manda um
  // File como multipart, onde vale o tipo do próprio arquivo e não o
  // `contentType` abaixo. Por isso o arquivo é reembalado com o tipo limpo.
  const contentType = cleanMimeType(file.type);
  const body = file.type === contentType ? file : new File([file], file.name, { type: contentType });

  const { error } = await supabase.storage.from(BUCKET).upload(path, body, {
    contentType,
    upsert: false,
  });
  if (error) {
    logger.error('[uploadWhatsAppMedia] falhou', { error: error.message });
    throw new Error(
      `Falha ao subir arquivo. Verifique se o bucket '${BUCKET}' existe no Supabase Storage. ` +
      `Detalhe: ${error.message}`,
    );
  }

  const { data, error: signError } = await supabase.storage.from(BUCKET).createSignedUrl(path, UPLOAD_LINK_TTL_S);
  if (signError || !data?.signedUrl) {
    logger.error('[uploadWhatsAppMedia] link do envio falhou', { error: signError?.message });
    throw new Error('O arquivo subiu, mas não foi possível preparar o envio. Tente de novo.');
  }

  return {
    path,
    signedUrl: data.signedUrl,
    mimeType: contentType,
    fileName: file.name,
    size: file.size,
  };
}

/** "audio/ogg; codecs=opus" → "audio/ogg"; vazio → "application/octet-stream". */
export function cleanMimeType(mime: string | null | undefined): string {
  const base = ((mime ?? '').split(';')[0] ?? '').trim().toLowerCase();
  return base || 'application/octet-stream';
}

export function detectMediaTypeFromMime(mime: string): 'image' | 'video' | 'audio' | 'document' {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}
