/**
 * O miolo da troca de caixa para OGG/Opus, com o Mediabunny.
 *
 * Fica num arquivo próprio, importado só por `import('./oggOpusMux')` em
 * voiceNote.ts: assim o Mediabunny vai num pedaço separado do site, baixado no
 * primeiro envio de áudio, e com import nomeado o empacotador corta o resto da
 * biblioteca (vídeo, MP3, FLAC...). Não importe este arquivo de forma estática.
 */
import {
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  MP4,
  OGG,
  OggOutputFormat,
  Output,
  WEBM,
} from 'mediabunny';

/** Reembala Opus (WebM, MP4 ou OGG) em OGG/Opus mono. Lança em qualquer falha. */
export async function reembalarEmOggOpus(gravacao: Blob): Promise<ArrayBuffer> {
  const input = new Input({ source: new BlobSource(gravacao), formats: [WEBM, MP4, OGG] });
  const target = new BufferTarget();
  const output = new Output({ format: new OggOutputFormat(), target });
  const conversao = await Conversion.init({
    input,
    output,
    video: { discard: true },
    audio: { codec: 'opus', numberOfChannels: 1 },
    showWarnings: false,
  });
  if (!conversao.isValid) {
    throw new Error(
      `conversão inválida: ${conversao.discardedTracks.map((d) => d.reason).join(', ') || 'sem faixa de áudio'}`,
    );
  }
  await conversao.execute();
  if (!target.buffer || target.buffer.byteLength === 0) throw new Error('saída vazia');
  return target.buffer;
}
