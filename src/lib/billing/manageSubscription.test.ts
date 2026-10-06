/**
 * manage-subscription — cancelar, desfazer e trocar o cartão (teste grátis,
 * entrega 3).
 *
 * O núcleo vive em supabase/functions/_shared/manage-subscription.ts (roda no
 * Deno, sem importar nada do Deno). Aqui o Stripe é um dublê que guarda o
 * estado e registra cada chamada.
 *
 * Trava:
 *   1. SÓ o Gerente ativo, sobre a própria Conta. (O modo sabotagem do
 *      relatório deixa o atendente passar e estes testes ficam vermelhos.)
 *   2. No teste grátis, cancelar liga as DUAS travas contra cobrança:
 *      cancel_at_period_end + nenhum cartão padrão (assinatura e cliente), com
 *      missing_payment_method=cancel. Desfazer devolve os cartões.
 *   3. Depois da primeira cobrança, cancelar só agenda o fim do período.
 *   4. A função não escreve na Conta: o estado volta pelo webhook.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  manageSubscription,
  MSG,
  META_PM_ASSINATURA,
  META_PM_CLIENTE,
  type Caller,
  type ContaRow,
  type CustomerLike,
  type ManageDeps,
  type SubLike,
} from '../../../supabase/functions/_shared/manage-subscription.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');

// ---------------------------------------------------------------------------
// Mundo falso
// ---------------------------------------------------------------------------

const AGORA = new Date('2026-10-01T12:00:00Z');
const seg = (iso: string) => Math.floor(Date.parse(iso) / 1000);
const FIM_DO_TESTE = seg('2026-10-05T12:00:00Z');
const FIM_DO_MES = seg('2026-10-20T12:00:00Z');

const CONTA: ContaRow = { id: 'conta-1', kind: 'account', subscription_id: 'sub_1', stripe_customer_id: 'cus_1' };
const GERENTE: Caller = { profileId: 'perfil-g', role: 'gerente', status: 'active', tenantId: 'conta-1' };

interface Chamada {
  metodo: string;
  id?: string;
  params?: Record<string, unknown>;
}

let sub: SubLike;
let cliente: CustomerLike;
let pmsDoCliente: Record<string, string | null>;
let chamadas: Chamada[];
let falharClienteUpdate: boolean;

function assinaturaEmTeste(): SubLike {
  return {
    id: 'sub_1',
    status: 'trialing',
    customer: 'cus_1',
    trial_end: FIM_DO_TESTE,
    current_period_end: FIM_DO_TESTE,
    cancel_at: null,
    cancel_at_period_end: false,
    default_payment_method: 'pm_sub',
    metadata: { tenant_id: 'conta-1' },
  };
}

function assinaturaPaga(): SubLike {
  return {
    ...assinaturaEmTeste(),
    status: 'active',
    trial_end: FIM_DO_TESTE,
    current_period_end: FIM_DO_MES,
  };
}

/** Aplica um update como o Stripe faria (o suficiente para os testes). */
function aplicar(s: SubLike, p: Record<string, unknown>): SubLike {
  const n: SubLike = { ...s, metadata: { ...(s.metadata ?? {}) } };
  if ('cancel_at_period_end' in p) {
    n.cancel_at_period_end = p.cancel_at_period_end === true;
    n.cancel_at = n.cancel_at_period_end ? (n.current_period_end ?? null) : null;
  }
  if ('cancel_at' in p) n.cancel_at = p.cancel_at === '' ? null : (p.cancel_at as number);
  if ('default_payment_method' in p) {
    n.default_payment_method = p.default_payment_method === '' ? null : (p.default_payment_method as string);
  }
  if (p.metadata) {
    for (const [k, v] of Object.entries(p.metadata as Record<string, string>)) {
      if (v === '') delete n.metadata![k];
      else n.metadata![k] = v;
    }
  }
  return n;
}

function deps(caller: Caller | null = GERENTE, conta: ContaRow | null = CONTA): ManageDeps {
  return {
    caller,
    siteUrl: 'https://convoflow.com.br',
    now: () => AGORA,
    log: () => {},
    loadConta: async (id) => (conta && conta.id === id ? conta : null),
    stripe: {
      retrieveSubscription: async (id) => {
        chamadas.push({ metodo: 'retrieveSubscription', id });
        return sub;
      },
      updateSubscription: async (id, params) => {
        chamadas.push({ metodo: 'updateSubscription', id, params });
        sub = aplicar(sub, params);
        return sub;
      },
      retrieveCustomer: async (id) => {
        chamadas.push({ metodo: 'retrieveCustomer', id });
        return cliente;
      },
      updateCustomer: async (id, params) => {
        chamadas.push({ metodo: 'updateCustomer', id, params });
        if (falharClienteUpdate) throw new Error('stripe fora');
        const pm = (params.invoice_settings as { default_payment_method: string }).default_payment_method;
        cliente = { ...cliente, invoice_settings: { default_payment_method: pm === '' ? null : pm } };
        return cliente;
      },
      retrievePaymentMethod: async (id) => {
        chamadas.push({ metodo: 'retrievePaymentMethod', id });
        return { id, customer: pmsDoCliente[id] ?? null };
      },
      createPortalSession: async (params) => {
        chamadas.push({ metodo: 'createPortalSession', params });
        return { url: 'https://billing.stripe.com/p/session/x' };
      },
    },
  };
}

const updatesDaAssinatura = () => chamadas.filter((c) => c.metodo === 'updateSubscription');
const updatesDoCliente = () => chamadas.filter((c) => c.metodo === 'updateCustomer');

beforeEach(() => {
  sub = assinaturaEmTeste();
  cliente = { id: 'cus_1', default_source: null, invoice_settings: { default_payment_method: 'pm_cli' } };
  pmsDoCliente = { pm_sub: 'cus_1', pm_cli: 'cus_1' };
  chamadas = [];
  falharClienteUpdate = false;
});

// ---------------------------------------------------------------------------
// 1. Só o Gerente
// ---------------------------------------------------------------------------

describe('só o Gerente ativo, sobre a própria Conta', () => {
  const ACOES = ['preview', 'schedule_cancel', 'undo_cancel', 'card_portal', 'card_sync'] as const;

  it.each(['atendente', 'gestor', 'superadmin'])('%s é recusado em todas as ações, sem tocar no Stripe', async (role) => {
    for (const acao of ACOES) {
      const r = await manageSubscription(acao, deps({ ...GERENTE, role }));
      expect(r.status, `${role} ${acao}`).toBe(403);
      expect(r.body.error).toBe(MSG.soGerente);
    }
    expect(chamadas).toEqual([]);
  });

  it('gerente suspenso é recusado', async () => {
    const r = await manageSubscription('schedule_cancel', deps({ ...GERENTE, status: 'suspended' }));
    expect(r.status).toBe(403);
    expect(chamadas).toEqual([]);
  });

  it('sem sessão → 401', async () => {
    const r = await manageSubscription('schedule_cancel', deps(null));
    expect(r.status).toBe(401);
  });

  it('gerente de uma Loja (não Conta) é recusado', async () => {
    const r = await manageSubscription('schedule_cancel', deps(GERENTE, { ...CONTA, kind: 'store' }));
    expect(r.status).toBe(403);
    expect(chamadas).toEqual([]);
  });

  it('assinatura de outra Conta (metadata) é recusada', async () => {
    sub = { ...sub, metadata: { tenant_id: 'outra-conta' } };
    const r = await manageSubscription('schedule_cancel', deps());
    expect(r.status).toBe(403);
    expect(updatesDaAssinatura()).toEqual([]);
  });

  it('assinatura de outro cliente do Stripe é recusada', async () => {
    sub = { ...sub, customer: 'cus_estranho' };
    const r = await manageSubscription('schedule_cancel', deps());
    expect(r.status).toBe(403);
    expect(updatesDaAssinatura()).toEqual([]);
  });

  it('Conta sem assinatura → 409', async () => {
    const r = await manageSubscription('schedule_cancel', deps(GERENTE, { ...CONTA, subscription_id: null }));
    expect(r.status).toBe(409);
  });

  it('ação desconhecida → 400', async () => {
    expect((await manageSubscription('apagar_tudo', deps())).status).toBe(400);
    expect((await manageSubscription(undefined, deps())).status).toBe(400);
  });

  it('cobrança sem chave do Stripe → 503', async () => {
    const d = deps();
    d.stripe = null;
    expect((await manageSubscription('preview', d)).status).toBe(503);
  });
});

// ---------------------------------------------------------------------------
// 2. Teste grátis
// ---------------------------------------------------------------------------

describe('cancelar no teste grátis: duas travas contra cobrança, e reversível', () => {
  it('a prévia diz "teste" e a data do fim do teste', async () => {
    const r = await manageSubscription('preview', deps());
    expect(r.body).toMatchObject({ ok: true, phase: 'trial', endsAt: '2026-10-05T12:00:00.000Z', canCancel: true, scheduled: false });
  });

  it('agenda o fim do período, tira o cartão padrão da assinatura e do cliente, e guarda os dois', async () => {
    const r = await manageSubscription('schedule_cancel', deps());
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ phase: 'trial', endsAt: '2026-10-05T12:00:00.000Z', scheduled: true });

    const [u] = updatesDaAssinatura();
    expect(u!.params).toMatchObject({
      cancel_at_period_end: true,
      default_payment_method: '',
      trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
    });
    expect((u!.params!.metadata as Record<string, string>)[META_PM_ASSINATURA]).toBe('pm_sub');
    expect((u!.params!.metadata as Record<string, string>)[META_PM_CLIENTE]).toBe('pm_cli');

    expect(updatesDoCliente()).toHaveLength(1);
    expect(updatesDoCliente()[0]!.params).toEqual({ invoice_settings: { default_payment_method: '' } });

    // Estado final: nenhum cartão padrão em lugar nenhum.
    expect(sub.default_payment_method).toBeNull();
    expect(cliente.invoice_settings?.default_payment_method).toBeNull();
    expect(sub.cancel_at_period_end).toBe(true);
  });

  it('se o cliente não deixar tirar o cartão, desfaz tudo e avisa (não fica meio agendado)', async () => {
    falharClienteUpdate = true;
    const r = await manageSubscription('schedule_cancel', deps());
    expect(r.status).toBe(502);
    expect(sub.cancel_at_period_end).toBe(false);
    expect(sub.default_payment_method).toBe('pm_sub');
  });

  it('fonte legada no cliente: recusa, sem mexer em nada', async () => {
    cliente = { ...cliente, default_source: 'card_legado' };
    const r = await manageSubscription('schedule_cancel', deps());
    expect(r.status).toBe(409);
    expect(updatesDaAssinatura()).toEqual([]);
  });

  it('clicar duas vezes não agenda duas vezes', async () => {
    await manageSubscription('schedule_cancel', deps());
    const r = await manageSubscription('schedule_cancel', deps());
    expect(r.body.alreadyScheduled).toBe(true);
    expect(updatesDaAssinatura()).toHaveLength(1);
  });

  it('desfazer devolve os dois cartões e tira o agendamento', async () => {
    await manageSubscription('schedule_cancel', deps());
    const r = await manageSubscription('undo_cancel', deps());
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ scheduled: false, needsCard: false });
    expect(sub.cancel_at_period_end).toBe(false);
    expect(sub.default_payment_method).toBe('pm_sub');
    expect(cliente.invoice_settings?.default_payment_method).toBe('pm_cli');
    expect(sub.metadata?.[META_PM_ASSINATURA]).toBeUndefined();
  });

  it('desfazer quando o cartão salvo sumiu: avisa que falta cartão', async () => {
    await manageSubscription('schedule_cancel', deps());
    pmsDoCliente = { pm_sub: null, pm_cli: null };
    const r = await manageSubscription('undo_cancel', deps());
    expect(r.body).toMatchObject({ scheduled: false, needsCard: true });
    expect(sub.default_payment_method).toBeNull();
  });

  it('trocar o cartão com cancelamento agendado no teste é recusado (desligaria a trava)', async () => {
    await manageSubscription('schedule_cancel', deps());
    expect((await manageSubscription('card_portal', deps())).status).toBe(409);
    expect((await manageSubscription('card_sync', deps())).status).toBe(409);
    expect(chamadas.some((c) => c.metodo === 'createPortalSession')).toBe(false);
  });

  it('a menos de 10 minutos do fim não dá para desfazer por aqui', async () => {
    await manageSubscription('schedule_cancel', deps());
    const d = deps();
    d.now = () => new Date(FIM_DO_TESTE * 1000 - 5 * 60 * 1000);
    const r = await manageSubscription('undo_cancel', d);
    expect(r.status).toBe(409);
    expect(r.body.error).toBe(MSG.tardeDemais);
  });
});

// ---------------------------------------------------------------------------
// 3. Depois da primeira cobrança
// ---------------------------------------------------------------------------

describe('cancelar depois da primeira cobrança: vai até o fim do período pago', () => {
  beforeEach(() => {
    sub = assinaturaPaga();
  });

  it('a prévia diz "pago" e a data do fim do período', async () => {
    const r = await manageSubscription('preview', deps());
    expect(r.body).toMatchObject({ phase: 'paid', endsAt: '2026-10-20T12:00:00.000Z' });
  });

  it('só agenda o fim do período: não mexe em cartão nem no cliente', async () => {
    const r = await manageSubscription('schedule_cancel', deps());
    expect(r.body).toMatchObject({ phase: 'paid', scheduled: true });
    const [u] = updatesDaAssinatura();
    expect(u!.params!.cancel_at_period_end).toBe(true);
    expect(u!.params).not.toHaveProperty('default_payment_method');
    expect(u!.params).not.toHaveProperty('cancel_at');
    expect(updatesDoCliente()).toEqual([]);
  });

  it('desfazer volta cancel_at_period_end para false', async () => {
    await manageSubscription('schedule_cancel', deps());
    const r = await manageSubscription('undo_cancel', deps());
    expect(r.body.scheduled).toBe(false);
    expect(updatesDaAssinatura()[1]!.params).toMatchObject({ cancel_at_period_end: false });
  });

  it('cancelamento com data própria (cancel_at) é desfeito limpando cancel_at, sem o outro parâmetro', async () => {
    sub = { ...sub, cancel_at: FIM_DO_MES, cancel_at_period_end: false };
    await manageSubscription('undo_cancel', deps());
    const [u] = updatesDaAssinatura();
    expect(u!.params).toMatchObject({ cancel_at: '' });
    expect(u!.params).not.toHaveProperty('cancel_at_period_end');
  });

  it('sem nada agendado, desfazer → 409', async () => {
    const r = await manageSubscription('undo_cancel', deps());
    expect(r.status).toBe(409);
    expect(r.body.error).toBe(MSG.naoAgendado);
  });

  it('pagamento pendente: não agenda cancelamento pelo produto', async () => {
    sub = { ...sub, status: 'past_due' };
    const r = await manageSubscription('schedule_cancel', deps());
    expect(r.status).toBe(409);
    expect(updatesDaAssinatura()).toEqual([]);
  });

  it('assinatura já encerrada: nada a cancelar', async () => {
    sub = { ...sub, status: 'canceled' };
    expect((await manageSubscription('schedule_cancel', deps())).status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// Cartão
// ---------------------------------------------------------------------------

describe('Atualizar cartão', () => {
  beforeEach(() => {
    sub = assinaturaPaga();
  });

  it('abre o portal SÓ no fluxo de troca de cartão, voltando para a aba Assinatura', async () => {
    const r = await manageSubscription('card_portal', deps());
    expect(r.body).toMatchObject({ ok: true, url: 'https://billing.stripe.com/p/session/x' });
    const sessao = chamadas.find((c) => c.metodo === 'createPortalSession')!.params!;
    expect(sessao).toMatchObject({
      customer: 'cus_1',
      return_url: 'https://convoflow.com.br/dashboard/settings?tab=subscription',
      flow_data: {
        type: 'payment_method_update',
        after_completion: {
          type: 'redirect',
          redirect: { return_url: 'https://convoflow.com.br/dashboard/settings?tab=subscription&cartao=atualizado' },
        },
      },
    });
  });

  it('funciona com pagamento pendente (é para isso que o aviso existe)', async () => {
    sub = { ...sub, status: 'past_due' };
    expect((await manageSubscription('card_portal', deps())).status).toBe(200);
  });

  it('na volta, a assinatura passa a usar o cartão novo do cliente', async () => {
    cliente = { ...cliente, invoice_settings: { default_payment_method: 'pm_novo' } };
    const r = await manageSubscription('card_sync', deps());
    expect(r.body.cardSynced).toBe(true);
    expect(sub.default_payment_method).toBe('pm_novo');
  });

  it('se a assinatura já usa o cartão do cliente, não mexe', async () => {
    cliente = { ...cliente, invoice_settings: { default_payment_method: 'pm_sub' } };
    const r = await manageSubscription('card_sync', deps());
    expect(r.body.cardSynced).toBe(false);
    expect(updatesDaAssinatura()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. Erros e o que a função NÃO faz
// ---------------------------------------------------------------------------

describe('limites', () => {
  it('erro do Stripe vira 502 com frase em pt-BR, sem vazar detalhe', async () => {
    const d = deps();
    d.stripe!.retrieveSubscription = async () => {
      throw new Error('No such subscription: sub_1');
    };
    const r = await manageSubscription('preview', d);
    expect(r.status).toBe(502);
    expect(r.body.error).toBe(MSG.falhaStripe);
  });

  it('a função não escreve em tabela nenhuma: o estado volta pelo stripe-webhook', () => {
    const fonte = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'manage-subscription', 'index.ts'), 'utf8');
    expect(fonte).not.toMatch(/\.(insert|upsert|delete)\(/);
    // `.update(` só aparece nas chamadas ao Stripe (subscriptions/customers).
    const updates = fonte.match(/[a-zA-Z]+\.update\(/g) ?? [];
    expect(updates.every((u) => /^(subscriptions|customers)\.update\($/.test(u))).toBe(true);
    expect(fonte).not.toMatch(/\.rpc\(/);
  });
});
