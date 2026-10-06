/**
 * Quem pode entregar um evento no `evolution-webhook`.
 *
 * Item 14, lote 5 (H2). Antes a checagem era `apikey === instance.instance_key`
 * — e `instance_key` É o nome da instância (é por ele que a função acha a
 * linha). Quem soubesse o nome forjava mensagem, status e QR de qualquer Conta.
 *
 * Agora só duas credenciais valem, cada uma no seu lugar:
 *
 * 1. `apikey` do CORPO = token da própria instância. É o que a Evolution v2
 *    manda sozinha: `sendDataWebhook` põe `apikey: this.token` no corpo, mas
 *    SÓ quando o servidor tem `AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=true`
 *    (com `false` o campo vem `null` e o evento é recusado). O token fica em
 *    `connection_config.apiKey` — gravado pelo `evolution-provision` — ou na
 *    coluna legada `evolution_api_key`, a mesma ordem do `provider-factory`.
 *
 * 2. Cabeçalho `x-webhook-secret` = secret `EVOLUTION_WEBHOOK_SECRET`. Serve
 *    para um canal que o cliente NÃO lê (um proxy na frente da Evolution, por
 *    exemplo). Não ponha esse valor no `webhook.headers` de uma instância: a
 *    Evolution devolve os headers em `GET /webhook/find/{instância}`, que
 *    aceita o token da própria instância (`auth.guard.ts`) — e o token está no
 *    `connection_config`, que o navegador da Conta lê. Um cliente leria o
 *    secret e forjaria eventos para as instâncias de todo mundo.
 *
 * As duas não se cruzam: o secret no corpo, ou o token no cabeçalho, não
 * valem. Token igual ao nome da instância nunca vale — é o furo antigo.
 *
 * Comparação em tempo constante sobre o SHA-256 dos dois lados: os resumos têm
 * sempre 64 caracteres, então nem o tamanho do segredo vaza.
 */
import { matchVerifyToken } from './cryptoSignature.ts';

export const EVOLUTION_WEBHOOK_SECRET_HEADER = 'x-webhook-secret';

export interface EvolutionWebhookInstance {
  instance_key: string;
  connection_config?: unknown;
  evolution_api_key?: string | null;
}

export type EvolutionWebhookAuth =
  | { ok: true; via: 'instance_token' | 'webhook_secret' }
  | { ok: false; reason: 'missing_credentials' | 'invalid_credentials' };

/** O token desta instância, ou null se não houver um utilizável. */
export function evolutionInstanceToken(instance: EvolutionWebhookInstance): string | null {
  const cfg = instance.connection_config;
  const fromConfig =
    cfg && typeof cfg === 'object' && !Array.isArray(cfg)
      ? (cfg as Record<string, unknown>).apiKey
      : undefined;

  const token =
    (typeof fromConfig === 'string' && fromConfig) ||
    (typeof instance.evolution_api_key === 'string' && instance.evolution_api_key) ||
    '';

  if (!token || token === instance.instance_key) return null;
  return token;
}

const encoder = new TextEncoder();

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sameSecret(provided: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256Hex(provided), sha256Hex(expected)]);
  return matchVerifyToken(a, [b]) === 0;
}

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

export async function authenticateEvolutionWebhook(input: {
  instance: EvolutionWebhookInstance;
  /** `apikey` do corpo do evento. */
  payloadApiKey: unknown;
  /** Valor do cabeçalho `x-webhook-secret`. */
  headerSecret: string | null;
  /** `Deno.env.get('EVOLUTION_WEBHOOK_SECRET')`. */
  webhookSecret: string | undefined;
}): Promise<EvolutionWebhookAuth> {
  const { instance, payloadApiKey, headerSecret, webhookSecret } = input;

  const hasPayloadKey = nonEmpty(payloadApiKey);
  const hasHeader = nonEmpty(headerSecret);
  if (!hasPayloadKey && !hasHeader) return { ok: false, reason: 'missing_credentials' };

  const token = evolutionInstanceToken(instance);
  if (hasPayloadKey && token && (await sameSecret(payloadApiKey, token))) {
    return { ok: true, via: 'instance_token' };
  }

  if (hasHeader && nonEmpty(webhookSecret) && (await sameSecret(headerSecret, webhookSecret))) {
    return { ok: true, via: 'webhook_secret' };
  }

  return { ok: false, reason: 'invalid_credentials' };
}
