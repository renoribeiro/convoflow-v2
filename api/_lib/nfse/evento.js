// Pedido de registro do evento de cancelamento (e101101), leiaute v1.01.
// Id = "PRE" + chave de acesso (50) + código do evento (6) = 59 caracteres.

import { AMBIENTES, CANCELAMENTO, NAMESPACE, VERSAO_LEIAUTE, VER_APLIC } from './constantes.js';
import { dataHoraFortaleza, digitos, el } from './xml.js';
import { ErroPedido } from './dps.js';

const RE_CHAVE = /^\d{50}$/;

export function idDoPedidoDeEvento(chave, codigoEvento = CANCELAMENTO.codigoEvento) {
  if (!RE_CHAVE.test(chave)) throw new ErroPedido('chave', '50 algarismos');
  return `PRE${chave}${codigoEvento}`;
}

/**
 * @param {{ chave: string }} pedido
 * @param {{ ambiente: 'restrita'|'producao', cnpjPrestador: string, agora: Date }} ctx
 * @returns {{ idEvento: string, xml: string }}
 */
export function montarPedidoCancelamento(pedido, ctx) {
  const amb = AMBIENTES[ctx.ambiente];
  if (!amb) throw new ErroPedido('ambiente', 'restrita ou producao');
  const chave = String(pedido?.chave ?? '');
  const idEvento = idDoPedidoDeEvento(chave);
  const xml =
    `<pedRegEvento xmlns="${NAMESPACE}" versao="${VERSAO_LEIAUTE}">` +
    `<infPedReg Id="${idEvento}">` +
    el('tpAmb', amb.tpAmb) +
    el('verAplic', VER_APLIC) +
    el('dhEvento', dataHoraFortaleza(new Date(ctx.agora.getTime() - 30_000))) +
    el('CNPJAutor', digitos(ctx.cnpjPrestador)) +
    el('chNFSe', chave) +
    `<e${CANCELAMENTO.codigoEvento}>` +
    el('xDesc', CANCELAMENTO.xDesc) +
    el('cMotivo', CANCELAMENTO.cMotivo) +
    el('xMotivo', CANCELAMENTO.xMotivo) +
    `</e${CANCELAMENTO.codigoEvento}>` +
    '</infPedReg>' +
    '</pedRegEvento>';
  return { idEvento, xml };
}
