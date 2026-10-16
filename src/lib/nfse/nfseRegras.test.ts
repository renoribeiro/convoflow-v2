/**
 * Nota fiscal, parte 2 — regras puras do Supabase (supabase/functions/_shared/nfse):
 * prazo de cancelamento, reembolso, tentativas, certificado, texto do serviço,
 * e-mail e os campos do DANFSe. Dados inventados.
 */
import { describe, expect, it } from 'vitest';
import {
  avisoDeCertificado,
  cobrancaNoEscopo,
  decisaoDeCancelamento,
  dentroDoPrazoDeCancelamento,
  diaEmFortaleza,
  dpsJaUsada,
  percentualParaLeiaute,
  prazoCancelamentoAutomatico,
  proximaTentativa,
  situacaoDoReembolso,
} from '../../../supabase/functions/_shared/nfse/regras.ts';
import { descricaoDoServico, resumoDaFatura, ultimoDiaDoPeriodo } from '../../../supabase/functions/_shared/nfse/descricao.ts';
import { emailDaNota } from '../../../supabase/functions/_shared/nfse/email.ts';
import { modeloDoDanfse } from '../../../supabase/functions/_shared/nfse/danfse-modelo.ts';
import { NFSE_XML_FICTICIA } from './fixturesNfse';

const HIFENS = /[-‐-―−]/;

describe('prazo do cancelamento automático (dia 10 do mês seguinte, Fortaleza)', () => {
  it('nota de 31/10 às 23:30 (Fortaleza) cancela sozinha até 10/11 23:59:59', () => {
    const emitida = new Date('2026-11-01T02:30:00Z'); // 31/10 23:30 em Fortaleza
    expect(prazoCancelamentoAutomatico(emitida).toISOString()).toBe('2026-11-11T02:59:59.000Z');
    expect(dentroDoPrazoDeCancelamento(emitida, new Date('2026-11-11T02:59:59Z'))).toBe(true);
    expect(dentroDoPrazoDeCancelamento(emitida, new Date('2026-11-11T03:00:00Z'))).toBe(false);
  });

  it('dezembro passa para 10 de janeiro do ano seguinte', () => {
    expect(prazoCancelamentoAutomatico(new Date('2026-12-15T15:00:00Z')).toISOString()).toBe('2027-01-11T02:59:59.000Z');
  });

  it('reembolso total no prazo cancela; fora do prazo ou parcial vira cancelar à mão', () => {
    const emitidaEm = new Date('2026-10-16T15:00:00Z');
    expect(decisaoDeCancelamento({ pagoCentavos: 49990, devolvidoCentavos: 49990, emitidaEm, agora: new Date('2026-11-05T12:00:00Z') })).toBe('cancelar');
    expect(decisaoDeCancelamento({ pagoCentavos: 49990, devolvidoCentavos: 49990, emitidaEm, agora: new Date('2026-11-12T12:00:00Z') })).toBe('cancelar_manual');
    expect(decisaoDeCancelamento({ pagoCentavos: 49990, devolvidoCentavos: 1000, emitidaEm, agora: new Date('2026-10-17T12:00:00Z') })).toBe('cancelar_manual');
    expect(decisaoDeCancelamento({ pagoCentavos: 49990, devolvidoCentavos: 0, emitidaEm, agora: new Date('2026-10-17T12:00:00Z') })).toBe('nada');
  });

  it('situação do reembolso', () => {
    expect(situacaoDoReembolso(100, 0)).toBe('nenhum');
    expect(situacaoDoReembolso(100, 40)).toBe('parcial');
    expect(situacaoDoReembolso(100, 100)).toBe('total');
    expect(situacaoDoReembolso(100, 120)).toBe('total');
  });
});

describe('tentativas, percentual, certificado e escopo', () => {
  it('espera cresce e fica em 6 horas depois da 5ª', () => {
    const agora = new Date('2026-10-16T12:00:00Z');
    const min = (n: number) => (proximaTentativa(n, agora).getTime() - agora.getTime()) / 60_000;
    expect([1, 2, 3, 4, 5, 6, 20].map(min)).toEqual([1, 5, 15, 60, 180, 360, 360]);
  });

  it('pTotTribSN sai com duas casas e recusa fora de 0 a 99,99', () => {
    expect(percentualParaLeiaute(6)).toBe('6.00');
    expect(percentualParaLeiaute('15.5')).toBe('15.50');
    expect(() => percentualParaLeiaute(100)).toThrow();
    expect(() => percentualParaLeiaute(-1)).toThrow();
  });

  it('aviso do certificado em 30, 15, 7 e 1 dia, e vencido', () => {
    expect(avisoDeCertificado(45)).toBeNull();
    expect(avisoDeCertificado(30)).toBe(30);
    expect(avisoDeCertificado(20)).toBe(30);
    expect(avisoDeCertificado(10)).toBe(15);
    expect(avisoDeCertificado(7)).toBe(7);
    expect(avisoDeCertificado(0)).toBe(1);
    expect(avisoDeCertificado(-1)).toBe('vencido');
  });

  it('restrita só emite para a Conta de teste; produção, para toda Conta', () => {
    const teste = 'aaaaaaaa-0000-4000-8000-000000000001';
    const outra = 'aaaaaaaa-0000-4000-8000-000000000002';
    expect(cobrancaNoEscopo('restrita', teste, [teste])).toBe(true);
    expect(cobrancaNoEscopo('restrita', outra, [teste])).toBe(false);
    expect(cobrancaNoEscopo('restrita', null, [teste])).toBe(false);
    expect(cobrancaNoEscopo('producao', outra, [teste])).toBe(true);
  });

  it('E0014 quer dizer número já usado; dia em Fortaleza vira à meia-noite local', () => {
    expect(dpsJaUsada([{ codigo: 'E0014' }])).toBe(true);
    expect(dpsJaUsada([{ codigo: 'E0240' }])).toBe(false);
    expect(diaEmFortaleza(new Date('2026-11-01T02:59:00Z'))).toBe('2026-10-31');
  });
});

describe('texto do serviço (xDescServ)', () => {
  it('é o texto decidido, com o período e os extras, sem hífen nem travessão', () => {
    const t = descricaoDoServico({
      inicio: '2026-10-16T15:00:00Z',
      fim: '2026-11-16T15:00:00Z',
      itens: { lojas_extras: 2, atendentes_extras: 3, ajuste_proporcional: true },
    });
    expect(t).toBe(
      'Licença de uso do software ConvoFlow, assinatura mensal do Plano Gerente com 5 Lojas incluídas. ' +
        'Período de 16/10/2026 a 16/11/2026. Lojas extras: 2. Atendentes extras: 3. Inclui ajuste proporcional por mudança no plano.',
    );
    expect(t).not.toMatch(HIFENS);
  });

  it('sem extras e sem período, só a primeira frase', () => {
    expect(descricaoDoServico({ inicio: null, fim: null, itens: null })).toBe(
      'Licença de uso do software ConvoFlow, assinatura mensal do Plano Gerente com 5 Lojas incluídas.',
    );
  });

  it('o fim do período do Stripe é exclusivo: o último dia é o anterior', () => {
    expect(ultimoDiaDoPeriodo('2026-11-16T03:00:00Z')).toBe('15/11/2026'); // 00:00 em Fortaleza
  });

  it('resume a fatura do Stripe: Lojas extras pelo preço, atendentes pelo produto, ajuste proporcional', () => {
    const fatura = {
      lines: {
        data: [
          { price: { id: 'price_FAKE_plano', product: 'prod_FAKE_plano' }, quantity: 1 },
          { price: { id: 'price_FAKE_loja', product: 'prod_FAKE_loja' }, quantity: 2 },
          { price: { id: 'price_FAKE_atend', product: 'prod_FAKE_atend' }, quantity: 3 },
          { price: { id: 'price_FAKE_loja', product: 'prod_FAKE_loja' }, quantity: 1, proration: true },
        ],
      },
    };
    expect(resumoDaFatura(fatura, { precoLojaExtra: 'price_FAKE_loja', produtoAtendente: 'prod_FAKE_atend' })).toEqual({
      lojas_extras: 2,
      atendentes_extras: 3,
      ajuste_proporcional: true,
    });
    expect(resumoDaFatura({}, {})).toEqual({ lojas_extras: 0, atendentes_extras: 0, ajuste_proporcional: false });
  });
});

describe('e-mail da nota', () => {
  const base = { nome: 'Cliente Inventado', numeroNota: '12', valorCentavos: 49990, periodo: '16/10/2026 a 15/11/2026', link: 'https://exemplo.com.br/x' };

  it('texto simples, sem hífen, com valor, período e o link', () => {
    const m = emailDaNota({ ...base, teste: false });
    expect(m.assunto).toBe('Nota fiscal de serviço ConvoFlow nº 12');
    expect(m.texto).toContain('R$ 499,90');
    expect(m.texto).toContain('16/10/2026 a 15/11/2026');
    expect(m.texto.replace(base.link, '')).not.toMatch(HIFENS);
    expect(m.assunto).not.toMatch(HIFENS);
    expect(m.html).toContain(`href="${base.link}"`);
    expect(m.texto).not.toContain('TESTE');
  });

  it('nota de teste avisa no assunto e no corpo', () => {
    const m = emailDaNota({ ...base, teste: true });
    expect(m.assunto.startsWith('[TESTE] ')).toBe(true);
    expect(m.texto).toContain('não tem validade jurídica');
  });

  it('escapa o nome no HTML', () => {
    expect(emailDaNota({ ...base, nome: '<b>X</b>', teste: false }).html).toContain('&lt;b&gt;X&lt;/b&gt;');
  });
});

describe('campos do DANFSe (NT 008)', () => {
  const m = modeloDoDanfse(NFSE_XML_FICTICIA, { municipioTomador: 'Fortaleza / CE' });

  it('identificação: chave sem "NFS", números, datas e situação', () => {
    expect(m.chave).toBe('23044002211222333000181000000000000126103630269879');
    expect(m.qrUrl).toBe('https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=23044002211222333000181000000000000126103630269879');
    expect(m.numeroNfse).toBe('7');
    expect(m.competencia).toBe('16/10/2026');
    expect(m.emissaoNfse).toBe('16/10/2026 14:56:24');
    expect(m.serieDps).toBe('00001');
    expect(m.situacao).toBe('NFS-e Gerada');
    expect(m.emitente).toBe('Prestador');
    expect(m.finalidade).toBe('-');
  });

  it('homologação pede "sem validade" e o ambiente certo', () => {
    expect(m.homologacao).toBe(true);
    expect(m.tipoAmbiente).toBe('Tipo de Ambiente: Homologação');
    expect(m.ambienteGerador).toBe('Ambiente Gerador: Sistema Nacional NFS-e');
    expect(m.municipioCabecalho).toBe('Fortaleza / CE');
  });

  it('prestador e tomador formatados; o endereço do prestador fica suprimido', () => {
    expect(m.prestador.documento).toBe('11.222.333/0001-81');
    expect(m.prestador.nome).toBe('EMPRESA FICTICIA LTDA');
    expect(m.prestador.ibgeCep).toBe('2304400 / 60.000-000');
    expect(m.ocultarEnderecoPrestador).toBe(true);
    expect(m.tomador?.documento).toBe('111.444.777-35');
    expect(m.tomador?.nome).toBe('Cliente & Inventado');
    expect(m.tomador?.endereco).toBe('Rua de Teste, 10, Centro');
    expect(m.tomador?.municipio).toBe('Fortaleza / CE');
  });

  it('serviço, ISS e totais; o que não está no XML vira "-"', () => {
    expect(m.servico.codigo).toBe('01.05.01 / 002');
    expect(m.servico.nbs).toBe('1.1103.22.00');
    expect(m.servico.local).toBe('Fortaleza / CE / BR');
    expect(m.servico.descricaoCodigo).toBe('Licenciamento de programas de informatica nao-customizaveis');
    expect(m.issqn.tipo).toBe('Operação Tributável');
    expect(m.issqn.retencao).toBe('Não Retido');
    expect(m.issqn.aliquota).toBe('-');
    expect(m.totais.servico).toBe('R$ 499,90');
    expect(m.totais.liquido).toBe('R$ 499,90');
    expect(m.informacoesComplementares).toBe('Totais Aproximados dos Tributos cfe. Lei nº 12.741/2012: Simples Nacional: 6,00%');
    expect(m.imprimirPisCofins).toBe(true);
    expect(m.cancelada).toBe(false);
    expect(modeloDoDanfse(NFSE_XML_FICTICIA, { cancelada: true }).cancelada).toBe(true);
  });
});
