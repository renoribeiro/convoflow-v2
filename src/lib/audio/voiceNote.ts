/**
 * Transforma a gravação do navegador no arquivo que vai para o WhatsApp.
 *
 * - Mensagem de voz: o WhatsApp exige OGG com Opus, mono. O navegador grava
 *   WebM/Opus (ou MP4/Opus): o Mediabunny tira os mesmos pacotes Opus de uma
 *   caixa e põe na outra, sem regravar o som (13 a 25 ms para 6 s de fala,
 *   medido no Chrome em 2026-10-22). Se a gravação vier em estéreo, ele
 *   recodifica para mono quando o navegador tem codificador Opus.
 * - Arquivo (iPhone antes do 18.4, só AAC): sai como está, em M4A.
 *
 * O Mediabunny (MPL-2.0, ~116 KB gzip) é carregado só aqui, no primeiro envio
 * de áudio: quem nunca grava não baixa nada.
 */
import type { FormatoGravacao } from './recording';

export class ErroPreparoAudio extends Error {
  constructor(causa?: unknown) {
    super('Não foi possível preparar o áudio para envio. Grave de novo.');
    this.name = 'ErroPreparoAudio';
    if (causa !== undefined) (this as { cause?: unknown }).cause = causa;
  }
}

/** Reembala Opus (WebM, MP4 ou OGG) em OGG/Opus mono. */
export async function paraOggOpus(gravacao: Blob): Promise<Blob> {
  let mux: typeof import('./oggOpusMux');
  try {
    mux = await import('./oggOpusMux');
  } catch (e) {
    // Falha de rede ao baixar o pedaço do Mediabunny (deploy novo, conexão caiu).
    throw new ErroPreparoAudio(e);
  }
  try {
    return new Blob([await mux.reembalarEmOggOpus(gravacao)], { type: 'audio/ogg' });
  } catch (e) {
    throw new ErroPreparoAudio(e);
  }
}

export type AudioPronto = { file: File; voz: boolean };

/**
 * Prepara a gravação para o envio, conforme o formato em que foi gravada.
 * `agora` só existe para o teste fixar o nome do arquivo.
 */
export async function prepararGravacao(
  gravacao: Blob,
  formato: Pick<FormatoGravacao, 'envio'>,
  agora: number = Date.now(),
): Promise<AudioPronto> {
  if (gravacao.size === 0) throw new ErroPreparoAudio();
  if (formato.envio === 'arquivo') {
    return { file: new File([gravacao], `audio-${agora}.m4a`, { type: 'audio/mp4' }), voz: false };
  }
  const ogg = await paraOggOpus(gravacao);
  return { file: new File([ogg], `voz-${agora}.ogg`, { type: 'audio/ogg' }), voz: true };
}
