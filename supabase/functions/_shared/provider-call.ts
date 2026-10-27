// =============================================================================
// provider-call.ts — executa um ProviderRequest (instance-control.ts) no Deno
// =============================================================================
// Servidor do cliente (WAHA) passa por safeFetch: endereço interno é recusado e
// redirecionamento não é seguido. O servidor Evolution é o da plataforma e vai
// por fetch com prazo. Imagem (QR do WAHA) volta em base64; o resto, JSON.
// =============================================================================

import type { ProviderRequest, ProviderResponse } from './instance-control.ts';
import { OutboundUrlError, safeFetch } from './safe-outbound-url.ts';

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export async function callProvider(req: ProviderRequest): Promise<ProviderResponse> {
  const init: RequestInit = {
    method: req.method,
    headers: req.headers,
    body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
  };
  let res: Response;
  try {
    res = req.customerServer
      ? await safeFetch(req.url, init)
      : await fetch(req.url, { ...init, signal: AbortSignal.timeout(15000) });
  } catch (err) {
    if (err instanceof OutboundUrlError) return { status: 0, blocked: err.message };
    return { status: 0, networkError: true };
  }
  const contentType = res.headers.get('content-type') || '';
  if (contentType.startsWith('image/')) {
    const buf = new Uint8Array(await res.arrayBuffer());
    return { status: res.status, base64: bytesToBase64(buf), contentType: contentType.split(';')[0] };
  }
  const text = await res.text().catch(() => '');
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return { status: res.status, json };
}
