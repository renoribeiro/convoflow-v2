// =============================================================================
// NFS-e Nacional — constantes fixas da emissão (nota fiscal, parte 2)
// =============================================================================
// A função api/nfse.js só fala com estes endereços. Não é um assinador
// genérico: o ambiente vem de NFSE_AMBIENTE (variável da Vercel) e escolhe a
// linha abaixo; nenhum endereço vem do pedido.
//
// Fontes: docs/RUNBOOK_nfse_nacional.md (endereços conferidos com o
// certificado em 2026-10-16) e o XSD v1.01 da NFS-e Nacional.
// =============================================================================

/** @typedef {'restrita' | 'producao'} Ambiente */

export const AMBIENTES = Object.freeze({
  restrita: Object.freeze({
    tpAmb: '2',
    sefin: 'https://sefin.producaorestrita.nfse.gov.br/SefinNacional',
    adn: 'https://adn.producaorestrita.nfse.gov.br',
  }),
  producao: Object.freeze({
    tpAmb: '1',
    sefin: 'https://sefin.nfse.gov.br/SefinNacional',
    adn: 'https://adn.nfse.gov.br',
  }),
});

/** Fortaleza (IBGE). Local de emissão e de prestação. */
export const MUNICIPIO_EMISSOR = '2304400';

/**
 * Item 1.05 da LC 116 e NBS 1.1103.22.00. Fortaleza só administra o item pelo
 * desdobramento municipal: sem cTribMun a Sefin recusa com E0312 (testado em
 * 2026-10-16 na produção restrita). Os dois desdobramentos têm alíquota de 5%:
 *   001 = "Licenciamento de programas de computador customizaveis"
 *   002 = "Licenciamento de programas de informatica nao-customizaveis"
 * O ConvoFlow é o mesmo software para todo cliente: 002.
 */
export const SERVICO = Object.freeze({
  cTribNac: '010501',
  cTribMun: '002',
  cNBS: '111032200',
  codigoMunicipalAliquota: '01.05.01.002',
});

/** Série da DPS reservada para o sistema (decisão do dono). */
export const SERIE = '00001';

/** Simples Nacional ME/EPP, tributos pelo SN, sem regime especial. */
export const REGIME = Object.freeze({ opSimpNac: '3', regApTribSN: '1', regEspTrib: '0' });

export const NAMESPACE = 'http://www.sped.fazenda.gov.br/nfse';
export const VERSAO_LEIAUTE = '1.01';
export const VER_APLIC = 'ConvoFlow 1.0';

/** Cancelamento por reembolso total: "2 - Serviço não prestado". */
export const CANCELAMENTO = Object.freeze({
  codigoEvento: '101101',
  xDesc: 'Cancelamento de NFS-e',
  cMotivo: '2',
  xMotivo: 'Serviço não prestado: assinatura reembolsada integralmente ao cliente.',
});

export function ambienteValido(valor) {
  return valor === 'restrita' || valor === 'producao';
}
