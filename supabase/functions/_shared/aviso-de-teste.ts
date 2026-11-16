// =============================================================================
// aviso-de-teste.ts — o botão "Enviar aviso de teste" (edge function webhook-teste)
// =============================================================================
// Manda um "Lead novo" com dados claramente falsos para o endereço do aviso,
// grava o resultado no histórico (webhook_deliveries, teste = true, já como
// entregue ou falhou, nunca na fila) e devolve à tela o código que o outro
// sistema respondeu.
//
// Quem pode: quem administra a Loja do aviso (store.admin), na própria Loja ou,
// sendo Gerente, numa Loja filha da Conta dele (a mesma regra das policies de
// public.webhooks, 20261116000001); superadmin também. Outra Conta recebe a
// mesma resposta de "não existe".
//
// Regra pura com as dependências injetadas: o Vitest testa sem Deno.
// =============================================================================

import { can, normalizeRole } from './capabilities.ts';
import { decideInstanceAccess, type InstanceAccessTenant } from './instance-access.ts';
import { cabecalhosDoAviso, type ResultadoDaEntrega } from './webhook-entrega.ts';

/** No máximo tantos testes por aviso a cada minuto. */
export const TESTES_POR_MINUTO = 5;

/** Os dados falsos do teste (telefone no padrão falso do repositório). */
export const LEAD_DE_TESTE = {
  lead_id: '00000000-0000-4000-8000-000000000000',
  nome: 'Contato de teste do ConvoFlow',
  telefone: '5585999990000',
  mensagem: 'Mensagem de teste do ConvoFlow. Pode apagar esta linha.',
} as const;

export const EVENTO_LEAD_NOVO = 'lead.novo';

export interface ChamadorDoTeste {
  tenant_id: string | null;
  role: string | null;
  status?: string | null;
  capabilities?: unknown;
}

export interface AvisoDoTeste {
  id: string;
  tenant_id: string;
  url: string;
  secret: string | null;
}

export interface DepsDoTeste {
  chamador: ChamadorDoTeste | null;
  aviso: AvisoDoTeste | null;
  lojaDoAviso: (InstanceAccessTenant & { name: string }) | null;
  /** Quantos testes deste aviso no último minuto. */
  testesNoUltimoMinuto: () => Promise<number>;
  /** O corpo do Lead novo, montado pelo banco (public.lead_novo_corpo). */
  montarCorpo: (loja: string) => Promise<Record<string, unknown>>;
  entregar: (url: string, corpo: string, cabecalhos: Record<string, string>) => Promise<ResultadoDaEntrega>;
  gravarHistorico: (linha: {
    id: string;
    tenant_id: string;
    webhook_id: string;
    payload: Record<string, unknown>;
    resultado: ResultadoDaEntrega;
  }) => Promise<{ error: string | null }>;
  novoId: () => string;
}

export interface RespostaDoTeste {
  status: number;
  body: Record<string, unknown>;
}

const NAO_EXISTE = 'Aviso não encontrado. Recarregue a página.';

/** Decide, manda e grava. Nunca lança. */
export async function enviarAvisoDeTeste(deps: DepsDoTeste): Promise<RespostaDoTeste> {
  const { chamador, aviso, lojaDoAviso } = deps;
  if (!chamador) return { status: 403, body: { ok: false, error: 'Perfil não encontrado.' } };
  if (!aviso) return { status: 404, body: { ok: false, error: NAO_EXISTE } };

  const superadmin = normalizeRole(chamador.role) === 'superadmin';
  // O superadmin pode não ter Conta no perfil: decideInstanceAccess recusaria.
  const acesso = superadmin && chamador.status === 'active'
    ? { allowed: true as const }
    : decideInstanceAccess(
        { tenant_id: chamador.tenant_id, role: chamador.role, status: chamador.status ?? null },
        { tenant_id: aviso.tenant_id },
        lojaDoAviso,
      );
  if (!acesso.allowed) {
    if (acesso.reason === 'inactive') return { status: 403, body: { ok: false, error: 'Seu acesso está suspenso.' } };
    return { status: 404, body: { ok: false, error: NAO_EXISTE } };
  }
  if (!superadmin && !can(chamador.role, 'store.admin', chamador.capabilities as Record<string, unknown> | null)) {
    return { status: 403, body: { ok: false, error: 'Só o Gestor e o Gerente mexem nos avisos para sistemas.' } };
  }

  if ((await deps.testesNoUltimoMinuto()) >= TESTES_POR_MINUTO) {
    return {
      status: 429,
      body: { ok: false, error: `Você já mandou ${TESTES_POR_MINUTO} testes deste aviso no último minuto. Espere um pouco e tente de novo.` },
    };
  }

  let corpo: Record<string, unknown>;
  try {
    corpo = await deps.montarCorpo(lojaDoAviso?.name ?? '');
  } catch {
    return { status: 503, body: { ok: false, error: 'Não foi possível montar o aviso de teste agora. Tente de novo em instantes.' } };
  }

  const id = deps.novoId();
  const texto = JSON.stringify(corpo);
  const cabecalhos = await cabecalhosDoAviso({
    evento: EVENTO_LEAD_NOVO,
    entregaId: id,
    corpo: texto,
    segredo: aviso.secret,
    teste: true,
  });
  const resultado = await deps.entregar(aviso.url, texto, cabecalhos);
  const gravou = await deps.gravarHistorico({
    id,
    tenant_id: aviso.tenant_id,
    webhook_id: aviso.id,
    payload: corpo,
    resultado,
  });

  return {
    status: 200,
    body: {
      ok: true,
      aceito: resultado.aceito,
      status: resultado.status,
      erro: resultado.erro,
      no_historico: !gravou.error,
    },
  };
}
