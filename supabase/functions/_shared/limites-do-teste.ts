// =============================================================================
// limites-do-teste — o que uma Conta em teste grátis pode usar
// =============================================================================
// Sessão 2 do cadastro pelo site (migração 20261109000001). A regra e a frase
// moram no banco, em public.teste_limite: aqui só se pergunta e se repassa.
// Os números (Lojas, números, QR Code, mensagens do dia, contatos por campanha)
// o superadmin muda na tela "Limites de uso", sem código.
//
// DOIS JEITOS DE USAR, iguais aos da trava de acesso (conta-acesso.ts)
//   Pessoa logada   conferirLimiteDoTeste(admin, perfil, loja, recurso). O
//                   superadmin nunca é limitado.
//   Trabalhador     criarCotaDeEnvios(admin). Pergunta uma vez por Conta na
//                   rodada e desconta cada envio, para duas Lojas da mesma Conta
//                   não passarem juntas do limite.
//
// SE O BANCO NÃO RESPONDER
//   Pessoa: "tente de novo" (503). Trabalhador: "desconhecido", não envia nesta
//   rodada e não cancela nada.
// =============================================================================

import { normalizeRole } from './capabilities.ts';
import type { ClienteComRpc } from './conta-acesso.ts';

export type RecursoDoTeste = 'lojas' | 'numeros' | 'numeros_qr' | 'mensagens' | 'contatos_campanha';

/** Código na resposta: a tela e os testes reconhecem a recusa por ele. */
export const LIMITE_DO_TESTE_CODE = 'limite_do_teste';

export const MSG_LIMITE_INDISPONIVEL =
  'Não foi possível conferir os limites do teste grátis agora. Tente de novo em alguns minutos.';

/** O motivo gravado em fila e log quando um trabalhador deixa de enviar. */
export const MOTIVO_LIMITE_DO_DIA = 'Limite diário de mensagens do teste grátis';

export interface RespostaDoLimite {
  ok: boolean;
  em_teste: boolean;
  conta?: string | null;
  limite?: number;
  usado?: number;
  mensagem?: string | null;
}

export type DecisaoDeLimite =
  | { ok: true }
  | { ok: false; status: 429 | 503; code: string; error: string };

/** Pergunta ao banco. Lança se ele não responder: quem chama decide. */
export async function perguntarLimite(
  admin: ClienteComRpc,
  tenantId: string,
  recurso: RecursoDoTeste,
  quantidade = 1,
): Promise<RespostaDoLimite> {
  const { data, error } = await admin.rpc('teste_limite', {
    p_tenant_id: tenantId,
    p_recurso: recurso,
    p_quantidade: quantidade,
  });
  if (error) throw new Error(error.message ?? 'teste_limite sem resposta');
  const r = (Array.isArray(data) ? data[0] : data) as RespostaDoLimite | null;
  if (!r || typeof r.ok !== 'boolean') throw new Error('teste_limite com resposta estranha');
  return r;
}

/** A pessoa logada pode seguir? Superadmin decide pela Conta e nunca é limitado. */
export async function conferirLimiteDoTeste(
  admin: ClienteComRpc,
  chamador: { role?: string | null } | null | undefined,
  tenantId: string | null | undefined,
  recurso: RecursoDoTeste,
  quantidade = 1,
): Promise<DecisaoDeLimite> {
  if (normalizeRole(chamador?.role) === 'superadmin') return { ok: true };
  if (!tenantId) return { ok: true };
  try {
    const r = await perguntarLimite(admin, tenantId, recurso, quantidade);
    if (r.ok) return { ok: true };
    return {
      ok: false,
      status: 429,
      code: LIMITE_DO_TESTE_CODE,
      error: r.mensagem || 'No teste grátis, esta ação passou do limite.',
    };
  } catch {
    return { ok: false, status: 503, code: 'limite_indisponivel', error: MSG_LIMITE_INDISPONIVEL };
  }
}

export type PodeEnviar = 'sim' | 'nao' | 'desconhecido';

export interface CotaDeEnvios {
  /** Ainda cabe um envio desta Loja hoje? Não desconta. */
  podeEnviar(tenantId: string): Promise<PodeEnviar>;
  /** Desconta um envio feito. Chame depois que o provedor aceitou. */
  registrarEnvio(tenantId: string): Promise<void>;
}

interface SaldoDaConta {
  emTeste: boolean;
  restante: number;
}

/** Para os trabalhadores: o saldo do dia por Conta, descontado a cada envio. */
export function criarCotaDeEnvios(
  admin: ClienteComRpc,
  aoFalhar?: (tenantId: string, erro: string) => void,
): CotaDeEnvios {
  const contaDaLoja = new Map<string, Promise<string | null>>();
  const saldos = new Map<string, SaldoDaConta>();

  const conta = (tenantId: string): Promise<string | null> => {
    let c = contaDaLoja.get(tenantId);
    if (!c) {
      c = perguntarLimite(admin, tenantId, 'mensagens', 1).then(
        (r) => {
          const id = r.conta ?? tenantId;
          if (!saldos.has(id)) {
            saldos.set(id, {
              emTeste: r.em_teste,
              restante: r.em_teste ? Math.max(0, (r.limite ?? 0) - (r.usado ?? 0)) : Number.POSITIVE_INFINITY,
            });
          }
          return id;
        },
        (e) => {
          aoFalhar?.(tenantId, e instanceof Error ? e.message : String(e));
          return null;
        },
      );
      contaDaLoja.set(tenantId, c);
    }
    return c;
  };

  return {
    async podeEnviar(tenantId) {
      const id = await conta(tenantId);
      if (!id) return 'desconhecido';
      const s = saldos.get(id);
      if (!s) return 'desconhecido';
      return s.restante > 0 ? 'sim' : 'nao';
    },
    async registrarEnvio(tenantId) {
      const id = await conta(tenantId);
      const s = id ? saldos.get(id) : undefined;
      if (s && s.emTeste) s.restante = Math.max(0, s.restante - 1);
    },
  };
}
