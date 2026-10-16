// O lado que ASSINA os pedidos para a função da Vercel (api/nfse.js).
// Mesmo formato de api/_lib/nfse/hmac.js: HMAC-SHA256 de `${ts}.${nonce}.${corpo}`,
// ts em segundos, nonce de 32 hex, assinatura em hex. Só WebCrypto: roda no
// Deno, no Node e no Vitest.

const enc = new TextEncoder();

function hex(buf: ArrayBuffer | Uint8Array): string {
  return Array.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function hmacSha256Hex(segredo: string, texto: string): Promise<string> {
  const chave = await crypto.subtle.importKey('raw', enc.encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', chave, enc.encode(texto)));
}

/** Cabeçalhos x-nfse-* para um corpo já serializado. */
export async function cabecalhosAssinados(
  segredo: string,
  corpo: string,
  agora: Date = new Date(),
  nonce: string = hex(crypto.getRandomValues(new Uint8Array(16))),
): Promise<Record<string, string>> {
  const ts = String(Math.floor(agora.getTime() / 1000));
  return {
    'x-nfse-ts': ts,
    'x-nfse-nonce': nonce,
    'x-nfse-assinatura': await hmacSha256Hex(segredo, `${ts}.${nonce}.${corpo}`),
  };
}
