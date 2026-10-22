import { describe, it, expect } from 'vitest';
import {
  BITRATE_ARQUIVO,
  BITRATE_VOZ,
  LIMITE_GRAVACAO_SEGUNDOS,
  MENSAGENS_MICROFONE,
  escolherFormatoGravacao,
  formatarDuracao,
  mensagemErroMicrofone,
} from './recording';

/** O que cada navegador responde em `MediaRecorder.isTypeSupported` (2026). */
const NAVEGADORES = {
  // Medido no Chromium 151 (headless) em 2026-10-22.
  chrome: [
    'audio/webm',
    'audio/webm;codecs=opus',
    'audio/mp4',
    'audio/mp4;codecs=opus',
    'audio/mp4;codecs=mp4a.40.2',
  ],
  // Firefox: só webm e ogg, Opus. Padrão ogg.
  firefox: ['audio/webm', 'audio/webm;codecs=opus', 'audio/ogg', 'audio/ogg;codecs=opus'],
  // Safari 18.4+: WebM/Opus e MP4/AAC.
  safari184: ['audio/webm', 'audio/webm;codecs=opus', 'audio/mp4', 'audio/mp4;codecs=mp4a.40.2'],
  // iPhone antes do 18.4: só MP4/AAC.
  iphoneAntigo: ['audio/mp4', 'audio/mp4;codecs=mp4a.40.2'],
  // Safari que responde só ao tipo genérico.
  iphoneSoGenerico: ['audio/mp4'],
} as const;

const suporte = (lista: readonly string[]) => (t: string) => lista.includes(t);

describe('escolherFormatoGravacao: formato por navegador', () => {
  it('Chrome, Edge e Android gravam WebM/Opus e vão como mensagem de voz', () => {
    const f = escolherFormatoGravacao(suporte(NAVEGADORES.chrome));
    expect(f).toMatchObject({ mimeType: 'audio/webm;codecs=opus', container: 'webm', envio: 'voz' });
    expect(f?.audioBitsPerSecond).toBe(BITRATE_VOZ);
  });

  it('Firefox grava OGG/Opus direto e vai como mensagem de voz', () => {
    expect(escolherFormatoGravacao(suporte(NAVEGADORES.firefox))).toMatchObject({
      mimeType: 'audio/ogg;codecs=opus',
      container: 'ogg',
      envio: 'voz',
    });
  });

  it('Safari 18.4+ (iPhone e Mac) grava WebM/Opus e vai como mensagem de voz', () => {
    expect(escolherFormatoGravacao(suporte(NAVEGADORES.safari184))).toMatchObject({
      mimeType: 'audio/webm;codecs=opus',
      envio: 'voz',
    });
  });

  it('iPhone antes do 18.4 grava MP4/AAC e vai como ARQUIVO (M4A)', () => {
    const f = escolherFormatoGravacao(suporte(NAVEGADORES.iphoneAntigo));
    expect(f).toMatchObject({ mimeType: 'audio/mp4;codecs=mp4a.40.2', container: 'mp4', envio: 'arquivo' });
    expect(f?.audioBitsPerSecond).toBe(BITRATE_ARQUIVO);
  });

  it('iPhone que só responde ao tipo genérico também vai como arquivo', () => {
    expect(escolherFormatoGravacao(suporte(NAVEGADORES.iphoneSoGenerico))).toMatchObject({
      mimeType: 'audio/mp4',
      envio: 'arquivo',
    });
  });

  it('navegador que não grava áudio devolve null', () => {
    expect(escolherFormatoGravacao(() => false)).toBeNull();
  });

  it('navegador que LANÇA em vez de responder segue para o próximo formato', () => {
    const f = escolherFormatoGravacao((t) => {
      if (t.startsWith('audio/ogg')) throw new Error('não implementado');
      return t === 'audio/webm;codecs=opus';
    });
    expect(f?.mimeType).toBe('audio/webm;codecs=opus');
  });

  it('a taxa de voz fica entre 24 e 32 kbps (decisão do dono)', () => {
    for (const b of [BITRATE_VOZ, BITRATE_ARQUIVO]) {
      expect(b).toBeGreaterThanOrEqual(24_000);
      expect(b).toBeLessThanOrEqual(32_000);
    }
  });
});

describe('limite de gravação', () => {
  it('é de 5 minutos', () => {
    expect(LIMITE_GRAVACAO_SEGUNDOS).toBe(300);
    expect(formatarDuracao(LIMITE_GRAVACAO_SEGUNDOS)).toBe('05:00');
  });
});

describe('mensagemErroMicrofone', () => {
  const erro = (name: string) => Object.assign(new Error('x'), { name });

  it('microfone bloqueado pela pessoa ou pelo navegador', () => {
    for (const n of ['NotAllowedError', 'PermissionDeniedError', 'SecurityError']) {
      expect(mensagemErroMicrofone(erro(n))).toBe(MENSAGENS_MICROFONE.bloqueado);
    }
    expect(MENSAGENS_MICROFONE.bloqueado).toBe(
      'O microfone está bloqueado. Clique no cadeado ao lado do endereço do site e permita o microfone.',
    );
  });

  it('nenhum microfone no aparelho', () => {
    for (const n of ['NotFoundError', 'DevicesNotFoundError', 'OverconstrainedError']) {
      expect(mensagemErroMicrofone(erro(n))).toBe('Nenhum microfone encontrado neste aparelho.');
    }
  });

  it('microfone ocupado por outro programa', () => {
    for (const n of ['NotReadableError', 'TrackStartError', 'AbortError']) {
      expect(mensagemErroMicrofone(erro(n))).toBe(
        'O microfone está sendo usado por outro programa. Feche-o e tente de novo.',
      );
    }
  });

  it('qualquer outro erro (ou algo que nem é erro) cai na frase genérica', () => {
    expect(mensagemErroMicrofone(erro('TypeError'))).toBe(MENSAGENS_MICROFONE.generico);
    expect(mensagemErroMicrofone('texto solto')).toBe(MENSAGENS_MICROFONE.generico);
    expect(mensagemErroMicrofone(null)).toBe(MENSAGENS_MICROFONE.generico);
  });

  it('DOMException real do navegador é reconhecida pelo nome', () => {
    expect(mensagemErroMicrofone(new DOMException('negado', 'NotAllowedError'))).toBe(
      MENSAGENS_MICROFONE.bloqueado,
    );
  });
});

describe('formatarDuracao', () => {
  it('formata minutos e segundos', () => {
    expect(formatarDuracao(0)).toBe('00:00');
    expect(formatarDuracao(9.9)).toBe('00:09');
    expect(formatarDuracao(75)).toBe('01:15');
    expect(formatarDuracao(-3)).toBe('00:00');
  });
});
