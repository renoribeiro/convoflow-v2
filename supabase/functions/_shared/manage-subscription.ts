// =============================================================================
// manage-subscription (núcleo) — cancelar, desfazer o cancelamento e trocar o
// cartão da assinatura da Conta (teste grátis, entrega 3)
// =============================================================================
// O index.ts da função só liga isto ao Deno, ao Supabase e ao Stripe. Toda
// decisão mora aqui, sem nada do Deno, para o Vitest testar
// (src/lib/billing/manageSubscription.test.ts).
//
// QUEM PODE: só o GERENTE ativo, e só sobre a PRÓPRIA Conta (profile.tenant_id,
// kind='account'). O cargo vem do perfil lido no servidor, nunca do pedido. A
// capacidade `billing.manage` não serve de filtro aqui: ela também é verdadeira
// para o gestor.
//
// ESTA FUNÇÃO NÃO ESCREVE NA CONTA. Ela muda a assinatura no Stripe; o estado da
// Conta (cancelamento agendado, data, status) volta pelo stripe-webhook da
// entrega 1, que relê a assinatura a cada evento. A tela espera o webhook.
//
// CANCELAR DURANTE O TESTE — por que não é só `cancel_at_period_end`
//   A documentação do Stripe garante que `cancel_at_period_end` encerra a
//   assinatura no fim do período, mas diz também que, com cancelamento no fim do
//   período, "todas as cobranças proporcionais pendentes continuarão ativas e
//   serão cobradas no final do período" — e em nenhum lugar afirma, numa frase,
//   que o fim do teste agendado para cancelar não gera fatura. Sem essa garantia
//   escrita, o cancelamento no teste usa DUAS travas documentadas:
//     1. `cancel_at_period_end = true`: a assinatura acaba no fim do período, que
//        no teste é o fim do teste;
//     2. sem forma de pagamento PADRÃO (na assinatura e no cliente) e com
//        `trial_settings.end_behavior.missing_payment_method = cancel`: "Se a
//        assinatura de avaliação gratuita terminar sem uma forma de pagamento,
//        será cancelada imediatamente" — e o Stripe só olha as formas padrão.
//   O cartão continua salvo no cliente (não é desanexado); só deixa de ser o
//   padrão. Os ids ficam no metadata da assinatura e o "desfazer" devolve tudo.
//   Cancelar na hora também não cobraria, mas não tem volta ("não é possível
//   reativar uma assinatura cancelada") e fecharia o sistema antes do fim do
//   teste — as duas coisas que o dono decidiu que não acontecem.
//
// CANCELAR DEPOIS DA PRIMEIRA COBRANÇA: só `cancel_at_period_end = true`. O
// período já foi pago, o acesso vai até o fim dele, não há renovação nem
// reembolso proporcional.
// =============================================================================

// ---------------------------------------------------------------------------
// Contrato
// ---------------------------------------------------------------------------

export type ManageAction = 'preview' | 'schedule_cancel' | 'undo_cancel' | 'card_portal' | 'card_sync';

export const MANAGE_ACTIONS: readonly ManageAction[] = [
  'preview',
  'schedule_cancel',
  'undo_cancel',
  'card_portal',
  'card_sync',
];

/** Chaves do metadata da assinatura que guardam os cartões padrão tirados no cancelamento. */
export const META_PM_ASSINATURA = 'convoflow_pm_assinatura';
export const META_PM_CLIENTE = 'convoflow_pm_cliente';
export const META_CANCELADO_POR = 'convoflow_cancelado_por';
export const META_CANCELADO_EM = 'convoflow_cancelado_em';

/** Margem mínima para ainda dar para desfazer antes do fim (Stripe precisa de tempo). */
export const MARGEM_DESFAZER_MS = 10 * 60 * 1000;

export type Phase = 'trial' | 'paid';

export interface Caller {
  profileId: string;
  role: string;
  status: string;
  tenantId: string | null;
}

export interface ContaRow {
  id: string;
  kind: string | null;
  subscription_id: string | null;
  stripe_customer_id: string | null;
}

/** O mínimo que lemos de uma assinatura do Stripe (API 2024-12-18.acacia). */
export interface SubLike {
  id: string;
  status: string;
  customer: string | { id: string };
  trial_end: number | null;
  current_period_end?: number | null;
  items?: { data?: Array<{ current_period_end?: number | null }> } | null;
  cancel_at: number | null;
  cancel_at_period_end: boolean;
  default_payment_method: string | { id: string } | null;
  metadata: Record<string, string> | null;
}

export interface CustomerLike {
  id: string;
  deleted?: boolean;
  default_source?: string | { id: string } | null;
  invoice_settings?: { default_payment_method?: string | { id: string } | null } | null;
}

export interface PaymentMethodLike {
  id: string;
  customer: string | { id: string } | null;
}

export interface StripePort {
  retrieveSubscription(id: string): Promise<SubLike>;
  updateSubscription(id: string, params: Record<string, unknown>, idempotencyKey: string): Promise<SubLike>;
  retrieveCustomer(id: string): Promise<CustomerLike>;
  updateCustomer(id: string, params: Record<string, unknown>, idempotencyKey: string): Promise<CustomerLike>;
  retrievePaymentMethod(id: string): Promise<PaymentMethodLike>;
  createPortalSession(params: Record<string, unknown>): Promise<{ url: string }>;
}

export interface ManageDeps {
  caller: Caller | null;
  loadConta(tenantId: string): Promise<ContaRow | null>;
  stripe: StripePort | null;
  /** Base do site para o retorno do portal (ex.: https://convoflow.com.br). */
  siteUrl: string;
  now(): Date;
  log(level: 'info' | 'warn' | 'error', msg: string, ctx?: Record<string, unknown>): void;
}

export interface ManageResult {
  status: number;
  body: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Mensagens (pt-BR, ditas ao Gerente)
// ---------------------------------------------------------------------------

export const MSG = {
  naoAutenticado: 'Entre de novo para continuar.',
  soGerente: 'Só o Gerente da Conta pode cancelar ou alterar a assinatura.',
  perfilParado: 'Seu acesso não está ativo. Fale com o suporte.',
  soConta: 'A assinatura é da Conta, não da Loja. Só o Gerente da Conta pode mexer nela.',
  semAssinatura: 'Esta Conta não tem assinatura para cancelar.',
  assinaturaDeOutra: 'Esta assinatura não pertence à sua Conta. Fale com o suporte.',
  jaEncerrada: 'Esta assinatura já foi encerrada.',
  pagamentoPendente:
    'A última cobrança não passou no cartão. Atualize o cartão para continuar, ou, se não quiser continuar, fale com o suporte para encerrar.',
  naoAgendado: 'Não há cancelamento agendado para desfazer.',
  tardeDemais: 'O cancelamento já está para acontecer e não dá mais para desfazer por aqui. Fale com o suporte.',
  cartaoBloqueadoNoTeste:
    'Com o cancelamento agendado no teste, o cartão fica guardado mas sem uso. Desfaça o cancelamento antes de trocar o cartão.',
  cartaoLegado: 'Não foi possível tirar o cartão desta assinatura com segurança. Fale com o suporte para cancelar.',
  semCliente: 'Esta Conta ainda não tem cadastro de pagamento no Stripe.',
  cobrancaDesligada: 'A cobrança online está fora do ar. Fale com o suporte.',
  acaoInvalida: 'Ação inválida.',
  falhaStripe: 'O Stripe não respondeu agora. Tente de novo em alguns minutos.',
} as const;

// ---------------------------------------------------------------------------
// Ajudantes puros
// ---------------------------------------------------------------------------

function idDe(v: string | { id: string } | null | undefined): string | null {
  if (!v) return null;
  return typeof v === 'string' ? v : v.id ?? null;
}

function fimDoPeriodo(sub: SubLike): number | null {
  if (typeof sub.current_period_end === 'number') return sub.current_period_end;
  const fins = (sub.items?.data ?? [])
    .map((i) => i?.current_period_end)
    .filter((n): n is number => typeof n === 'number');
  return fins.length ? Math.max(...fins) : null;
}

/** Teste ou período pago, e até quando o acesso vai se cancelar agora. */
export function phaseOf(sub: SubLike): { phase: Phase; endsAt: string | null } {
  if (sub.status === 'trialing') {
    const fim = sub.trial_end ?? fimDoPeriodo(sub);
    return { phase: 'trial', endsAt: fim ? new Date(fim * 1000).toISOString() : null };
  }
  const fim = fimDoPeriodo(sub);
  return { phase: 'paid', endsAt: fim ? new Date(fim * 1000).toISOString() : null };
}

export function isScheduled(sub: SubLike): boolean {
  return sub.cancel_at_period_end === true || typeof sub.cancel_at === 'number';
}

const erro = (status: number, mensagem: string, codigo?: string): ManageResult => ({
  status,
  body: { error: mensagem, ...(codigo ? { code: codigo } : {}) },
});

// ---------------------------------------------------------------------------
// A porta: quem é, qual Conta, qual assinatura
// ---------------------------------------------------------------------------

type Contexto =
  | { ok: true; caller: Caller; conta: ContaRow; stripe: StripePort }
  | { ok: false; result: ManageResult };

async function contexto(deps: ManageDeps): Promise<Contexto> {
  const caller = deps.caller;
  if (!caller) return { ok: false, result: erro(401, MSG.naoAutenticado) };
  if (caller.role !== 'gerente') return { ok: false, result: erro(403, MSG.soGerente, 'not_gerente') };
  if (caller.status !== 'active') return { ok: false, result: erro(403, MSG.perfilParado) };
  if (!caller.tenantId) return { ok: false, result: erro(403, MSG.soConta) };

  const conta = await deps.loadConta(caller.tenantId);
  if (!conta || conta.kind !== 'account') return { ok: false, result: erro(403, MSG.soConta) };
  if (!deps.stripe) return { ok: false, result: erro(503, MSG.cobrancaDesligada) };
  return { ok: true, caller, conta, stripe: deps.stripe };
}

type ComAssinatura =
  | { ok: true; caller: Caller; conta: ContaRow; stripe: StripePort; sub: SubLike }
  | { ok: false; result: ManageResult };

async function comAssinatura(deps: ManageDeps): Promise<ComAssinatura> {
  const c = await contexto(deps);
  if (!c.ok) return c;
  if (!c.conta.subscription_id) return { ok: false, result: erro(409, MSG.semAssinatura, 'no_subscription') };

  const sub = await c.stripe.retrieveSubscription(c.conta.subscription_id);
  // A assinatura tem de ser DESTA Conta: o metadata gravado pelo checkout e o
  // cliente do Stripe da Conta. Qualquer divergência para tudo.
  const donaPeloMetadata = sub.metadata?.tenant_id;
  if (donaPeloMetadata && donaPeloMetadata !== c.conta.id) {
    return { ok: false, result: erro(403, MSG.assinaturaDeOutra) };
  }
  if (c.conta.stripe_customer_id && idDe(sub.customer) !== c.conta.stripe_customer_id) {
    return { ok: false, result: erro(403, MSG.assinaturaDeOutra) };
  }
  return { ...c, sub };
}

function resumo(sub: SubLike, extra: Record<string, unknown> = {}): ManageResult {
  const { phase, endsAt } = phaseOf(sub);
  return {
    status: 200,
    body: {
      ok: true,
      phase,
      endsAt,
      subscriptionStatus: sub.status,
      scheduled: isScheduled(sub),
      ...extra,
    },
  };
}

// ---------------------------------------------------------------------------
// As ações
// ---------------------------------------------------------------------------

async function preview(deps: ManageDeps): Promise<ManageResult> {
  const c = await comAssinatura(deps);
  if (!c.ok) return c.result;
  return resumo(c.sub, { canCancel: ['trialing', 'active'].includes(c.sub.status) && !isScheduled(c.sub) });
}

async function agendar(deps: ManageDeps): Promise<ManageResult> {
  const c = await comAssinatura(deps);
  if (!c.ok) return c.result;
  const { sub, stripe, caller } = c;

  if (['canceled', 'incomplete_expired'].includes(sub.status)) return erro(409, MSG.jaEncerrada, 'ended');
  if (sub.status === 'past_due' || sub.status === 'unpaid') return erro(409, MSG.pagamentoPendente, 'past_due');
  if (!['trialing', 'active'].includes(sub.status)) return erro(409, MSG.jaEncerrada, 'ended');

  // Já agendado: nada a fazer (clique duplo, aba aberta em dois lugares). É
  // esta checagem que evita trabalho repetido; a chave de idempotência é por
  // pedido, porque cancelar → desfazer → cancelar no mesmo dia manda
  // parâmetros diferentes e o Stripe recusaria uma chave reaproveitada.
  if (isScheduled(sub)) return resumo(sub, { alreadyScheduled: true });

  const quem = { [META_CANCELADO_POR]: caller.profileId, [META_CANCELADO_EM]: deps.now().toISOString() };

  if (sub.status === 'active') {
    const atualizada = await stripe.updateSubscription(
      sub.id,
      { cancel_at_period_end: true, metadata: quem },
      `convoflow-cancelar:${sub.id}:pago:${deps.now().getTime()}`,
    );
    return resumo(atualizada);
  }

  // ------------------------------------------------------------ no teste
  const clienteId = idDe(sub.customer);
  if (!clienteId) return erro(409, MSG.cartaoLegado, 'no_customer');
  const cliente = await stripe.retrieveCustomer(clienteId);
  // Fonte legada (default_source) não dá para "tirar do padrão" sem remover:
  // a segunda trava não seria garantida. Não acontece no nosso checkout.
  if (idDe(cliente.default_source ?? null)) return erro(409, MSG.cartaoLegado, 'legacy_source');

  const pmAssinatura = idDe(sub.default_payment_method);
  const pmCliente = idDe(cliente.invoice_settings?.default_payment_method ?? null);

  const atualizada = await stripe.updateSubscription(
    sub.id,
    {
      cancel_at_period_end: true,
      default_payment_method: '',
      trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
      metadata: {
        ...quem,
        [META_PM_ASSINATURA]: pmAssinatura ?? '',
        [META_PM_CLIENTE]: pmCliente ?? '',
      },
    },
    `convoflow-cancelar:${sub.id}:teste:${deps.now().getTime()}`,
  );

  if (pmCliente) {
    try {
      await stripe.updateCustomer(
        clienteId,
        { invoice_settings: { default_payment_method: '' } },
        `convoflow-cancelar-cliente:${sub.id}:${deps.now().getTime()}`,
      );
    } catch (e) {
      // Sem a segunda trava o cancelamento não é o que prometemos: desfaz a
      // primeira e devolve o erro, em vez de deixar meio agendado.
      deps.log('error', 'manage-subscription: não tirou o cartão padrão do cliente; desfazendo', {
        sub: sub.id,
        erro: e instanceof Error ? e.message : String(e),
      });
      await stripe.updateSubscription(
        sub.id,
        {
          cancel_at_period_end: false,
          ...(pmAssinatura ? { default_payment_method: pmAssinatura } : {}),
          metadata: { [META_PM_ASSINATURA]: '', [META_PM_CLIENTE]: '', [META_CANCELADO_POR]: '', [META_CANCELADO_EM]: '' },
        },
        `convoflow-cancelar-reverter:${sub.id}:${deps.now().getTime()}`,
      );
      return erro(502, MSG.falhaStripe, 'stripe_failed');
    }
  }

  return resumo(atualizada);
}

async function desfazer(deps: ManageDeps): Promise<ManageResult> {
  const c = await comAssinatura(deps);
  if (!c.ok) return c.result;
  const { sub, stripe } = c;

  if (['canceled', 'incomplete_expired'].includes(sub.status)) return erro(409, MSG.jaEncerrada, 'ended');
  if (!isScheduled(sub)) return erro(409, MSG.naoAgendado, 'not_scheduled');

  const { endsAt } = phaseOf(sub);
  const quando = sub.cancel_at ? sub.cancel_at * 1000 : endsAt ? Date.parse(endsAt) : null;
  if (quando !== null && quando - deps.now().getTime() < MARGEM_DESFAZER_MS) {
    return erro(409, MSG.tardeDemais, 'too_late');
  }

  // No modo clássico, cancel_at_period_end=true também preenche cancel_at; os
  // dois parâmetros não vão juntos: desliga o que foi usado.
  const reverter: Record<string, unknown> = sub.cancel_at_period_end
    ? { cancel_at_period_end: false }
    : { cancel_at: '' };

  const meta = sub.metadata ?? {};
  const pmAssinatura = meta[META_PM_ASSINATURA] || null;
  const pmCliente = meta[META_PM_CLIENTE] || null;
  const clienteId = idDe(sub.customer);
  let cartaoDevolvido = true;

  // O cartão só volta se ainda estiver salvo neste cliente.
  const aindaDoCliente = async (pm: string) => {
    try {
      const m = await stripe.retrievePaymentMethod(pm);
      return idDe(m.customer) === clienteId;
    } catch {
      return false;
    }
  };

  if (pmAssinatura) {
    if (await aindaDoCliente(pmAssinatura)) reverter.default_payment_method = pmAssinatura;
    else cartaoDevolvido = false;
  }
  reverter.metadata = {
    [META_PM_ASSINATURA]: '',
    [META_PM_CLIENTE]: '',
    [META_CANCELADO_POR]: '',
    [META_CANCELADO_EM]: '',
  };

  const atualizada = await stripe.updateSubscription(sub.id, reverter, `convoflow-desfazer:${sub.id}:${deps.now().getTime()}`);

  if (pmCliente && clienteId) {
    if (await aindaDoCliente(pmCliente)) {
      await stripe.updateCustomer(
        clienteId,
        { invoice_settings: { default_payment_method: pmCliente } },
        `convoflow-desfazer-cliente:${sub.id}:${deps.now().getTime()}`,
      );
    } else {
      cartaoDevolvido = false;
    }
  }

  // No teste, sem cartão padrão a assinatura cancela sozinha no fim do teste:
  // a tela pede o cartão novo.
  const precisaCartao = atualizada.status === 'trialing' && (pmAssinatura || pmCliente) !== null && !cartaoDevolvido;
  return resumo(atualizada, { needsCard: precisaCartao });
}

function retornoDoPortal(siteUrl: string, extra = ''): string {
  return `${siteUrl.replace(/\/+$/, '')}/dashboard/settings?tab=subscription${extra}`;
}

async function portal(deps: ManageDeps): Promise<ManageResult> {
  const c = await comAssinatura(deps);
  if (!c.ok) return c.result;
  const { sub, stripe } = c;

  if (['canceled', 'incomplete_expired'].includes(sub.status)) return erro(409, MSG.jaEncerrada, 'ended');
  // O portal grava o cartão novo como padrão do cliente — isso desligaria a
  // segunda trava do cancelamento no teste.
  if (sub.status === 'trialing' && isScheduled(sub)) {
    return erro(409, MSG.cartaoBloqueadoNoTeste, 'trial_cancel_scheduled');
  }
  const clienteId = idDe(sub.customer);
  if (!clienteId) return erro(409, MSG.semCliente, 'no_customer');

  const sessao = await stripe.createPortalSession({
    customer: clienteId,
    return_url: retornoDoPortal(deps.siteUrl),
    flow_data: {
      type: 'payment_method_update',
      after_completion: {
        type: 'redirect',
        redirect: { return_url: retornoDoPortal(deps.siteUrl, '&cartao=atualizado') },
      },
    },
  });
  return { status: 200, body: { ok: true, url: sessao.url } };
}

/**
 * Depois do portal: o fluxo grava o cartão novo como padrão do CLIENTE. Se a
 * assinatura tem um cartão próprio (o checkout pode gravar lá), é ele que o
 * Stripe cobra — então alinhamos a assinatura ao cartão novo.
 */
async function sincronizarCartao(deps: ManageDeps): Promise<ManageResult> {
  const c = await comAssinatura(deps);
  if (!c.ok) return c.result;
  const { sub, stripe } = c;

  if (sub.status === 'trialing' && isScheduled(sub)) {
    return erro(409, MSG.cartaoBloqueadoNoTeste, 'trial_cancel_scheduled');
  }
  const clienteId = idDe(sub.customer);
  if (!clienteId) return erro(409, MSG.semCliente, 'no_customer');

  const cliente = await stripe.retrieveCustomer(clienteId);
  const novo = idDe(cliente.invoice_settings?.default_payment_method ?? null);
  const atual = idDe(sub.default_payment_method);
  if (!novo || !atual || novo === atual) return resumo(sub, { cardSynced: false });

  const atualizada = await stripe.updateSubscription(
    sub.id,
    { default_payment_method: novo },
    `convoflow-cartao:${sub.id}:${novo}`,
  );
  return resumo(atualizada, { cardSynced: true });
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

export async function manageSubscription(action: unknown, deps: ManageDeps): Promise<ManageResult> {
  if (typeof action !== 'string' || !(MANAGE_ACTIONS as readonly string[]).includes(action)) {
    return erro(400, MSG.acaoInvalida, 'bad_action');
  }
  try {
    switch (action as ManageAction) {
      case 'preview':
        return await preview(deps);
      case 'schedule_cancel':
        return await agendar(deps);
      case 'undo_cancel':
        return await desfazer(deps);
      case 'card_portal':
        return await portal(deps);
      case 'card_sync':
        return await sincronizarCartao(deps);
    }
  } catch (e) {
    deps.log('error', 'manage-subscription: falha', {
      action,
      erro: e instanceof Error ? e.message : String(e),
    });
    return erro(502, MSG.falhaStripe, 'stripe_failed');
  }
  return erro(400, MSG.acaoInvalida, 'bad_action');
}
