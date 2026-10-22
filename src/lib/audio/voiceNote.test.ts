/**
 * Troca de caixa WebM → OGG da mensagem de voz, com o Mediabunny de verdade.
 *
 * O fixture `gravacao-chrome-tom.webm` é uma gravação REAL do MediaRecorder do
 * Chrome (tom de 440 Hz, 1,5 s, Opus mono a 24 kbps, sem duração no cabeçalho,
 * exatamente como o Chrome entrega). Não tem voz de ninguém.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlobSource, Input, OGG } from 'mediabunny';
import { ErroPreparoAudio, paraOggOpus, prepararGravacao } from './voiceNote';

// O Blob do jsdom não tem arrayBuffer()/stream(), que o Mediabunny usa (o do
// navegador tem). Neste arquivo valem o Blob e o File do próprio Node.
const originais = { Blob: globalThis.Blob, File: globalThis.File };
beforeAll(() => {
  globalThis.Blob = NodeBlob as unknown as typeof Blob;
  globalThis.File = NodeFile as unknown as typeof File;
});
afterAll(() => {
  globalThis.Blob = originais.Blob;
  globalThis.File = originais.File;
});

const fixture = (nome: string) =>
  new Blob([readFileSync(join(process.cwd(), 'src', 'lib', 'audio', '__fixtures__', nome))]);

const bytes = async (b: Blob) => new Uint8Array(await b.arrayBuffer());
const ascii = (u: Uint8Array, de: number, ate: number) => String.fromCharCode(...u.subarray(de, ate));

async function lerOgg(b: Blob) {
  const input = new Input({ source: new BlobSource(b), formats: [OGG] });
  const faixa = await input.getPrimaryAudioTrack();
  return {
    codec: faixa?.codec,
    canais: faixa?.numberOfChannels,
    taxa: faixa?.sampleRate,
    duracao: await input.computeDuration(),
  };
}

describe('paraOggOpus', () => {
  it('reembala a gravação do Chrome (WebM/Opus) em OGG/Opus mono, com duração', async () => {
    const ogg = await paraOggOpus(fixture('gravacao-chrome-tom.webm'));
    const u = await bytes(ogg);

    expect(ogg.type).toBe('audio/ogg');
    expect(ascii(u, 0, 4)).toBe('OggS');
    // Cabeçalho Opus: "OpusHead", versão 1, e o byte seguinte é o nº de canais.
    const i = ascii(u, 0, 200).indexOf('OpusHead');
    expect(i).toBeGreaterThan(0);
    expect(u[i + 9]).toBe(1);

    const info = await lerOgg(ogg);
    expect(info.codec).toBe('opus');
    expect(info.canais).toBe(1);
    expect(info.taxa).toBe(48000);
    // O WebM do Chrome não traz duração; o OGG precisa trazer (o player mostra o tempo).
    expect(info.duracao).toBeGreaterThan(1.2);
    expect(info.duracao).toBeLessThan(2);
  });

  it('não regrava o som: o OGG tem praticamente o mesmo tamanho da gravação', async () => {
    const webm = fixture('gravacao-chrome-tom.webm');
    const ogg = await paraOggOpus(webm);
    // Só troca a caixa. Recodificar mudaria o tamanho bem mais que isso.
    expect(Math.abs(ogg.size - webm.size) / webm.size).toBeLessThan(0.25);
  });

  it('gravação em estéreo sem codificador Opus disponível falha com a frase da tela', async () => {
    // No navegador o Mediabunny recodifica para mono (WebCodecs). Aqui no Node
    // não há codificador: sem mono não há mensagem de voz válida, então falha
    // alto em vez de mandar estéreo para a Meta.
    await expect(paraOggOpus(fixture('tom-estereo.webm'))).rejects.toBeInstanceOf(ErroPreparoAudio);
  });

  it('arquivo que não é áudio falha com ErroPreparoAudio', async () => {
    const lixo = new Blob([new Uint8Array(2048).fill(7)]);
    await expect(paraOggOpus(lixo)).rejects.toThrow('Não foi possível preparar o áudio para envio. Grave de novo.');
  });
});

describe('prepararGravacao', () => {
  it('mensagem de voz: vira voz-<hora>.ogg, tipo audio/ogg, voz true', async () => {
    const r = await prepararGravacao(fixture('gravacao-chrome-tom.webm'), { envio: 'voz' }, 1700000000000);
    expect(r.voz).toBe(true);
    expect(r.file.name).toBe('voz-1700000000000.ogg');
    expect(r.file.type).toBe('audio/ogg');
    expect(ascii(await bytes(r.file), 0, 4)).toBe('OggS');
  });

  it('iPhone antes do 18.4 (MP4/AAC): vai como arquivo M4A, sem conversão', async () => {
    const aac = new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'audio/mp4' });
    const r = await prepararGravacao(aac, { envio: 'arquivo' }, 1700000000000);
    expect(r.voz).toBe(false);
    expect(r.file.name).toBe('audio-1700000000000.m4a');
    expect(r.file.type).toBe('audio/mp4');
    expect(Array.from(await bytes(r.file))).toEqual([1, 2, 3, 4, 5]);
  });

  it('gravação vazia não é enviada', async () => {
    await expect(prepararGravacao(new Blob([]), { envio: 'voz' })).rejects.toBeInstanceOf(ErroPreparoAudio);
  });
});
