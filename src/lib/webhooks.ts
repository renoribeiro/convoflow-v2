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

/** O evento "Lead novo" (20261116000001): a primeira mensagem de um contato novo. */
export const EVENTO_LEAD_NOVO = 'lead.novo';

/**
 * Os campos que o "Lead novo" manda, na ordem em que a ajuda e a planilha os
 * mostram. Quem monta é o banco (public.lead_novo_corpo); docs/teste_lead_novo.sql
 * prova que são exatamente estes.
 */
export const CAMPOS_DO_LEAD_NOVO = [
  'data_entrada',
  'data_entrada_iso',
  'lead_id',
  'nome',
  'telefone',
  'primeiramensagem',
  'loja',
] as const;

/** Eventos que o usuário pode assinar ao criar um webhook. */
export const WEBHOOK_EVENT_TYPES: WebhookEventType[] = [
  { id: EVENTO_LEAD_NOVO, label: 'Lead novo' },
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

/** O nome do acontecimento para a tela ("lead.novo" vira "Lead novo"). */
export function rotuloDoEvento(id: string): string {
  return WEBHOOK_EVENT_TYPES.find((e) => e.id === id)?.label ?? id;
}

/**
 * A resposta do outro sistema, em português simples. Mesmo texto do alerta do
 * sino (tg_aviso_falhou_alerta, 20261116000001), para a pessoa reconhecer.
 * `erro` é o motivo gravado pelo servidor (_shared/webhook-entrega.ts).
 */
export function explicarResposta(status: number | null | undefined, erro: string | null | undefined): string {
  if (typeof status === 'number') {
    if (status >= 200 && status < 300) return `o outro sistema recebeu (código ${status})`;
    if (status === 404) return 'o endereço não existe no outro sistema (código 404)';
    if (status === 410) return 'o endereço foi desligado no outro sistema (código 410)';
    if (status === 401 || status === 403) return `o outro sistema recusou o acesso (código ${status})`;
    if (status === 429) return 'o outro sistema pediu para esperar (código 429)';
    if (status >= 500) return `o outro sistema estava com erro (código ${status})`;
    return `o outro sistema recusou o aviso (código ${status})`;
  }
  const e = erro ?? '';
  if (e.startsWith('tempo_esgotado')) return 'o outro sistema demorou mais de 10 segundos para responder';
  if (e === 'endereco_bloqueado: redirect') return 'o endereço manda para outro lugar; use o endereço final';
  if (e === 'endereco_bloqueado: unresolved') return 'esse endereço não existe na internet; confira se está escrito certo';
  if (e.startsWith('endereco_bloqueado')) return 'esse endereço é de rede interna e não pode receber avisos';
  if (e === 'Conta sem acesso') return 'a Conta estava sem acesso e o aviso não foi enviado';
  if (e === 'Webhook inativo ou inexistente') return 'o aviso estava desligado ou foi removido';
  return 'o outro sistema não respondeu';
}

/** Uma linha do histórico, como a tela lê de webhook_deliveries. */
export interface EntregaDoAviso {
  id: string;
  created_at: string;
  event_type: string;
  status: 'pending' | 'processing' | 'delivered' | 'failed' | string;
  attempts: number;
  max_attempts: number;
  response_status: number | null;
  error_message: string | null;
  teste: boolean;
}

export type SituacaoDaEntrega = 'aceito' | 'falhou' | 'tentando' | 'na_fila';

export function situacaoDaEntrega(e: Pick<EntregaDoAviso, 'status' | 'attempts'>): SituacaoDaEntrega {
  if (e.status === 'delivered') return 'aceito';
  if (e.status === 'failed') return 'falhou';
  return e.attempts > 0 ? 'tentando' : 'na_fila';
}

export const ROTULO_DA_SITUACAO: Record<SituacaoDaEntrega, string> = {
  aceito: 'Aceito',
  falhou: 'Falhou',
  tentando: 'Tentando de novo',
  na_fila: 'Na fila',
};

/** "1 tentativa", "3 de 5 tentativas". */
export function textoDasTentativas(e: Pick<EntregaDoAviso, 'status' | 'attempts' | 'max_attempts'>): string {
  const n = Math.max(0, e.attempts);
  if (e.status === 'delivered' || e.status === 'failed') return n === 1 ? '1 tentativa' : `${n} tentativas`;
  return `${n} de ${e.max_attempts} tentativas`;
}

/** "16/11 16:48", no horário de Brasília. */
export function quandoFoi(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d).replace(',', '');
}

/** Valor do seletor de Loja do Gerente que cria o mesmo aviso em cada Loja. */
export const TODAS_AS_LOJAS = 'todas';

/** O que a edge function webhook-teste devolve (o gancho useMexerNosAvisos repassa). */
export interface ResultadoDoTeste {
  ok: boolean;
  aceito?: boolean;
  status?: number | null;
  erro?: string | null;
  /** Frase da recusa (sem acesso, limite de testes, aviso que sumiu). */
  error?: string;
}

/** O resultado do botão "Enviar aviso de teste", numa frase. */
export function fraseDoTeste(r: ResultadoDoTeste): { aceito: boolean; texto: string } {
  if (!r.ok) return { aceito: false, texto: r.error ?? 'Não foi possível mandar o teste agora.' };
  if (r.aceito) return { aceito: true, texto: `Aceito: ${explicarResposta(r.status, r.erro)}.` };
  return { aceito: false, texto: `Não aceito: ${explicarResposta(r.status, r.erro)}.` };
}

/**
 * "Reenviar" aparece só no envio que falhou de verdade (não no teste, que tem o
 * botão próprio). O banco confere de novo (reenviar_entrega, 20261116000002).
 */
export function podeReenviar(e: Pick<EntregaDoAviso, 'status' | 'teste'>): boolean {
  return e.status === 'failed' && !e.teste;
}
