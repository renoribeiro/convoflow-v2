/**
 * Mídia das Conversas (bucket `whatsapp-media`): o que está gravado em
 * `messages.media_url` e como a tela chega ao arquivo.
 *
 * O bucket é privado (2026-10-23). A tela nunca usa o valor gravado direto: pede
 * um link temporário à função `media-links` (ver useMediaLinks). O valor gravado
 * pode ser o caminho (`<loja>/...`, o formato novo) ou a URL pública inteira de
 * antes; os dois servem para pedir o link. Link de fora (CDN do WhatsApp,
 * `data:`) segue como está.
 *
 * `whatsappMediaPath` é o espelho do mesmo nome em
 * supabase/functions/_shared/media-links.ts: a função e a tela precisam
 * concordar sobre o que é arquivo nosso. Paridade em mediaLinks.test.ts.
 */

export const WHATSAPP_MEDIA_BUCKET = 'whatsapp-media';

const ROTA_DO_BUCKET = new RegExp(
  `^/storage/v1/object/(?:public|sign|authenticated)/${WHATSAPP_MEDIA_BUCKET}/(.+)$`,
);

export function whatsappMediaPath(valor: unknown, origemDoProjeto?: string): string | null {
  if (typeof valor !== 'string') return null;
  const v = valor.trim();
  if (!v) return null;

  let caminho: string;
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) {
    if (!/^https?:\/\//i.test(v)) return null;
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

export type MediaRef =
  | { kind: 'none' }
  /** Link de fora: a tela usa como está. */
  | { kind: 'external'; url: string }
  /**
   * Arquivo nosso: a tela pede o link. `fallbackUrl` é a URL pública antiga,
   * quando é isso que está gravado; só serve enquanto o bucket for público.
   */
  | { kind: 'storage'; path: string; fallbackUrl: string | null };

export function classifyMediaUrl(valor: string | null | undefined, origemDoProjeto?: string): MediaRef {
  if (typeof valor !== 'string' || !valor.trim()) return { kind: 'none' };
  const path = whatsappMediaPath(valor, origemDoProjeto);
  if (path) {
    const fallbackUrl = /^https?:\/\//i.test(valor.trim()) && valor.includes('/object/public/') ? valor.trim() : null;
    return { kind: 'storage', path, fallbackUrl };
  }
  // Caminho torto de arquivo nosso não vira link de fora: só http(s) e data: passam.
  if (/^(https?:|data:|blob:)/i.test(valor.trim())) return { kind: 'external', url: valor.trim() };
  return { kind: 'none' };
}

/**
 * Link de "Baixar": no link assinado do Storage, `&download=` faz o arquivo
 * vir como anexo em vez de abrir (o atributo `download` do <a> não vale entre
 * domínios). O parâmetro não entra na assinatura, então o mesmo token serve.
 */
export function downloadHref(url: string): string {
  if (!url.includes('/storage/v1/object/sign/') || /[?&]download=/.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}download=`;
}
