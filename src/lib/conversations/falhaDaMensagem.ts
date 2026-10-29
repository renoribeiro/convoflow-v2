import { motivoDaFalhaGravada, motivoDaRecusaMeta } from '@/lib/whatsapp/metaErrors';

/**
 * Mensagem que não saiu: o motivo que a bolha mostra embaixo dela e se dá
 * para "Reenviar" (lote 6d, achado 37, decisão D12 do dono).
 *
 * De onde vem a falha gravada (messages.error_code / error_message):
 *  - API Oficial, na hora do envio ou pelo webhook: o código da Meta (só
 *    algarismos) e a frase crua da Meta, em inglês. A frase crua NUNCA vai
 *    para a tela: com código conhecido sai o texto em português de
 *    metaErrors.ts; sem ele, uma frase genérica, sempre com o código no fim.
 *  - Evolution e WAHA (whatsapp-send-message), Instagram e as guardas da
 *    tela: um motivo nosso (letras, ex.: "disconnected") e a frase que a tela
 *    mostrou, já em português. Essa frase é a que fica.
 */
export interface FalhaGravada {
  error_code?: string | null;
  error_message?: string | null;
}

const SEM_MOTIVO = 'A mensagem não foi enviada.';
const META_GENERICA = 'A Meta recusou esta mensagem.';

export function motivoDaFalhaDaMensagem(falha: FalhaGravada | null | undefined): string {
  const codigo = (falha?.error_code ?? '').trim();
  const texto = (falha?.error_message ?? '').trim();
  if (/^\d+$/.test(codigo)) return motivoDaRecusaMeta(codigo, META_GENERICA);
  if (codigo) return texto || SEM_MOTIVO;
  // Sem código: linha antiga ou guarda da tela. Se o texto traz um código da
  // Meta, vale a frase em português dele; senão, o texto (que é nosso).
  if (!texto) return SEM_MOTIVO;
  const traduzido = motivoDaFalhaGravada(texto);
  return traduzido !== texto ? traduzido : texto;
}

/** O que a bolha precisa saber da mensagem para decidir o "Reenviar". */
export interface MensagemParaReenvio {
  direction: string;
  status: string;
  message_type: string;
  content: string | null;
}

export type Reenvio = { pode: true } | { pode: false; motivo: string };

/** Por que a conversa não deixa enviar agora (null = deixa). */
export interface ContextoDoReenvio {
  bloqueio: string | null;
}

export const REENVIO_TEXTOS = {
  template: 'Para reenviar um template, use "Enviar template" no menu ⋮.',
  arquivo: 'Para reenviar um arquivo, anexe de novo e envie.',
} as const;

/**
 * Reenviar cria uma mensagem NOVA com o mesmo texto; a que falhou fica no
 * histórico como estava. Só texto: arquivo se anexa de novo e template sai
 * por "Enviar template". Na API Oficial fora da janela de 24 horas, quem barra
 * é o `bloqueio` (a mesma regra do campo de mensagem).
 * null = a mensagem não falhou, ou não é nossa: a bolha não mostra nada.
 */
export function reenvioDaMensagem(m: MensagemParaReenvio, ctx: ContextoDoReenvio): Reenvio | null {
  if (m.direction !== 'outbound' || m.status !== 'failed') return null;
  const tipo = (m.message_type || 'text').toLowerCase();
  if (tipo === 'reaction') return null;
  if (tipo === 'template') return { pode: false, motivo: REENVIO_TEXTOS.template };
  if (tipo !== 'text') return { pode: false, motivo: REENVIO_TEXTOS.arquivo };
  if (!m.content?.trim()) return null;
  if (ctx.bloqueio) return { pode: false, motivo: ctx.bloqueio };
  return { pode: true };
}
