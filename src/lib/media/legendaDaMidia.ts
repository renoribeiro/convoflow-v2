/**
 * O texto que acompanha uma mídia na conversa.
 *
 * Os webhooks gravam um rótulo no `content` da mensagem de mídia, para a lista
 * de conversas e para quando o arquivo não chega: a Meta grava "[Imagem]",
 * "[Vídeo] <legenda>", "[Documento] <nome do arquivo>", "[Áudio]", "[Sticker]";
 * o Evolution e o histórico importado gravam o rótulo sozinho quando não há
 * legenda ("[Imagem]", "[Arquivo de Áudio]", "[Figurinha]"...).
 *
 * Com a mídia NA TELA o rótulo é ruído: a bolha mostra só o que o cliente
 * escreveu. Sem a mídia (arquivo que não chegou) a bolha cai no texto e o
 * rótulo continua lá, que é o único aviso do que era.
 */

const ROTULOS = ['Imagem', 'Áudio', 'Audio', 'Arquivo de Áudio', 'Vídeo', 'Video', 'Documento', 'Figurinha', 'Sticker'];
const ROTULO_NO_COMECO = new RegExp(`^\\s*\\[(?:${ROTULOS.join('|')})\\]\\s*`, 'i');

/** "[Imagem] olha isso" → "olha isso"; "[Áudio]" → ""; texto sem rótulo fica igual (sem as pontas). */
export function semRotuloDeMidia(texto: string | null | undefined): string {
  if (typeof texto !== 'string') return '';
  return texto.replace(ROTULO_NO_COMECO, '').trim();
}
