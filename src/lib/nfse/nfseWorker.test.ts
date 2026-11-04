/**
 * Nota fiscal, parte 2 — a fila (supabase/functions/_shared/nfse/worker-core.ts)
 * com banco, Sefin, arquivos e e-mail simulados em memória.
 *
 * Prova: número reservado uma vez e nunca trocado; nunca duas notas para a
 * mesma cobrança; depois de timeout consulta a DPS ANTES de mandar de novo;
 * E0014 recupera a nota (e para se ela for de outra cobrança); restrita só
 * para a Conta de teste e e-mail só para o endereço de teste; reembolso cancela
 * no prazo e vira cancelar_manual fora dele. A liberação da produção e os avisos
 * novos estão em nfseLiberacao.test.ts. Dados inventados.
 */
import { describe, expect, it } from 'vitest';
import { cancelarNota, processarCobranca, rodarCiclo, rodarDiario } from '../../../supabase/functions/_shared/nfse/worker-core.ts';
import type { RespostaNfse } from '../../../supabase/functions/_shared/nfse/cliente-vercel.ts';
import { CERTIFICADO_OK, CHAVE, CONTA_TESTE, EMITIDA, ENCONTRADA, OUTRA_CONTA, cobranca, montar } from '@/test/nfseHarness';

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
    const t = montar({ ambiente: 'producao', config: { emissao_producao_liberada: true }, respostas: { certificado: [CERTIFICADO_OK], emitir: [EMITIDA] } });
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
  it('avisa o certificado (uma vez por limite) e lê Fortaleza', async () => {
    const t = montar({
      cobrancas: [],
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
});
