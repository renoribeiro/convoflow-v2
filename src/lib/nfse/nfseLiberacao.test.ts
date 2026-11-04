/**
 * A liberação da emissão em produção e os avisos da checagem diária
 * (decisão do dono, 2026-11-04). Fila simulada em memória; dados inventados.
 *
 * Prova: nota de cliente só sai com produção nos dois lugares e a chave ligada,
 * em todas as combinações; sem isso não gasta número nem chama a emissão; os
 * campos de Fortaleza não decidem nada; a restrita enxerga os pagamentos de
 * clientes de verdade sem emitir nada para eles.
 */
import { describe, expect, it } from 'vitest';
import { processarCobranca, rodarCiclo, rodarDiario } from '../../../supabase/functions/_shared/nfse/worker-core.ts';
import type { RespostaNfse } from '../../../supabase/functions/_shared/nfse/cliente-vercel.ts';
import type { Ambiente } from '../../../supabase/functions/_shared/nfse/regras.ts';
import { CERTIFICADO_OK, CHAVE, CONTA_TESTE, EMITIDA, OUTRA_CONTA, cobranca, montar, type OpcoesDoMontar } from '@/test/nfseHarness';

const AMBIENTES: Ambiente[] = ['restrita', 'producao'];
const HIFENS = /[-‐-―−]/;

const COMBINACOES = AMBIENTES.flatMap((supabase) =>
  AMBIENTES.flatMap((vercel) => [false, true].map((liberada) => ({ supabase, vercel, liberada }))),
);

const DIARIO_LIMPO = {
  certificado: [CERTIFICADO_OK],
  parametros: [{ resultado: 'ok', aderenteEmissorNacional: true }],
  parametros_producao: [{ resultado: 'ok', aderenteEmissorNacional: false, situacaoEmissaoPadraoContribuintesRFB: 1 }],
} as OpcoesDoMontar['respostas'];

/** O que deveria acontecer com a cobrança de cada tipo de Conta, escrito à mão de propósito. */
function esperado(supabase: Ambiente, vercel: Ambiente, liberada: boolean, conta: string): string {
  if (supabase === 'restrita') {
    if (conta !== CONTA_TESTE) return 'fora_do_escopo';
    return vercel === 'restrita' ? 'emitida' : 'incerta';
  }
  if (!liberada) return 'nao_liberada';
  return vercel === 'producao' ? 'emitida' : 'ambiente_nao_confirmado';
}

describe('quem emite, em todas as combinações de ambiente e chave', () => {
  for (const { supabase, vercel, liberada } of COMBINACOES) {
    for (const [nome, conta] of [['cliente', OUTRA_CONTA], ['Conta de teste', CONTA_TESTE]] as const) {
      const r = esperado(supabase, vercel, liberada, conta);
      it(`Supabase ${supabase}, Vercel ${vercel}, chave ${liberada ? 'ligada' : 'desligada'}, ${nome}: ${r}`, async () => {
        const t = montar({
          ambiente: supabase,
          ambienteVercel: vercel,
          config: { emissao_producao_liberada: liberada },
          cobrancas: [cobranca('c1', { tenant_id: conta })],
          respostas: { certificado: [CERTIFICADO_OK], emitir: [EMITIDA] },
        });
        expect(await processarCobranca(t.portas, 'c1')).toBe(r);

        const emissoes = t.chamadas.filter((c) => c.acao === 'emitir').length;
        const notas = [...t.notas.values()];
        if (r === 'emitida') {
          expect(emissoes).toBe(1);
          expect(notas).toHaveLength(1);
          expect(notas[0]).toMatchObject({ ambiente: supabase, status: 'emitida' });
          expect(t.cobrancas.get('c1')!.nota_status).toBe('emitida');
        } else if (r === 'incerta') {
          // Restrita aqui e produção na Vercel: a função recusa o pedido. Nenhuma nota sai.
          expect(notas[0]).toMatchObject({ ambiente: 'restrita', status: 'erro', chave_acesso: null });
        } else {
          expect(emissoes).toBe(0);
          expect(notas).toHaveLength(0); // não gastou número
          expect(t.cobrancas.get('c1')!.nota_status).toBe('aguardando_emissao');
        }
        // Em nenhuma combinação sai nota de produção sem as três condições.
        const saiuEmProducao = notas.some((n) => n.ambiente === 'producao' && n.status === 'emitida');
        expect(saiuEmProducao).toBe(supabase === 'producao' && vercel === 'producao' && liberada);
      });
    }
  }
});

describe('a porta da produção', () => {
  const liberado = { emissao_producao_liberada: true };

  it('os campos de Fortaleza não decidem: com os dois desligados e a chave ligada, emite', async () => {
    const t = montar({
      ambiente: 'producao',
      config: { ...liberado, prefeitura_emissor_nacional: false, prefeitura_producao_emissor_nacional: false, prefeitura_producao_situacao_rfb: 0 },
      respostas: { certificado: [CERTIFICADO_OK], emitir: [EMITIDA] },
    });
    expect(await processarCobranca(t.portas, 'c1')).toBe('emitida');
    expect(t.chamadas.map((c) => c.acao)).toEqual(['certificado', 'emitir']);
  });

  it('os campos de Fortaleza não decidem: com os dois ligados e a chave desligada, não emite', async () => {
    const t = montar({ ambiente: 'producao', config: { prefeitura_emissor_nacional: true, prefeitura_producao_emissor_nacional: true } });
    expect(await processarCobranca(t.portas, 'c1')).toBe('nao_liberada');
    expect(t.chamadas).toHaveLength(0);
  });

  it('sem confirmação da função da Vercel (fora do ar), não emite nem gasta número', async () => {
    const t = montar({ ambiente: 'producao', config: liberado, respostas: { certificado: [{ resultado: 'incerta', detalhe: 'sem resposta da função: TimeoutError' }], emitir: [EMITIDA] } });
    expect(await processarCobranca(t.portas, 'c1')).toBe('ambiente_nao_confirmado');
    expect(t.chamadas.map((c) => c.acao)).toEqual(['certificado']);
    expect(t.notas.size).toBe(0);
  });

  it('o ciclo para na primeira cobrança sem liberação e, com a chave ligada, emite a fila na ordem', async () => {
    const t = montar({
      ambiente: 'producao',
      cobrancas: [cobranca('c1'), cobranca('c2')],
      respostas: { certificado: [CERTIFICADO_OK], emitir: [EMITIDA, { ...EMITIDA, chaveAcesso: '1'.repeat(50) }] },
    });
    expect((await rodarCiclo(t.portas)).emissao).toEqual({ nao_liberada: 1 });
    expect(t.notas.size).toBe(0);

    t.config.emissao_producao_liberada = true;
    expect((await rodarCiclo(t.portas)).emissao).toEqual({ emitida: 2 });
    expect([...t.notas.values()].map((n) => [n.charge_id, n.numero_dps])).toEqual([['c1', 1], ['c2', 2]]);
  });

  it('desligar a chave para as próximas notas, sem mexer na que já saiu', async () => {
    const t = montar({
      ambiente: 'producao',
      config: liberado,
      cobrancas: [cobranca('c1'), cobranca('c2')],
      respostas: { certificado: [CERTIFICADO_OK], emitir: [EMITIDA] },
    });
    await processarCobranca(t.portas, 'c1');
    t.config.emissao_producao_liberada = false;
    expect(await processarCobranca(t.portas, 'c2')).toBe('nao_liberada');
    expect(t.cobrancas.get('c1')!.nota_status).toBe('emitida');
    expect(t.cobrancas.get('c2')!.nota_status).toBe('aguardando_emissao');
  });

  it('com a chave desligada, o reembolso total de nota já emitida continua cancelando', async () => {
    const t = montar({
      ambiente: 'producao',
      config: liberado,
      respostas: { certificado: [CERTIFICADO_OK], emitir: [EMITIDA], cancelar: [{ resultado: 'cancelada', eventoXml: '<evento/>' }] },
    });
    await processarCobranca(t.portas, 'c1');
    t.config.emissao_producao_liberada = false;
    t.cobrancas.get('c1')!.amount_refunded_cents = 49990;
    expect((await rodarCiclo(t.portas)).cancelamentos).toBe(1);
    expect([...t.notas.values()][0]!.status).toBe('cancelada');
    expect(t.chamadas.find((c) => c.acao === 'cancelar')!.dados).toEqual({ chave: CHAVE });
  });

  it('o ciclo da restrita não encosta na cobrança de cliente', async () => {
    const t = montar({ cobrancas: [cobranca('c1', { tenant_id: OUTRA_CONTA })], respostas: { emitir: [EMITIDA] } });
    await rodarCiclo(t.portas);
    expect(t.chamadas).toHaveLength(0);
    expect(t.notas.size).toBe(0);
    expect(t.cobrancas.get('c1')!.nota_status).toBe('aguardando_emissao');
  });
});

describe('aviso: pagamento de cliente esperando nota há mais de 24 horas', () => {
  const dia = new Date('2026-11-05T12:00:00Z');
  const pagoEm = (horas: number) => new Date(dia.getTime() - horas * 3600_000).toISOString();

  const rodar = async (opts: OpcoesDoMontar) => {
    const t = montar({ agora: dia, respostas: DIARIO_LIMPO, ...opts });
    const r = await rodarDiario(t.portas, await t.portas.banco.config());
    return { t, r };
  };

  it('na restrita, enxerga o cliente de verdade, avisa com valor e data, e não emite nada', async () => {
    const { t, r } = await rodar({ cobrancas: [cobranca('c1', { tenant_id: OUTRA_CONTA, paid_at: pagoEm(25) })] });
    expect(r.clientesEsperando).toBe(1);
    expect(t.avisosDetalhe.find((a) => a.chave === 'espera:2026-11-05')).toMatchObject({
      titulo: 'Pagamento de cliente sem nota há mais de 24 horas',
      mensagem: '1 pagamento(s) de cliente, somando R$ 499,90, esperam nota há mais de 24 horas. O mais antigo é de 04/11/2026. As notas não saem enquanto o ambiente for de teste. Veja Faturamento, Cobranças.',
    });
    expect(t.chamadas.some((c) => c.acao === 'emitir')).toBe(false);
    expect(t.notas.size).toBe(0);
    expect(t.cobrancas.get('c1')!.nota_status).toBe('aguardando_emissao');
  });

  it('com menos de 24 horas ainda não avisa', async () => {
    const { t } = await rodar({ cobrancas: [cobranca('c1', { tenant_id: OUTRA_CONTA, paid_at: pagoEm(23) })] });
    expect(t.avisos.some((a) => a.startsWith('espera:'))).toBe(false);
  });

  it('não conta Conta de teste nem pagamento devolvido inteiro; conta o reembolso parcial e a cobrança sem Conta', async () => {
    const { t, r } = await rodar({
      cobrancas: [
        cobranca('teste', { paid_at: pagoEm(30) }),
        cobranca('devolvida', { tenant_id: OUTRA_CONTA, paid_at: pagoEm(30), amount_refunded_cents: 49990 }),
        cobranca('parcial', { tenant_id: OUTRA_CONTA, paid_at: pagoEm(30), amount_refunded_cents: 100 }),
        cobranca('sem-conta', { tenant_id: null, paid_at: pagoEm(40), amount_paid_cents: 10000 }),
      ],
    });
    expect(r.clientesEsperando).toBe(2);
    expect(t.avisosDetalhe.find((a) => a.chave.startsWith('espera:'))!.mensagem).toContain('2 pagamento(s) de cliente, somando R$ 599,90');
  });

  it('não conta nota já resolvida', async () => {
    const { r } = await rodar({
      cobrancas: [
        cobranca('a', { tenant_id: OUTRA_CONTA, paid_at: pagoEm(30), nota_status: 'emitida' }),
        cobranca('b', { tenant_id: OUTRA_CONTA, paid_at: pagoEm(30), nota_status: 'sem_nota' }),
      ],
    });
    expect(r.clientesEsperando).toBe(0);
  });

  it('em produção com a chave desligada, diz que é a chave', async () => {
    const { t } = await rodar({ ambiente: 'producao', cobrancas: [cobranca('c1', { tenant_id: OUTRA_CONTA, paid_at: pagoEm(30) })] });
    expect(t.avisosDetalhe.find((a) => a.chave.startsWith('espera:'))!.mensagem).toContain('As notas não saem enquanto a chave "Emissão em produção liberada" estiver desligada.');
  });

  it('em produção liberada, nota com erro também conta, sem culpar a chave', async () => {
    const { t } = await rodar({ ambiente: 'producao', config: { emissao_producao_liberada: true }, cobrancas: [cobranca('c1', { tenant_id: OUTRA_CONTA, paid_at: pagoEm(30), nota_status: 'erro' })] });
    const m = t.avisosDetalhe.find((a) => a.chave.startsWith('espera:'))!.mensagem;
    expect(m).toContain('1 pagamento(s) de cliente');
    expect(m).not.toContain('As notas não saem');
  });

  it('avisa uma vez por dia e volta no dia seguinte, enquanto o pagamento esperar', async () => {
    const t = montar({ agora: dia, respostas: DIARIO_LIMPO, cobrancas: [cobranca('c1', { tenant_id: OUTRA_CONTA, paid_at: pagoEm(30) })] });
    await rodarDiario(t.portas, await t.portas.banco.config());
    await rodarDiario(t.portas, await t.portas.banco.config());
    expect(t.avisos.filter((a) => a.startsWith('espera:'))).toEqual(['espera:2026-11-05']);
    t.andar(60 * 24);
    await rodarDiario(t.portas, await t.portas.banco.config());
    expect(t.avisos.filter((a) => a.startsWith('espera:'))).toEqual(['espera:2026-11-05', 'espera:2026-11-06']);
  });

  it('o texto não tem hífen nem travessão', async () => {
    const { t } = await rodar({ ambiente: 'producao', cobrancas: [cobranca('c1', { tenant_id: OUTRA_CONTA, paid_at: pagoEm(30) })] });
    const a = t.avisosDetalhe.find((x) => x.chave.startsWith('espera:'))!;
    expect(a.titulo + a.mensagem).not.toMatch(HIFENS);
  });
});

describe('aviso: mudança nos campos de Fortaleza', () => {
  const leitura = (aderenteEmissorNacional: boolean, situacaoEmissaoPadraoContribuintesRFB?: number): RespostaNfse => ({
    resultado: 'ok',
    aderenteEmissorNacional,
    situacaoEmissaoPadraoContribuintesRFB,
  });
  const montarCom = (config: OpcoesDoMontar['config'], prod: RespostaNfse[]) =>
    montar({ cobrancas: [], config, respostas: { ...DIARIO_LIMPO, parametros_producao: prod } });
  const fortaleza = (t: ReturnType<typeof montar>) => t.avisosDetalhe.filter((a) => a.chave.startsWith('fortaleza:'));

  it('sem mudança, não avisa e grava a leitura', async () => {
    const t = montarCom({ prefeitura_producao_emissor_nacional: false, prefeitura_producao_situacao_rfb: 1 }, [leitura(false, 1)]);
    const r = await rodarDiario(t.portas, await t.portas.banco.config());
    expect(r).toMatchObject({ prefeituraProducao: false, situacaoRfb: 1, mudancasFortaleza: 0 });
    expect(fortaleza(t)).toEqual([]);
    expect(t.config.prefeitura_producao_lida_em).toBe('2026-10-16T16:00:00.000Z');
  });

  it('a primeira leitura só guarda o valor', async () => {
    const t = montarCom({ prefeitura_producao_emissor_nacional: false, prefeitura_producao_situacao_rfb: null }, [leitura(false, 1)]);
    await rodarDiario(t.portas, await t.portas.banco.config());
    expect(t.config.prefeitura_producao_situacao_rfb).toBe(1);
    expect(fortaleza(t)).toEqual([]);
  });

  it('Emissor Nacional mudou: avisa com o valor antigo e o novo, e o email vai também para o dono', async () => {
    const t = montarCom({ prefeitura_producao_emissor_nacional: false, prefeitura_producao_situacao_rfb: 1 }, [leitura(true, 1)]);
    await rodarDiario(t.portas, await t.portas.banco.config());
    expect(fortaleza(t)).toEqual([
      {
        chave: 'fortaleza:aderenteEmissorNacional:0:1:2026-10-16',
        titulo: 'Fortaleza mudou um dado da nota fiscal',
        mensagem: 'O dado Emissor Nacional (aderenteEmissorNacional) de Fortaleza mudou de 0 para 1. Isso não liga nem desliga a emissão: ela depende só do ambiente e da chave em Faturamento.',
        emails: ['dono@example.com'],
      },
    ]);
  });

  it('o segundo campo mudou: avisa com o nome dele, e também quando volta', async () => {
    const t = montarCom({ prefeitura_producao_emissor_nacional: false, prefeitura_producao_situacao_rfb: 1 }, [leitura(false, 0), leitura(false, 1)]);
    await rodarDiario(t.portas, await t.portas.banco.config());
    expect(fortaleza(t)[0]!.mensagem).toContain('Emissão padrão da Receita (situacaoEmissaoPadraoContribuintesRFB) de Fortaleza mudou de 1 para 0');
    t.andar(60 * 24);
    await rodarDiario(t.portas, await t.portas.banco.config());
    expect(fortaleza(t).map((a) => a.chave)).toEqual([
      'fortaleza:situacaoEmissaoPadraoContribuintesRFB:1:0:2026-10-16',
      'fortaleza:situacaoEmissaoPadraoContribuintesRFB:0:1:2026-10-17',
    ]);
  });

  it('os dois mudaram: dois avisos', async () => {
    const t = montarCom({ prefeitura_producao_emissor_nacional: false, prefeitura_producao_situacao_rfb: 1 }, [leitura(true, 0)]);
    await rodarDiario(t.portas, await t.portas.banco.config());
    expect(fortaleza(t)).toHaveLength(2);
  });

  it('mudança não liga nada: a chave e o ambiente continuam como estavam', async () => {
    const t = montarCom({ prefeitura_producao_emissor_nacional: false }, [leitura(true, 1)]);
    await rodarDiario(t.portas, await t.portas.banco.config());
    expect(t.config.emissao_producao_liberada).toBe(false);
    expect(t.config.ambiente_ativo).toBe('restrita');
  });

  it('a Vercel ainda sem o campo novo: não confunde com mudança e mantém o valor guardado', async () => {
    const t = montarCom({ prefeitura_producao_emissor_nacional: false, prefeitura_producao_situacao_rfb: 1 }, [{ resultado: 'ok', aderenteEmissorNacional: false }]);
    await rodarDiario(t.portas, await t.portas.banco.config());
    expect(t.config.prefeitura_producao_situacao_rfb).toBe(1);
    expect(fortaleza(t)).toEqual([]);
  });

  it('leitura que falha vira aviso: sem ela, o sistema ficaria cego de novo', async () => {
    const t = montarCom({}, [{ resultado: 'incerta', detalhe: 'convenio respondeu 503' }]);
    await rodarDiario(t.portas, await t.portas.banco.config());
    expect(fortaleza(t)[0]).toMatchObject({ chave: 'fortaleza:leitura:2026-10-16', titulo: 'Não consegui ler os dados de Fortaleza' });
    expect(fortaleza(t)[0]!.mensagem).toContain('convenio respondeu 503');
  });
});

describe('aviso: ambiente e chave que não combinam', () => {
  const casos: Array<{ supabase: Ambiente; vercel: Ambiente; liberada: boolean; codigo: string | null }> = [
    { supabase: 'restrita', vercel: 'restrita', liberada: false, codigo: null },
    { supabase: 'restrita', vercel: 'restrita', liberada: true, codigo: 'liberada_no_teste' },
    { supabase: 'restrita', vercel: 'producao', liberada: false, codigo: 'ambientes_diferentes' },
    { supabase: 'restrita', vercel: 'producao', liberada: true, codigo: 'ambientes_diferentes' },
    { supabase: 'producao', vercel: 'restrita', liberada: false, codigo: 'ambientes_diferentes' },
    { supabase: 'producao', vercel: 'restrita', liberada: true, codigo: 'ambientes_diferentes' },
    { supabase: 'producao', vercel: 'producao', liberada: false, codigo: 'producao_sem_liberacao' },
    { supabase: 'producao', vercel: 'producao', liberada: true, codigo: null },
  ];

  for (const { supabase, vercel, liberada, codigo } of casos) {
    it(`Supabase ${supabase}, Vercel ${vercel}, chave ${liberada ? 'ligada' : 'desligada'}: ${codigo ?? 'sem aviso'}`, async () => {
      const t = montar({ ambiente: supabase, ambienteVercel: vercel, cobrancas: [], config: { emissao_producao_liberada: liberada }, respostas: DIARIO_LIMPO });
      const r = await rodarDiario(t.portas, await t.portas.banco.config());
      expect(r.desacordo).toBe(codigo);
      expect(t.avisos.filter((a) => a.startsWith('desacordo:'))).toEqual(codigo ? [`desacordo:${codigo}:2026-10-16`] : []);
      // Com os ambientes diferentes, o aviso certo é este, não os de leitura.
      if (codigo === 'ambientes_diferentes') {
        expect(t.avisos.some((a) => a.startsWith('cert:leitura') || a.startsWith('fortaleza:leitura'))).toBe(false);
      }
    });
  }

  it('o aviso diz o ambiente de cada lugar', async () => {
    const t = montar({ ambiente: 'producao', ambienteVercel: 'restrita', cobrancas: [], respostas: DIARIO_LIMPO });
    await rodarDiario(t.portas, await t.portas.banco.config());
    expect(t.avisosDetalhe.find((a) => a.chave.startsWith('desacordo:'))!.mensagem).toContain('em produção no Supabase e em teste na Vercel');
  });

  it('a função da Vercel fora do ar não vira desacordo: quem avisa é a leitura do certificado', async () => {
    const t = montar({ cobrancas: [], respostas: { ...DIARIO_LIMPO, certificado: [{ resultado: 'incerta', detalhe: 'função recusou: HTTP 500' }] } });
    const r = await rodarDiario(t.portas, await t.portas.banco.config());
    expect(r.desacordo).toBeNull();
    expect(t.avisos).toContain('cert:leitura:2026-10-16');
  });
});
