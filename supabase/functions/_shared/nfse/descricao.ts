// =============================================================================
// nfse/descricao.ts — o texto do serviço (xDescServ) e o resumo da fatura
// =============================================================================
// Texto decidido pelo dono, sem hífen nem travessão:
//   "Licença de uso do software ConvoFlow, assinatura mensal do Plano Gerente
//    com 5 Lojas incluídas. Período de DD/MM/AAAA a DD/MM/AAAA. Lojas extras: N.
//    Atendentes extras: N. API e integrações. Inclui ajuste proporcional por
//    mudança no plano."
// As quatro últimas frases só entram quando a fatura tem o item.
// Sem Deno: o Vitest importa.
// =============================================================================

export interface ItensDaFatura {
  lojas_extras: number;
  atendentes_extras: number;
  ajuste_proporcional: boolean;
  /** A fatura cobra o complemento "API e integrações". Ausente = não (resumos antigos). */
  api?: boolean;
}

export const ITENS_VAZIOS: ItensDaFatura = { lojas_extras: 0, atendentes_extras: 0, ajuste_proporcional: false };

const FUSO_MS = 3 * 60 * 60 * 1000;
const dois = (n: number) => String(n).padStart(2, '0');

/** DD/MM/AAAA em Fortaleza. */
export function dataBr(iso: string | Date): string {
  const d = new Date(new Date(iso).getTime() - FUSO_MS);
  return `${dois(d.getUTCDate())}/${dois(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

/**
 * O fim do período no Stripe é o início do próximo (exclusivo): o último dia
 * coberto é um segundo antes.
 */
export function ultimoDiaDoPeriodo(fimIso: string): string {
  return dataBr(new Date(new Date(fimIso).getTime() - 1000));
}

export function descricaoDoServico(opts: {
  inicio: string | null;
  fim: string | null;
  itens: ItensDaFatura | null;
}): string {
  const frases = ['Licença de uso do software ConvoFlow, assinatura mensal do Plano Gerente com 5 Lojas incluídas.'];
  if (opts.inicio && opts.fim) frases.push(`Período de ${dataBr(opts.inicio)} a ${ultimoDiaDoPeriodo(opts.fim)}.`);
  const itens = opts.itens ?? ITENS_VAZIOS;
  if (itens.lojas_extras > 0) frases.push(`Lojas extras: ${itens.lojas_extras}.`);
  if (itens.atendentes_extras > 0) frases.push(`Atendentes extras: ${itens.atendentes_extras}.`);
  if (itens.api) frases.push('API e integrações.');
  if (itens.ajuste_proporcional) frases.push('Inclui ajuste proporcional por mudança no plano.');
  return frases.join(' ');
}

type Obj = Record<string, unknown>;

function idDe(v: unknown): string | null {
  if (typeof v === 'string' && v) return v;
  if (v && typeof v === 'object' && typeof (v as Obj).id === 'string') return (v as Obj).id as string;
  return null;
}

/** As linhas da fatura (lines.data) → Lojas e atendentes extras, API e se houve ajuste proporcional. */
export function resumoDaFatura(
  invoice: unknown,
  ids: { precoLojaExtra?: string | null; produtoAtendente?: string | null; produtoApi?: string | null },
): ItensDaFatura {
  const linhas = ((invoice as Obj)?.lines as Obj | undefined)?.data;
  const r: ItensDaFatura = { ...ITENS_VAZIOS };
  if (!Array.isArray(linhas)) return r;
  for (const bruta of linhas) {
    const l = bruta as Obj;
    const preco = (l.price as Obj | undefined) ?? undefined;
    const detalhesPreco = ((l.pricing as Obj | undefined)?.price_details as Obj | undefined) ?? undefined;
    const precoId = idDe(preco) ?? (typeof detalhesPreco?.price === 'string' ? (detalhesPreco.price as string) : null);
    const produto = idDe(preco?.product) ?? (typeof detalhesPreco?.product === 'string' ? (detalhesPreco.product as string) : null);
    const proporcional =
      l.proration === true ||
      ((((l.parent as Obj | undefined)?.subscription_item_details as Obj | undefined)?.proration) === true);
    if (proporcional) {
      r.ajuste_proporcional = true;
      continue;
    }
    const qtd = Number(l.quantity) || 0;
    if (ids.precoLojaExtra && precoId === ids.precoLojaExtra) r.lojas_extras += qtd;
    else if (ids.produtoAtendente && produto === ids.produtoAtendente) r.atendentes_extras += qtd;
    else if (ids.produtoApi && produto === ids.produtoApi && qtd > 0) r.api = true;
  }
  return r;
}
