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

const NOME_DO_ROTULO: Record<string, string> = {
  imagem: 'Foto',
  'áudio': 'Áudio',
  audio: 'Áudio',
  'arquivo de áudio': 'Áudio',
  'vídeo': 'Vídeo',
  video: 'Vídeo',
  documento: 'Documento',
  figurinha: 'Figurinha',
  sticker: 'Figurinha',
};

/**
 * Uma linha que fala de uma mensagem (citação, "Respondendo:"): sem o rótulo
 * cru do webhook. "[Imagem]" → "Foto"; "[Imagem] olha isso" → "Foto: olha isso";
 * texto sem rótulo fica igual.
 */
export function resumoDaMensagem(texto: string | null | undefined): string {
  if (typeof texto !== 'string') return '';
  const achado = ROTULO_NO_COMECO.exec(texto);
  if (!achado) return texto.trim();
  const nome = NOME_DO_ROTULO[achado[0].trim().slice(1, -1).toLowerCase()] ?? 'Arquivo';
  const resto = semRotuloDeMidia(texto);
  return resto ? `${nome}: ${resto}` : nome;
}
