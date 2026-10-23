// =============================================================================
// media-links — o núcleo da função que entrega link temporário da mídia do chat
// =============================================================================
// Foto, áudio, vídeo e documento das Conversas moram no bucket `whatsapp-media`.
// Quem abre o arquivo pede um link assinado (vale 1 hora) por esta função, com
// a sessão dele. A regra de quem vê qual arquivo é a MESMA de quem vê qual
// mensagem: a leitura de `messages` é feita com o token de quem pede, então o
// RLS da conversa decide (atendente em "own"/"unassigned", gerente nas Lojas
// filhas, outra Conta nada). Mensagem que não volta não ganha link.
//
// Depois disso, cada caminho ainda tem de bater com a própria mensagem:
//   - começa pela pasta da Loja da mensagem (`<tenant_id>/...`);
//   - `<tenant_id>/inbound/<wamid>.<ext>` só vale para mensagem RECEBIDA cujo id
//     do WhatsApp é aquele <wamid> (é o caminho que o meta-webhook grava);
//   - qualquer outro caminho só vale para mensagem ENVIADA (o anexo do chat).
// Assim uma linha que alguém da Loja gravou à mão não serve de chave para o
// arquivo de outra conversa.
//
// O valor gravado em `messages.media_url` pode ser o caminho (o formato novo) ou
// a URL pública inteira de antes de 2026-10-23: as duas formas valem.
//
// Sem nada de Deno aqui: os testes do app importam este arquivo
// (src/lib/media/mediaLinks.test.ts). A casca está em media-links/index.ts.
// =============================================================================

export const WHATSAPP_MEDIA_BUCKET = 'whatsapp-media';
/** Validade do link, para ver no chat e para o provedor baixar no envio. */
export const MEDIA_LINK_TTL_S = 60 * 60;
/** Uma página do chat tem 50 mensagens; 100 dá folga para duas. */
export const MAX_MESSAGE_IDS = 100;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROTA_DO_BUCKET = new RegExp(
  `^/storage/v1/object/(?:public|sign|authenticated)/${WHATSAPP_MEDIA_BUCKET}/(.+)$`,
);

/**
 * Caminho do arquivo dentro de `whatsapp-media`, a partir do que está gravado
 * na mensagem. Aceita o caminho puro e a URL do próprio projeto (pública ou
 * assinada). Devolve null para vazio, para link de fora (CDN do WhatsApp,
 * `data:`, `blob:`) e para qualquer caminho torto (`..`, barra no começo).
 *
 * `origemDoProjeto` (ex.: https://<ref>.supabase.co) faz a URL de outro host
 * ser recusada mesmo com o mesmo desenho de rota.
 */
export function whatsappMediaPath(valor: unknown, origemDoProjeto?: string): string | null {
  if (typeof valor !== 'string') return null;
  const v = valor.trim();
  if (!v) return null;

  let caminho: string;
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) {
    if (!/^https?:\/\//i.test(v)) return null; // data:, blob: e afins
    let url: URL;
    try {
      url = new URL(v);
    } catch {
      return null;
    }
    if (origemDoProjeto) {
      let origem: string;
      try {
        origem = new URL(origemDoProjeto).origin;
      } catch {
        return null;
      }
      if (url.origin !== origem) return null;
    }
    const m = ROTA_DO_BUCKET.exec(url.pathname);
    if (!m) return null;
    try {
      caminho = decodeURIComponent(m[1] ?? '');
    } catch {
      return null;
    }
  } else {
    caminho = v;
  }

  if (caminho.startsWith('/') || caminho.includes('\\') || /[?#]/.test(caminho)) return null;
  const partes = caminho.split('/');
  if (partes.length < 2 || partes.some((p) => p === '' || p === '.' || p === '..')) return null;
  return caminho;
}

export type LinhaDaMensagem = {
  id: string;
  tenant_id: string | null;
  direction: string | null;
  evolution_message_id: string | null;
  media_url: string | null;
};

/** O caminho pertence a esta mensagem? (ver o cabeçalho) */
export function caminhoBateComAMensagem(linha: LinhaDaMensagem, caminho: string): boolean {
  if (!linha.tenant_id || !caminho.startsWith(`${linha.tenant_id}/`)) return false;
  const resto = caminho.slice(linha.tenant_id.length + 1);
  if (resto.startsWith('inbound/')) {
    const wamid = linha.evolution_message_id;
    return linha.direction === 'inbound' && Boolean(wamid) && resto.startsWith(`inbound/${wamid}.`);
  }
  return linha.direction === 'outbound';
}

export type DependenciasMediaLinks = {
  /** Confere o token. null = sem login válido. */
  usuarioDoToken(token: string): Promise<{ id: string } | null>;
  /** Lê as mensagens COM O TOKEN de quem pede (o RLS decide). */
  lerMensagens(token: string, ids: string[]): Promise<LinhaDaMensagem[]>;
  /** Assina com a chave do servidor, de uma vez. Caminho sem link volta null. */
  assinar(caminhos: string[], validadeS: number): Promise<Array<{ path: string; signedUrl: string | null }>>;
  origemDoProjeto?: string;
};

export type RespostaMediaLinks = {
  status: number;
  body: { links: Record<string, string>; expires_in: number } | { error: string };
};

export function lerIdsDoPedido(corpo: unknown): string[] | { error: string } {
  const ids = (corpo as { message_ids?: unknown } | null)?.message_ids;
  if (!Array.isArray(ids)) return { error: 'Pedido inválido.' };
  const unicos = [...new Set(ids)];
  if (unicos.length > MAX_MESSAGE_IDS) return { error: `No máximo ${MAX_MESSAGE_IDS} mensagens por pedido.` };
  if (!unicos.every((id) => typeof id === 'string' && UUID.test(id))) return { error: 'Pedido inválido.' };
  return unicos as string[];
}

export async function atenderMediaLinks(
  pedido: { token: string | null; corpo: unknown },
  deps: DependenciasMediaLinks,
): Promise<RespostaMediaLinks> {
  const token = (pedido.token ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return { status: 401, body: { error: 'Entre no sistema de novo.' } };
  const usuario = await deps.usuarioDoToken(token);
  if (!usuario) return { status: 401, body: { error: 'Entre no sistema de novo.' } };

  const ids = lerIdsDoPedido(pedido.corpo);
  if (!Array.isArray(ids)) return { status: 400, body: ids };
  if (ids.length === 0) return { status: 200, body: { links: {}, expires_in: MEDIA_LINK_TTL_S } };

  const linhas = await deps.lerMensagens(token, ids);
  const pedidos = new Set(ids);
  const caminhoPorMensagem = new Map<string, string>();
  for (const linha of linhas) {
    if (!pedidos.has(linha.id)) continue;
    const caminho = whatsappMediaPath(linha.media_url, deps.origemDoProjeto);
    if (caminho && caminhoBateComAMensagem(linha, caminho)) caminhoPorMensagem.set(linha.id, caminho);
  }
  if (caminhoPorMensagem.size === 0) return { status: 200, body: { links: {}, expires_in: MEDIA_LINK_TTL_S } };

  const caminhos = [...new Set(caminhoPorMensagem.values())];
  const assinados = await deps.assinar(caminhos, MEDIA_LINK_TTL_S);
  const linkPorCaminho = new Map<string, string>();
  for (const a of assinados) if (a.signedUrl) linkPorCaminho.set(a.path, a.signedUrl);

  const links: Record<string, string> = {};
  for (const [id, caminho] of caminhoPorMensagem) {
    const link = linkPorCaminho.get(caminho);
    if (link) links[id] = link;
  }
  return { status: 200, body: { links, expires_in: MEDIA_LINK_TTL_S } };
}

/**
 * Caminho que o chat pede para ENVIAR ao provedor (whatsapp-send-message): o
 * anexo que a pessoa acabou de subir na pasta da Loja da instância. Nunca
 * `inbound/` (o servidor não reenvia mídia recebida por aqui).
 */
export function caminhoDeEnvioValido(caminho: unknown, tenantDaInstancia: string): string | null {
  const c = whatsappMediaPath(caminho);
  if (!c || c !== caminho) return null; // só o caminho puro, nunca uma URL
  if (!c.startsWith(`${tenantDaInstancia}/`)) return null;
  if (c.slice(tenantDaInstancia.length + 1).startsWith('inbound/')) return null;
  return c;
}
