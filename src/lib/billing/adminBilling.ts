// =============================================================================
// Administração › Faturamento — o que a aba mostra, sem React
// =============================================================================
// Duas fontes, cada uma no que ela sabe de verdade (item 10, 2026-09-29):
//
//   LINHAS DAS CONTAS (tenants, mantidas pelo stripe-webhook): quem paga, quem
//   está no teste e até quando, quem tem pagamento pendente, quem agendou o
//   cancelamento. É o mesmo campo que libera o sistema (tenant_access_state),
//   então a aba e a trava não discordam.
//
//   STRIPE AO VIVO (stripe-admin › billing_overview): receita mensal com lojas
//   extras e cupons, próximas cobranças, receita recebida por mês e pagamentos
//   que falharam. A linha da Conta não tem preço, desconto nem data da próxima
//   cobrança.
//
// A Conta cuja assinatura NÃO existe na conta do Stripe da secret (hoje: a
// assinatura feita na conta antiga) vem em `overview.legacy`. Ela sai das
// listas das Contas e aparece separada, com o rótulo de conta antiga — nunca
// somada a número nenhum.
//
// Os tipos do Stripe abaixo ESPELHAM supabase/functions/_shared/stripe-admin-core.ts.
// Mudou lá, muda aqui.
// =============================================================================

// ---------------------------------------------------------------------------
// Espelho do servidor
// ---------------------------------------------------------------------------

export type StripeMode = 'live' | 'test' | 'unknown';

export interface PriceCheck {
  env: string;
  configured: boolean;
  found: boolean;
  id: string | null;
  active: boolean | null;
  unitAmount: number | null;
  currency: string | null;
  interval: string | null;
  intervalCount: number | null;
  productName: string | null;
  error: string | null;
}

export interface WebhookCheck {
  url: string;
  expectedEvents: string[];
  found: boolean;
  enabled: boolean | null;
  missingEvents: string[];
  error: string | null;
}

export interface StripeStatus {
  secretConfigured: boolean;
  connected: boolean;
  mode: StripeMode;
  error: string | null;
  account: { id: string; name: string | null; email: string | null; country: string | null } | null;
  prices: { gerente: PriceCheck; storeSlot: PriceCheck };
  /** Produto "Atendente extra" (secret STRIPE_PRODUCT_ATTENDANT). */
  attendantProduct?: ProductCheck;
  webhook: WebhookCheck;
}

export interface ProductCheck {
  env: string;
  configured: boolean;
  found: boolean;
  id: string | null;
  active: boolean | null;
  name: string | null;
  error: string | null;
}

export interface MrrBreakdown {
  net: number;
  gross: number;
  plan: number;
  extraStores: number;
  /** Atendentes extras. Opcional até o servidor novo estar no ar. */
  extraAttendants?: number;
  other: number;
  discounts: number;
  subscriptions: number;
}

export interface UpcomingCharge {
  tenantId: string | null;
  contaName: string;
  subscriptionId: string;
  status: string;
  date: string | null;
  amount: number | null;
  currency: string;
}

export interface MonthRevenue {
  month: string;
  amount: number;
  invoices: number;
}

export interface FailedPayment {
  tenantId: string | null;
  contaName: string;
  chargeId: string;
  date: string;
  amount: number;
  currency: string;
  reason: string | null;
  recovered: boolean;
}

export interface LegacyConta {
  tenantId: string;
  contaName: string;
  subscriptionId: string;
  subscriptionStatus: string | null;
}

export interface BillingOverview {
  generatedAt: string;
  mode: StripeMode;
  currency: string;
  mrr: MrrBreakdown;
  upcoming: UpcomingCharge[];
  revenueByMonth: MonthRevenue[];
  failedPayments: FailedPayment[];
  legacy: LegacyConta[];
  warnings: string[];
}

/** Os 6 eventos que o stripe-webhook precisa receber. Espelho de WEBHOOK_EVENTS. */
export const WEBHOOK_EVENTS: readonly string[] = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
];

/** Endereço do stripe-webhook a partir da URL do projeto. */
export function stripeWebhookUrl(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/stripe-webhook`;
}

// ---------------------------------------------------------------------------
// As linhas das Contas
// ---------------------------------------------------------------------------

export interface ContaBillingRow {
  id: string;
  name: string | null;
  kind: string | null;
  subscription_id: string | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
  subscription_will_cancel: boolean | null;
  subscription_cancel_at: string | null;
  store_slots_extra: number | null;
  manual_access_granted?: boolean | null;
  /** Preço por atendente extra (centavos/mês) desta Conta. */
  atendente_extra_preco_centavos?: number | null;
  /** Atendentes extras que a assinatura cobra (webhook/sync). null = nunca sincronizado. */
  atendentes_extra_cobrados?: number | null;
}

export const CONTA_BILLING_COLUMNS =
  'id, name, kind, subscription_id, subscription_status, trial_ends_at, subscription_will_cancel, subscription_cancel_at, store_slots_extra, manual_access_granted, atendente_extra_preco_centavos, atendentes_extra_cobrados';

/** Status com pagamento pendente (o Stripe ainda tenta, ou parou de tentar sem cancelar). */
export const PENDING_STATUSES = ['past_due', 'unpaid', 'incomplete'];
/** Assinatura já encerrada: não tem cancelamento "agendado". */
const ENDED_STATUSES = ['canceled', 'incomplete_expired'];

export interface ContasSummary {
  pagantes: ContaBillingRow[];
  emTeste: ContaBillingRow[];
  pendentes: ContaBillingRow[];
  cancelamentos: ContaBillingRow[];
}

const porData = (campo: 'trial_ends_at' | 'subscription_cancel_at') => (a: ContaBillingRow, b: ContaBillingRow) =>
  (a[campo] ?? '9999').localeCompare(b[campo] ?? '9999');

/**
 * As quatro listas das Contas. Só Conta (kind='account'): Loja não assina.
 * `legacyIds` = Contas com assinatura fora da conta do Stripe atual; saem de
 * todas as listas (aparecem à parte).
 *
 * "Em teste" é o STATUS trialing. `trial_ends_at` sozinho não diz nada: há
 * Conta com essa data preenchida por um teste manual antigo e nenhuma
 * assinatura.
 */
export function summarizeContas(rows: ContaBillingRow[], legacyIds: ReadonlySet<string> = new Set()): ContasSummary {
  const contas = rows.filter((r) => r.kind === 'account' && !legacyIds.has(r.id));
  const nome = (a: ContaBillingRow, b: ContaBillingRow) => (a.name ?? '').localeCompare(b.name ?? '', 'pt-BR');
  return {
    pagantes: contas.filter((r) => r.subscription_status === 'active').sort(nome),
    emTeste: contas.filter((r) => r.subscription_status === 'trialing').sort(porData('trial_ends_at')),
    pendentes: contas.filter((r) => PENDING_STATUSES.includes(r.subscription_status ?? '')).sort(nome),
    cancelamentos: contas
      .filter((r) => r.subscription_will_cancel === true && !ENDED_STATUSES.includes(r.subscription_status ?? ''))
      .sort(porData('subscription_cancel_at')),
  };
}

// ---------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------

/** Centavos → "R$ 499,90". */
export function formatCents(cents: number | null | undefined, currency = 'brl'): string {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
}

/** ISO → "03/10/2026", no fuso de Brasília. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** 'AAAA-MM' → "set/2026". */
export function formatMonth(month: string): string {
  const [ano, mes] = month.split('-').map(Number);
  if (!ano || !mes) return month;
  return `${MESES[mes - 1]}/${ano}`;
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Ativa',
  trialing: 'Em teste',
  past_due: 'Pagamento pendente',
  unpaid: 'Não paga',
  incomplete: 'Primeiro pagamento pendente',
  incomplete_expired: 'Expirada',
  canceled: 'Cancelada',
  paused: 'Pausada',
};

export function statusLabel(status: string | null | undefined): string {
  if (!status) return 'Sem assinatura';
  return STATUS_LABEL[status] ?? status;
}

/** O mês corrente ('AAAA-MM', Brasília) dentro da receita por mês. */
export function currentMonthRevenue(overview: BillingOverview | null | undefined): MonthRevenue | null {
  const lista = overview?.revenueByMonth ?? [];
  return lista[lista.length - 1] ?? null;
}

/** Soma das próximas cobranças com valor conhecido. */
export function upcomingTotal(overview: BillingOverview | null | undefined): number {
  return (overview?.upcoming ?? []).reduce((s, u) => s + (typeof u.amount === 'number' ? u.amount : 0), 0);
}

/** Falhas que ainda não foram recuperadas. */
export function unrecoveredFailures(overview: BillingOverview | null | undefined): number {
  return (overview?.failedPayments ?? []).filter((f) => !f.recovered).length;
}

// ---------------------------------------------------------------------------
// Atendentes extras: concedido × cobrado (limite por Loja, entrega 2)
// ---------------------------------------------------------------------------
// Concedido = soma de tenants.atendentes_extra das Lojas da Conta (o superadmin
// dá na janela "Atendentes"). Cobrado = tenants.atendentes_extra_cobrados da
// Conta (o stripe-webhook e a sincronização da stripe-admin releem a
// assinatura). Espelho de CHARGING_STATUSES em _shared/attendant-billing.ts.

export const ATTENDANT_CHARGING_STATUSES: readonly string[] = ['active', 'trialing', 'past_due'];

export type AttendantBillingState =
  /** Nenhuma vaga extra e nada cobrado. */
  | 'sem_extras'
  /** Cobrado = concedido. */
  | 'em_dia'
  /** Assinatura viva e cobrado diferente do concedido: sincronizar. */
  | 'diferenca'
  /** Vagas extras numa assinatura viva, sem preço: definir o preço. */
  | 'sem_preco'
  /** Vagas extras sem assinatura (acesso manual): sem cobrança, por decisão. */
  | 'sem_cobranca'
  /** Assinatura na conta antiga do Stripe: não é tocada. */
  | 'conta_antiga';

export interface AttendantBillingCheck {
  state: AttendantBillingState;
  concedidos: number;
  cobrados: number;
}

/** Soma das vagas extras de atendente por Conta, a partir das linhas das Lojas. */
export function grantedAttendantsByConta(
  rows: Array<{ kind?: string | null; parent_tenant_id?: string | null; atendentes_extra?: number | null }> | null | undefined,
): Record<string, number> {
  const soma: Record<string, number> = {};
  for (const r of rows ?? []) {
    if (r.kind !== 'store' || !r.parent_tenant_id) continue;
    const n = typeof r.atendentes_extra === 'number' && r.atendentes_extra > 0 ? r.atendentes_extra : 0;
    soma[r.parent_tenant_id] = (soma[r.parent_tenant_id] ?? 0) + n;
  }
  return soma;
}

export function attendantBillingCheck(
  conta: ContaBillingRow,
  concedidos: number,
  legacyIds: ReadonlySet<string> = new Set(),
): AttendantBillingCheck {
  const cobrados = conta.atendentes_extra_cobrados ?? 0;
  if (legacyIds.has(conta.id)) return { state: 'conta_antiga', concedidos, cobrados };
  const viva = ATTENDANT_CHARGING_STATUSES.includes(conta.subscription_status ?? '');
  if (!viva) return { state: concedidos > 0 ? 'sem_cobranca' : 'sem_extras', concedidos, cobrados: 0 };
  if (concedidos > 0 && !conta.atendente_extra_preco_centavos) return { state: 'sem_preco', concedidos, cobrados };
  if (cobrados !== concedidos) return { state: 'diferenca', concedidos, cobrados };
  return { state: concedidos > 0 ? 'em_dia' : 'sem_extras', concedidos, cobrados };
}

/** O que pede ação do superadmin: diferença entre concedido e cobrado, ou falta de preço. */
export function attendantBillingIssues(
  contas: ContaBillingRow[],
  concedidosPorConta: Record<string, number>,
  legacyIds: ReadonlySet<string> = new Set(),
): Array<{ conta: ContaBillingRow; check: AttendantBillingCheck }> {
  return contas
    .filter((c) => c.kind === 'account')
    .map((conta) => ({ conta, check: attendantBillingCheck(conta, concedidosPorConta[conta.id] ?? 0, legacyIds) }))
    .filter((x) => x.check.state === 'diferenca' || x.check.state === 'sem_preco');
}

export const ATTENDANT_STATE_LABEL: Record<AttendantBillingState, string> = {
  sem_extras: 'Sem extras',
  em_dia: 'Cobrança em dia',
  diferenca: 'Diferença',
  sem_preco: 'Sem preço',
  sem_cobranca: 'Sem cobrança (acesso manual)',
  conta_antiga: 'Conta antiga do Stripe',
};

// Espelho das respostas das ações attendant_* da stripe-admin
// (supabase/functions/_shared/attendant-billing.ts).

export type AttendantSyncState =
  | 'not_configured'
  | 'no_subscription'
  | 'legacy'
  | 'subscription_ended'
  | 'past_due'
  | 'no_price'
  | 'invalid_price'
  | 'synced';

export interface AttendantSyncResult {
  state: AttendantSyncState;
  concedidos: number;
  cobrados: number | null;
  subscriptionStatus: string | null;
  ops: string[];
  message: string;
}

export interface AttendantSetPriceResult {
  changed: boolean;
  priceId: string | null;
  priceCents: number | null;
  archivedPrevious: boolean;
  sync: AttendantSyncResult;
}

export interface AttendantStatusInfo {
  configured: boolean;
  productId: string | null;
  priceCents: number | null;
  priceId: string | null;
  concedidos: number;
  cobrados: number | null;
  subscription: { state: 'none' | 'legacy' | 'ended' | 'past_due' | 'live'; status: string | null };
  item: { quantity: number; priceId: string | null; unitAmount: number | null } | null;
  priceChangeNeedsNotice: boolean;
}

/** "49,90" / "49.90" / "49" → 4990 centavos. Inválido → null. */
export function parseReaisToCents(texto: string): number | null {
  const limpo = texto.trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (!/^\d{1,4}([.,]\d{1,2})?$/.test(limpo)) return null;
  const [inteiro, decimal = ''] = limpo.replace(',', '.').split('.');
  return Number(inteiro) * 100 + Number((decimal + '00').slice(0, 2));
}

/** 4990 → "49,90" (para o campo de edição). */
export function centsToReaisInput(cents: number | null | undefined): string {
  if (typeof cents !== 'number') return '';
  return (cents / 100).toFixed(2).replace('.', ',');
}
