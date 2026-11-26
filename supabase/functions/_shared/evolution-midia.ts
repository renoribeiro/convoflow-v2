// =============================================================================
// evolution-midia.ts: foto, áudio, vídeo, documento e figurinha dos números
// QR Code (Evolution 2.3.7)
// =============================================================================
// Desde 2026-11-25. Antes disso a conversa mostrava só "[Imagem]", "[Áudio]"...
//
// O caminho é o mesmo da Meta (meta-webhook, persistIncomingMedia): o webhook
// grava a mensagem como sempre e, em segundo plano, este arquivo
//   1. pede o arquivo ao Evolution, em POST /chat/getBase64FromMediaMessage,
//      mandando a mensagem inteira do evento ({ key, message }). Com
//      `message.message` preenchido o Evolution baixa direto, sem procurar no
//      banco dele; a chave da mídia chega no JSON como objeto de índices e ele
//      mesmo a remonta (whatsapp.baileys.service.ts do tag 2.3.7,
//      getBase64FromMediaMessage e deserializeMessageBuffers). A recuperação
//      das mensagens antigas manda só { key: { id } }: aí ele procura no banco
//      dele, que guarda as mensagens;
//   2. sobe no bucket privado `whatsapp-media`:
//        <loja>/inbound/<id>.<ext>  mensagem recebida
//        <loja>/celular/<id>.<ext>  mensagem que a Loja mandou pelo celular
//      O tipo do arquivo vai sem parâmetros ("audio/ogg; codecs=opus" vira
//      "audio/ogg"), porque a lista de tipos do bucket compara o tipo puro;
//   3. preenche `media_url` (o CAMINHO, nunca um link) e `message_type`.
// A tela pede o link de 1 hora à função `media-links`, que já aceita os dois
// caminhos: `inbound/<id>.` só para a mensagem recebida com esse id, qualquer
// outro só para mensagem enviada. Nenhuma das duas pastas aceita upload do
// navegador (migração 20261125000001).
//
// Arquivo acima de 20 MB, ou de um tipo que o bucket recusa: a mensagem fica
// com o texto de hoje e ganha a linha "Arquivo disponível só no celular".
// Falha (Evolution fora, mídia que não volta): uma tentativa só, registro com
// ids, e o texto de hoje fica. Sem fila.
//
// Mensagem apagada pela paciente: o que ela apaga não fica guardado
// (evolution-apagada.ts apaga o arquivo e limpa media_url). Se o apagar chegar
// no meio do download, a gravação aqui só vale para linha que não está
// apagada; quando não vale, o arquivo que acabou de subir é removido.
//
// Sem nada de Deno: o Vitest importa este arquivo, e o script da recuperação
// (scripts/evolution-midia/recuperar.mjs) também.
// =============================================================================

import { WHATSAPP_MEDIA_BUCKET } from './media-links.ts';

export const TETO_DA_MIDIA_BYTES = 20 * 1024 * 1024;
export const AVISO_SO_NO_CELULAR = 'Arquivo disponível só no celular';
export const TIPOS_DE_MIDIA = ['image', 'video', 'audio', 'document', 'sticker'] as const;
export type TipoDeMidia = typeof TIPOS_DE_MIDIA[number];
export type PastaDaMidia = 'inbound' | 'celular';
export const PASTAS_DO_SERVIDOR: readonly PastaDaMidia[] = ['inbound', 'celular'];

/** Campo do Baileys onde mora cada tipo (o mesmo de extractMessageContent no webhook). */
const CAMPO_DO_TIPO: Record<TipoDeMidia, string> = {
  image: 'imageMessage',
  video: 'videoMessage',
  audio: 'audioMessage',
  document: 'documentMessage',
  sticker: 'stickerMessage',
};

/**
 * Os tipos que o bucket aceita (allowed_mime_types de `whatsapp-media`,
 * migração 20260511120000) e a extensão de cada um. Tipo fora daqui o bucket
 * recusa: nem vale baixar.
 */
export const EXTENSAO_POR_MIME: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'video/quicktime': 'mov',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/amr': 'amr',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt',
  'text/csv': 'csv',
};

/** Nomes diferentes que o celular usa para um tipo que o bucket aceita. */
const APELIDOS_DE_MIME: Readonly<Record<string, string>> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'audio/mp3': 'audio/mpeg',
  'audio/x-m4a': 'audio/mp4',
  'audio/m4a': 'audio/mp4',
  'audio/x-wav': 'audio/wav',
  'audio/wave': 'audio/wav',
  'audio/opus': 'audio/ogg',
  'application/ogg': 'audio/ogg',
};

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

export function ehTipoDeMidia(tipo: unknown): tipo is TipoDeMidia {
  return typeof tipo === 'string' && (TIPOS_DE_MIDIA as readonly string[]).includes(tipo);
}

/** "audio/ogg; codecs=opus" → "audio/ogg"; apelido vira o nome que o bucket aceita. */
export function mimeDoBucket(mime: unknown): string {
  if (typeof mime !== 'string') return '';
  const base = mime.split(';')[0]!.trim().toLowerCase();
  return APELIDOS_DE_MIME[base] ?? base;
}

export function extensaoDoMime(mime: unknown): string | null {
  return EXTENSAO_POR_MIME[mimeDoBucket(mime)] ?? null;
}

/** A parte da mídia na mensagem do evento (imageMessage, audioMessage...). */
export function parteDaMidia(message: unknown, tipo: TipoDeMidia): Record<string, unknown> | null {
  const m = obj(message);
  if (!m) return null;
  const direta = obj(m[CAMPO_DO_TIPO[tipo]]);
  if (direta) return direta;
  if (tipo === 'document') {
    return obj(obj(obj(m.documentWithCaptionMessage)?.message)?.documentMessage);
  }
  return null;
}

/** fileLength chega como número, texto ou Long ({ low, high }). Sem valor: null. */
export function tamanhoDeclarado(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v : null;
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) return Number(v.trim());
  const o = obj(v);
  if (o && typeof o.low === 'number') {
    const alto = typeof o.high === 'number' ? o.high >>> 0 : 0;
    return alto * 2 ** 32 + (o.low >>> 0);
  }
  return null;
}

/** Id do WhatsApp que pode virar nome de arquivo (sem ponto, barra ou espaço). */
export function idSeguro(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id);
}

export function caminhoDaMidia(tenantId: string, pasta: PastaDaMidia, id: string, ext: string): string {
  return `${tenantId}/${pasta}/${id}.${ext}`;
}

/** Todos os caminhos em que o arquivo de uma mensagem pode estar (para apagar). */
export function caminhosPossiveis(tenantId: string, id: string): string[] {
  if (!idSeguro(id)) return [];
  const exts = [...new Set(Object.values(EXTENSAO_POR_MIME))];
  return PASTAS_DO_SERVIDOR.flatMap((pasta) => exts.map((ext) => caminhoDaMidia(tenantId, pasta, id, ext)));
}

/** O texto de hoje com a linha do aviso, uma vez só. */
export function conteudoComAviso(conteudo: string | null | undefined): string {
  const base = (conteudo ?? '').trim();
  if (base.endsWith(AVISO_SO_NO_CELULAR)) return base;
  return base ? `${base}\n${AVISO_SO_NO_CELULAR}` : AVISO_SO_NO_CELULAR;
}

/** Bytes que um base64 representa, sem decodificar. */
export function tamanhoDoBase64(b64: string): number {
  const limpo = b64.replace(/\s/g, '');
  const sobra = limpo.endsWith('==') ? 2 : limpo.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((limpo.length * 3) / 4) - sobra);
}

export function bytesDoBase64(b64: string): Uint8Array {
  const limpo = b64.replace(/^data:[^,]*,/, '').replace(/\s/g, '');
  const bin = atob(limpo);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// -----------------------------------------------------------------------------
// A regra
// -----------------------------------------------------------------------------

export interface PedidoDeMidia {
  /** Linha de `messages` que o webhook gravou. */
  linhaId: string;
  tenantId: string;
  idDoWhatsapp: string;
  pasta: PastaDaMidia;
  tipo: string;
  /**
   * O que vai em `message` para o Evolution: a mensagem do evento
   * ({ key, message }) ou só { key: { id } } na recuperação.
   */
  mensagem: { key: Record<string, unknown>; message?: unknown };
}

export interface LinhaDaMidia {
  status: string | null;
  content: string | null;
  metadata: unknown;
  media_url: string | null;
}

export type Baixado =
  | { ok: true; base64: string; mimetype: string | null }
  | { ok: false; situacao: 'grande_demais' | 'indisponivel' | 'falhou'; detalhe: string };

export interface DepsDaMidia {
  lerLinha(linhaId: string, tenantId: string): Promise<{ linha: LinhaDaMidia | null; erro: string | null }>;
  baixar(mensagem: PedidoDeMidia['mensagem']): Promise<Baixado>;
  subir(caminho: string, bytes: Uint8Array, mime: string): Promise<{ erro: string | null; recusado: boolean }>;
  /** media_url e message_type, só em linha que não está apagada. */
  gravarArquivo(linhaId: string, tenantId: string, caminho: string, tipo: TipoDeMidia): Promise<{ gravou: boolean; erro: string | null }>;
  /** O texto com o aviso, só em linha que não está apagada. */
  gravarAviso(linhaId: string, tenantId: string, content: string, metadata: Record<string, unknown>): Promise<{ gravou: boolean; erro: string | null }>;
  remover(caminhos: string[]): Promise<{ erro: string | null }>;
}

export type SituacaoDaMidia =
  | 'guardada'
  | 'grande_demais'
  | 'tipo_recusado'
  | 'indisponivel'
  | 'falhou'
  | 'apagada'
  | 'ja_tem_arquivo'
  | 'invalida';

export interface ResultadoDaMidia {
  situacao: SituacaoDaMidia;
  caminho?: string;
  /** Só código e motivo curto (nunca texto da mensagem nem chave). */
  detalhe?: string;
}

export function linhaApagada(linha: Pick<LinhaDaMidia, 'status' | 'metadata'>): boolean {
  return linha.status === 'deleted' || obj(linha.metadata)?.deleted === true;
}

export async function guardarMidiaDaEvolution(
  pedido: PedidoDeMidia,
  deps: DepsDaMidia,
  teto: number = TETO_DA_MIDIA_BYTES,
): Promise<ResultadoDaMidia> {
  const { linhaId, tenantId, idDoWhatsapp, pasta, tipo } = pedido;
  if (!ehTipoDeMidia(tipo) || !idSeguro(idDoWhatsapp) || !PASTAS_DO_SERVIDOR.includes(pasta)) {
    return { situacao: 'invalida' };
  }

  const lida = await deps.lerLinha(linhaId, tenantId);
  if (lida.erro) return { situacao: 'falhou', detalhe: `ler linha: ${lida.erro}` };
  if (!lida.linha) return { situacao: 'falhou', detalhe: 'linha não encontrada' };
  const linha = lida.linha;
  if (linhaApagada(linha)) return { situacao: 'apagada' };
  if (linha.media_url) return { situacao: 'ja_tem_arquivo' };

  const avisar = async (motivo: 'grande_demais' | 'tipo_recusado'): Promise<ResultadoDaMidia> => {
    const metadata = { ...(obj(linha.metadata) ?? {}), midia: { situacao: 'so_no_celular', motivo } };
    const g = await deps.gravarAviso(linhaId, tenantId, conteudoComAviso(linha.content), metadata);
    if (g.erro) return { situacao: 'falhou', detalhe: `aviso: ${g.erro}` };
    if (!g.gravou) return { situacao: 'apagada' };
    return { situacao: motivo };
  };

  // O que o evento já diz, antes de baixar.
  const parte = parteDaMidia(pedido.mensagem.message, tipo);
  const declarado = tamanhoDeclarado(parte?.fileLength);
  if (declarado !== null && declarado > teto) return avisar('grande_demais');
  if (parte && typeof parte.mimetype === 'string' && parte.mimetype.trim() && !extensaoDoMime(parte.mimetype)) {
    return avisar('tipo_recusado');
  }

  const baixado = await deps.baixar(pedido.mensagem);
  if (!baixado.ok) {
    if (baixado.situacao === 'grande_demais') return avisar('grande_demais');
    return { situacao: baixado.situacao, detalhe: baixado.detalhe };
  }
  if (tamanhoDoBase64(baixado.base64) > teto) return avisar('grande_demais');

  let bytes: Uint8Array;
  try {
    bytes = bytesDoBase64(baixado.base64);
  } catch {
    return { situacao: 'falhou', detalhe: 'base64 inválido' };
  }
  if (bytes.length === 0) return { situacao: 'indisponivel', detalhe: 'arquivo vazio' };
  if (bytes.length > teto) return avisar('grande_demais');

  const mime = mimeDoBucket(baixado.mimetype) || mimeDoBucket(parte?.mimetype);
  const ext = extensaoDoMime(mime);
  if (!ext) return avisar('tipo_recusado');

  const caminho = caminhoDaMidia(tenantId, pasta, idDoWhatsapp, ext);
  const subiu = await deps.subir(caminho, bytes, mime);
  if (subiu.recusado) return avisar('tipo_recusado');
  if (subiu.erro) return { situacao: 'falhou', detalhe: `upload: ${subiu.erro}` };

  const gravou = await deps.gravarArquivo(linhaId, tenantId, caminho, tipo);
  if (gravou.erro || !gravou.gravou) {
    // Apagada no meio do caminho (ou a gravação falhou): o arquivo não fica.
    await deps.remover([caminho]);
    return gravou.erro
      ? { situacao: 'falhou', detalhe: `gravar: ${gravou.erro}` }
      : { situacao: 'apagada' };
  }
  return { situacao: 'guardada', caminho };
}

// -----------------------------------------------------------------------------
// Recuperação das mensagens antigas (uma vez, scripts/evolution-midia/)
// -----------------------------------------------------------------------------

export interface LinhaParaRecuperar {
  id: string;
  tenant_id: string;
  direction: string | null;
  message_type: string | null;
  evolution_message_id: string | null;
  status: string | null;
  metadata: unknown;
  media_url: string | null;
}

/**
 * Quem entra na recuperação: mídia sem arquivo, com id do WhatsApp, que não foi
 * apagada e que ainda não ganhou o aviso. Apagada fica de fora e é contada.
 */
export function escolherParaRecuperar(linhas: LinhaParaRecuperar[]): {
  fila: PedidoDeMidia[];
  apagadas: number;
  ignoradas: number;
} {
  const fila: PedidoDeMidia[] = [];
  let apagadas = 0;
  let ignoradas = 0;
  for (const l of linhas) {
    if (!ehTipoDeMidia(l.message_type) || !idSeguro(l.evolution_message_id) || l.media_url) {
      ignoradas++;
      continue;
    }
    if (linhaApagada(l)) {
      apagadas++;
      continue;
    }
    if (obj(obj(l.metadata)?.midia)?.situacao === 'so_no_celular') {
      ignoradas++;
      continue;
    }
    const pasta: PastaDaMidia | null = l.direction === 'inbound' ? 'inbound' : l.direction === 'outbound' ? 'celular' : null;
    if (!pasta) {
      ignoradas++;
      continue;
    }
    fila.push({
      linhaId: l.id,
      tenantId: l.tenant_id,
      idDoWhatsapp: l.evolution_message_id,
      pasta,
      tipo: l.message_type,
      mensagem: { key: { id: l.evolution_message_id } },
    });
  }
  return { fila, apagadas, ignoradas };
}

// -----------------------------------------------------------------------------
// Ligações reais: Evolution, banco e bucket
// -----------------------------------------------------------------------------

export interface EvolutionDaMidia {
  baseUrl: string;
  apiKey: string;
  instancia: string;
}

type Buscar = (url: string, init: Record<string, unknown>) => Promise<Response>;

/** Lê o corpo até `limite` bytes. Passou: null (e a leitura para). */
async function lerComTeto(res: Response, limite: number): Promise<string | null> {
  if (!res.body) return await res.text();
  const leitor = res.body.getReader();
  const pedacos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > limite) {
      await leitor.cancel().catch(() => {});
      return null;
    }
    pedacos.push(value);
  }
  const tudo = new Uint8Array(total);
  let pos = 0;
  for (const p of pedacos) {
    tudo.set(p, pos);
    pos += p.byteLength;
  }
  return new TextDecoder().decode(tudo);
}

/**
 * POST /chat/getBase64FromMediaMessage/{instancia}, uma tentativa. 400/404 do
 * Evolution (mensagem que ele não acha, mídia que o WhatsApp não devolve mais)
 * é "indisponível"; rede, tempo esgotado e 5xx, "falhou".
 */
export function baixadorDoEvolution(
  evo: EvolutionDaMidia,
  opcoes: { fetch?: Buscar; timeoutMs?: number; teto?: number } = {},
): DepsDaMidia['baixar'] {
  const buscar: Buscar = opcoes.fetch ?? ((url, init) => fetch(url, init as RequestInit));
  const timeoutMs = opcoes.timeoutMs ?? 60_000;
  const teto = opcoes.teto ?? TETO_DA_MIDIA_BYTES;
  // O base64 tem 4/3 do arquivo; o resto do JSON (nome, legenda) cabe na folga.
  const limite = Math.ceil((teto * 4) / 3) + 256 * 1024;
  const url = `${evo.baseUrl.replace(/\/+$/, '')}/chat/getBase64FromMediaMessage/${encodeURIComponent(evo.instancia)}`;

  return async (mensagem) => {
    let res: Response;
    try {
      res = await buscar(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: evo.apiKey },
        body: JSON.stringify({ message: mensagem, convertToMp4: false }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      return { ok: false, situacao: 'falhou', detalhe: (e as { name?: string })?.name === 'TimeoutError' ? 'tempo esgotado' : 'rede' };
    }

    const declarado = Number(res.headers.get('content-length'));
    if (Number.isFinite(declarado) && declarado > limite) {
      await res.body?.cancel().catch(() => {});
      return { ok: false, situacao: 'grande_demais', detalhe: 'resposta grande' };
    }

    let texto: string | null;
    try {
      texto = await lerComTeto(res, limite);
    } catch {
      return { ok: false, situacao: 'falhou', detalhe: 'leitura interrompida' };
    }
    if (texto === null) return { ok: false, situacao: 'grande_demais', detalhe: 'resposta grande' };

    if (!res.ok) {
      const situacao = res.status === 400 || res.status === 404 ? 'indisponivel' : 'falhou';
      return { ok: false, situacao, detalhe: `http ${res.status}` };
    }

    let corpo: Record<string, unknown> | null = null;
    try {
      corpo = obj(JSON.parse(texto));
    } catch {
      corpo = null;
    }
    if (!corpo) return { ok: false, situacao: 'falhou', detalhe: 'resposta inválida' };
    const base64 = typeof corpo.base64 === 'string' ? corpo.base64 : '';
    if (!base64) return { ok: false, situacao: 'indisponivel', detalhe: 'sem arquivo' };
    return { ok: true, base64, mimetype: typeof corpo.mimetype === 'string' ? corpo.mimetype : null };
  };
}

/** O mínimo do supabase-js (service role) que a gravação usa. */
export interface ClienteDaMidia {
  // deno-lint-ignore no-explicit-any
  from(tabela: string): any;
  // deno-lint-ignore no-explicit-any
  storage: { from(bucket: string): any };
}

const msg = (e: unknown): string => String((e as { message?: unknown })?.message ?? e);

/** Upload recusado pelo tipo do arquivo (allowed_mime_types do bucket). */
export function uploadRecusadoPeloTipo(erro: unknown): boolean {
  const e = obj(erro);
  const codigo = String(e?.statusCode ?? e?.status ?? '');
  return codigo === '415' || /mime type|content type|invalid_mime/i.test(msg(erro));
}

export function depsDoServidor(supabase: ClienteDaMidia, baixar: DepsDaMidia['baixar']): DepsDaMidia {
  const bucket = () => supabase.storage.from(WHATSAPP_MEDIA_BUCKET);
  return {
    baixar,
    async lerLinha(linhaId, tenantId) {
      const { data, error } = await supabase.from('messages')
        .select('status, content, metadata, media_url')
        .eq('id', linhaId)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (error) return { linha: null, erro: msg(error) };
      return { linha: (data as LinhaDaMidia | null) ?? null, erro: null };
    },
    async subir(caminho, bytes, mime) {
      const { error } = await bucket().upload(caminho, bytes, { contentType: mime, upsert: true });
      if (!error) return { erro: null, recusado: false };
      return { erro: msg(error), recusado: uploadRecusadoPeloTipo(error) };
    },
    async gravarArquivo(linhaId, tenantId, caminho, tipo) {
      const { data, error } = await supabase.from('messages')
        .update({ media_url: caminho, message_type: tipo })
        .eq('id', linhaId)
        .eq('tenant_id', tenantId)
        .neq('status', 'deleted')
        .select('id');
      if (error) return { gravou: false, erro: msg(error) };
      return { gravou: Array.isArray(data) && data.length > 0, erro: null };
    },
    async gravarAviso(linhaId, tenantId, content, metadata) {
      const { data, error } = await supabase.from('messages')
        .update({ content, metadata })
        .eq('id', linhaId)
        .eq('tenant_id', tenantId)
        .neq('status', 'deleted')
        .select('id');
      if (error) return { gravou: false, erro: msg(error) };
      return { gravou: Array.isArray(data) && data.length > 0, erro: null };
    },
    async remover(caminhos) {
      if (caminhos.length === 0) return { erro: null };
      const { error } = await bucket().remove(caminhos);
      return { erro: error ? msg(error) : null };
    },
  };
}
