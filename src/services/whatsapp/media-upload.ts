import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

const BUCKET = 'whatsapp-media';

export interface UploadedMedia {
  publicUrl: string;
  path: string;
  mimeType: string;
  fileName: string;
  size: number;
}

/**
 * Sobe um arquivo para o Supabase Storage no bucket `whatsapp-media`.
 *
 * Pendência: o bucket precisa existir e ter RLS adequada (read público para
 * URLs assinadas no chat). Caso o bucket não exista, criar via:
 *   ```sql
 *   insert into storage.buckets (id, name, public) values ('whatsapp-media', 'whatsapp-media', true);
 *   ```
 * Ajuste a policy depois para limitar uploads ao tenant.
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

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) {
    throw new Error('Bucket configurado, mas não foi possível obter a URL pública.');
  }

  return {
    publicUrl: data.publicUrl,
    path,
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
