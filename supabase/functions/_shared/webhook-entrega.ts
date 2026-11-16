// =============================================================================
// webhook-entrega.ts — o POST de um aviso para sistema (webhook de saída)
// =============================================================================
// Usado pelo webhook-dispatcher (a fila) e pelo webhook-teste (o botão "Enviar
// aviso de teste"), para os dois mandarem do mesmo jeito e gravarem o mesmo
// motivo de falha no histórico (webhook_deliveries.error_message), que a tela
// explica em português (explicarResposta, src/lib/webhooks.ts) e o alerta do
// sino também (tg_aviso_falhou_alerta, 20261116000001).
//
// Desde 2026-11-16 o endereço passa por safeFetch: rede interna, endereço que
// não existe e redirecionamento são recusados antes de sair. Com o histórico
// mostrando o código de resposta, mandar para endereço interno virava um jeito
// de sondar a rede do servidor.
//
// Sem I/O próprio além do fetch injetável: o Vitest testa sem Deno.
// =============================================================================

import { OutboundUrlError, safeFetch, type Resolver } from './safe-outbound-url.ts';

/** Prazo para o outro sistema responder. */
export const PRAZO_DO_AVISO_MS = 10_000;

/** Os motivos de falha sem código HTTP, como ficam gravados no histórico. */
export const ERRO_TEMPO_ESGOTADO = 'tempo_esgotado';
export const ERRO_ENDERECO_BLOQUEADO = 'endereco_bloqueado';
export const ERRO_SEM_CONEXAO = 'sem_conexao';

export interface ResultadoDaEntrega {
  aceito: boolean;
  /** Código HTTP que o outro sistema respondeu, ou null quando nem respondeu. */
  status: number | null;
  /** null quando aceito; senão "HTTP 404", "tempo_esgotado", "endereco_bloqueado: <razão>" ou "sem_conexao". */
  erro: string | null;
}

export interface OpcoesDaEntrega {
  fetchImpl?: typeof fetch;
  resolver?: Resolver;
  timeoutMs?: number;
}

/** Assinatura HMAC-SHA256 (hex) do corpo, igual a signWebhookPayload (src/lib/webhooks.ts). */
export async function assinarAviso(segredo: string, corpo: string): Promise<string> {
  const enc = new TextEncoder();
  const chave = await crypto.subtle.importKey('raw', enc.encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', chave, enc.encode(corpo));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Os cabeçalhos de todo aviso. A assinatura só vai quando há senha de conferência. */
export async function cabecalhosDoAviso(p: {
  evento: string;
  entregaId: string;
  corpo: string;
  segredo?: string | null;
  teste?: boolean;
}): Promise<Record<string, string>> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-ConvoFlow-Event': p.evento,
    'X-ConvoFlow-Delivery': p.entregaId,
  };
  if (p.teste) h['X-ConvoFlow-Test'] = 'true';
  if (p.segredo) h['X-ConvoFlow-Signature'] = `sha256=${await assinarAviso(p.segredo, p.corpo)}`;
  return h;
}

/** Traduz a exceção do fetch no motivo gravado. */
export function motivoDaFalha(err: unknown): string {
  if (err instanceof OutboundUrlError) return `${ERRO_ENDERECO_BLOQUEADO}: ${err.reason}`;
  const nome = (err as { name?: string } | null)?.name ?? '';
  if (nome === 'TimeoutError' || nome === 'AbortError') return ERRO_TEMPO_ESGOTADO;
  return ERRO_SEM_CONEXAO;
}

/** Faz o POST e devolve o que aconteceu. Nunca lança. */
export async function entregarAviso(
  url: string,
  corpo: string,
  cabecalhos: Record<string, string>,
  opcoes: OpcoesDaEntrega = {},
): Promise<ResultadoDaEntrega> {
  try {
    const res = await safeFetch(
      url,
      { method: 'POST', headers: cabecalhos, body: corpo },
      { fetchImpl: opcoes.fetchImpl, resolver: opcoes.resolver, timeoutMs: opcoes.timeoutMs ?? PRAZO_DO_AVISO_MS },
    );
    // O corpo da resposta não interessa; ler libera a conexão.
    try {
      await res.body?.cancel();
    } catch {
      // ignora
    }
    if (res.ok) return { aceito: true, status: res.status, erro: null };
    return { aceito: false, status: res.status, erro: `HTTP ${res.status}` };
  } catch (err) {
    return { aceito: false, status: null, erro: motivoDaFalha(err) };
  }
}
