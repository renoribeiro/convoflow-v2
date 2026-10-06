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

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
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
    mimeType: file.type || 'application/octet-stream',
    fileName: file.name,
    size: file.size,
  };
}

export function detectMediaTypeFromMime(mime: string): 'image' | 'video' | 'audio' | 'document' {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}
