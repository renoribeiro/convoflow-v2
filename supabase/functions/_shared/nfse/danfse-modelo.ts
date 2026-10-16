// =============================================================================
// nfse/danfse-modelo.ts — os campos do DANFSe (NT 008 v1.02), já formatados
// =============================================================================
// Puro (sem Deno, sem pdf-lib): lê o XML da NFS-e e devolve o texto de cada
// campo. Quem desenha é danfse-pdf.ts. Regras da NT 008 seguidas aqui:
//   - só sai o que está no XML; campo vazio vira "-" (nota 12);
//   - "NFS-e SEM VALIDADE JURÍDICA" quando tpAmb = 2 (homologação);
//   - totais aproximados de tributos obrigatórios nas informações
//     complementares (nota 10). O nosso XML traz pTotTribSN (percentual do
//     Simples): sai como "Simples Nacional: 6,00%".
// Decisão nossa: a linha "Endereço / E-mail" do PRESTADOR é suprimida (nota 1
// permite). O e-mail do cadastro da empresa na Receita não é o nosso.
// =============================================================================

import { atributo, bloco, valor } from './xml-leitura.ts';

export interface PessoaDanfse {
  documento: string;
  im: string;
  fone: string;
  nome: string;
  municipio: string;
  ibgeCep: string;
  endereco: string;
  email: string;
}

export interface ModeloDanfse {
  homologacao: boolean;
  cancelada: boolean;
  municipioCabecalho: string;
  ambienteGerador: string;
  tipoAmbiente: string;
  chave: string;
  qrUrl: string;
  numeroNfse: string;
  competencia: string;
  emissaoNfse: string;
  numeroDps: string;
  serieDps: string;
  emissaoDps: string;
  emitente: string;
  situacao: string;
  finalidade: string;
  prestador: PessoaDanfse & { simples: string; regimeSn: string };
  ocultarEnderecoPrestador: boolean;
  tomador: PessoaDanfse | null;
  servico: { codigo: string; nbs: string; local: string; descricaoCodigo: string; descricao: string };
  issqn: {
    tipo: string;
    incidencia: string;
    regimeEspecial: string;
    imunidade: string;
    suspensao: string;
    processo: string;
    bc: string;
    aliquota: string;
    retencao: string;
    apurado: string;
  };
  federal: { irrf: string; cp: string; cs: string; pis: string; cofins: string; descricaoCs: string };
  imprimirPisCofins: boolean;
  totais: {
    servico: string;
    descIncond: string;
    descCond: string;
    retencoes: string;
    liquido: string;
    ibsCbs: string;
    liquidoComIbsCbs: string;
  };
  informacoesComplementares: string;
}

export const URL_CONSULTA_PUBLICA = 'https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=';

const TRACO = '-';
const ou = (v: string | null | undefined) => (v && v.trim() ? v.trim() : TRACO);

const DESCRICOES = {
  ambGer: { '1': 'Prefeitura', '2': 'Sistema Nacional NFS-e' } as Record<string, string>,
  tpAmb: { '1': 'Produção', '2': 'Homologação' } as Record<string, string>,
  tpEmit: { '1': 'Prestador', '2': 'Tomador', '3': 'Intermediário' } as Record<string, string>,
  cStat: { '100': 'NFS-e Gerada', '102': 'NFS-e de Decisão Judicial', '103': 'NFS-e Avulsa', '107': 'NFS-e MEI' } as Record<string, string>,
  opSimpNac: {
    '1': 'Não Optante',
    '2': 'Optante - Microempreendedor Individual (MEI)',
    '3': 'Optante - Microempresa ou Empresa de Pequeno Porte (ME/EPP)',
  } as Record<string, string>,
  regApTribSN: {
    '1': 'Regime de apuração dos tributos federais e municipal pelo SN',
    '2': 'Regime de apuração dos tributos federais pelo SN e ISSQN por fora do SN conforme respectiva legislação municipal do tributo',
    '3': 'Regime de apuração dos tributos federais e municipal por fora do SN conforme respectivas legislações federal e municipal de cada tributo',
  } as Record<string, string>,
  tribISSQN: { '1': 'Operação Tributável', '2': 'Imunidade', '3': 'Exportação de serviço', '4': 'Não Incidência' } as Record<string, string>,
  tpRetISSQN: { '1': 'Não Retido', '2': 'Retido pelo Tomador', '3': 'Retido pelo Intermediário' } as Record<string, string>,
  regEspTrib: {
    '0': 'Nenhum',
    '1': 'Ato Cooperado (Cooperativa)',
    '2': 'Estimativa',
    '3': 'Microempresa Municipal',
    '4': 'Notário ou Registrador',
    '5': 'Profissional Autônomo',
    '6': 'Sociedade de Profissionais',
    '9': 'Outros',
  } as Record<string, string>,
};

/** Corta com reticências quando passa do limite da NT. */
export function caber(texto: string, max: number): string {
  return texto.length > max ? `${texto.slice(0, max - 3)}...` : texto;
}

export function documentoFormatado(tipo: 'CNPJ' | 'CPF' | 'NIF', v: string | null): string {
  if (!v) return TRACO;
  if (tipo === 'CNPJ' && /^\d{14}$/.test(v)) return v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (tipo === 'CPF' && /^\d{11}$/.test(v)) return v.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return v;
}

function cepFormatado(v: string | null): string {
  return v && /^\d{8}$/.test(v) ? `${v.slice(0, 2)}.${v.slice(2, 5)}-${v.slice(5)}` : ou(v);
}

/** "2026-10-16T14:56:24-03:00" → "16/10/2026 14:56:24" (hora local do próprio XML). */
export function dataHoraDoXml(v: string | null): string {
  const m = v ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2}:\d{2})/.exec(v) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}` : TRACO;
}

export function dataDoXml(v: string | null): string {
  const m = v ? /^(\d{4})-(\d{2})-(\d{2})/.exec(v) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]}` : TRACO;
}

/** "499.90" → "R$ 499,90". */
export function dinheiro(v: string | null): string {
  if (!v || !/^\d+(\.\d+)?$/.test(v)) return TRACO;
  const [int = '0', dec = ''] = v.split('.');
  const milhar = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `R$ ${milhar},${(dec + '00').slice(0, 2)}`;
}

function percentual(v: string | null): string {
  if (!v || !/^\d+(\.\d+)?$/.test(v)) return TRACO;
  return `${Number(v).toFixed(2).replace('.', ',')}%`;
}

function pessoa(xml: string | null, municipioNome: string | null): PessoaDanfse | null {
  if (!xml) return null;
  const tipo = valor(xml, 'CNPJ') ? 'CNPJ' : valor(xml, 'CPF') ? 'CPF' : 'NIF';
  const end = bloco(xml, 'end');
  const endNac = bloco(end, 'endNac');
  const cMun = valor(endNac, 'cMun');
  const cep = valor(endNac, 'CEP');
  const partes = [valor(end, 'xLgr'), valor(end, 'nro'), valor(end, 'xCpl'), valor(end, 'xBairro')].filter((p): p is string => !!p);
  return {
    documento: documentoFormatado(tipo, valor(xml, tipo)),
    im: ou(valor(xml, 'IM')),
    fone: ou(valor(xml, 'fone')),
    nome: caber(ou(valor(xml, 'xNome')), 80),
    municipio: caber(ou(municipioNome), 37),
    ibgeCep: cMun || cep ? `${ou(cMun)} / ${cepFormatado(cep)}` : TRACO,
    endereco: partes.length ? caber(partes.join(', '), 80) : TRACO,
    email: caber(ou(valor(xml, 'email')), 80),
  };
}

/**
 * @param xml  o XML da NFS-e (como a Sefin devolveu)
 * @param extras o que o XML não traz em texto: nome do município do tomador ("Cidade / UF")
 */
export function modeloDoDanfse(xml: string, extras: { cancelada?: boolean; municipioTomador?: string | null } = {}): ModeloDanfse {
  const inf = bloco(xml, 'infNFSe');
  if (!inf) throw new Error('XML sem infNFSe');
  const dps = bloco(inf, 'infDPS');
  const emit = bloco(inf, 'emit');
  const enderEmit = bloco(emit, 'enderNac');
  const prest = bloco(dps, 'prest');
  const toma = bloco(dps, 'toma');
  const serv = bloco(dps, 'serv');
  const cServ = bloco(serv, 'cServ');
  const valoresDps = bloco(dps, 'valores');
  const tribMun = bloco(valoresDps, 'tribMun');
  const tribFed = bloco(valoresDps, 'tribFed');
  const totTrib = bloco(valoresDps, 'totTrib');
  const valoresNfse = bloco(inf, 'valores'); // o primeiro "valores" de infNFSe é o da nota, antes da DPS

  const ufEmit = valor(enderEmit, 'UF');
  const cMunEmit = valor(enderEmit, 'cMun');
  const comUf = (nome: string | null, cMun: string | null, pais = false) => {
    if (!nome) return TRACO;
    const uf = cMun && cMun === cMunEmit && ufEmit ? ` / ${ufEmit}` : '';
    return `${nome}${uf}${pais ? ' / BR' : ''}`;
  };

  const chave = (atributo(xml, 'infNFSe', 'Id') ?? '').replace(/^NFS/, '');
  const tpAmb = valor(dps, 'tpAmb') ?? '';
  const cTribNac = valor(cServ, 'cTribNac');
  const cTribMun = valor(cServ, 'cTribMun');
  const nbs = valor(cServ, 'cNBS');

  const prestador = pessoa(prest, comUf(valor(inf, 'xLocEmi'), cMunEmit));
  // O prestador do XML da DPS só tem CNPJ e regime; nome, telefone e endereço vêm do emitente da NFS-e.
  const emitente = pessoa(emit, comUf(valor(inf, 'xLocEmi'), cMunEmit));
  const endEmit = [valor(enderEmit, 'xLgr'), valor(enderEmit, 'nro'), valor(enderEmit, 'xCpl'), valor(enderEmit, 'xBairro')].filter(
    (p): p is string => !!p,
  );
  const regTrib = bloco(prest, 'regTrib');

  const pTotSn = valor(totTrib, 'pTotTribSN');
  const vTot = bloco(totTrib, 'vTotTrib');
  const pTot = bloco(totTrib, 'pTotTrib');
  const totais = pTotSn
    ? `Simples Nacional: ${percentual(pTotSn)}`
    : vTot
      ? `Federais: ${dinheiro(valor(vTot, 'vTotTribFed'))} ; Estaduais: ${dinheiro(valor(vTot, 'vTotTribEst'))} ; Municipais: ${dinheiro(valor(vTot, 'vTotTribMun'))}`
      : pTot
        ? `Federais: ${percentual(valor(pTot, 'pTotTribFed'))} ; Estaduais: ${percentual(valor(pTot, 'pTotTribEst'))} ; Municipais: ${percentual(valor(pTot, 'pTotTribMun'))}`
        : TRACO;
  const complementares = [
    valor(serv, 'xInfComp') ? `Inf. Cont.: ${valor(serv, 'xInfComp')}` : null,
    valor(inf, 'xOutInf') ? `Inf. A. T. Mun.: ${valor(inf, 'xOutInf')}` : null,
  ].filter((p): p is string => !!p);
  const linhaTributos = `Totais Aproximados dos Tributos cfe. Lei nº 12.741/2012: ${totais}`;

  const competencia = valor(dps, 'dCompet');

  return {
    homologacao: tpAmb === '2',
    cancelada: !!extras.cancelada,
    municipioCabecalho: caber(comUf(valor(inf, 'xLocEmi'), cMunEmit), 37),
    ambienteGerador: `Ambiente Gerador: ${DESCRICOES.ambGer[valor(inf, 'ambGer') ?? ''] ?? TRACO}`,
    tipoAmbiente: `Tipo de Ambiente: ${DESCRICOES.tpAmb[tpAmb] ?? TRACO}`,
    chave: chave || TRACO,
    qrUrl: `${URL_CONSULTA_PUBLICA}${chave}`,
    numeroNfse: ou(valor(inf, 'nNFSe')),
    competencia: dataDoXml(competencia),
    emissaoNfse: dataHoraDoXml(valor(inf, 'dhProc')),
    numeroDps: ou(valor(dps, 'nDPS')),
    serieDps: ou(valor(dps, 'serie')),
    emissaoDps: dataHoraDoXml(valor(dps, 'dhEmi')),
    emitente: DESCRICOES.tpEmit[valor(dps, 'tpEmit') ?? ''] ?? TRACO,
    situacao: caber(DESCRICOES.cStat[valor(inf, 'cStat') ?? ''] ?? TRACO, 40),
    finalidade: ou(valor(dps, 'finNFSe')),
    prestador: {
      ...(prestador as PessoaDanfse),
      nome: emitente?.nome ?? TRACO,
      fone: emitente?.fone ?? TRACO,
      im: valor(emit, 'IM') ?? valor(prest, 'IM') ?? TRACO,
      ibgeCep: cMunEmit ? `${cMunEmit} / ${cepFormatado(valor(enderEmit, 'CEP'))}` : TRACO,
      endereco: endEmit.length ? caber(endEmit.join(', '), 80) : TRACO,
      email: emitente?.email ?? TRACO,
      simples: caber(DESCRICOES.opSimpNac[valor(regTrib, 'opSimpNac') ?? ''] ?? TRACO, 40),
      regimeSn: caber(DESCRICOES.regApTribSN[valor(regTrib, 'regApTribSN') ?? ''] ?? TRACO, 80),
    },
    ocultarEnderecoPrestador: true,
    tomador: pessoa(toma, extras.municipioTomador ?? null),
    servico: {
      codigo: cTribNac && /^\d{6}$/.test(cTribNac)
        ? `${cTribNac.slice(0, 2)}.${cTribNac.slice(2, 4)}.${cTribNac.slice(4)}${cTribMun ? ` / ${cTribMun}` : ''}`
        : TRACO,
      nbs: nbs && /^\d{9}$/.test(nbs) ? `${nbs[0]}.${nbs.slice(1, 5)}.${nbs.slice(5, 7)}.${nbs.slice(7)}` : TRACO,
      local: caber(comUf(valor(inf, 'xLocPrestacao'), valor(serv, 'cLocPrestacao'), true), 42),
      descricaoCodigo: caber(valor(inf, 'xTribMun') || valor(inf, 'xTribNac') || TRACO, 170),
      descricao: caber(ou(valor(cServ, 'xDescServ')), 1300),
    },
    issqn: {
      tipo: DESCRICOES.tribISSQN[valor(tribMun, 'tribISSQN') ?? ''] ?? TRACO,
      incidencia: caber(comUf(valor(inf, 'xLocIncid'), valor(inf, 'cLocIncid'), true), 42),
      regimeEspecial: DESCRICOES.regEspTrib[valor(regTrib, 'regEspTrib') ?? ''] ?? TRACO,
      imunidade: ou(valor(tribMun, 'tpImunidade')),
      suspensao: ou(valor(bloco(tribMun, 'exigSusp'), 'tpSusp')),
      processo: ou(valor(bloco(tribMun, 'exigSusp'), 'nProcesso')),
      bc: dinheiro(valor(valoresNfse, 'vBC')),
      aliquota: percentual(valor(valoresNfse, 'pAliqAplic')),
      retencao: DESCRICOES.tpRetISSQN[valor(tribMun, 'tpRetISSQN') ?? ''] ?? TRACO,
      apurado: dinheiro(valor(valoresNfse, 'vISSQN')),
    },
    federal: {
      irrf: dinheiro(valor(tribFed, 'vRetIRRF')),
      cp: dinheiro(valor(tribFed, 'vRetCP')),
      cs: dinheiro(valor(tribFed, 'vRetCSLL')),
      pis: dinheiro(valor(bloco(tribFed, 'piscofins'), 'vPis')),
      cofins: dinheiro(valor(bloco(tribFed, 'piscofins'), 'vCofins')),
      descricaoCs: ou(valor(bloco(tribFed, 'piscofins'), 'tpRetPisCofins')),
    },
    // Nota 6: a linha de PIS/COFINS sai para competência até o fim de 2026.
    imprimirPisCofins: !competencia || competencia <= '2026-12-31',
    totais: {
      servico: dinheiro(valor(bloco(valoresDps, 'vServPrest'), 'vServ')),
      descIncond: dinheiro(valor(bloco(valoresDps, 'vDescCondIncond'), 'vDescIncond')),
      descCond: dinheiro(valor(bloco(valoresDps, 'vDescCondIncond'), 'vDescCond')),
      retencoes: dinheiro(valor(valoresNfse, 'vTotalRet')),
      liquido: dinheiro(valor(valoresNfse, 'vLiq')),
      ibsCbs: TRACO,
      liquidoComIbsCbs: dinheiro(valor(bloco(inf, 'totCIBS'), 'vTotNF')),
    },
    informacoesComplementares: caber([...complementares, linhaTributos].join(' | '), 2000),
  };
}
