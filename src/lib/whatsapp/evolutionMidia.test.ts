/**
 * Mídia dos números QR Code (Evolution 2.3.7): foto, áudio, vídeo, documento e
 * figurinha recebidos, e o que a Loja manda pelo celular do número.
 * Regra em supabase/functions/_shared/evolution-midia.ts. O formato do evento e
 * da resposta de /chat/getBase64FromMediaMessage é o do tag 2.3.7
 * (whatsapp.baileys.service.ts). Ids, Lojas e arquivos inventados.
 */
import { describe, it, expect } from 'vitest';
import {
  AVISO_SO_NO_CELULAR,
  TETO_DA_MIDIA_BYTES,
  baixadorDoEvolution,
  caminhosPossiveis,
  conteudoComAviso,
  depsDoServidor,
  escolherParaRecuperar,
  guardarMidiaDaEvolution,
  mimeDoBucket,
  tamanhoDeclarado,
  type Baixado,
  type ClienteDaMidia,
  type DepsDaMidia,
  type LinhaParaRecuperar,
  type PedidoDeMidia,
} from '../../../supabase/functions/_shared/evolution-midia.ts';
import { aplicarApagadas, depsDoBanco } from '../../../supabase/functions/_shared/evolution-apagada.ts';
import { caminhoBateComAMensagem, whatsappMediaPath } from '../../../supabase/functions/_shared/media-links.ts';

const LOJA = 'aaaaaaaa-0000-4000-8000-00000000000a';
const OUTRA_LOJA = 'aaaaaaaa-0000-4000-8000-00000000000b';
const ID_A = '3EB0AAAAAAAAAAAAAAAA01';
const ID_B = '3EB0AAAAAAAAAAAAAAAA02';
const JID = '99999000001111@lid';

// -----------------------------------------------------------------------------
// Banco e bucket de mentira, com o mesmo encadeamento do supabase-js
// -----------------------------------------------------------------------------

interface Linha {
  id: string;
  tenant_id: string;
  direction: string;
  message_type: string;
  evolution_message_id: string;
  content: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  media_url: string | null;
}

function ambiente(linhas: Linha[], falhar: { upload?: { message: string; statusCode?: string } } = {}) {
  const arquivos = new Map<string, { bytes: Uint8Array; tipo: string }>();
  const uploads: Array<{ caminho: string; tipo: string; upsert: boolean }> = [];
  const remocoes: string[][] = [];

  const cliente: ClienteDaMidia = {
    from(tabela: string) {
      expect(tabela).toBe('messages');
      const eq: Record<string, unknown> = {};
      const neq: Record<string, unknown> = {};
      let payload: Record<string, unknown> | null = null;
      const alvo = () =>
        linhas.filter((l) => {
          const r = l as unknown as Record<string, unknown>;
          return Object.entries(eq).every(([c, v]) => r[c] === v) && Object.entries(neq).every(([c, v]) => r[c] !== v);
        });
      const executar = () => {
        const achadas = alvo();
        if (payload) {
          for (const l of achadas) Object.assign(l, payload);
          return { data: achadas.map((l) => ({ id: l.id })), error: null };
        }
        return { data: achadas.map((l) => ({ ...l })), error: null };
      };
      const q = {
        select() { return q; },
        update(p: Record<string, unknown>) { payload = p; return q; },
        eq(c: string, v: unknown) { eq[c] = v; return q; },
        neq(c: string, v: unknown) { neq[c] = v; return q; },
        maybeSingle() {
          const r = executar();
          return Promise.resolve({ data: (r.data as unknown[])[0] ?? null, error: null });
        },
        then(ok: (r: unknown) => unknown) { return Promise.resolve(ok(executar())); },
      };
      return q;
    },
    storage: {
      from(bucket: string) {
        expect(bucket).toBe('whatsapp-media');
        return {
          async upload(caminho: string, bytes: Uint8Array, op: { contentType: string; upsert: boolean }) {
            uploads.push({ caminho, tipo: op.contentType, upsert: op.upsert });
            if (falhar.upload) return { data: null, error: falhar.upload };
            arquivos.set(caminho, { bytes, tipo: op.contentType });
            return { data: { path: caminho }, error: null };
          },
          async remove(caminhos: string[]) {
            remocoes.push(caminhos);
            const saiu = caminhos.filter((c) => arquivos.delete(c));
            return { data: saiu.map((name) => ({ name })), error: null };
          },
        };
      },
    },
  };
  return { cliente, linhas, arquivos, uploads, remocoes };
}

const linha = (over: Partial<Linha> = {}): Linha => ({
  id: 'linha-1',
  tenant_id: LOJA,
  direction: 'inbound',
  message_type: 'image',
  evolution_message_id: ID_A,
  content: '[Imagem]',
  status: 'received',
  metadata: { evolution: { tipo: 'lid' } },
  media_url: null,
  ...over,
});

const b64 = (texto: string) => btoa(texto);

/** Evolution de mentira: devolve sempre a mesma resposta e guarda o que foi pedido. */
function evolution(resposta: Baixado) {
  const pedidos: PedidoDeMidia['mensagem'][] = [];
  const baixar: DepsDaMidia['baixar'] = async (m) => {
    pedidos.push(m);
    return resposta;
  };
  return { baixar, pedidos };
}

/** O que o messages.upsert do 2.3.7 manda em `data.message` para cada tipo. */
const eventoDe = (campo: string, parte: Record<string, unknown>, id = ID_A, fromMe = false) => ({
  key: { remoteJid: JID, fromMe, id },
  message: { [campo]: parte, messageContextInfo: {} },
});

const pedido = (over: Partial<PedidoDeMidia> = {}): PedidoDeMidia => ({
  linhaId: 'linha-1',
  tenantId: LOJA,
  idDoWhatsapp: ID_A,
  pasta: 'inbound',
  tipo: 'image',
  mensagem: eventoDe('imageMessage', { mimetype: 'image/jpeg', fileLength: '1234', mediaKey: { 0: 1, 1: 2 } }),
  ...over,
});

// -----------------------------------------------------------------------------

describe('na chegada: cada tipo vai para o bucket e para a linha', () => {
  it('foto recebida: <loja>/inbound/<id>.jpg, media_url com o caminho, mensagem inteira para o Evolution', async () => {
    const amb = ambiente([linha()]);
    const evo = evolution({ ok: true, base64: b64('foto'), mimetype: 'image/jpeg' });
    const r = await guardarMidiaDaEvolution(pedido(), depsDoServidor(amb.cliente, evo.baixar));

    expect(r).toEqual({ situacao: 'guardada', caminho: `${LOJA}/inbound/${ID_A}.jpg` });
    expect(amb.linhas[0]!.media_url).toBe(`${LOJA}/inbound/${ID_A}.jpg`);
    expect(amb.linhas[0]!.message_type).toBe('image');
    expect(amb.linhas[0]!.content).toBe('[Imagem]');
    expect(new TextDecoder().decode(amb.arquivos.get(`${LOJA}/inbound/${ID_A}.jpg`)!.bytes)).toBe('foto');
    expect(evo.pedidos[0]).toEqual(pedido().mensagem);
    // O caminho é o que a função media-links já aceita para a mensagem recebida com esse id.
    expect(caminhoBateComAMensagem(
      { id: 'linha-1', tenant_id: LOJA, direction: 'inbound', evolution_message_id: ID_A, media_url: r.caminho! },
      whatsappMediaPath(r.caminho)!,
    )).toBe(true);
  });

  it('nota de voz: "audio/ogg; codecs=opus" sobe como audio/ogg em .ogg', async () => {
    const amb = ambiente([linha({ message_type: 'audio', content: '[Áudio]' })]);
    const evo = evolution({ ok: true, base64: b64('voz'), mimetype: 'audio/ogg; codecs=opus' });
    const r = await guardarMidiaDaEvolution(
      pedido({ tipo: 'audio', mensagem: eventoDe('audioMessage', { mimetype: 'audio/ogg; codecs=opus', ptt: true, seconds: 4 }) }),
      depsDoServidor(amb.cliente, evo.baixar),
    );
    expect(r.situacao).toBe('guardada');
    expect(amb.uploads[0]).toEqual({ caminho: `${LOJA}/inbound/${ID_A}.ogg`, tipo: 'audio/ogg', upsert: true });
    expect(amb.linhas[0]!.media_url).toBe(`${LOJA}/inbound/${ID_A}.ogg`);
  });

  it('vídeo: .mp4', async () => {
    const amb = ambiente([linha({ message_type: 'video', content: '[Vídeo]' })]);
    const evo = evolution({ ok: true, base64: b64('video'), mimetype: 'video/mp4' });
    const r = await guardarMidiaDaEvolution(
      pedido({ tipo: 'video', mensagem: eventoDe('videoMessage', { mimetype: 'video/mp4', fileLength: { low: 5000, high: 0, unsigned: true } }) }),
      depsDoServidor(amb.cliente, evo.baixar),
    );
    expect(r.caminho).toBe(`${LOJA}/inbound/${ID_A}.mp4`);
    expect(amb.linhas[0]!.message_type).toBe('video');
  });

  it('documento: .pdf, e o nome do arquivo continua sendo o texto da linha', async () => {
    const amb = ambiente([linha({ message_type: 'document', content: 'exame.pdf' })]);
    const evo = evolution({ ok: true, base64: b64('%PDF'), mimetype: 'application/pdf' });
    const r = await guardarMidiaDaEvolution(
      pedido({ tipo: 'document', mensagem: eventoDe('documentMessage', { mimetype: 'application/pdf', fileName: 'exame.pdf' }) }),
      depsDoServidor(amb.cliente, evo.baixar),
    );
    expect(r.caminho).toBe(`${LOJA}/inbound/${ID_A}.pdf`);
    expect(amb.linhas[0]!.content).toBe('exame.pdf');
  });

  it('documento com legenda (documentWithCaptionMessage): o tipo declarado é lido por dentro', async () => {
    const amb = ambiente([linha({ message_type: 'document', content: 'planilha.zip' })]);
    const evo = evolution({ ok: true, base64: b64('zip'), mimetype: 'application/zip' });
    const r = await guardarMidiaDaEvolution(
      pedido({
        tipo: 'document',
        mensagem: {
          key: { id: ID_A },
          message: { documentWithCaptionMessage: { message: { documentMessage: { mimetype: 'application/zip' } } } },
        },
      }),
      depsDoServidor(amb.cliente, evo.baixar),
    );
    expect(r.situacao).toBe('tipo_recusado');
    expect(evo.pedidos).toHaveLength(0);
  });

  it('figurinha: .webp', async () => {
    const amb = ambiente([linha({ message_type: 'sticker', content: '[Figurinha]' })]);
    const evo = evolution({ ok: true, base64: b64('webp'), mimetype: 'image/webp' });
    const r = await guardarMidiaDaEvolution(
      pedido({ tipo: 'sticker', mensagem: eventoDe('stickerMessage', { mimetype: 'image/webp', isAnimated: false }) }),
      depsDoServidor(amb.cliente, evo.baixar),
    );
    expect(r.caminho).toBe(`${LOJA}/inbound/${ID_A}.webp`);
  });

  it('mandada pelo celular da Loja: <loja>/celular/<id>, e a media-links aceita o caminho para mensagem enviada', async () => {
    const amb = ambiente([linha({ direction: 'outbound', status: 'sent' })]);
    const evo = evolution({ ok: true, base64: b64('tabela de precos'), mimetype: 'image/jpeg' });
    const r = await guardarMidiaDaEvolution(
      pedido({ pasta: 'celular', mensagem: eventoDe('imageMessage', { mimetype: 'image/jpeg' }, ID_A, true) }),
      depsDoServidor(amb.cliente, evo.baixar),
    );
    expect(r.caminho).toBe(`${LOJA}/celular/${ID_A}.jpg`);
    expect(amb.linhas[0]!.media_url).toBe(`${LOJA}/celular/${ID_A}.jpg`);
    expect(caminhoBateComAMensagem(
      { id: 'linha-1', tenant_id: LOJA, direction: 'outbound', evolution_message_id: ID_A, media_url: r.caminho! },
      r.caminho!,
    )).toBe(true);
  });

  it('linha que já tem arquivo (anexo enviado pela tela): nada é pedido nem trocado', async () => {
    const amb = ambiente([linha({ direction: 'outbound', media_url: `${LOJA}/1790000000001-foto.jpg` })]);
    const evo = evolution({ ok: true, base64: b64('x'), mimetype: 'image/jpeg' });
    const r = await guardarMidiaDaEvolution(pedido({ pasta: 'celular' }), depsDoServidor(amb.cliente, evo.baixar));
    expect(r.situacao).toBe('ja_tem_arquivo');
    expect(evo.pedidos).toHaveLength(0);
    expect(amb.linhas[0]!.media_url).toBe(`${LOJA}/1790000000001-foto.jpg`);
  });

  it('a busca e a gravação ficam na Loja do número', async () => {
    const amb = ambiente([linha({ tenant_id: OUTRA_LOJA })]);
    const evo = evolution({ ok: true, base64: b64('x'), mimetype: 'image/jpeg' });
    const r = await guardarMidiaDaEvolution(pedido(), depsDoServidor(amb.cliente, evo.baixar));
    expect(r.situacao).toBe('falhou');
    expect(amb.uploads).toHaveLength(0);
    expect(amb.linhas[0]!.media_url).toBeNull();
  });
});

describe('acima de 20 MB e tipo recusado: o texto de hoje fica, com "Arquivo disponível só no celular"', () => {
  it('tamanho declarado no evento acima de 20 MB: nem baixa', async () => {
    const amb = ambiente([linha({ message_type: 'video', content: '[Vídeo]' })]);
    const evo = evolution({ ok: true, base64: b64('x'), mimetype: 'video/mp4' });
    const r = await guardarMidiaDaEvolution(
      pedido({ tipo: 'video', mensagem: eventoDe('videoMessage', { mimetype: 'video/mp4', fileLength: { low: TETO_DA_MIDIA_BYTES + 1, high: 0 } }) }),
      depsDoServidor(amb.cliente, evo.baixar),
    );
    expect(r.situacao).toBe('grande_demais');
    expect(evo.pedidos).toHaveLength(0);
    expect(amb.uploads).toHaveLength(0);
    expect(amb.linhas[0]!.content).toBe(`[Vídeo]\n${AVISO_SO_NO_CELULAR}`);
    expect(amb.linhas[0]!.media_url).toBeNull();
    expect(amb.linhas[0]!.metadata).toEqual({
      evolution: { tipo: 'lid' },
      midia: { situacao: 'so_no_celular', motivo: 'grande_demais' },
    });
  });

  it('arquivo que chega maior que o teto (sem tamanho no evento): aviso, nada no bucket', async () => {
    const amb = ambiente([linha()]);
    const evo = evolution({ ok: true, base64: b64('123456789012'), mimetype: 'image/jpeg' });
    const r = await guardarMidiaDaEvolution(
      pedido({ mensagem: { key: { id: ID_A } } }),
      depsDoServidor(amb.cliente, evo.baixar),
      8,
    );
    expect(r.situacao).toBe('grande_demais');
    expect(amb.uploads).toHaveLength(0);
    expect(amb.linhas[0]!.content).toBe(`[Imagem]\n${AVISO_SO_NO_CELULAR}`);
  });

  it('o Evolution respondeu grande demais (a leitura parou no teto): aviso', async () => {
    const amb = ambiente([linha()]);
    const evo = evolution({ ok: false, situacao: 'grande_demais', detalhe: 'resposta grande' });
    const r = await guardarMidiaDaEvolution(pedido(), depsDoServidor(amb.cliente, evo.baixar));
    expect(r.situacao).toBe('grande_demais');
    expect(amb.linhas[0]!.content).toContain(AVISO_SO_NO_CELULAR);
  });

  it('tipo declarado que o bucket não aceita (HEIC): aviso sem baixar', async () => {
    const amb = ambiente([linha()]);
    const evo = evolution({ ok: true, base64: b64('x'), mimetype: 'image/heic' });
    const r = await guardarMidiaDaEvolution(
      pedido({ mensagem: eventoDe('imageMessage', { mimetype: 'image/heic' }) }),
      depsDoServidor(amb.cliente, evo.baixar),
    );
    expect(r.situacao).toBe('tipo_recusado');
    expect(evo.pedidos).toHaveLength(0);
    expect(amb.linhas[0]!.content).toBe(`[Imagem]\n${AVISO_SO_NO_CELULAR}`);
  });

  it('o bucket recusou o tipo no upload (415): aviso, media_url vazio', async () => {
    const amb = ambiente([linha({ message_type: 'document', content: 'tabela.csv' })], {
      upload: { message: 'mime type text/csv is not supported', statusCode: '415' },
    });
    const evo = evolution({ ok: true, base64: b64('a;b'), mimetype: 'text/csv' });
    const r = await guardarMidiaDaEvolution(
      pedido({ tipo: 'document', mensagem: { key: { id: ID_A } } }),
      depsDoServidor(amb.cliente, evo.baixar),
    );
    expect(r.situacao).toBe('tipo_recusado');
    expect(amb.linhas[0]!.content).toBe(`tabela.csv\n${AVISO_SO_NO_CELULAR}`);
    expect(amb.linhas[0]!.media_url).toBeNull();
  });

  it('o aviso entra uma vez só', () => {
    expect(conteudoComAviso(conteudoComAviso('[Imagem]'))).toBe(`[Imagem]\n${AVISO_SO_NO_CELULAR}`);
    expect(conteudoComAviso(null)).toBe(AVISO_SO_NO_CELULAR);
  });
});

describe('falha: uma tentativa, a linha fica como está', () => {
  it('Evolution indisponível ou com erro: nada no bucket, texto de hoje', async () => {
    for (const resposta of [
      { ok: false, situacao: 'indisponivel', detalhe: 'http 400' },
      { ok: false, situacao: 'falhou', detalhe: 'rede' },
    ] as Baixado[]) {
      const amb = ambiente([linha()]);
      const evo = evolution(resposta);
      const r = await guardarMidiaDaEvolution(pedido(), depsDoServidor(amb.cliente, evo.baixar));
      expect(r.situacao).toBe((resposta as { situacao: string }).situacao);
      expect(evo.pedidos).toHaveLength(1);
      expect(amb.uploads).toHaveLength(0);
      expect(amb.linhas[0]).toEqual(linha());
    }
  });

  it('upload que falha por outro motivo: "falhou", sem aviso', async () => {
    const amb = ambiente([linha()], { upload: { message: 'Internal error', statusCode: '500' } });
    const evo = evolution({ ok: true, base64: b64('x'), mimetype: 'image/jpeg' });
    const r = await guardarMidiaDaEvolution(pedido(), depsDoServidor(amb.cliente, evo.baixar));
    expect(r.situacao).toBe('falhou');
    expect(amb.linhas[0]!.content).toBe('[Imagem]');
  });
});

describe('apagada pela paciente', () => {
  it('apagou antes do download: nada é pedido nem guardado', async () => {
    const amb = ambiente([linha()]);
    await aplicarApagadas('messages.delete', { id: ID_A, remoteJid: JID, fromMe: false, status: 'DELETED' }, depsDoBanco(amb.cliente, LOJA));
    const evo = evolution({ ok: true, base64: b64('foto'), mimetype: 'image/jpeg' });
    const r = await guardarMidiaDaEvolution(pedido(), depsDoServidor(amb.cliente, evo.baixar));
    expect(r.situacao).toBe('apagada');
    expect(evo.pedidos).toHaveLength(0);
    expect(amb.arquivos.size).toBe(0);
  });

  it('apagou NO MEIO do download: a gravação não vale e o arquivo que subiu é removido', async () => {
    const amb = ambiente([linha()]);
    const baixar: DepsDaMidia['baixar'] = async () => {
      // O aviso de apagar chega enquanto o Evolution ainda está mandando o arquivo.
      await aplicarApagadas('messages.delete', { id: ID_A, status: 'DELETED' }, depsDoBanco(amb.cliente, LOJA));
      return { ok: true, base64: b64('foto'), mimetype: 'image/jpeg' };
    };
    const r = await guardarMidiaDaEvolution(pedido(), depsDoServidor(amb.cliente, baixar));
    expect(r.situacao).toBe('apagada');
    expect(amb.uploads).toHaveLength(1);
    expect(amb.arquivos.size).toBe(0);
    expect(amb.linhas[0]!.media_url).toBeNull();
    expect(amb.linhas[0]!.status).toBe('deleted');
  });

  it('apagou DEPOIS do download: o arquivo sai do bucket e media_url é limpo', async () => {
    const amb = ambiente([linha()]);
    const evo = evolution({ ok: true, base64: b64('foto'), mimetype: 'image/jpeg' });
    await guardarMidiaDaEvolution(pedido(), depsDoServidor(amb.cliente, evo.baixar));
    expect(amb.arquivos.size).toBe(1);

    const r = await aplicarApagadas('messages.edited', { key: { remoteJid: JID, fromMe: false, id: ID_A }, type: 'REVOKE' }, depsDoBanco(amb.cliente, LOJA));
    expect(r).toMatchObject({ marcadas: 1, arquivosRemovidos: 1, falhas: [] });
    expect(amb.arquivos.size).toBe(0);
    expect(amb.linhas[0]!.media_url).toBeNull();
    expect(amb.linhas[0]!.status).toBe('deleted');
    // Só as pastas do servidor, só esse id, só a Loja do número.
    expect(amb.remocoes[0]!.every((c) => c.startsWith(`${LOJA}/inbound/${ID_A}.`) || c.startsWith(`${LOJA}/celular/${ID_A}.`))).toBe(true);
  });

  it('apagar não toca no anexo enviado pela tela (o de campanha é de muitas mensagens)', async () => {
    const anexo = `${LOJA}/1790000000001-campanha.jpg`;
    const amb = ambiente([linha({ direction: 'outbound', status: 'sent', media_url: anexo })]);
    amb.arquivos.set(anexo, { bytes: new Uint8Array([1]), tipo: 'image/jpeg' });
    const r = await aplicarApagadas('messages.delete', { id: ID_A, status: 'DELETED' }, depsDoBanco(amb.cliente, LOJA));
    expect(r.arquivosRemovidos).toBe(0);
    expect(amb.arquivos.has(anexo)).toBe(true);
    expect(amb.linhas[0]!.media_url).toBeNull();
  });

  it('os caminhos que o apagar procura: as duas pastas, todas as extensões, nada fora da Loja', () => {
    const c = caminhosPossiveis(LOJA, ID_B);
    expect(c).toContain(`${LOJA}/inbound/${ID_B}.ogg`);
    expect(c).toContain(`${LOJA}/celular/${ID_B}.jpg`);
    expect(c.every((x) => x.startsWith(`${LOJA}/`))).toBe(true);
    expect(caminhosPossiveis(LOJA, '../x')).toEqual([]);
  });
});

describe('recuperação das mensagens antigas', () => {
  const antiga = (over: Partial<LinhaParaRecuperar>): LinhaParaRecuperar => ({
    id: 'l1', tenant_id: LOJA, direction: 'inbound', message_type: 'audio', evolution_message_id: ID_A,
    status: 'received', metadata: null, media_url: null, ...over,
  });

  it('pula a apagada, leva a do celular para celular/ e pede ao Evolution só pela key', () => {
    const r = escolherParaRecuperar([
      antiga({}),
      antiga({ id: 'l2', evolution_message_id: ID_B, direction: 'outbound', message_type: 'image', status: 'sent' }),
      antiga({ id: 'l3', status: 'deleted' }),
      antiga({ id: 'l4', metadata: { deleted: true } }),
      antiga({ id: 'l5', media_url: `${LOJA}/inbound/${ID_A}.ogg` }),
      antiga({ id: 'l6', metadata: { midia: { situacao: 'so_no_celular', motivo: 'grande_demais' } } }),
      antiga({ id: 'l7', message_type: 'text' }),
    ]);
    expect(r.apagadas).toBe(2);
    expect(r.ignoradas).toBe(3);
    expect(r.fila.map((p) => [p.linhaId, p.pasta, p.tipo])).toEqual([
      ['l1', 'inbound', 'audio'],
      ['l2', 'celular', 'image'],
    ]);
    expect(r.fila[1]!.mensagem).toEqual({ key: { id: ID_B } });
  });

  it('a apagada que entrasse mesmo assim não é guardada', async () => {
    const amb = ambiente([linha({ status: 'deleted', metadata: { deleted: true } })]);
    const evo = evolution({ ok: true, base64: b64('x'), mimetype: 'image/jpeg' });
    const r = await guardarMidiaDaEvolution(pedido({ mensagem: { key: { id: ID_A } } }), depsDoServidor(amb.cliente, evo.baixar));
    expect(r.situacao).toBe('apagada');
    expect(evo.pedidos).toHaveLength(0);
  });
});

describe('o pedido ao Evolution', () => {
  const resposta = (status: number, corpo: unknown, headers: Record<string, string> = {}) =>
    new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), { status, headers });

  it('POST /chat/getBase64FromMediaMessage/<instância> com a chave no cabeçalho e convertToMp4 false', async () => {
    const vistos: Array<{ url: string; init: Record<string, unknown> }> = [];
    const baixar = baixadorDoEvolution(
      { baseUrl: 'https://evolution.example/', apiKey: 'chave-de-teste', instancia: 'loja teste' },
      { fetch: async (url, init) => { vistos.push({ url, init }); return resposta(201, { mediaType: 'audioMessage', mimetype: 'audio/ogg; codecs=opus', base64: b64('voz'), buffer: null }); } },
    );
    const m = { key: { id: ID_A }, message: { audioMessage: { mimetype: 'audio/ogg; codecs=opus' } } };
    expect(await baixar(m)).toEqual({ ok: true, base64: b64('voz'), mimetype: 'audio/ogg; codecs=opus' });
    expect(vistos[0]!.url).toBe('https://evolution.example/chat/getBase64FromMediaMessage/loja%20teste');
    expect(vistos[0]!.init.method).toBe('POST');
    expect((vistos[0]!.init.headers as Record<string, string>).apikey).toBe('chave-de-teste');
    expect(JSON.parse(vistos[0]!.init.body as string)).toEqual({ message: m, convertToMp4: false });
  });

  it('400 e 404 são "indisponível"; 500 e rede são "falhou"; o detalhe é só o código', async () => {
    const com = (f: () => Promise<Response>) =>
      baixadorDoEvolution({ baseUrl: 'https://evolution.example', apiKey: 'k', instancia: 'i' }, { fetch: f })({ key: { id: ID_A } });
    expect(await com(async () => resposta(400, { response: { message: ['Error: Message not found'] } })))
      .toEqual({ ok: false, situacao: 'indisponivel', detalhe: 'http 400' });
    expect(await com(async () => resposta(404, 'nada'))).toMatchObject({ situacao: 'indisponivel' });
    expect(await com(async () => resposta(500, 'erro'))).toEqual({ ok: false, situacao: 'falhou', detalhe: 'http 500' });
    expect(await com(async () => { throw new TypeError('fetch failed'); })).toEqual({ ok: false, situacao: 'falhou', detalhe: 'rede' });
    expect(await com(async () => resposta(201, { base64: '' }))).toMatchObject({ situacao: 'indisponivel' });
  });

  it('resposta maior que o teto: para de ler e responde "grande demais"', async () => {
    const opcoes = (f: () => Promise<Response>) => ({ fetch: f, teto: 10 });
    const evo = { baseUrl: 'https://evolution.example', apiKey: 'k', instancia: 'i' };
    const pelaContagem = baixadorDoEvolution(evo, opcoes(async () => resposta(201, '{}', { 'content-length': String(10 * 1024 * 1024) })));
    expect(await pelaContagem({ key: { id: ID_A } })).toMatchObject({ ok: false, situacao: 'grande_demais' });
    const grande = 'x'.repeat(300 * 1024);
    const pelaLeitura = baixadorDoEvolution(evo, opcoes(async () => resposta(201, { base64: grande })));
    expect(await pelaLeitura({ key: { id: ID_A } })).toMatchObject({ ok: false, situacao: 'grande_demais' });
  });
});

describe('pedaços da regra', () => {
  it('tipo do arquivo como o bucket espera', () => {
    expect(mimeDoBucket('audio/ogg; codecs=opus')).toBe('audio/ogg');
    expect(mimeDoBucket('IMAGE/JPG')).toBe('image/jpeg');
    expect(mimeDoBucket(undefined)).toBe('');
  });

  it('fileLength em número, texto e Long', () => {
    expect(tamanhoDeclarado(10)).toBe(10);
    expect(tamanhoDeclarado('2048')).toBe(2048);
    expect(tamanhoDeclarado({ low: 5, high: 1, unsigned: true })).toBe(2 ** 32 + 5);
    expect(tamanhoDeclarado(null)).toBeNull();
  });
});
