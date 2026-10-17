// Leitura mínima do XML da NFS-e devolvido pela Sefin (sem DOM: o Deno das
// edge functions não tem DOMParser). O XML é gerado pelo governo, sem CDATA e
// sem prefixo de namespace nas tags de dados: basta achar blocos por nome.

/** Conteúdo interno do primeiro <tag ...>...</tag> (ou null). */
export function bloco(xml: string | null | undefined, tag: string): string | null {
  if (!xml) return null;
  const abre = new RegExp(`<${tag}(\\s[^>]*)?>`);
  const m = abre.exec(xml);
  if (!m) return null;
  const inicio = m.index + m[0].length;
  const fim = xml.indexOf(`</${tag}>`, inicio);
  return fim < 0 ? null : xml.slice(inicio, fim);
}

/** Valor de texto num caminho de blocos: valor(xml, 'infNFSe', 'emit', 'xNome'). */
export function valor(xml: string | null | undefined, ...caminho: string[]): string | null {
  let atual: string | null = xml ?? null;
  for (const tag of caminho) {
    atual = bloco(atual, tag);
    if (atual === null) return null;
  }
  return atual === null ? null : decodificar(atual.trim());
}

/** Atributo da primeira tag: atributo(xml, 'infNFSe', 'Id'). */
export function atributo(xml: string | null | undefined, tag: string, nome: string): string | null {
  if (!xml) return null;
  const m = new RegExp(`<${tag}\\s[^>]*\\b${nome}="([^"]*)"`).exec(xml);
  return m?.[1] !== undefined ? decodificar(m[1]) : null;
}

export function decodificar(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
