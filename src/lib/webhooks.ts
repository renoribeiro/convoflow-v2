/**
 * Helpers de webhooks de saída (outbound), compartilhados entre a UI e os testes.
 *
 * A edge function `supabase/functions/webhook-dispatcher` usa a MESMA assinatura
 * (HMAC-SHA256 hex) — esta função existe aqui para ser testável no Vitest e
 * reutilizada na UI. Mantenha as duas implementações em sincronia.
 */

export interface WebhookEventType {
  id: string;
  label: string;
}

/** Eventos que o usuário pode assinar ao criar um webhook. */
export const WEBHOOK_EVENT_TYPES: WebhookEventType[] = [
  { id: 'message.received', label: 'Chega uma mensagem' },
  { id: 'message.sent', label: 'Sai uma mensagem' },
  { id: 'contact.created', label: 'Entra um contato novo' },
  { id: 'contact.updated', label: 'Um contato muda' },
  { id: 'campaign.started', label: 'Uma campanha começa' },
  { id: 'campaign.completed', label: 'Uma campanha termina' },
  { id: 'followup.scheduled', label: 'Um follow up é agendado' },
  { id: 'chatbot.triggered', label: 'Um chatbot começa a atender' },
];

export const WEBHOOK_EVENT_IDS = WEBHOOK_EVENT_TYPES.map((e) => e.id);

export interface WebhookFormValues {
  name?: string;
  url?: string;
  events?: string[];
  secret?: string;
  active?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Valida o formulário de webhook no boundary (submit). Exige nome e uma URL
 * http(s) válida; pelo menos um evento.
 */
export function validateWebhookForm(form: WebhookFormValues): ValidationResult {
  if (!form.name || !form.name.trim()) {
    return { valid: false, error: 'Dê um nome ao aviso.' };
  }
  if (!form.url || !form.url.trim()) {
    return { valid: false, error: 'Informe o endereço do outro sistema.' };
  }
  let parsed: URL;
  try {
    parsed = new URL(form.url.trim());
  } catch {
    return { valid: false, error: 'Esse endereço não é válido. Confira se está completo.' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, error: 'O endereço precisa começar com http:// ou https://' };
  }
  if (!form.events || form.events.length === 0) {
    return { valid: false, error: 'Escolha pelo menos um acontecimento para avisar.' };
  }
  const unknown = form.events.filter((e) => !WEBHOOK_EVENT_IDS.includes(e));
  if (unknown.length > 0) {
    return { valid: false, error: 'Um dos acontecimentos marcados não existe mais. Recarregue a página e marque de novo.' };
  }
  return { valid: true };
}

/**
 * Assinatura HMAC-SHA256 (hex minúsculo) do corpo bruto. O consumidor valida
 * recriando a mesma assinatura com o `secret` e comparando com o header
 * `X-ConvoFlow-Signature: sha256=<hex>`.
 *
 * DEVE produzir o mesmo resultado da função `hmacHex` da edge function.
 */
export async function signWebhookPayload(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
