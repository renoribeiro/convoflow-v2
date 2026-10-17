// =============================================================================
// billing/cobrancas — a lista de cobranças (nota fiscal, parte 1)
// =============================================================================
// Cada fatura paga do Stripe vira uma linha de `public.billing_charges`,
// gravada SÓ pelo stripe-webhook (supabase/functions/_shared/billing-charges.ts).
// O navegador só lê: o Gerente as da própria Conta (Configurações › Assinatura
// › Cobranças), o superadmin todas (Administração › Faturamento › Cobranças).
//
// A COLUNA DA NOTA FISCAL aparece para o superadmin sempre e para o resto só
// quando o ambiente ativo é o de produção (notaFiscalVisivel): em teste, os
// clientes não veem nada.
// =============================================================================

export type NotaStatus =
  | 'aguardando_emissao'
  | 'emitindo'
  | 'emitida'
  | 'erro'
  | 'cancelada'
  | 'cancelar_manual'
  | 'aguardando_prefeitura'
  | 'certificado_vencido'
  | 'sem_nota';

export const NOTA_STATUS_LABEL: Record<NotaStatus, string> = {
  aguardando_emissao: 'Aguardando emissão',
  emitindo: 'Emitindo',
  emitida: 'Emitida',
  erro: 'Erro na emissão',
  cancelada: 'Cancelada',
  cancelar_manual: 'Cancelar à mão',
  aguardando_prefeitura: 'Aguardando a Prefeitura',
  certificado_vencido: 'Certificado vencido',
  sem_nota: 'Sem nota',
};

export type AmbienteNfse = 'restrita' | 'producao';

/** Liga a coluna "Nota fiscal" nas duas listas. */
export function notaFiscalVisivel({
  ehSuperadmin,
  ambienteAtivo,
}: {
  ehSuperadmin: boolean;
  ambienteAtivo: string | null | undefined;
}): boolean {
  return ehSuperadmin || ambienteAtivo === 'producao';
}

export interface NotaDaCobranca {
  id: string;
  ambiente: AmbienteNfse;
  status: string;
  numero_nfse: string | null;
  chave_acesso: string | null;
  emitida_em: string | null;
  cancelada_em: string | null;
  ultimo_erro_codigo: string | null;
  ultimo_erro_mensagem: string | null;
  tentativas: number;
  pdf_path: string | null;
  xml_path: string | null;
}

/**
 * A nota que a lista mostra. Superadmin: a de produção, senão a de teste.
 * Os demais: só a de produção (o RLS já filtra, aqui é cinto e suspensório).
 */
export function escolherNota(notas: NotaDaCobranca[] | null | undefined, ehSuperadmin: boolean): NotaDaCobranca | null {
  const lista = notas ?? [];
  const producao = lista.find((n) => n.ambiente === 'producao');
  if (producao) return producao;
  return ehSuperadmin ? (lista.find((n) => n.ambiente === 'restrita') ?? null) : null;
}

/** Estados em que "Emitir de novo" faz sentido (superadmin). */
export const STATUS_REEMITIVEIS: readonly string[] = ['erro', 'aguardando_prefeitura', 'certificado_vencido', 'aguardando_emissao'];

/** As colunas que as duas telas leem. */
export const COBRANCA_COLUMNS =
  'id, stripe_invoice_id, tenant_id, amount_paid_cents, currency, paid_at, period_start, period_end, hosted_invoice_url, amount_refunded_cents, refunded_at, nota_status, notas:notas_fiscais(id, ambiente, status, numero_nfse, chave_acesso, emitida_em, cancelada_em, ultimo_erro_codigo, ultimo_erro_mensagem, tentativas, pdf_path, xml_path)';

export interface Cobranca {
  id: string;
  stripe_invoice_id: string;
  tenant_id: string | null;
  amount_paid_cents: number;
  currency: string;
  paid_at: string;
  period_start: string | null;
  period_end: string | null;
  hosted_invoice_url: string | null;
  amount_refunded_cents: number;
  refunded_at: string | null;
  nota_status: string;
  notas?: NotaDaCobranca[] | null;
  /** Só na lista do superadmin (embed de tenants). */
  conta?: { name: string | null } | null;
}

export type SituacaoCobranca = 'paga' | 'teste' | 'reembolsada' | 'reembolso_parcial';

/** Situação da cobrança para a tela, a partir do valor pago e do devolvido. */
export function situacaoDaCobranca(c: Pick<Cobranca, 'amount_paid_cents' | 'amount_refunded_cents'>): SituacaoCobranca {
  const pago = Number(c.amount_paid_cents) || 0;
  const devolvido = Number(c.amount_refunded_cents) || 0;
  if (devolvido > 0 && devolvido >= pago) return 'reembolsada';
  if (devolvido > 0) return 'reembolso_parcial';
  if (pago === 0) return 'teste';
  return 'paga';
}

export const SITUACAO_LABEL: Record<SituacaoCobranca, string> = {
  paga: 'Paga',
  teste: 'R$ 0 (teste grátis ou cupom)',
  reembolsada: 'Reembolsada',
  reembolso_parcial: 'Reembolso parcial',
};

/** Só links do Stripe viram link na tela (o valor vem do banco, mas não arriscamos). */
export function linkDoStripe(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname === 'stripe.com' || u.hostname.endsWith('.stripe.com')) ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Soma do que foi pago e do que foi devolvido numa lista (em centavos). */
export function totaisDasCobrancas(lista: Array<Pick<Cobranca, 'amount_paid_cents' | 'amount_refunded_cents'>>): {
  pago: number;
  devolvido: number;
} {
  return lista.reduce(
    (t, c) => ({ pago: t.pago + (Number(c.amount_paid_cents) || 0), devolvido: t.devolvido + (Number(c.amount_refunded_cents) || 0) }),
    { pago: 0, devolvido: 0 },
  );
}

export function rotuloDaNota(status: string | null | undefined): string {
  return NOTA_STATUS_LABEL[(status ?? '') as NotaStatus] ?? '—';
}
