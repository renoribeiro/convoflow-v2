// =============================================================================
// Montagem da DPS (Declaração de Prestação de Serviço), leiaute v1.01
// =============================================================================
// Pura: recebe o pedido já validado e devolve o XML ainda sem assinatura. A
// ordem dos campos é a do XSD (TCInfDPS); trocar a ordem faz a Sefin recusar.
//
// Fixos do nosso caso (docs/RUNBOOK_nfse_nacional.md):
//   - prestador = o CNPJ do certificado, Simples ME/EPP (opSimpNac 3,
//     regApTribSN 1, regEspTrib 0). Nome e endereço do prestador NÃO vão: a
//     Sefin usa o cadastro.
//   - serviço 010501 com o desdobramento de Fortaleza (cTribMun) e NBS
//     111032200. Sem cTribMun a Sefin recusa (E0312).
//   - ISS operação tributável, não retido, sem alíquota (Simples).
//   - totTrib = pTotTribSN (indTotTrib é proibido para ME/EPP, regra E0712).
//   - sem grupo IBSCBS (obrigatório para o Simples só em 01/01/2027).
// =============================================================================

import { AMBIENTES, MUNICIPIO_EMISSOR, NAMESPACE, REGIME, SERIE, SERVICO, VERSAO_LEIAUTE, VER_APLIC } from './constantes.js';
import { centavosParaDecimal, dataFortaleza, dataHoraFortaleza, digitos, el, esc, linha } from './xml.js';

export class ErroPedido extends Error {
  constructor(campo, mensagem) {
    super(`${campo}: ${mensagem}`);
    this.name = 'ErroPedido';
    this.campo = campo;
  }
}

/** Id da DPS: "DPS" + município(7) + tipo de inscrição(1: 2=CNPJ) + CNPJ(14) + série(5) + número(15). */
export function idDaDps(cnpjPrestador, numero, serie = SERIE) {
  const cnpj = digitos(cnpjPrestador);
  if (cnpj.length !== 14) throw new ErroPedido('cnpjPrestador', 'precisa de 14 algarismos');
  if (!Number.isSafeInteger(numero) || numero < 1 || numero > 999999999999999) {
    throw new ErroPedido('numero', 'fora de 1 a 999999999999999');
  }
  return `DPS${MUNICIPIO_EMISSOR}2${cnpj}${serie.padStart(5, '0')}${String(numero).padStart(15, '0')}`;
}

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const RE_PTOT = /^(0|0\.\d{2}|[1-9]\d?(\.\d{2})?)$/;
const RE_EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/**
 * Confere o pedido de emissão. Lança ErroPedido no primeiro campo errado.
 * @returns o pedido normalizado (só algarismos onde o leiaute pede algarismo)
 */
export function validarPedidoEmissao(p) {
  if (!p || typeof p !== 'object') throw new ErroPedido('pedido', 'vazio');
  const numero = p.numero;
  if (!Number.isSafeInteger(numero) || numero < 1) throw new ErroPedido('numero', 'inteiro positivo');
  if (typeof p.competencia !== 'string' || !RE_DATA.test(p.competencia)) throw new ErroPedido('competencia', 'AAAA-MM-DD');
  if (!Number.isSafeInteger(p.valorCentavos) || p.valorCentavos <= 0) throw new ErroPedido('valorCentavos', 'inteiro maior que zero');
  const descricao = linha(p.descricao, 1000);
  if (!descricao) throw new ErroPedido('descricao', 'vazia');
  if (typeof p.pTotTribSN !== 'string' || !RE_PTOT.test(p.pTotTribSN)) throw new ErroPedido('pTotTribSN', 'formato 6.00');

  const t = p.tomador;
  if (!t || typeof t !== 'object') throw new ErroPedido('tomador', 'ausente');
  const documento = digitos(t.documento);
  if (t.tipo === 'cpf' ? documento.length !== 11 : t.tipo === 'cnpj' ? documento.length !== 14 : true) {
    throw new ErroPedido('tomador.documento', 'CPF com 11 ou CNPJ com 14 algarismos');
  }
  const nome = linha(t.nome, 300);
  if (!nome) throw new ErroPedido('tomador.nome', 'vazio');
  const e = t.endereco;
  if (!e || typeof e !== 'object') throw new ErroPedido('tomador.endereco', 'ausente');
  const cMun = digitos(e.cMun);
  if (cMun.length !== 7) throw new ErroPedido('tomador.endereco.cMun', '7 algarismos (IBGE)');
  const cep = digitos(e.cep);
  if (cep.length !== 8) throw new ErroPedido('tomador.endereco.cep', '8 algarismos');
  const logradouro = linha(e.logradouro, 255);
  if (!logradouro) throw new ErroPedido('tomador.endereco.logradouro', 'vazio');
  const bairro = linha(e.bairro, 60);
  if (!bairro) throw new ErroPedido('tomador.endereco.bairro', 'vazio');
  const email = linha(t.email, 80);

  return {
    numero,
    competencia: p.competencia,
    valorCentavos: p.valorCentavos,
    descricao,
    pTotTribSN: p.pTotTribSN,
    tomador: {
      tipo: t.tipo,
      documento,
      nome,
      email: RE_EMAIL.test(email) ? email : '',
      endereco: {
        cMun,
        cep,
        logradouro,
        numero: linha(e.numero, 60) || 'S/N',
        complemento: linha(e.complemento, 156),
        bairro,
      },
    },
  };
}

/**
 * Monta a DPS sem assinatura.
 * @param {object} pedido  validado por validarPedidoEmissao
 * @param {{ ambiente: 'restrita'|'producao', cnpjPrestador: string, imPrestador?: string, cTribMun?: string, agora: Date }} ctx
 * @returns {{ idDps: string, xml: string }}
 */
export function montarDps(pedido, ctx) {
  const amb = AMBIENTES[ctx.ambiente];
  if (!amb) throw new ErroPedido('ambiente', 'restrita ou producao');
  const idDps = idDaDps(ctx.cnpjPrestador, pedido.numero);
  // A Sefin recusa emissão no futuro; meio minuto para trás cobre relógio adiantado.
  const emissao = new Date(ctx.agora.getTime() - 30_000);
  const dhEmi = dataHoraFortaleza(emissao);
  // Competência nunca depois da emissão (regra E0015).
  const hoje = dataFortaleza(emissao);
  const dCompet = pedido.competencia > hoje ? hoje : pedido.competencia;

  const t = pedido.tomador;
  const e = t.endereco;
  const im = digitos(ctx.imPrestador ?? '');

  const xml =
    `<DPS xmlns="${NAMESPACE}" versao="${VERSAO_LEIAUTE}">` +
    `<infDPS Id="${idDps}">` +
    el('tpAmb', amb.tpAmb) +
    el('dhEmi', dhEmi) +
    el('verAplic', VER_APLIC) +
    el('serie', SERIE) +
    el('nDPS', String(pedido.numero)) +
    el('dCompet', dCompet) +
    el('tpEmit', '1') +
    el('cLocEmi', MUNICIPIO_EMISSOR) +
    '<prest>' +
    el('CNPJ', digitos(ctx.cnpjPrestador)) +
    el('IM', im) +
    '<regTrib>' +
    el('opSimpNac', REGIME.opSimpNac) +
    el('regApTribSN', REGIME.regApTribSN) +
    el('regEspTrib', REGIME.regEspTrib) +
    '</regTrib>' +
    '</prest>' +
    '<toma>' +
    el(t.tipo === 'cpf' ? 'CPF' : 'CNPJ', t.documento) +
    el('xNome', t.nome) +
    '<end>' +
    '<endNac>' +
    el('cMun', e.cMun) +
    el('CEP', e.cep) +
    '</endNac>' +
    el('xLgr', e.logradouro) +
    el('nro', e.numero) +
    el('xCpl', e.complemento) +
    el('xBairro', e.bairro) +
    '</end>' +
    el('email', t.email) +
    '</toma>' +
    '<serv>' +
    '<locPrest>' +
    el('cLocPrestacao', MUNICIPIO_EMISSOR) +
    '</locPrest>' +
    '<cServ>' +
    el('cTribNac', SERVICO.cTribNac) +
    el('cTribMun', /^\d{3}$/.test(ctx.cTribMun ?? '') ? ctx.cTribMun : SERVICO.cTribMun) +
    `<xDescServ>${esc(pedido.descricao)}</xDescServ>` +
    el('cNBS', SERVICO.cNBS) +
    '</cServ>' +
    '</serv>' +
    '<valores>' +
    '<vServPrest>' +
    el('vServ', centavosParaDecimal(pedido.valorCentavos)) +
    '</vServPrest>' +
    '<trib>' +
    '<tribMun>' +
    el('tribISSQN', '1') +
    el('tpRetISSQN', '1') +
    '</tribMun>' +
    '<totTrib>' +
    el('pTotTribSN', pedido.pTotTribSN) +
    '</totTrib>' +
    '</trib>' +
    '</valores>' +
    '</infDPS>' +
    '</DPS>';

  return { idDps, xml };
}
