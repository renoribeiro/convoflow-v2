/**
 * Da fatura do Stripe até a nota: prova que uma fatura real vira a nota certa,
 * sem chamar o Stripe nem a Sefin.
 *
 * As faturas seguem o formato documentado da API (https://docs.stripe.com/api/invoices/object):
 * a versão que o nosso cliente fixa (2024-12-18.acacia) e, num caso, a que vem
 * depois dela (basil: `parent` no lugar de `subscription`, `pricing` no lugar de
 * `price`). Todos os ids têm FAKE e os valores são inventados.
 *
 * O caminho é o de verdade: evento do Stripe → recordChargeFromEvent (a linha de
 * billing_charges) → itensDasLinhasDaFatura (os itens, da lista que
 * GET /v1/invoices/{id}/lines devolve) → processarCobranca → montarDps (o XML que
 * iria para a Sefin).
 */
import { describe, expect, it } from 'vitest';
import { chargeRowFromInvoice, recordChargeFromEvent, type ChargeDeps, type ChargeRow } from '../../../supabase/functions/_shared/billing-charges.ts';
import { enderecoDasLinhasDaFatura, itensDasLinhasDaFatura } from '../../../supabase/functions/_shared/nfse/descricao.ts';
import { processarCobranca, type Cobranca, type DadosFiscais } from '../../../supabase/functions/_shared/nfse/worker-core.ts';
import { valor } from '../../../supabase/functions/_shared/nfse/xml-leitura.ts';
import { montarDps, validarPedidoEmissao } from '../../../api/_lib/nfse/dps.js';
import { CERTIFICADO_OK, DADOS, EMITIDA, OUTRA_CONTA, montar } from '@/test/nfseHarness';

type Obj = Record<string, unknown>;

const IDS = { precoLojaExtra: 'price_FAKE_loja', produtoAtendente: 'prod_FAKE_atendente', produtoApi: 'prod_FAKE_api' };
const CNPJ_PRESTADOR = '11222333000181';

// 16/11/2026 12:00 em Fortaleza, um mês de assinatura.
const INICIO = Date.UTC(2026, 10, 16, 15) / 1000;
const FIM = Date.UTC(2026, 11, 16, 15) / 1000;

function linha(id: string, valorCentavos: number, preco: { price: string; product: string }, extra: Obj = {}): Obj {
  return {
    id: `il_FAKE_${id}`,
    object: 'line_item',
    amount: valorCentavos,
    currency: 'brl',
    description: 'Descrição do Stripe, que a nota não usa',
    discount_amounts: [],
    discountable: true,
    discounts: [],
    invoice: 'in_FAKE_1',
    livemode: true,
    metadata: {},
    period: { start: INICIO, end: FIM },
    price: { id: preco.price, object: 'price', currency: 'brl', product: preco.product, type: 'recurring', unit_amount: valorCentavos },
    proration: false,
    proration_details: { credited_items: null },
    quantity: 1,
    subscription: 'sub_FAKE_1',
    subscription_item: `si_FAKE_${id}`,
    type: 'subscription',
    ...extra,
  };
}

const PLANO = linha('plano', 49990, { price: 'price_FAKE_gerente', product: 'prod_FAKE_gerente' });

function fatura(linhas: Obj[], extra: Obj = {}): Obj {
  const subtotal = linhas.reduce((s, l) => s + Number(l.amount), 0);
  return {
    id: 'in_FAKE_1',
    object: 'invoice',
    amount_due: subtotal,
    amount_paid: subtotal,
    amount_remaining: 0,
    billing_reason: 'subscription_cycle',
    charge: 'ch_FAKE_1',
    collection_method: 'charge_automatically',
    created: INICIO,
    currency: 'brl',
    customer: 'cus_FAKE_1',
    customer_email: 'pagador@example.com',
    customer_name: 'Pessoa Inventada',
    customer_tax_ids: [],
    discount: null,
    discounts: [],
    hosted_invoice_url: 'https://invoice.stripe.com/i/FAKE',
    invoice_pdf: 'https://pay.stripe.com/invoice/FAKE/pdf',
    livemode: true,
    lines: { object: 'list', data: linhas, has_more: false, total_count: linhas.length, url: '/v1/invoices/in_FAKE_1/lines' },
    paid: true,
    payment_intent: 'pi_FAKE_1',
    // O período da própria fatura é o ANTERIOR numa fatura de assinatura: a nota não pode usar este.
    period_end: INICIO,
    period_start: Date.UTC(2026, 9, 16, 15) / 1000,
    status: 'paid',
    status_transitions: { finalized_at: INICIO, marked_uncollectible_at: null, paid_at: INICIO + 60, voided_at: null },
    subscription: 'sub_FAKE_1',
    subscription_details: { metadata: { tenant_id: OUTRA_CONTA } },
    subtotal,
    subtotal_excluding_tax: subtotal,
    tax: null,
    total: subtotal,
    total_discount_amounts: [],
    total_excluding_tax: subtotal,
    ...extra,
  };
}

/** A mesma fatura de assinatura no formato basil, que tira `subscription` e `price` do topo. */
function faturaBasil(linhas: Obj[], extra: Obj = {}): Obj {
  const base = fatura(linhas, extra);
  const { subscription: _s, subscription_details: _d, charge: _c, payment_intent: _p, paid: _pg, ...resto } = base;
  return {
    ...resto,
    parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_FAKE_1', metadata: { tenant_id: OUTRA_CONTA } } },
    lines: {
      ...(base.lines as Obj),
      data: linhas.map((l) => {
        const { price, proration, proration_details: _pd, subscription: _ls, subscription_item: _si, type: _t, ...r } = l as Obj & { price: Obj };
        return {
          ...r,
          parent: { type: 'subscription_item_details', subscription_item_details: { proration, subscription: 'sub_FAKE_1', subscription_item: 'si_FAKE' } },
          pricing: { type: 'price_details', price_details: { price: price.id, product: price.product }, unit_amount_decimal: String(price.unit_amount) },
        };
      }),
    },
  };
}

/** billing_charges em memória: `stripe_invoice_id` é único, como no banco. */
function bancoDeCobrancas(invoice: Obj) {
  const linhas = new Map<string, ChargeRow>();
  const deps: ChargeDeps = {
    retrieveInvoice: async () => invoice,
    retrieveCharge: async () => ({}),
    loadAccountBySubscriptionId: async () => null,
    loadAccountById: async (id) => (id === OUTRA_CONTA ? id : null),
    loadAccountByCustomerId: async () => null,
    insertChargeIfNew: async (row) => {
      if (linhas.has(row.stripe_invoice_id)) return 'exists';
      linhas.set(row.stripe_invoice_id, row);
      return 'inserted';
    },
    findInvoiceIdByCharge: async () => null,
    updateRefund: async () => 0,
  };
  return { linhas, deps };
}

const evento = (tipo: string, id = 'in_FAKE_1') => ({ type: tipo, data: { object: { id } } });

/** Do evento do Stripe à DPS. `emitir` devolve a nota a partir do XML montado. */
async function notaDaFatura(invoice: Obj, dados: DadosFiscais = DADOS) {
  const { linhas, deps } = bancoDeCobrancas(invoice);
  await recordChargeFromEvent(evento('invoice.paid'), deps);
  const row = [...linhas.values()][0]!;
  const cobranca: Cobranca = { ...row, id: 'c1', amount_refunded_cents: 0, fatura_itens: null, paid_at: row.paid_at };

  const xmls: string[] = [];
  const t = montar({
    ambiente: 'producao',
    agora: new Date(Date.UTC(2026, 10, 16, 16)),
    config: { emissao_producao_liberada: true },
    cobrancas: [cobranca],
    dados,
    itensDaFatura: async () => itensDasLinhasDaFatura(invoice.lines, IDS),
    respostas: {
      certificado: [CERTIFICADO_OK],
      emitir: [
        (pedido) => {
          const { xml } = montarDps(validarPedidoEmissao(pedido), { ambiente: 'producao', cnpjPrestador: CNPJ_PRESTADOR, agora: new Date(Date.UTC(2026, 10, 16, 16)) });
          xmls.push(xml);
          return { ...EMITIDA, nfseXml: `<NFSe><infNFSe><nNFSe>9</nNFSe>${xml}</infNFSe></NFSe>` };
        },
      ],
    },
  });
  const resultado = await processarCobranca(t.portas, 'c1');
  const pedido = t.chamadas.find((c) => c.acao === 'emitir')?.dados as Record<string, any> | undefined;
  return { t, row, resultado, pedido, xml: xmls[0] ?? '' };
}

const DESCRICAO_BASE = 'Licença de uso do software ConvoFlow, assinatura mensal do Plano Gerente com 5 Lojas incluídas. Período de 16/11/2026 a 16/12/2026.';

describe('fatura paga vira a nota certa', () => {
  it('sem cupom: o valor pago, o período das linhas e o texto do plano', async () => {
    const { row, resultado, pedido, xml } = await notaDaFatura(fatura([PLANO]));
    expect(row).toMatchObject({ amount_paid_cents: 49990, tenant_id: OUTRA_CONTA, nota_status: 'aguardando_emissao', stripe_subscription_id: 'sub_FAKE_1' });
    expect(resultado).toBe('emitida');
    expect(pedido).toMatchObject({ valorCentavos: 49990, competencia: '2026-11-16', descricao: DESCRICAO_BASE });
    expect(valor(xml, 'infDPS', 'valores', 'vServPrest', 'vServ')).toBe('499.90');
    expect(valor(xml, 'infDPS', 'serv', 'cServ', 'xDescServ')).toBe(DESCRICAO_BASE);
    expect(valor(xml, 'infDPS', 'dCompet')).toBe('2026-11-16');
  });

  it('com cupom de 50%: a nota sai pelo valor pago, não pelo preço de tabela', async () => {
    const invoice = fatura([{ ...PLANO, discount_amounts: [{ amount: 24995, discount: 'di_FAKE_1' }], discounts: ['di_FAKE_1'] }], {
      amount_due: 24995,
      amount_paid: 24995,
      discounts: ['di_FAKE_1'],
      total: 24995,
      total_excluding_tax: 24995,
      total_discount_amounts: [{ amount: 24995, discount: 'di_FAKE_1' }],
    });
    const { pedido, xml } = await notaDaFatura(invoice);
    expect(pedido!.valorCentavos).toBe(24995);
    expect(valor(xml, 'infDPS', 'valores', 'vServPrest', 'vServ')).toBe('249.95');
    expect(pedido!.descricao).toBe(DESCRICAO_BASE);
  });

  it('com cupom de 100%: fatura de R$ 0 fica sem nota e nunca chega na emissão', async () => {
    const row = chargeRowFromInvoice(fatura([PLANO], { amount_due: 0, amount_paid: 0, total: 0 }), OUTRA_CONTA)!;
    expect(row).toMatchObject({ amount_paid_cents: 0, nota_status: 'sem_nota' });
    const t = montar({ ambiente: 'producao', config: { emissao_producao_liberada: true }, cobrancas: [{ ...row, id: 'c1', amount_refunded_cents: 0, fatura_itens: null }] });
    expect(await processarCobranca(t.portas, 'c1')).toBe('fora_do_escopo');
    expect(t.chamadas).toHaveLength(0);
  });

  it('com Lojas extras: soma ao plano no valor e aparece no texto', async () => {
    const lojas = linha('loja', 19980, { price: 'price_FAKE_loja', product: 'prod_FAKE_loja' }, { quantity: 2 });
    const { pedido, t } = await notaDaFatura(fatura([PLANO, lojas]));
    expect(pedido!.valorCentavos).toBe(69970);
    expect(pedido!.descricao).toBe(`${DESCRICAO_BASE} Lojas extras: 2.`);
    expect(t.cobrancas.get('c1')!.fatura_itens).toEqual({ lojas_extras: 2, atendentes_extras: 0, ajuste_proporcional: false });
  });

  it('com a API e integrações: aparece no texto e entra no valor', async () => {
    const api = linha('api', 9990, { price: 'price_FAKE_api', product: 'prod_FAKE_api' });
    const { pedido } = await notaDaFatura(fatura([PLANO, api]));
    expect(pedido!.valorCentavos).toBe(59980);
    expect(pedido!.descricao).toBe(`${DESCRICAO_BASE} API e integrações.`);
  });

  it('com tudo junto, cupom em cima: Lojas, atendentes, API e o valor pago', async () => {
    const lojas = linha('loja', 9990, { price: 'price_FAKE_loja', product: 'prod_FAKE_loja' });
    const atendentes = linha('atendente', 14970, { price: 'price_FAKE_atendente', product: 'prod_FAKE_atendente' }, { quantity: 3 });
    const api = linha('api', 9990, { price: 'price_FAKE_api', product: 'prod_FAKE_api' });
    const { pedido } = await notaDaFatura(fatura([PLANO, lojas, atendentes, api], { amount_paid: 60000, total: 60000, total_discount_amounts: [{ amount: 24940, discount: 'di_FAKE_1' }] }));
    expect(pedido!.valorCentavos).toBe(60000);
    expect(pedido!.descricao).toBe(`${DESCRICAO_BASE} Lojas extras: 1. Atendentes extras: 3. API e integrações.`);
  });

  it('com ajuste proporcional: a linha proporcional não conta como Loja e o texto avisa', async () => {
    const credito = linha('credito', -5000, { price: 'price_FAKE_gerente', product: 'prod_FAKE_gerente' }, { proration: true, type: 'invoiceitem' });
    const novaLoja = linha('loja', 3330, { price: 'price_FAKE_loja', product: 'prod_FAKE_loja' }, { proration: true, type: 'invoiceitem' });
    const { pedido } = await notaDaFatura(fatura([PLANO, credito, novaLoja]));
    expect(pedido!.valorCentavos).toBe(48320);
    expect(pedido!.descricao).toBe(`${DESCRICAO_BASE} Inclui ajuste proporcional por mudança no plano.`);
  });

  it('formato basil: mesma nota, com Lojas e proporcional lidos do `parent` e do `pricing`', async () => {
    const lojas = linha('loja', 9990, { price: 'price_FAKE_loja', product: 'prod_FAKE_loja' });
    const ajuste = linha('ajuste', 1000, { price: 'price_FAKE_gerente', product: 'prod_FAKE_gerente' }, { proration: true });
    const { row, pedido } = await notaDaFatura(faturaBasil([PLANO, lojas, ajuste]));
    expect(row).toMatchObject({ stripe_subscription_id: 'sub_FAKE_1', tenant_id: OUTRA_CONTA, stripe_charge_id: null });
    expect(pedido!.valorCentavos).toBe(60980);
    expect(pedido!.descricao).toBe(`${DESCRICAO_BASE} Lojas extras: 1. Inclui ajuste proporcional por mudança no plano.`);
  });

  it('pago perto da meia noite: a competência é o dia em Fortaleza, não o de Londres', async () => {
    const pagoEm = Date.UTC(2026, 10, 17, 2, 30) / 1000; // 16/11 23:30 em Fortaleza
    const { pedido } = await notaDaFatura(fatura([PLANO], { status_transitions: { paid_at: pagoEm } }));
    expect(pedido!.competencia).toBe('2026-11-16');
  });
});

describe('a leitura das linhas no Stripe', () => {
  it('usa o endereço documentado, com o limite máximo e sem expand', () => {
    const url = new URL(enderecoDasLinhasDaFatura('in_FAKE_1'));
    expect(`${url.origin}${url.pathname}`).toBe('https://api.stripe.com/v1/invoices/in_FAKE_1/lines');
    expect(url.searchParams.get('limit')).toBe('100');
    // `lines.data.price` não é expansível na versão 2024-12-18.acacia: a linha já traz o preço.
    expect(url.search).not.toContain('expand');
  });

  it('o id da fatura vai escapado', () => {
    expect(enderecoDasLinhasDaFatura('in_FAKE/../x')).toContain('in_FAKE%2F..%2Fx');
  });

  it('mais de 10 linhas: conta todas', async () => {
    const lojas = Array.from({ length: 12 }, (_, i) => linha(`loja${i}`, 1000, { price: 'price_FAKE_loja', product: 'prod_FAKE_loja' }));
    const { pedido } = await notaDaFatura(fatura([PLANO, ...lojas]));
    expect(pedido!.descricao).toBe(`${DESCRICAO_BASE} Lojas extras: 12.`);
  });

  it('lista cortada: a nota para com erro em vez de sair com o texto faltando item', async () => {
    const invoice = fatura([PLANO]);
    (invoice.lines as Obj).has_more = true;
    const { t, resultado, pedido } = await notaDaFatura(invoice);
    expect(resultado).toBe('erro');
    expect(pedido).toBeUndefined();
    expect([...t.notas.values()][0]).toMatchObject({ status: 'erro', ultimo_erro_codigo: 'STRIPE' });
    expect([...t.notas.values()][0]!.ultimo_erro_mensagem).toContain('mais de 100 linhas');
  });
});

describe('o documento do cliente vem dos dados da nota, não do Stripe', () => {
  it('empresa: CNPJ, razão social e email da nota no XML; o nome e o email do Stripe não entram', async () => {
    const empresa: DadosFiscais = { ...DADOS, person_type: 'cnpj', tax_id: '11444777000161', legal_name: 'Empresa Inventada Ltda', invoice_email: 'nota@exemplo.com.br' };
    const { pedido, xml } = await notaDaFatura(fatura([PLANO]), empresa);
    expect(pedido!.tomador).toMatchObject({ tipo: 'cnpj', documento: '11444777000161', nome: 'Empresa Inventada Ltda', email: 'nota@exemplo.com.br' });
    expect(valor(xml, 'infDPS', 'toma', 'CNPJ')).toBe('11444777000161');
    expect(valor(xml, 'infDPS', 'toma', 'CPF')).toBeNull();
    expect(valor(xml, 'infDPS', 'toma', 'xNome')).toBe('Empresa Inventada Ltda');
    expect(xml).not.toContain('Pessoa Inventada');
    expect(xml).not.toContain('pagador@example.com');
  });

  it('pessoa física: CPF no XML', async () => {
    const { xml } = await notaDaFatura(fatura([PLANO]));
    expect(valor(xml, 'infDPS', 'toma', 'CPF')).toBe(DADOS.tax_id);
    expect(valor(xml, 'infDPS', 'toma', 'CNPJ')).toBeNull();
  });

  it('Conta sem dados da nota: para e avisa, sem cair nos dados do Stripe', async () => {
    const { linhas, deps } = bancoDeCobrancas(fatura([PLANO]));
    await recordChargeFromEvent(evento('invoice.paid'), deps);
    const row = [...linhas.values()][0]!;
    const t = montar({
      ambiente: 'producao',
      config: { emissao_producao_liberada: true },
      cobrancas: [{ ...row, tenant_id: '99999999-0000-4000-8000-000000000009', id: 'c1', amount_refunded_cents: 0, fatura_itens: null }],
      respostas: { certificado: [CERTIFICADO_OK] },
    });
    expect(await processarCobranca(t.portas, 'c1')).toBe('erro');
    expect(t.chamadas.some((c) => c.acao === 'emitir')).toBe(false);
    expect(t.avisos.some((a) => a.startsWith('dados:'))).toBe(true);
  });
});

describe('nunca duas notas para a mesma fatura', () => {
  it('invoice.paid e invoice.payment_succeeded da mesma fatura gravam uma linha só, em qualquer ordem', async () => {
    const { linhas, deps } = bancoDeCobrancas(fatura([PLANO]));
    expect((await recordChargeFromEvent(evento('invoice.payment_succeeded'), deps)).result).toBe('recorded');
    expect((await recordChargeFromEvent(evento('invoice.paid'), deps)).result).toBe('already_recorded');
    expect((await recordChargeFromEvent(evento('invoice.paid'), deps)).result).toBe('already_recorded');
    expect(linhas.size).toBe(1);
  });

  it('o evento velho de uma fatura que hoje não está paga não grava cobrança', async () => {
    const { linhas, deps } = bancoDeCobrancas(fatura([PLANO], { status: 'void' }));
    expect((await recordChargeFromEvent(evento('invoice.paid'), deps)).result).toBe('not_paid');
    expect(linhas.size).toBe(0);
  });

  it('processar a mesma cobrança de novo não emite outra nota', async () => {
    const { t } = await notaDaFatura(fatura([PLANO]));
    expect(await processarCobranca(t.portas, 'c1')).toBe('ja_finalizada');
    expect(t.chamadas.filter((c) => c.acao === 'emitir')).toHaveLength(1);
    expect(t.notas.size).toBe(1);
  });

  it('resposta perdida: a consulta acha a nota do mesmo valor e do mesmo cliente, e não reenvia', async () => {
    const { xml, t: feita } = await notaDaFatura(fatura([PLANO]));
    const cobrancaFeita = feita.cobrancas.get('c1')!;
    const nfseXml = `<NFSe><infNFSe><nNFSe>9</nNFSe>${xml}</infNFSe></NFSe>`;
    const t = montar({
      ambiente: 'producao',
      agora: new Date(Date.UTC(2026, 10, 16, 16)),
      config: { emissao_producao_liberada: true },
      cobrancas: [{ ...cobrancaFeita, nota_status: 'aguardando_emissao' }],
      respostas: {
        certificado: [CERTIFICADO_OK],
        emitir: [{ resultado: 'incerta', detalhe: 'timeout' }],
        consultar_dps: [{ resultado: 'encontrada', idDps: EMITIDA.idDps, chaveAcesso: EMITIDA.chaveAcesso, nfseXml }],
      },
    });
    expect(await processarCobranca(t.portas, 'c1')).toBe('incerta');
    t.andar(2);
    expect(await processarCobranca(t.portas, 'c1')).toBe('recuperada');
    expect(t.chamadas.filter((c) => c.acao === 'emitir')).toHaveLength(1);
    expect([...t.notas.values()][0]).toMatchObject({ status: 'emitida', numero_dps: 1 });
  });

  it('resposta perdida com nota de outro valor: para, não reenvia e avisa', async () => {
    const { xml, t: feita } = await notaDaFatura(fatura([PLANO]));
    const nfseXml = `<NFSe><infNFSe><nNFSe>9</nNFSe>${xml}</infNFSe></NFSe>`;
    const t = montar({
      ambiente: 'producao',
      agora: new Date(Date.UTC(2026, 10, 16, 16)),
      config: { emissao_producao_liberada: true },
      cobrancas: [{ ...feita.cobrancas.get('c1')!, nota_status: 'aguardando_emissao', amount_paid_cents: 12345 }],
      respostas: {
        certificado: [CERTIFICADO_OK],
        emitir: [{ resultado: 'incerta', detalhe: 'timeout' }],
        consultar_dps: [{ resultado: 'encontrada', idDps: EMITIDA.idDps, chaveAcesso: EMITIDA.chaveAcesso, nfseXml }],
      },
    });
    await processarCobranca(t.portas, 'c1');
    t.andar(2);
    expect(await processarCobranca(t.portas, 'c1')).toBe('erro');
    expect([...t.notas.values()][0]).toMatchObject({ status: 'erro', ultimo_erro_codigo: 'DPS_DE_OUTRA_NOTA' });
    expect(t.chamadas.filter((c) => c.acao === 'emitir')).toHaveLength(1);
  });
});
