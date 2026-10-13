// =============================================================================
// billing/cobrancas — a lista de cobranças (nota fiscal, parte 1)
// =============================================================================
// Cada fatura paga do Stripe vira uma linha de `public.billing_charges`,
// gravada SÓ pelo stripe-webhook (supabase/functions/_shared/billing-charges.ts).
// O navegador só lê: o Gerente as da própria Conta (Configurações › Assinatura
// › Cobranças), o superadmin todas (Administração › Faturamento › Cobranças).
//
// A COLUNA DA NOTA FISCAL fica escondida atrás de NOTA_FISCAL_VISIVEL, uma
// chave só para as duas telas. Desligada até a parte 2 (emissão) existir: sem
// ela, todo cliente veria "aguardando emissão" para sempre.
// =============================================================================

/** Liga a coluna "Nota fiscal" nas duas listas. Só depois da parte 2 (emissão). */
export const NOTA_FISCAL_VISIVEL = false;

export type NotaStatus = 'aguardando_emissao' | 'sem_nota';

export const NOTA_STATUS_LABEL: Record<NotaStatus, string> = {
  aguardando_emissao: 'Aguardando emissão',
  sem_nota: 'Sem nota (R$ 0)',
};

/** As colunas que as duas telas leem. */
export const COBRANCA_COLUMNS =
  'id, stripe_invoice_id, tenant_id, amount_paid_cents, currency, paid_at, period_start, period_end, hosted_invoice_url, amount_refunded_cents, refunded_at, nota_status';

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
