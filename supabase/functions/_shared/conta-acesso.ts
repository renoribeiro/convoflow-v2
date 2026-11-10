// =============================================================================
// conta-acesso — a Conta tem acesso? A trava de pagamento no servidor
// =============================================================================
// Até 2026-11-06 a trava morava só na tela. Agora toda edge function que escreve
// em nome do cliente ou gasta dinheiro pergunta aqui, e a resposta vem da mesma
// regra que decide a tela: public.conta_acesso(uuid), a única cópia em SQL
// (migração 20261106000001). Nada de reescrever a regra neste arquivo.
//
// DOIS JEITOS DE USAR
//   Pessoa logada   decidirAcessoDoChamador(admin, perfil). Superadmin sempre
//                   passa. A recusa traz a frase certa para o cargo.
//   Trabalhador     criarMemoDeAcesso(admin). Pergunta uma vez por Conta em cada
//                   rodada, para chatbot, automação, campanha, relatório.
//
// SE O BANCO NÃO RESPONDER
//   A pessoa recebe "tente de novo" (503): nem libera sem saber, nem diz que a
//   Conta está bloqueada. O trabalhador não envia nesta rodada e a próxima
//   pergunta de novo: nada automático sai sem certeza, e nada é pausado nem
//   cancelado por causa de um "não sei".
//
// O QUE NÃO PASSA POR AQUI, DE PROPÓSITO
//   Mensagem que chega nunca é barrada: os webhooks gravam sempre. Quem para é a
//   resposta automática. O caminho do pagamento (checkout, cancelar, dados da
//   nota) também fica de fora: é por ele que a Conta volta a ter acesso. A lista
//   de cada função está em src/lib/access/travaNoServidor.test.ts.
// =============================================================================

import { normalizeRole } from './capabilities.ts';

/** Código na resposta. A tela e os testes reconhecem a recusa por ele. */
export const CONTA_SEM_ACESSO_CODE = 'conta_sem_acesso';

/**
 * As frases. Cópia em public.exigir_conta_com_acesso (migração 20261106000001):
 * src/lib/access/travaNoServidor.test.ts exige que sejam iguais.
 */
export const MSG_SEM_ACESSO_GERENTE =
  'A Conta está sem acesso, então esta ação não foi feita. Para liberar, entre no ConvoFlow e conclua a assinatura na tela de pagamento.';
export const MSG_SEM_ACESSO_EQUIPE =
  'A Conta está sem acesso, então esta ação não foi feita. Fale com o responsável pela Conta.';
export const MSG_ACESSO_INDISPONIVEL =
  'Não foi possível conferir o acesso da Conta agora. Tente de novo em alguns minutos.';

/** O mínimo do cliente do Supabase que este arquivo usa. */
export interface ClienteComRpc {
  // deno-lint-ignore no-explicit-any
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: any; error: { message?: string } | null }>;
}

/** O perfil de quem chama. As funções já leem isso para conferir o cargo. */
export interface ChamadorDaConta {
  role?: string | null;
  tenant_id?: string | null;
}

export type DecisaoDeAcesso =
  | { ok: true }
  | { ok: false; status: 403 | 503; code: string; error: string };

/** A frase da recusa para o cargo: o Gerente paga, a equipe fala com ele. */
export function mensagemSemAcesso(role: string | null | undefined): string {
  return normalizeRole(role) === 'gerente' ? MSG_SEM_ACESSO_GERENTE : MSG_SEM_ACESSO_EQUIPE;
}

/** Pergunta à regra. Lança se o banco não responder: quem chama decide o que fazer. */
export async function contaLiberada(admin: ClienteComRpc, tenantId: string): Promise<boolean> {
  const { data, error } = await admin.rpc('conta_acesso', { p_tenant_id: tenantId });
  if (error) throw new Error(error.message ?? 'conta_acesso sem resposta');
  const linha = Array.isArray(data) ? data[0] : data;
  return linha?.unlocked === true;
}

/**
 * A pessoa logada pode seguir? Sem Conta no perfil não há o que decidir aqui: a
 * função já trata esse caso (é o mesmo que o banco faz).
 */
export async function decidirAcessoDoChamador(
  admin: ClienteComRpc,
  chamador: ChamadorDaConta | null | undefined,
): Promise<DecisaoDeAcesso> {
  if (normalizeRole(chamador?.role) === 'superadmin') return { ok: true };
  if (!chamador?.tenant_id) return { ok: true };
  try {
    if (await contaLiberada(admin, chamador.tenant_id)) return { ok: true };
  } catch {
    return { ok: false, status: 503, code: 'acesso_indisponivel', error: MSG_ACESSO_INDISPONIVEL };
  }
  return { ok: false, status: 403, code: CONTA_SEM_ACESSO_CODE, error: mensagemSemAcesso(chamador.role) };
}

/**
 * O corpo da recusa. As funções de número respondem `ok`, as da Meta `success`, a
 * do Instagram `message`, e a tela lê `error` nas outras: vão todos os campos.
 */
export function corpoDaRecusa(d: { error: string; code: string; ok?: boolean; status?: number }): Record<string, unknown> {
  return { ok: false, success: false, error: d.error, message: d.error, code: d.code };
}

/**
 * Três respostas, porque "não sei" não é "sem acesso": com o banco fora do ar, o
 * trabalhador não envia, mas também não pausa nem cancela nada de quem paga.
 */
export type EstadoDaConta = 'liberada' | 'sem_acesso' | 'desconhecido';

export interface MemoDeAcesso {
  estado(tenantId: string): Promise<EstadoDaConta>;
  /** true só com certeza: "não sei" não envia. */
  liberada(tenantId: string): Promise<boolean>;
}

/** Para os trabalhadores: uma pergunta por Conta em cada rodada. */
export function criarMemoDeAcesso(
  admin: ClienteComRpc,
  aoFalhar?: (tenantId: string, erro: string) => void,
): MemoDeAcesso {
  const respostas = new Map<string, Promise<EstadoDaConta>>();
  const estado = (tenantId: string): Promise<EstadoDaConta> => {
    let resposta = respostas.get(tenantId);
    if (!resposta) {
      resposta = contaLiberada(admin, tenantId).then(
        (ok): EstadoDaConta => (ok ? 'liberada' : 'sem_acesso'),
        (e): EstadoDaConta => {
          aoFalhar?.(tenantId, e instanceof Error ? e.message : String(e));
          return 'desconhecido';
        },
      );
      respostas.set(tenantId, resposta);
    }
    return resposta;
  };
  return {
    estado,
    liberada: async (tenantId) => (await estado(tenantId)) === 'liberada',
  };
}

/** O motivo gravado em fila e log quando um trabalhador deixa de enviar. */
export const MOTIVO_CONTA_SEM_ACESSO = 'Conta sem acesso';
