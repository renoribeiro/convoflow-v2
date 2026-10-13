// =============================================================================
// billing-charges.ts — toda cobrança paga vira uma linha (nota fiscal, parte 1)
// =============================================================================
// Recebe o I/O por parâmetro (Stripe e banco) para o Vitest simular eventos
// repetidos e fora de ordem sem Deno nem rede — mesma convenção de
// stripe-webhook-sync.ts.
//
// QUAIS EVENTOS
//   invoice.paid / invoice.payment_succeeded → grava a cobrança (uma linha por
//       fatura: `billing_charges.stripe_invoice_id` é único). Os dois chegam
//       para a mesma fatura; o segundo não duplica.
//   charge.refunded → grava o reembolso na linha da fatura daquela cobrança.
//       Nada de nota fiscal ainda: isso é a parte 2.
//
// COMO OS DEMAIS HANDLERS: o evento só diz O QUE reler. A fatura e a cobrança
// são relidas no Stripe com a versão de API do nosso cliente
// (2024-12-18.acacia), então o formato não depende da versão do endpoint e um
// evento velho reentregue grava o estado de AGORA.
//
// NOTA FISCAL: a linha nasce `aguardando_emissao` quando algo foi pago e
// `sem_nota` quando a fatura é de R$ 0 (início do teste grátis, cupom de 100%).
// Quem emite e muda esse estado é a parte 2.
//
// FALHAS: releitura no Stripe ou gravação no banco que falham LANÇAM. O
// webhook responde 500 e o Stripe reenvia; a gravação é idempotente.
// =============================================================================

export type ChargeEventPointer =
  | { kind: 'invoice'; invoiceId: string }
  | { kind: 'refund'; chargeId: string }
  | { kind: 'none' };

/** Os eventos que gravam fatura paga. */
export const PAID_INVOICE_EVENTS = ['invoice.paid', 'invoice.payment_succeeded'] as const;
export const REFUND_EVENT = 'charge.refunded';

export type NotaStatus = 'aguardando_emissao' | 'sem_nota';

/** Uma linha de `billing_charges` como o webhook a grava. */
export interface ChargeRow {
  stripe_invoice_id: string;
  tenant_id: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_charge_id: string | null;
  stripe_payment_intent_id: string | null;
  amount_paid_cents: number;
  currency: string;
  paid_at: string;
  period_start: string | null;
  period_end: string | null;
  hosted_invoice_url: string | null;
  invoice_pdf_url: string | null;
  nota_status: NotaStatus;
}

export interface RefundPatch {
  amount_refunded_cents: number;
  refunded_at: string | null;
}

export interface ChargeDeps {
  /** Relê a fatura no Stripe. Deve LANÇAR se não conseguir. */
  retrieveInvoice: (invoiceId: string) => Promise<unknown>;
  /** Relê a cobrança no Stripe, com `refunds` expandido. Deve LANÇAR se não conseguir. */
  retrieveCharge: (chargeId: string) => Promise<unknown>;
  /** A Conta (kind='account') que tem esta assinatura. */
  loadAccountBySubscriptionId: (subscriptionId: string) => Promise<string | null>;
  /** A Conta, se o id é de uma Conta (kind='account'). */
  loadAccountById: (tenantId: string) => Promise<string | null>;
  /** A Conta (kind='account') que tem este cliente do Stripe. */
  loadAccountByCustomerId: (customerId: string) => Promise<string | null>;
  /** Insere se a fatura ainda não tem linha. Deve LANÇAR se o banco recusar. */
  insertChargeIfNew: (row: ChargeRow) => Promise<'inserted' | 'exists'>;
  /** A fatura da linha que tem esta cobrança (ou este pagamento), se houver. */
  findInvoiceIdByCharge: (chargeId: string, paymentIntentId: string | null) => Promise<string | null>;
  /** Grava o reembolso na linha da fatura. Devolve quantas linhas mudaram. */
  updateRefund: (invoiceId: string, patch: RefundPatch) => Promise<number>;
}

export type ChargeOutcome =
  | { result: 'not_charge_event' }
  | { result: 'not_paid'; invoiceId: string; status: string }
  | { result: 'recorded'; invoiceId: string; tenantId: string | null; row: ChargeRow }
  | { result: 'already_recorded'; invoiceId: string }
  | { result: 'refund_recorded'; invoiceId: string; chargeId: string; patch: RefundPatch }
  | { result: 'refund_without_invoice'; chargeId: string };

// -----------------------------------------------------------------------------
// Leitura dos objetos do Stripe
// -----------------------------------------------------------------------------

type Obj = Record<string, unknown>;

/** O id de um campo que pode vir como texto ou como objeto expandido. */
function idDe(v: unknown): string | null {
  if (typeof v === 'string' && v) return v;
  if (v && typeof v === 'object' && typeof (v as Obj).id === 'string') return (v as Obj).id as string;
  return null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const unixParaIso = (v: unknown): string | null => {
  const n = num(v);
  return n === null ? null : new Date(n * 1000).toISOString();
};
const textoOuNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** O que o evento aponta (só o ponteiro: o estado vem da releitura). */
export function chargePointerFromEvent(event: { type?: unknown; data?: { object?: unknown } | null }): ChargeEventPointer {
  const type = typeof event?.type === 'string' ? event.type : '';
  const obj = (event?.data?.object ?? {}) as Obj;
  if ((PAID_INVOICE_EVENTS as readonly string[]).includes(type)) {
    const id = idDe(obj.id);
    return id ? { kind: 'invoice', invoiceId: id } : { kind: 'none' };
  }
  if (type === REFUND_EVENT) {
    const id = idDe(obj.id);
    return id ? { kind: 'refund', chargeId: id } : { kind: 'none' };
  }
  return { kind: 'none' };
}

/** A assinatura da fatura (acacia: invoice.subscription; basil em diante: parent). */
export function invoiceSubscriptionId(invoice: Obj): string | null {
  const parent = (invoice.parent ?? {}) as { subscription_details?: { subscription?: unknown } };
  return idDe(invoice.subscription) ?? idDe(parent.subscription_details?.subscription);
}

/** A Conta escrita pelo create-checkout-session no metadata da assinatura. */
export function invoiceMetadataTenant(invoice: Obj): string | null {
  const det = (invoice.subscription_details ?? {}) as { metadata?: Obj | null };
  const parent = (invoice.parent ?? {}) as { subscription_details?: { metadata?: Obj | null } };
  const meta = det.metadata ?? parent.subscription_details?.metadata ?? {};
  const t = (meta as Obj).tenant_id;
  return typeof t === 'string' && t ? t : null;
}

/**
 * O período cobrado: as linhas de assinatura da fatura (o `period_*` da
 * própria fatura é o período ANTERIOR numa fatura de assinatura). Sem linhas,
 * cai no da fatura.
 */
export function invoicePeriod(invoice: Obj): { start: string | null; end: string | null } {
  const linhas = ((invoice.lines as { data?: unknown } | undefined)?.data ?? []) as Array<Obj>;
  let ini: number | null = null;
  let fim: number | null = null;
  for (const l of Array.isArray(linhas) ? linhas : []) {
    const p = (l?.period ?? {}) as Obj;
    const s = num(p.start);
    const e = num(p.end);
    if (s !== null) ini = ini === null ? s : Math.min(ini, s);
    if (e !== null) fim = fim === null ? e : Math.max(fim, e);
  }
  if (ini === null && fim === null) {
    return { start: unixParaIso(invoice.period_start), end: unixParaIso(invoice.period_end) };
  }
  return { start: ini === null ? null : new Date(ini * 1000).toISOString(), end: fim === null ? null : new Date(fim * 1000).toISOString() };
}

/**
 * A linha a gravar a partir da fatura RELIDA. Null quando ela não está paga
 * (um invoice.paid velho de uma fatura que hoje está anulada, por exemplo).
 */
export function chargeRowFromInvoice(invoice: Obj, tenantId: string | null): ChargeRow | null {
  const id = idDe(invoice.id);
  if (!id || invoice.status !== 'paid') return null;
  const pago = Math.max(0, Math.round(num(invoice.amount_paid) ?? 0));
  const transicoes = (invoice.status_transitions ?? {}) as Obj;
  const pagoEm = unixParaIso(transicoes.paid_at) ?? unixParaIso(invoice.created) ?? new Date(0).toISOString();
  const periodo = invoicePeriod(invoice);
  return {
    stripe_invoice_id: id,
    tenant_id: tenantId,
    stripe_customer_id: idDe(invoice.customer),
    stripe_subscription_id: invoiceSubscriptionId(invoice),
    stripe_charge_id: idDe(invoice.charge),
    stripe_payment_intent_id: idDe(invoice.payment_intent),
    amount_paid_cents: pago,
    currency: (textoOuNull(invoice.currency) ?? 'brl').toLowerCase(),
    paid_at: pagoEm,
    period_start: periodo.start,
    period_end: periodo.end,
    hosted_invoice_url: textoOuNull(invoice.hosted_invoice_url),
    invoice_pdf_url: textoOuNull(invoice.invoice_pdf),
    nota_status: pago > 0 ? 'aguardando_emissao' : 'sem_nota',
  };
}

/**
 * O reembolso a partir da cobrança RELIDA: o total devolvido (o Stripe soma
 * os reembolsos parciais) e a data do último reembolso que deu certo.
 */
export function refundPatchFromCharge(charge: Obj): RefundPatch {
  const total = Math.max(0, Math.round(num(charge.amount_refunded) ?? 0));
  if (total === 0) return { amount_refunded_cents: 0, refunded_at: null };
  const lista = ((charge.refunds as { data?: unknown } | undefined)?.data ?? []) as Array<Obj>;
  let ultimo: number | null = null;
  for (const r of Array.isArray(lista) ? lista : []) {
    if (r?.status && r.status !== 'succeeded') continue;
    const c = num(r?.created);
    if (c !== null) ultimo = ultimo === null ? c : Math.max(ultimo, c);
  }
  return { amount_refunded_cents: total, refunded_at: unixParaIso(ultimo ?? charge.created) };
}

// -----------------------------------------------------------------------------
// O fluxo
// -----------------------------------------------------------------------------

/**
 * Qual Conta pagou. Ordem (a mesma ideia do stripe-webhook-sync):
 *   1. a Conta que já tem ESTA assinatura;
 *   2. a Conta do metadata da assinatura (o checkout grava);
 *   3. a Conta do cliente do Stripe (um por Conta).
 * Sem nenhuma, a linha é gravada SEM Conta: cobrança paga nunca se perde, e o
 * superadmin a vê como "Conta não identificada".
 */
async function acharConta(deps: ChargeDeps, invoice: Obj): Promise<string | null> {
  const sub = invoiceSubscriptionId(invoice);
  if (sub) {
    const porAssinatura = await deps.loadAccountBySubscriptionId(sub);
    if (porAssinatura) return porAssinatura;
  }
  const meta = invoiceMetadataTenant(invoice);
  if (meta) {
    const porMetadata = await deps.loadAccountById(meta);
    if (porMetadata) return porMetadata;
  }
  const cliente = idDe(invoice.customer);
  if (cliente) {
    const porCliente = await deps.loadAccountByCustomerId(cliente);
    if (porCliente) return porCliente;
  }
  return null;
}

async function gravarFatura(deps: ChargeDeps, invoiceId: string): Promise<ChargeOutcome> {
  const invoice = (await deps.retrieveInvoice(invoiceId)) as Obj;
  const status = typeof invoice?.status === 'string' ? invoice.status : 'desconhecido';
  if (status !== 'paid') return { result: 'not_paid', invoiceId, status };
  const tenantId = await acharConta(deps, invoice);
  const row = chargeRowFromInvoice(invoice, tenantId);
  if (!row) return { result: 'not_paid', invoiceId, status };
  const r = await deps.insertChargeIfNew(row);
  return r === 'inserted' ? { result: 'recorded', invoiceId, tenantId, row } : { result: 'already_recorded', invoiceId };
}

export async function recordChargeFromEvent(
  event: { type?: unknown; data?: { object?: unknown } | null },
  deps: ChargeDeps,
): Promise<ChargeOutcome> {
  const ponteiro = chargePointerFromEvent(event);

  if (ponteiro.kind === 'invoice') return gravarFatura(deps, ponteiro.invoiceId);

  if (ponteiro.kind === 'refund') {
    const charge = (await deps.retrieveCharge(ponteiro.chargeId)) as Obj;
    let invoiceId = idDe(charge?.invoice);
    if (!invoiceId) invoiceId = await deps.findInvoiceIdByCharge(ponteiro.chargeId, idDe(charge?.payment_intent));
    if (!invoiceId) return { result: 'refund_without_invoice', chargeId: ponteiro.chargeId };

    const patch = refundPatchFromCharge(charge);
    let mudou = await deps.updateRefund(invoiceId, patch);
    if (mudou === 0) {
      // O reembolso chegou antes da linha (evento da fatura perdido ou ainda na
      // fila): grava a fatura agora e tenta de novo.
      await gravarFatura(deps, invoiceId);
      mudou = await deps.updateRefund(invoiceId, patch);
      if (mudou === 0) return { result: 'refund_without_invoice', chargeId: ponteiro.chargeId };
    }
    return { result: 'refund_recorded', invoiceId, chargeId: ponteiro.chargeId, patch };
  }

  return { result: 'not_charge_event' };
}
