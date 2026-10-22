import { describe, it, expect } from 'vitest';
import {
  LIMITE_AUDIO_BYTES,
  MENSAGENS_AUDIO_ANEXADO,
  ehArquivoDeAudio,
  ehNotaDeVozPelaUrl,
  tipoBase,
  validarAudioAnexado,
} from './audioFile';

const arquivo = (nome: string, type: string, tamanho = 10) =>
  new File([new Uint8Array(tamanho)], nome, { type });

/** File de tamanho "grande" sem alocar os bytes. */
function arquivoGrande(nome: string, type: string, tamanho: number): File {
  const f = arquivo(nome, type, 1);
  Object.defineProperty(f, 'size', { value: tamanho });
  return f;
}

describe('validarAudioAnexado: o que o clipe aceita', () => {
  it.each([
    ['recado.mp3', 'audio/mpeg', 'audio/mpeg'],
    ['recado.m4a', 'audio/mp4', 'audio/mp4'],
    ['recado.aac', 'audio/aac', 'audio/aac'],
    ['recado.ogg', 'audio/ogg', 'audio/ogg'],
  ])('%s é aceito com o tipo %s', (nome, type, esperado) => {
    const r = validarAudioAnexado(arquivo(nome, type));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.file.type).toBe(esperado);
  });

  it.each([
    // O Windows informa .m4a como audio/x-m4a; o bucket só aceita audio/mp4.
    ['recado.m4a', 'audio/x-m4a', 'audio/mp4'],
    ['recado.aac', 'audio/x-aac', 'audio/aac'],
    ['recado.aac', '', 'audio/aac'],
    ['recado.mp3', 'audio/mp3', 'audio/mpeg'],
    ['RECADO.MP3', 'audio/mpeg', 'audio/mpeg'],
    ['recado.ogg', 'audio/ogg; codecs=opus', 'audio/ogg'],
  ])('%s com tipo "%s" sobe como %s', (nome, type, esperado) => {
    const r = validarAudioAnexado(arquivo(nome, type));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.file.type).toBe(esperado);
      expect(r.file.name).toBe(nome);
    }
  });

  it.each([
    ['gravacao.wav', 'audio/wav'],
    ['gravacao.webm', 'audio/webm'],
    ['gravacao.opus', 'audio/ogg'],
    ['gravacao.amr', 'audio/amr'],
    ['gravacao.flac', 'audio/flac'],
    ['sem-extensao', 'audio/x-wav'],
  ])('%s recebe "formato não aceito"', (nome, type) => {
    expect(validarAudioAnexado(arquivo(nome, type))).toEqual({
      ok: false,
      motivo: 'Formato de áudio não aceito. Envie MP3, M4A, AAC ou OGG.',
    });
  });

  it('arquivo acima de 16 MB é recusado com o motivo', () => {
    const r = validarAudioAnexado(arquivoGrande('longo.mp3', 'audio/mpeg', LIMITE_AUDIO_BYTES + 1));
    expect(r).toEqual({ ok: false, motivo: MENSAGENS_AUDIO_ANEXADO.tamanho });
  });

  it('exatamente 16 MB ainda passa', () => {
    expect(validarAudioAnexado(arquivoGrande('limite.mp3', 'audio/mpeg', LIMITE_AUDIO_BYTES)).ok).toBe(true);
  });

  it('arquivo vazio é recusado', () => {
    expect(validarAudioAnexado(arquivo('vazio.mp3', 'audio/mpeg', 0))).toEqual({
      ok: false,
      motivo: MENSAGENS_AUDIO_ANEXADO.vazio,
    });
  });
});

describe('ehArquivoDeAudio', () => {
  it('reconhece pelo tipo ou pela extensão', () => {
    expect(ehArquivoDeAudio({ name: 'x.bin', type: 'audio/mpeg' })).toBe(true);
    expect(ehArquivoDeAudio({ name: 'x.aac', type: '' })).toBe(true);
    expect(ehArquivoDeAudio({ name: 'x.wav', type: '' })).toBe(true);
  });

  it('imagem, vídeo e documento não são áudio', () => {
    expect(ehArquivoDeAudio({ name: 'foto.jpg', type: 'image/jpeg' })).toBe(false);
    expect(ehArquivoDeAudio({ name: 'video.mp4', type: 'video/mp4' })).toBe(false);
    expect(ehArquivoDeAudio({ name: 'contrato.pdf', type: 'application/pdf' })).toBe(false);
  });
});

describe('ehNotaDeVozPelaUrl', () => {
  const base = 'https://projeto.supabase.co/storage/v1/object/public/whatsapp-media/aaaaaaaa-0000-4000-8000-000000000001';

  it('OGG é mensagem de voz: o recebido da Meta e o gravado aqui', () => {
    expect(ehNotaDeVozPelaUrl(`${base}/inbound/wamid.FAKE1.ogg`)).toBe(true);
    expect(ehNotaDeVozPelaUrl(`${base}/1700000000000-voz-1700000000000.ogg`)).toBe(true);
    expect(ehNotaDeVozPelaUrl(`${base}/x.OPUS?download=1`)).toBe(true);
  });

  it('MP3 e M4A são arquivo de áudio, sem microfone', () => {
    expect(ehNotaDeVozPelaUrl(`${base}/recado.mp3`)).toBe(false);
    expect(ehNotaDeVozPelaUrl(`${base}/audio-1700000000000.m4a`)).toBe(false);
  });

  it('não confunde ".ogg" no meio do endereço nem endereço vazio', () => {
    expect(ehNotaDeVozPelaUrl(`${base}/x.mp3?nome=a.ogg`)).toBe(false);
    expect(ehNotaDeVozPelaUrl(null)).toBe(false);
    expect(ehNotaDeVozPelaUrl('')).toBe(false);
  });
});

describe('tipoBase', () => {
  it('tira os parâmetros e põe em minúsculas', () => {
    expect(tipoBase('Audio/OGG; codecs=opus')).toBe('audio/ogg');
    expect(tipoBase(undefined)).toBe('');
  });
});
