/**
 * Nota fiscal, parte 2 — a fila (supabase/functions/_shared/nfse/worker-core.ts)
 * com banco, Sefin, arquivos e e-mail simulados em memória.
 *
 * Prova: número reservado uma vez e nunca trocado; nunca duas notas para a
 * mesma cobrança; depois de timeout consulta a DPS ANTES de mandar de novo;
 * E0014 recupera a nota (e para se ela for de outra cobrança); restrita só
 * para a Conta de teste e e-mail só para o endereço de teste; Fortaleza
 * desligada = aguardando_prefeitura; reembolso cancela no prazo e vira
 * cancelar_manual fora dele. Dados inventados.
 */
import { describe, expect, it } from 'vitest';
import {
  cancelarNota,
  processarCobranca,
  rodarCiclo,
  rodarDiario,
  ALERTA_FORTALEZA_LIGOU,
  MENSAGEM_FORTALEZA_LIGOU,
  type Cobranca,
  type Config,
  type DadosFiscais,
  type Nota,
  type Portas,
} from '../../../supabase/functions/_shared/nfse/worker-core.ts';
import type { AcaoNfse, RespostaNfse } from '../../../supabase/functions/_shared/nfse/cliente-vercel.ts';
import type { Ambiente } from '../../../supabase/functions/_shared/nfse/regras.ts';
import { NFSE_XML_FICTICIA } from './fixturesNfse';

const CONTA_TESTE = 'aaaaaaaa-0000-4000-8000-000000000001';
const OUTRA_CONTA = 'aaaaaaaa-0000-4000-8000-000000000002';
const CHAVE = '23044002211222333000181000000000000126103630269879';

function cobranca(id: string, extra: Partial<Cobranca> = {}): Cobranca {
  return {
    id,
    tenant_id: CONTA_TESTE,
    stripe_invoice_id: `in_FAKE_${id}`,
    amount_paid_cents: 49990,
    amount_refunded_cents: 0,
    paid_at: '2026-10-16T15:00:00Z',
    period_start: '2026-10-16T15:00:00Z',
    period_end: '2026-11-16T15:00:00Z',
    nota_status: 'aguardando_emissao',
    fatura_itens: null,
    ...extra,
  };
}

const DADOS: DadosFiscais = {
  tenant_id: CONTA_TESTE,
  person_type: 'cpf',
  tax_id: '11144477735',
  legal_name: 'Cliente Inventado',
  cep: '60060170',
  street: 'Rua de Teste',
  number: '10',
  complement: null,
  district: 'Centro',
  city: 'Fortaleza',
  city_ibge_code: '2304400',
  state: 'CE',
  invoice_email: 'cliente@example.com',
};

type Resposta = RespostaNfse | ((dados: Record<string, unknown>) => RespostaNfse);

function montar(opts: { ambiente?: Ambiente; respostas?: Partial<Record<AcaoNfse, Resposta[]>>; agora?: Date; config?: Partial<Config>; cobrancas?: Cobranca[] } = {}) {
  const ambiente = opts.ambiente ?? 'restrita';
  let agora = opts.agora ?? new Date('2026-10-16T16:00:00Z');
  const cobrancas = new Map<string, Cobranca>((opts.cobrancas ?? [cobranca('c1')]).map((c) => [c.id, c]));
  const notas = new Map<string, Nota>();
  const sequencia: Record<Ambiente, number> = { restrita: 0, producao: 0 };
  const config: Config = {
    p_tot_trib_sn: '6.00',
    ambiente_ativo: 'restrita',
    certificado_valido_ate: null,
    prefeitura_emissor_nacional: true,
    prefeitura_lida_em: agora.toISOString(),
    diario_rodado_em: '2026-10-16',
    ...opts.config,
  };
  const chamadas: Array<{ acao: AcaoNfse; dados: Record<string, unknown> }> = [];
  const arquivos = new Map<string, Uint8Array | string>();
  const emails: Array<{ para: string[]; assunto: string; anexos?: unknown[] }> = [];
  const avisos: string[] = [];
  const avisosDetalhe: Array<{ chave: string; titulo: string; mensagem: string; emails?: string[] }> = [];
  const filas = { ...(opts.respostas ?? {}) };

  const portas: Portas = {
    ambiente,
    contasTeste: [CONTA_TESTE],
    emailTeste: 'teste@example.com',
    emailAvisos: 'dono@example.com',
    agora: () => agora,
    banco: {
      async config() { return { ...config }; },
      async atualizarConfig(p) { Object.assign(config, p); },
      async candidatas(amb, limite) {
        return [...cobrancas.values()]
          .filter((c) => ['aguardando_emissao', 'emitindo', 'erro'].includes(c.nota_status) && c.amount_paid_cents > 0)
          .map((c) => ({ cobranca: { ...c }, nota: [...notas.values()].find((n) => n.charge_id === c.id && n.ambiente === amb) ?? null }))
          .filter(({ nota }) => !nota || ((!nota.proxima_tentativa_em || new Date(nota.proxima_tentativa_em) <= agora) && (!nota.travada_ate || new Date(nota.travada_ate) < agora)))
          .slice(0, limite);
      },
      async cobranca(id) { const c = cobrancas.get(id); return c ? { ...c } : null; },
      async dadosFiscais(t) { return t === CONTA_TESTE || t === OUTRA_CONTA ? { ...DADOS, tenant_id: t } : null; },
      async reservarNota(chargeId, amb) {
        const existente = [...notas.values()].find((n) => n.charge_id === chargeId && n.ambiente === amb);
        if (existente) return { ...existente };
        sequencia[amb] += 1;
        const n: Nota = {
          id: `n${notas.size + 1}`, charge_id: chargeId, tenant_id: cobrancas.get(chargeId)!.tenant_id, ambiente: amb,
          numero_dps: sequencia[amb], id_dps: null, status: 'aguardando_emissao', chave_acesso: null, numero_nfse: null,
          valor_centavos: null, emitida_em: null, xml_path: null, pdf_path: null, email_enviado_em: null, email_tentativas: 0,
          tentativas: 0, proxima_tentativa_em: null, verificar_antes_de_reenviar: false, travada_ate: null,
        };
        notas.set(n.id, n);
        return { ...n };
      },
      async nota(id) { const n = notas.get(id); return n ? { ...n } : null; },
      async travar(id, ate, ag) {
        const n = notas.get(id)!;
        if (n.travada_ate && new Date(n.travada_ate) >= ag) return false;
        n.travada_ate = ate.toISOString();
        return true;
      },
      async atualizarNota(id, p) { Object.assign(notas.get(id)!, p); },
      async atualizarCobranca(id, p) { Object.assign(cobrancas.get(id)!, p); },
      async emitidasComReembolso(amb) {
        return [...notas.values()]
          .filter((n) => n.ambiente === amb && n.status === 'emitida' && cobrancas.get(n.charge_id)!.amount_refunded_cents > 0)
          .map((n) => ({ nota: { ...n }, cobranca: { ...cobrancas.get(n.charge_id)! } }));
      },
      async semEmail(amb) { return [...notas.values()].filter((n) => n.ambiente === amb && n.status === 'emitida' && !n.email_enviado_em && n.pdf_path && n.email_tentativas < 3).map((n) => ({ ...n })); },
      async cobrancasNoEstado(estados) { return [...cobrancas.values()].filter((c) => estados.includes(c.nota_status)); },
      async pagasSemTentativa(amb, ate) {
        return [...cobrancas.values()].filter((c) => c.amount_paid_cents > 0 && new Date(c.paid_at) < ate && !['emitida', 'cancelada', 'cancelar_manual', 'sem_nota'].includes(c.nota_status) && ![...notas.values()].some((n) => n.charge_id === c.id && n.ambiente === amb));
      },
      async paradas(ate) { return [...cobrancas.values()].filter((c) => new Date(c.paid_at) < ate && ['aguardando_emissao', 'emitindo', 'erro'].includes(c.nota_status)); },
    },
    nfse: {
      async chamar(acao, dados = {}) {
        chamadas.push({ acao, dados });
        const fila = filas[acao] ?? [];
        const r = fila.length > 1 ? fila.shift()! : fila[0];
        if (!r) throw new Error(`resposta não prevista para ${acao}`);
        return typeof r === 'function' ? r(dados) : r;
      },
    },
    arquivos: {
      async salvar(c, conteudo) { arquivos.set(c, conteudo); },
      async urlAssinada(c, s) { return `https://exemplo.com.br/assinada/${c}?s=${s}`; },
      async baixar(c) { const v = arquivos.get(c); return v === undefined ? null : typeof v === 'string' ? new TextEncoder().encode(v) : v; },
    },
    email: { async enviar(m) { emails.push(m); return 're_FAKE_1'; } },
    avisos: {
      async superadmin(chave, titulo, mensagem, opts) {
        if (avisos.includes(chave)) return false;
        avisos.push(chave);
        avisosDetalhe.push({ chave, titulo, mensagem, emails: opts?.emails });
        return true;
      },
    },
    gerarPdf: async (_xml, o) => new TextEncoder().encode(o.cancelada ? 'PDF CANCELADA' : 'PDF'),
    itensDaFatura: async () => ({ lojas_extras: 1, atendentes_extras: 0, ajuste_proporcional: false }),
    codigoIbge: async () => '2304400',
    log: () => {},
  };
  return {
    portas, cobrancas, notas, chamadas, arquivos, emails, avisos, avisosDetalhe, config,
    andar(minutos: number) { agora = new Date(agora.getTime() + minutos * 60_000); },
  };
}

const EMITIDA: RespostaNfse = { resultado: 'emitida', idDps: 'DPS' + '2'.repeat(42), chaveAcesso: CHAVE, nfseXml: NFSE_XML_FICTICIA, alertas: [] };
const ENCONTRADA: RespostaNfse = { resultado: 'encontrada', idDps: 'DPS' + '2'.repeat(42), chaveAcesso: CHAVE, nfseXml: NFSE_XML_FICTICIA };

describe('emissão', () => {
  it('reserva o número, emite, guarda XML e PDF, marca emitida e manda o e-mail (restrita: só ao endereço de teste)', async () => {
    const t = montar({ respostas: { emitir: [EMITIDA] } });
    expect(await processarCobranca(t.portas, 'c1')).toBe('emitida');
    const nota = [...t.notas.values()][0]!;
    expect(nota).toMatchObject({ numero_dps: 1, status: 'emitida', chave_acesso: CHAVE, numero_nfse: '7', verificar_antes_de_reenviar: false });
    expect(t.cobrancas.get('c1')!.nota_status).toBe('emitida');
    expect(t.arquivos.has(`restrita/${CONTA_TESTE}/${CHAVE}.xml`)).toBe(true);
    expect(t.arquivos.has(`restrita/${CONTA_TESTE}/${CHAVE}.pdf`)).toBe(true);
    expect(t.emails).toHaveLength(1);
    expect(t.emails[0]!.para).toEqual(['teste@example.com']);
    expect(t.emails[0]!.assunto).toBe('[TESTE] Nota fiscal de serviço ConvoFlow nº 7');
    expect(t.emails[0]!.anexos).toHaveLength(1);
    expect(nota.email_resend_id).toBe('re_FAKE_1');
    // O pedido leva o texto decidido, o percentual da configuração e o tomador.
    const pedido = t.chamadas.find((c) => c.acao === 'emitir')!.dados as Record<string, unknown>;
    expect(pedido).toMatchObject({ numero: 1, valorCentavos: 49990, pTotTribSN: '6.00', competencia: '2026-10-16' });
    expect(pedido.descricao).toBe(
      'Licença de uso do software ConvoFlow, assinatura mensal do Plano Gerente com 5 Lojas incluídas. Período de 16/10/2026 a 16/11/2026. Lojas extras: 1.',
    );
  });

  it('em produção o e-mail vai para o e-mail da nota do cliente', async () => {
    const t = montar({ ambiente: 'producao', respostas: { emitir: [EMITIDA] } });
    await processarCobranca(t.portas, 'c1');
    expect(t.emails[0]!.para).toEqual(['cliente@example.com']);
    expect(t.emails[0]!.assunto.startsWith('[TESTE]')).toBe(false);
  });

  it('chamar de novo não emite outra nota (idempotente) e o número nunca muda', async () => {
    const t = montar({ respostas: { emitir: [EMITIDA] } });
    await processarCobranca(t.portas, 'c1');
    expect(await processarCobranca(t.portas, 'c1')).toBe('ja_finalizada');
    expect(t.chamadas.filter((c) => c.acao === 'emitir')).toHaveLength(1);
    expect(t.notas.size).toBe(1);
  });

  it('cada cobrança tem o seu número, em ordem', async () => {
    const t = montar({ cobrancas: [cobranca('c1'), cobranca('c2')], respostas: { emitir: [EMITIDA, { ...EMITIDA, chaveAcesso: '1'.repeat(50) }] } });
    await rodarCiclo(t.portas);
    expect([...t.notas.values()].map((n) => [n.charge_id, n.numero_dps])).toEqual([['c1', 1], ['c2', 2]]);
  });

  it('timeout: fica marcada para consultar; o próximo ciclo CONSULTA a DPS e recupera sem mandar de novo', async () => {
    const t = montar({ respostas: { emitir: [{ resultado: 'incerta', idDps: 'DPS' + '2'.repeat(42), detalhe: 'timeout' }], consultar_dps: [ENCONTRADA] } });
    expect(await processarCobranca(t.portas, 'c1')).toBe('incerta');
    const nota = [...t.notas.values()][0]!;
    expect(nota).toMatchObject({ status: 'erro', verificar_antes_de_reenviar: true, ultimo_erro_codigo: 'INCERTA' });
    t.andar(2);
    expect(await processarCobranca(t.portas, 'c1')).toBe('recuperada');
    expect(t.chamadas.map((c) => c.acao)).toEqual(['emitir', 'consultar_dps']);
    expect([...t.notas.values()][0]!).toMatchObject({ status: 'emitida', numero_dps: 1, chave_acesso: CHAVE });
  });

  it('timeout e a DPS não existe: consulta primeiro e só então manda de novo, com o MESMO número', async () => {
    const t = montar({
      respostas: {
        emitir: [{ resultado: 'incerta', detalhe: 'timeout' }, EMITIDA],
        consultar_dps: [{ resultado: 'nao_encontrada', erros: [{ codigo: 'E2404', descricao: 'não gerada' }] }],
      },
    });
    await processarCobranca(t.portas, 'c1');
    t.andar(2);
    expect(await processarCobranca(t.portas, 'c1')).toBe('emitida');
    expect(t.chamadas.map((c) => [c.acao, c.dados.numero])).toEqual([['emitir', 1], ['consultar_dps', 1], ['emitir', 1]]);
  });

  it('E0014 (número já virou nota): recupera a nota pela consulta', async () => {
    const t = montar({ respostas: { emitir: [{ resultado: 'rejeitada', erros: [{ codigo: 'E0014', descricao: 'já existe' }] }], consultar_dps: [ENCONTRADA] } });
    expect(await processarCobranca(t.portas, 'c1')).toBe('recuperada');
    expect([...t.notas.values()][0]!.status).toBe('emitida');
  });

  it('E0014 com nota de outro valor: para, não reenvia e avisa', async () => {
    const t = montar({
      cobrancas: [cobranca('c1', { amount_paid_cents: 12345 })],
      respostas: { emitir: [{ resultado: 'rejeitada', erros: [{ codigo: 'E0014', descricao: 'já existe' }] }], consultar_dps: [ENCONTRADA] },
    });
    expect(await processarCobranca(t.portas, 'c1')).toBe('erro');
    expect([...t.notas.values()][0]!).toMatchObject({ status: 'erro', ultimo_erro_codigo: 'DPS_DE_OUTRA_NOTA' });
    expect(t.avisos.some((a) => a.startsWith('outra:'))).toBe(true);
  });

  it('recusa da Sefin: erro com o código, sem consultar depois; aviso na 3ª tentativa', async () => {
    const recusa: RespostaNfse = { resultado: 'rejeitada', erros: [{ codigo: 'E0240', descricao: 'CEP não existe' }] };
    const t = montar({ respostas: { emitir: [recusa] } });
    await processarCobranca(t.portas, 'c1');
    expect([...t.notas.values()][0]!).toMatchObject({ status: 'erro', ultimo_erro_codigo: 'E0240', verificar_antes_de_reenviar: false, tentativas: 1 });
    expect(t.avisos).toHaveLength(0);
    for (let i = 0; i < 2; i++) {
      t.andar(400);
      await processarCobranca(t.portas, 'c1');
    }
    expect([...t.notas.values()][0]!.tentativas).toBe(3);
    expect(t.avisos).toEqual([`erro:n1:E0240`]);
  });

  it('restrita não emite para Conta que não é de teste', async () => {
    const t = montar({ cobrancas: [cobranca('c1', { tenant_id: OUTRA_CONTA })] });
    expect(await processarCobranca(t.portas, 'c1')).toBe('fora_do_escopo');
    expect(t.chamadas).toHaveLength(0);
    expect(t.notas.size).toBe(0);
  });

  it('produção com Fortaleza desligada: aguardando a Prefeitura e aviso, sem emitir', async () => {
    const t = montar({ ambiente: 'producao', config: { prefeitura_emissor_nacional: null, prefeitura_lida_em: null }, respostas: { parametros: [{ resultado: 'ok', aderenteEmissorNacional: false }] } });
    expect(await processarCobranca(t.portas, 'c1')).toBe('aguardando_prefeitura');
    expect(t.cobrancas.get('c1')!.nota_status).toBe('aguardando_prefeitura');
    expect(t.chamadas.map((c) => c.acao)).toEqual(['parametros']);
    expect(t.config.prefeitura_emissor_nacional).toBe(false);
    expect(t.avisos[0]).toMatch(/^prefeitura:producao:/);
  });

  it('reembolso total antes de emitir: sem nota; parcial: erro e aviso', async () => {
    const t = montar({ cobrancas: [cobranca('c1', { amount_refunded_cents: 49990 }), cobranca('c2', { amount_refunded_cents: 100 })] });
    expect(await processarCobranca(t.portas, 'c1')).toBe('sem_nota');
    expect(t.cobrancas.get('c1')!.nota_status).toBe('sem_nota');
    expect(await processarCobranca(t.portas, 'c2')).toBe('erro');
    expect([...t.notas.values()][0]!.ultimo_erro_codigo).toBe('REEMBOLSO_PARCIAL');
    expect(t.chamadas).toHaveLength(0);
  });

  it('certificado vencido para a emissão e avisa', async () => {
    const t = montar({ respostas: { emitir: [{ resultado: 'certificado_vencido', validoAte: '2026-10-01T00:00:00Z' }] } });
    expect(await processarCobranca(t.portas, 'c1')).toBe('certificado_vencido');
    expect(t.cobrancas.get('c1')!.nota_status).toBe('certificado_vencido');
    expect(t.avisos[0]).toMatch(/^cert:vencido:/);
  });

  it('trava: com a nota travada por outro processo, não faz nada', async () => {
    const t = montar({ respostas: { emitir: [EMITIDA] } });
    const n = await t.portas.banco.reservarNota('c1', 'restrita');
    await t.portas.banco.travar(n.id, new Date('2026-10-16T16:05:00Z'), new Date('2026-10-16T16:00:00Z'));
    expect(await processarCobranca(t.portas, 'c1')).toBe('ocupada');
    expect(t.chamadas).toHaveLength(0);
  });
});

describe('cancelamento', () => {
  async function emitida(agora: Date, cancelar: RespostaNfse = { resultado: 'cancelada', eventoXml: '<evento/>' }) {
    const t = montar({
      agora,
      respostas: {
        emitir: [{ ...EMITIDA }],
        cancelar: [cancelar],
        certificado: [{ resultado: 'ok', validoAte: '2027-09-21T00:00:00Z', diasRestantes: 300 }],
        parametros: [{ resultado: 'ok', aderenteEmissorNacional: true }],
        parametros_producao: [{ resultado: 'ok', aderenteEmissorNacional: false }],
      },
    });
    await processarCobranca(t.portas, 'c1');
    return t;
  }

  it('reembolso total dentro do prazo: cancela, guarda o evento e refaz o PDF com CANCELADA', async () => {
    const t = await emitida(new Date('2026-10-16T16:00:00Z'));
    t.cobrancas.get('c1')!.amount_refunded_cents = 49990;
    t.andar(60 * 24 * 5);
    const r = await rodarCiclo(t.portas);
    expect(r.cancelamentos).toBe(1);
    expect(t.chamadas.find((c) => c.acao === 'cancelar')!.dados).toEqual({ chave: CHAVE });
    expect([...t.notas.values()][0]!.status).toBe('cancelada');
    expect(t.cobrancas.get('c1')!.nota_status).toBe('cancelada');
    expect(t.arquivos.get(`restrita/${CONTA_TESTE}/${CHAVE}-cancelamento.xml`)).toBe('<evento/>');
    expect(new TextDecoder().decode(t.arquivos.get(`restrita/${CONTA_TESTE}/${CHAVE}.pdf`) as Uint8Array)).toBe('PDF CANCELADA');
  });

  it('reembolso total depois do dia 10 do mês seguinte: cancelar à mão, sem chamar a Sefin', async () => {
    const t = await emitida(new Date('2026-10-16T16:00:00Z'));
    t.cobrancas.get('c1')!.amount_refunded_cents = 49990;
    t.andar(60 * 24 * 30); // 15/11
    await rodarCiclo(t.portas);
    expect(t.chamadas.some((c) => c.acao === 'cancelar')).toBe(false);
    expect([...t.notas.values()][0]!.status).toBe('cancelar_manual');
    expect(t.avisos.some((a) => a.startsWith('manual:'))).toBe(true);
  });

  it('reembolso parcial: cancelar à mão', async () => {
    const t = await emitida(new Date('2026-10-16T16:00:00Z'));
    t.cobrancas.get('c1')!.amount_refunded_cents = 1000;
    await rodarCiclo(t.portas);
    expect([...t.notas.values()][0]!.status).toBe('cancelar_manual');
  });

  it('Prefeitura recusa pelo prazo (E0822): cancelar à mão', async () => {
    const t = await emitida(new Date('2026-10-16T16:00:00Z'), { resultado: 'rejeitada', erros: [{ codigo: 'E0822', descricao: 'fora do prazo' }] });
    const nota = [...t.notas.values()][0]!;
    expect(await cancelarNota(t.portas, nota, t.cobrancas.get('c1')!)).toBe('cancelar_manual');
  });
});

describe('checagem diária', () => {
  it('avisa o certificado (uma vez por limite), lê Fortaleza e devolve à fila o que esperava a Prefeitura', async () => {
    const t = montar({
      cobrancas: [cobranca('c1', { nota_status: 'aguardando_prefeitura' })],
      config: { diario_rodado_em: '2026-10-15' },
      respostas: {
        certificado: [{ resultado: 'ok', validoAte: '2026-10-26T00:00:00Z', diasRestantes: 10 }],
        parametros: [{ resultado: 'ok', aderenteEmissorNacional: true }],
        parametros_producao: [{ resultado: 'ok', aderenteEmissorNacional: false }],
      },
    });
    const r = await rodarDiario(t.portas, await t.portas.banco.config());
    expect(r).toMatchObject({ certificadoDias: 10, prefeitura: true });
    expect(t.avisos).toContain('cert:15:2026-10-26');
    expect(t.cobrancas.get('c1')!.nota_status).toBe('aguardando_emissao');
    expect(t.config.diario_rodado_em).toBe('2026-10-16');
    await rodarDiario(t.portas, await t.portas.banco.config());
    expect(t.avisos.filter((a) => a.startsWith('cert:15'))).toHaveLength(1);
  });

  it('cobrança paga há mais de 6 horas sem nota vira aviso', async () => {
    const t = montar({
      agora: new Date('2026-10-17T00:00:00Z'),
      respostas: { certificado: [{ resultado: 'ok', validoAte: '2027-09-21T00:00:00Z', diasRestantes: 339 }], parametros: [{ resultado: 'ok', aderenteEmissorNacional: true }], parametros_producao: [{ resultado: 'ok', aderenteEmissorNacional: false }] },
    });
    const r = await rodarDiario(t.portas, await t.portas.banco.config());
    expect(r).toMatchObject({ semTentativa: 1, paradas: 1 });
    expect(t.avisos.some((a) => a.startsWith('conciliacao:'))).toBe(true);
    expect(t.avisos.some((a) => a.startsWith('paradas:'))).toBe(true);
  });

  it('Fortaleza em PRODUÇÃO (leitura falsa): desligada não avisa; ligada avisa uma vez só, com e-mail só para o dono, e não liga nada', async () => {
    const diario = { certificado: [{ resultado: 'ok', validoAte: '2027-09-21T00:00:00Z', diasRestantes: 339 }] as RespostaNfse[], parametros: [{ resultado: 'ok', aderenteEmissorNacional: true }] as RespostaNfse[] };
    const t = montar({ respostas: { ...diario, parametros_producao: [{ resultado: 'ok', aderenteEmissorNacional: false }, { resultado: 'ok', aderenteEmissorNacional: true }] } });
    const r1 = await rodarDiario(t.portas, await t.portas.banco.config());
    expect(r1.prefeituraProducao).toBe(false);
    expect(t.config.prefeitura_producao_emissor_nacional).toBe(false);
    expect(t.config.prefeitura_producao_lida_em).toBe('2026-10-16T16:00:00.000Z');
    expect(t.avisos).not.toContain(ALERTA_FORTALEZA_LIGOU);

    t.andar(60 * 24);
    const r2 = await rodarDiario(t.portas, await t.portas.banco.config());
    expect(r2).toMatchObject({ prefeituraProducao: true, avisoProducao: true });
    expect(t.config.prefeitura_producao_emissor_nacional).toBe(true);
    expect(t.avisosDetalhe.filter((a) => a.chave === ALERTA_FORTALEZA_LIGOU)).toEqual([
      {
        chave: ALERTA_FORTALEZA_LIGOU,
        titulo: 'Fortaleza ligou o Emissor Nacional',
        mensagem: 'Fortaleza ligou o Emissor Nacional. Já dá para ligar a nota fiscal em produção.',
        emails: ['dono@example.com'],
      },
    ]);
    expect(MENSAGEM_FORTALEZA_LIGOU).toBe('Fortaleza ligou o Emissor Nacional. Já dá para ligar a nota fiscal em produção.');

    // Lê "ligada" de novo nos dias seguintes: não repete o aviso.
    t.andar(60 * 24);
    const r3 = await rodarDiario(t.portas, await t.portas.banco.config());
    expect(r3.avisoProducao).toBe(false);
    expect(t.avisosDetalhe.filter((a) => a.chave === ALERTA_FORTALEZA_LIGOU)).toHaveLength(1);
    // Não liga a produção: o sistema continua no teste e a config não muda de ambiente.
    expect(t.portas.ambiente).toBe('restrita');
    expect(t.config.ambiente_ativo).toBe('restrita');
  });
});
