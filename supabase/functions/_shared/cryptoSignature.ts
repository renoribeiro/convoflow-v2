/**
 * Crypto helpers for verifying webhook signatures.
 *
 * Currently used by `meta-webhook` to validate the `X-Hub-Signature-256`
 * header that Meta sends with every POST. Designed to be reusable for any
 * provider that signs payloads with HMAC-SHA256 (Stripe, GitHub, etc).
 */

const encoder = new TextEncoder();

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Invalid hex string length');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) {
      throw new Error('Invalid hex character');
    }
    bytes[i] = byte;
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

/**
 * Compute the HMAC-SHA256 of `rawBody` keyed by `secret` and return it as
 * lowercase hex. Useful for tests or for signing outbound requests.
 */
export async function computeHmacSha256Hex(rawBody: string, secret: string): Promise<string> {
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
  return bytesToHex(new Uint8Array(signature));
}

/**
 * Verify a Meta-style `X-Hub-Signature-256` header.
 *
 * Meta sends the header as `sha256=<hex>`. We compute HMAC-SHA256 over the
 * raw request body keyed by the App Secret and compare in constant time.
 *
 * Returns true ONLY if the header is present, well-formed, and matches.
 */
export async function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!signatureHeader || !appSecret) return false;

  const prefix = 'sha256=';
  if (!signatureHeader.startsWith(prefix)) return false;

  const providedHex = signatureHeader.slice(prefix.length).trim();
  if (providedHex.length !== 64) return false;

  let providedBytes: Uint8Array;
  try {
    providedBytes = hexToBytes(providedHex);
  } catch {
    return false;
  }

  const expectedHex = await computeHmacSha256Hex(rawBody, appSecret);
  const expectedBytes = hexToBytes(expectedHex);

  return timingSafeEqual(providedBytes, expectedBytes);
}

/**
 * Lista de segredos candidatos para um webhook. Ordem importa: o primeiro é o
 * app atual, o segundo é o app novo. `undefined`, `null` e string vazia são
 * ignorados — assim um secret secundário ausente ou limpo não muda nada em
 * relação a validar só com o primário. Suporte permanente (ver cabeçalho de
 * `meta-webhook/index.ts`): fora de migração o segundo slot fica vazio, e é
 * isso que o torna inerte — não a remoção do código.
 */
export type SecretCandidates = ReadonlyArray<string | null | undefined>;

/**
 * Como `verifyMetaSignature`, mas aceita mais de um App Secret — necessário
 * enquanto dois Meta Apps apontam para o mesmo endpoint. Tenta cada segredo na
 * ordem recebida e devolve o índice (na lista ORIGINAL) do que bateu, ou -1.
 *
 * Retornar o índice em vez de booleano permite ao chamador registrar QUAL app
 * assinou sem nunca tocar no valor do segredo. Sem segredo presente → -1,
 * nunca aceita.
 */
export async function verifyMetaSignatureAny(
  rawBody: string,
  signatureHeader: string | null,
  candidates: SecretCandidates,
): Promise<number> {
  for (let i = 0; i < candidates.length; i++) {
    const secret = candidates[i];
    if (typeof secret !== 'string' || secret.length === 0) continue;
    if (await verifyMetaSignature(rawBody, signatureHeader, secret)) return i;
  }
  return -1;
}

/**
 * Handshake GET da Meta: `hub.verify_token` precisa bater com um dos tokens
 * configurados. Comparação em tempo constante; devolve o índice do token que
 * bateu (na lista original) ou -1. Token vindo ausente ou vazio nunca bate.
 */
export function matchVerifyToken(
  provided: string | null | undefined,
  candidates: SecretCandidates,
): number {
  if (typeof provided !== 'string' || provided.length === 0) return -1;
  const providedBytes = encoder.encode(provided);
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (typeof candidate !== 'string' || candidate.length === 0) continue;
    if (timingSafeEqual(providedBytes, encoder.encode(candidate))) return i;
  }
  return -1;
}
