// =============================================================================
// waha-webhook-auth.ts — quem pode entregar um evento no `waha-webhook`
// =============================================================================
// Antes (até 2026-10-26) valia uma senha só para todos os servidores WAHA, o
// secret WAHA_WEBHOOK_SECRET no cabeçalho Authorization. O servidor WAHA é do
// cliente: para receber eventos, o cliente teria de conhecer essa senha, e com
// ela forjaria eventos para os números WAHA de TODAS as Lojas.
//
// Agora cada número tem a própria senha de entrega (`webhookSecret`), criada
// pelo servidor no cadastro (waha-provision) e guardada no cofre
// (get_instance_provider_credentials). O WAHA assina o corpo com ela:
// `.agent/skills/waha/SKILL.md` §2.3 (`hmac.key`) e §4.3 — cabeçalho
// `X-Webhook-Hmac` = HMAC-SHA512 do corpo bruto, em hexadecimal. Quem conhece
// a senha de um número só consegue falar por aquele número, que já é dele.
//
// Sem imports de Deno: o Vitest importa este arquivo.
// =============================================================================

export const WAHA_HMAC_HEADER = 'x-webhook-hmac';
export const WAHA_HMAC_ALGORITHM_HEADER = 'x-webhook-hmac-algorithm';

const encoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** HMAC-SHA512 do corpo, em hexadecimal minúsculo. */
export async function wahaHmacHex(rawBody: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
  return toHex(new Uint8Array(sig));
}

function sameLength128Hex(a: string, b: string): boolean {
  if (a.length !== 128 || b.length !== 128) return false;
  let diff = 0;
  for (let i = 0; i < 128; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type WahaWebhookAuth =
  | { ok: true }
  | { ok: false; reason: 'no_secret' | 'missing_signature' | 'bad_algorithm' | 'invalid_signature' };

/**
 * Confere a assinatura do WAHA. `secret` é a senha de entrega DESTE número, do
 * cofre; sem ela, recusa (número cadastrado antes da senha por número, ou
 * cofre fora do ar: falha fechada).
 */
export async function authenticateWahaWebhook(input: {
  rawBody: string;
  signatureHeader: string | null;
  algorithmHeader: string | null;
  secret: string | null | undefined;
}): Promise<WahaWebhookAuth> {
  const { rawBody, signatureHeader, algorithmHeader, secret } = input;
  if (typeof secret !== 'string' || secret.length === 0) return { ok: false, reason: 'no_secret' };
  const provided = (signatureHeader ?? '').trim().toLowerCase();
  if (!provided) return { ok: false, reason: 'missing_signature' };
  if (algorithmHeader && algorithmHeader.trim().toLowerCase() !== 'sha512') {
    return { ok: false, reason: 'bad_algorithm' };
  }
  const expected = await wahaHmacHex(rawBody, secret);
  return sameLength128Hex(provided, expected) ? { ok: true } : { ok: false, reason: 'invalid_signature' };
}

/** Senha de entrega nova: 32 bytes aleatórios em hexadecimal (64 caracteres). */
export function newWebhookSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}
