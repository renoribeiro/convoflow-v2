/**
 * Áudio anexado pelo clipe (Conversas): o que aceitamos e com que tipo sobe.
 *
 * Aceitamos MP3, M4A, AAC e OGG (decisão do dono, 2026-10-22). São formatos
 * que a Cloud API da Meta recebe como áudio; WAV e WebM ela recusa. O arquivo
 * sai como ARQUIVO de áudio, não como mensagem de voz.
 *
 * O tipo que o navegador informa não é confiável (no Windows um .m4a chega como
 * `audio/x-m4a`, um .aac às vezes sem tipo nenhum), e o bucket `whatsapp-media`
 * só aceita os tipos da lista dele. Por isso a extensão manda e o tipo é
 * reescrito para o padrão antes do upload.
 */

/** Limite da Meta para áudio (Cloud API, 16 MB). Vale para todos os canais. */
export const LIMITE_AUDIO_BYTES = 16 * 1024 * 1024;

type AudioAceito = { ext: string; mime: string; apelidos: readonly string[] };

const ACEITOS: readonly AudioAceito[] = [
  { ext: 'mp3', mime: 'audio/mpeg', apelidos: ['audio/mpeg', 'audio/mp3', 'audio/mpeg3', 'audio/x-mpeg-3'] },
  { ext: 'm4a', mime: 'audio/mp4', apelidos: ['audio/mp4', 'audio/x-m4a', 'audio/m4a'] },
  { ext: 'aac', mime: 'audio/aac', apelidos: ['audio/aac', 'audio/x-aac', 'audio/aacp'] },
  { ext: 'ogg', mime: 'audio/ogg', apelidos: ['audio/ogg', 'application/ogg'] },
];

/** Extensões de áudio que a pessoa pode tentar anexar e que recusamos com aviso. */
const OUTRAS_EXTENSOES_DE_AUDIO = ['wav', 'webm', 'weba', 'opus', 'oga', 'amr', 'flac', 'wma', 'aif', 'aiff', 'mid', 'midi', '3ga'];

export const MENSAGENS_AUDIO_ANEXADO = {
  formato: 'Formato de áudio não aceito. Envie MP3, M4A, AAC ou OGG.',
  tamanho: 'Esse áudio passa de 16 MB, o limite do WhatsApp.',
  vazio: 'Esse arquivo de áudio está vazio.',
} as const;

function extensaoDe(nome: string): string {
  const i = nome.lastIndexOf('.');
  return i >= 0 ? nome.slice(i + 1).toLowerCase() : '';
}

/** Tipo sem parâmetros e em minúsculas: "audio/ogg; codecs=opus" → "audio/ogg". */
export function tipoBase(mime: string | null | undefined): string {
  return ((mime ?? '').split(';')[0] ?? '').trim().toLowerCase();
}

/** O arquivo escolhido é um áudio (pelo tipo OU pela extensão)? */
export function ehArquivoDeAudio(file: Pick<File, 'name' | 'type'>): boolean {
  if (tipoBase(file.type).startsWith('audio/')) return true;
  const ext = extensaoDe(file.name);
  return ACEITOS.some((a) => a.ext === ext) || OUTRAS_EXTENSOES_DE_AUDIO.includes(ext);
}

export type AudioAnexadoValidado = { ok: true; file: File } | { ok: false; motivo: string };

/**
 * Confere um áudio anexado e devolve o arquivo com o tipo padrão (o que o
 * bucket e a Meta aceitam). Chame só para arquivos em que `ehArquivoDeAudio`
 * deu true.
 */
export function validarAudioAnexado(file: File): AudioAnexadoValidado {
  const ext = extensaoDe(file.name);
  const base = tipoBase(file.type);
  const aceito =
    ACEITOS.find((a) => a.ext === ext) ??
    // Sem extensão conhecida: vale o tipo, se for um dos apelidos.
    (ext === '' || !OUTRAS_EXTENSOES_DE_AUDIO.includes(ext)
      ? ACEITOS.find((a) => a.apelidos.includes(base))
      : undefined);

  if (!aceito) return { ok: false, motivo: MENSAGENS_AUDIO_ANEXADO.formato };
  if (file.size === 0) return { ok: false, motivo: MENSAGENS_AUDIO_ANEXADO.vazio };
  if (file.size > LIMITE_AUDIO_BYTES) return { ok: false, motivo: MENSAGENS_AUDIO_ANEXADO.tamanho };

  if (file.type === aceito.mime) return { ok: true, file };
  return { ok: true, file: new File([file], file.name, { type: aceito.mime, lastModified: file.lastModified }) };
}

/**
 * Mensagem de voz pelo endereço do arquivo: OGG é o formato da nota de voz do
 * WhatsApp, e o próprio WhatsApp mostra o microfone para todo OGG/Opus, mesmo
 * enviado como áudio comum. É assim que o balão decide o ícone, tanto do áudio
 * recebido (a Meta grava .ogg) quanto do que gravamos aqui.
 */
export function ehNotaDeVozPelaUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  let caminho = url;
  try {
    caminho = new URL(url).pathname;
  } catch {
    caminho = url.split(/[?#]/)[0] ?? '';
  }
  return /\.(ogg|opus)$/i.test(caminho);
}
