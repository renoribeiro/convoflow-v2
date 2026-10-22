/**
 * Gravador de mensagem de voz das Conversas.
 *
 * O que precisa continuar verdadeiro:
 *  - grava → para → OUVE → envia ou descarta (nada sai sem a pessoa ouvir);
 *  - para sozinho em 5 minutos e vai para a prévia;
 *  - cada erro do microfone tem a sua frase em pt-BR;
 *  - com motivo de bloqueio (janela de 24 h, número desconectado) o botão
 *    avisa e NEM abre o microfone;
 *  - formato e taxa pedidos ao MediaRecorder: Opus mono a 24 kbps.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';

const toast = vi.hoisted(() => ({ error: vi.fn(), info: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const prepararGravacao = vi.hoisted(() =>
  vi.fn(async (_blob: Blob, formato: { envio: 'voz' | 'arquivo' }) => ({
    file: new File(['x'], formato.envio === 'voz' ? 'voz-1.ogg' : 'audio-1.m4a', {
      type: formato.envio === 'voz' ? 'audio/ogg' : 'audio/mp4',
    }),
    voz: formato.envio === 'voz',
  })),
);
vi.mock('@/lib/audio/voiceNote', async (orig) => ({
  ...(await orig<typeof import('@/lib/audio/voiceNote')>()),
  prepararGravacao,
}));

import { AudioRecorder, TEXTOS_GRAVADOR } from './AudioRecorder';
import { MENSAGENS_MICROFONE } from '@/lib/audio/recording';
import { ErroPreparoAudio } from '@/lib/audio/voiceNote';

// ---- microfone e MediaRecorder falsos ---------------------------------------

let suportados: string[] = ['audio/webm', 'audio/webm;codecs=opus'];

class FakeRecorder {
  static ultimo: FakeRecorder | null = null;
  static isTypeSupported = (t: string) => suportados.includes(t);
  state: 'inactive' | 'recording' = 'inactive';
  mimeType: string;
  options: MediaRecorderOptions;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(_stream: unknown, options: MediaRecorderOptions) {
    this.options = options;
    this.mimeType = options.mimeType ?? '';
    FakeRecorder.ultimo = this;
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['opus'], { type: this.mimeType }) });
    this.onstop?.();
  }
}

const trilha = { stop: vi.fn() };
const getUserMedia = vi.fn(async () => ({ getTracks: () => [trilha] }));

beforeEach(() => {
  suportados = ['audio/webm', 'audio/webm;codecs=opus'];
  FakeRecorder.ultimo = null;
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
  URL.createObjectURL = vi.fn(() => 'blob:previa');
  URL.revokeObjectURL = vi.fn();
  getUserMedia.mockClear();
  getUserMedia.mockImplementation(async () => ({ getTracks: () => [trilha] }));
  trilha.stop.mockClear();
  prepararGravacao.mockClear();
  toast.error.mockClear();
  toast.info.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderGravador(props: Partial<React.ComponentProps<typeof AudioRecorder>> = {}) {
  const onSend = props.onSend ?? vi.fn(async () => true);
  render(
    <TooltipProvider>
      <AudioRecorder onSend={onSend} {...props} />
    </TooltipProvider>,
  );
  return { onSend };
}

/** Clica no microfone e deixa o getUserMedia resolver. */
async function comecarGravacao() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Gravar áudio' }));
  });
}

async function pararEOuvir() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Parar e ouvir' }));
  });
}

describe('AudioRecorder: gravar, ouvir e enviar', () => {
  it('pede Opus mono a 24 kbps e mostra o tempo enquanto grava', async () => {
    renderGravador();
    await comecarGravacao();

    expect(getUserMedia).toHaveBeenCalledWith({
      audio: expect.objectContaining({ channelCount: { ideal: 1 } }),
    });
    expect(FakeRecorder.ultimo?.options).toEqual({
      mimeType: 'audio/webm;codecs=opus',
      audioBitsPerSecond: 24_000,
    });
    expect(screen.getByRole('group', { name: 'Gravando áudio' })).toBeInTheDocument();
    expect(screen.getByTestId('audio-timer')).toHaveTextContent('00:00');
  });

  it('parar NÃO envia: abre a prévia para ouvir; enviar manda como mensagem de voz', async () => {
    const { onSend } = renderGravador();
    await comecarGravacao();
    await pararEOuvir();

    // Microfone liberado ao parar.
    expect(trilha.stop).toHaveBeenCalled();
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Ouvir antes de enviar')).toHaveAttribute('src', 'blob:previa');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enviar áudio' }));
    });

    expect(prepararGravacao).toHaveBeenCalledWith(expect.any(Blob), expect.objectContaining({ envio: 'voz' }));
    expect(onSend).toHaveBeenCalledTimes(1);
    const [file, opcoes] = (onSend as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect((file as File).type).toBe('audio/ogg');
    expect(opcoes).toEqual({ voz: true });
    // Volta ao botão do microfone.
    expect(screen.getByRole('button', { name: 'Gravar áudio' })).toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:previa');
  });

  it('descartar na prévia não envia nada', async () => {
    const { onSend } = renderGravador();
    await comecarGravacao();
    await pararEOuvir();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Descartar áudio' }));
    });
    expect(onSend).not.toHaveBeenCalled();
    expect(prepararGravacao).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Gravar áudio' })).toBeInTheDocument();
  });

  it('descartar durante a gravação não abre prévia', async () => {
    const { onSend } = renderGravador();
    await comecarGravacao();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Descartar gravação' }));
    });
    expect(screen.queryByLabelText('Ouvir antes de enviar')).toBeNull();
    expect(onSend).not.toHaveBeenCalled();
    expect(trilha.stop).toHaveBeenCalled();
  });

  it('iPhone antes do 18.4 (só MP4/AAC): vai como arquivo, não como voz', async () => {
    suportados = ['audio/mp4', 'audio/mp4;codecs=mp4a.40.2'];
    const { onSend } = renderGravador();
    await comecarGravacao();
    expect(FakeRecorder.ultimo?.options).toEqual({
      mimeType: 'audio/mp4;codecs=mp4a.40.2',
      audioBitsPerSecond: 32_000,
    });
    await pararEOuvir();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enviar áudio' }));
    });
    expect(prepararGravacao).toHaveBeenCalledWith(expect.any(Blob), expect.objectContaining({ envio: 'arquivo' }));
    expect((onSend as ReturnType<typeof vi.fn>).mock.calls[0]![1]).toEqual({ voz: false });
  });

  it('se o envio for barrado (onSend devolve false), a prévia continua na tela', async () => {
    renderGravador({ onSend: vi.fn(async () => false) });
    await comecarGravacao();
    await pararEOuvir();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enviar áudio' }));
    });
    expect(screen.getByLabelText('Ouvir antes de enviar')).toBeInTheDocument();
  });

  it('falha ao preparar o áudio: avisa e mantém a prévia para tentar de novo', async () => {
    prepararGravacao.mockRejectedValueOnce(new ErroPreparoAudio());
    const { onSend } = renderGravador();
    await comecarGravacao();
    await pararEOuvir();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enviar áudio' }));
    });
    expect(onSend).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Não foi possível preparar o áudio para envio. Grave de novo.');
    expect(screen.getByRole('button', { name: 'Enviar áudio' })).toBeInTheDocument();
  });
});

describe('AudioRecorder: limite de 5 minutos', () => {
  it('para sozinho em 05:00 e abre a prévia', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const { onSend } = renderGravador();
    await comecarGravacao();

    await act(async () => {
      vi.advanceTimersByTime(299_000);
    });
    expect(FakeRecorder.ultimo?.state).toBe('recording');
    expect(screen.getByTestId('audio-timer')).toHaveTextContent('04:59');

    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    expect(toast.info).toHaveBeenCalledWith(TEXTOS_GRAVADOR.limite);
    expect(screen.getByLabelText('Ouvir antes de enviar')).toBeInTheDocument();
    expect(trilha.stop).toHaveBeenCalled();
    // Parar no limite não envia sozinho.
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe('AudioRecorder: erros do microfone', () => {
  it.each([
    ['NotAllowedError', MENSAGENS_MICROFONE.bloqueado],
    ['NotFoundError', MENSAGENS_MICROFONE.naoEncontrado],
    ['NotReadableError', MENSAGENS_MICROFONE.emUso],
  ])('%s mostra a frase certa e não começa a gravar', async (nome, frase) => {
    getUserMedia.mockRejectedValueOnce(new DOMException('x', nome));
    renderGravador();
    await comecarGravacao();
    expect(toast.error).toHaveBeenCalledWith(frase);
    expect(FakeRecorder.ultimo).toBeNull();
    expect(screen.getByRole('button', { name: 'Gravar áudio' })).toBeInTheDocument();
  });

  it('navegador sem formato de gravação avisa para anexar pelo clipe', async () => {
    suportados = [];
    renderGravador();
    await comecarGravacao();
    expect(toast.error).toHaveBeenCalledWith(TEXTOS_GRAVADOR.semSuporte);
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('navegador sem microfone algum (sem mediaDevices) não mostra o botão', () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    renderGravador();
    expect(screen.queryByRole('button', { name: 'Gravar áudio' })).toBeNull();
  });
});

describe('AudioRecorder: bloqueado antes de gravar', () => {
  it('com motivo, o clique mostra o motivo e NÃO abre o microfone', async () => {
    const motivo = 'Fora da janela de 24h: o cliente não escreve há mais de 24 horas. Envie um template aprovado para reabrir a conversa.';
    renderGravador({ blockedReason: motivo });
    const botao = screen.getByRole('button', { name: 'Gravar áudio' });
    expect(botao).toHaveAttribute('aria-disabled', 'true');

    await comecarGravacao();
    expect(toast.error).toHaveBeenCalledWith(motivo);
    expect(getUserMedia).not.toHaveBeenCalled();
  });
});
