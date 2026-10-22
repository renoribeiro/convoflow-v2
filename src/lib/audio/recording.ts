/**
 * Gravação de áudio no navegador (Conversas): que formato pedir ao
 * MediaRecorder, o limite de tempo e as frases de erro do microfone.
 *
 * Nenhum navegador grava OGG, que é o formato da mensagem de voz do WhatsApp,
 * exceto o Firefox. Chrome, Edge, Android e Safari 18.4+ gravam WebM/Opus: o
 * som é o mesmo Opus, só a "caixa" muda, e `voiceNote.ts` troca a caixa para
 * OGG sem regravar. iPhone antes do 18.4 só grava MP4/AAC: vai como ARQUIVO de
 * áudio (M4A), não como mensagem de voz (decisão do dono, 2026-10-22).
 */

/** 5 minutos. Ao chegar aqui a gravação para sozinha e vai para a revisão. */
export const LIMITE_GRAVACAO_SEGUNDOS = 300;

/**
 * Opus mono a 24 kbps: voz clara e arquivo pequeno. Até uns 2min50s fica abaixo
 * de 512 KB, o limite para o WhatsApp mostrar o botão de tocar na hora (acima
 * disso o cliente vê "baixar" antes, mas funciona).
 */
export const BITRATE_VOZ = 24_000;
/** AAC rende menos que Opus no mesmo tamanho; 32 kbps segura a voz. */
export const BITRATE_ARQUIVO = 32_000;

export type FormatoGravacao = {
  /** O que vai para `new MediaRecorder(stream, { mimeType })`. */
  mimeType: string;
  container: 'ogg' | 'webm' | 'mp4';
  /** `voz` = sai como mensagem de voz (OGG/Opus); `arquivo` = sai como M4A. */
  envio: 'voz' | 'arquivo';
  audioBitsPerSecond: number;
};

/** Ordem de preferência. O primeiro que o navegador aceitar vence. */
const CANDIDATOS: readonly FormatoGravacao[] = [
  // Firefox: já é OGG/Opus.
  { mimeType: 'audio/ogg;codecs=opus', container: 'ogg', envio: 'voz', audioBitsPerSecond: BITRATE_VOZ },
  // Chrome, Edge, Android, Safari 18.4+.
  { mimeType: 'audio/webm;codecs=opus', container: 'webm', envio: 'voz', audioBitsPerSecond: BITRATE_VOZ },
  // Safari com Opus dentro de MP4 (quando o aparelho tem).
  { mimeType: 'audio/mp4;codecs=opus', container: 'mp4', envio: 'voz', audioBitsPerSecond: BITRATE_VOZ },
  // iPhone antes do 18.4: só AAC.
  { mimeType: 'audio/mp4;codecs=mp4a.40.2', container: 'mp4', envio: 'arquivo', audioBitsPerSecond: BITRATE_ARQUIVO },
  { mimeType: 'audio/mp4', container: 'mp4', envio: 'arquivo', audioBitsPerSecond: BITRATE_ARQUIVO },
];

/**
 * Escolhe o formato de gravação. Recebe o `MediaRecorder.isTypeSupported` (ou
 * um falso, nos testes). `null` = este navegador não grava áudio.
 */
export function escolherFormatoGravacao(
  isTypeSupported: (mimeType: string) => boolean,
): FormatoGravacao | null {
  for (const c of CANDIDATOS) {
    try {
      if (isTypeSupported(c.mimeType)) return c;
    } catch {
      // Navegador antigo que lança em vez de responder false: segue a lista.
    }
  }
  return null;
}

export const MENSAGENS_MICROFONE = {
  bloqueado:
    'O microfone está bloqueado. Clique no cadeado ao lado do endereço do site e permita o microfone.',
  naoEncontrado: 'Nenhum microfone encontrado neste aparelho.',
  emUso: 'O microfone está sendo usado por outro programa. Feche-o e tente de novo.',
  generico: 'Não foi possível usar o microfone. Tente de novo.',
} as const;

/** Traduz o erro do `getUserMedia` para a frase que a pessoa lê. */
export function mensagemErroMicrofone(err: unknown): string {
  const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: unknown }).name) : '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError': // nome antigo do Chrome
    case 'SecurityError':
      return MENSAGENS_MICROFONE.bloqueado;
    case 'NotFoundError':
    case 'DevicesNotFoundError': // nome antigo do Chrome
    case 'OverconstrainedError':
      return MENSAGENS_MICROFONE.naoEncontrado;
    case 'NotReadableError':
    case 'TrackStartError': // nome antigo do Chrome
    case 'AbortError':
      return MENSAGENS_MICROFONE.emUso;
    default:
      return MENSAGENS_MICROFONE.generico;
  }
}

/** 75 → "01:15". */
export function formatarDuracao(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
