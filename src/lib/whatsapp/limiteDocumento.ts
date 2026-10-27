import { detectMediaTypeFromMime } from '@/services/whatsapp/media-upload';

/**
 * Documento grande demais para número Evolution ou WAHA.
 *
 * O envio desses números sai pelo servidor, que lê o arquivo do bucket privado
 * e manda os bytes ao provedor (supabase/functions/_shared/message-send.ts,
 * MEDIA_LIMIT_BYTES). Acima de 30 MB a função do servidor não tem memória para
 * isso, e o arquivo nem deve subir: a tela recusa antes, com a frase abaixo.
 * A API Oficial (Meta) baixa por link e segue com o limite dela.
 */
export const LIMITE_DOCUMENTO_BYTES = 30 * 1024 * 1024;

export const DOCUMENTO_GRANDE_DEMAIS =
  'Este arquivo passa de 30 MB e não pode ser enviado por este número. Envie um link para o arquivo.';

/** null = pode seguir; texto = o motivo para mostrar na tela. */
export function motivoDocumentoGrande(
  provider: string | null | undefined,
  file: { type: string; size: number },
): string | null {
  const p = provider || 'evolution';
  if (p !== 'evolution' && p !== 'waha') return null;
  if (detectMediaTypeFromMime(file.type || '') !== 'document') return null;
  return file.size > LIMITE_DOCUMENTO_BYTES ? DOCUMENTO_GRANDE_DEMAIS : null;
}
