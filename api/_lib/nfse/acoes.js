// =============================================================================
// As ações da função api/nfse.js (Sefin Nacional e ADN, endereços fixos)
// =============================================================================
// Recebe o I/O por parâmetro (cliente HTTP, certificado, relógio) para o
// Vitest simular a Sefin sem rede.
//
// Toda resposta de negócio sai com `resultado`:
//   emitida | encontrada | cancelada | ok       — deu certo
//   rejeitada                                   — a Sefin recusou (erros[] com código)
//   nao_encontrada                              — a DPS não virou nota
//   incerta                                     — timeout, 5xx ou resposta estranha:
//                                                 quem chamou NÃO sabe se a nota existe e
//                                                 tem de consultar a DPS antes de reenviar.
// =============================================================================

import { AMBIENTES, MUNICIPIO_EMISSOR, SERVICO } from './constantes.js';
import { assinar } from './assinatura.js';
import { ErroPedido, idDaDps, montarDps, validarPedidoEmissao } from './dps.js';
import { montarPedidoCancelamento } from './evento.js';
import { ErroDeRede, gunzipBase64, gzipBase64 } from './sefin.js';

export const ACOES = ['emitir', 'consultar_dps', 'consultar_nfse', 'cancelar', 'parametros', 'certificado'];

const RE_CHAVE = /^\d{50}$/;

/** Os erros da Sefin vêm em `erros[]` (emissão), `erro` objeto (consultas) ou `erro[]` (eventos). */
export function errosDaResposta(json) {
  const bruto = json?.erros ?? json?.erro ?? [];
  const lista = Array.isArray(bruto) ? bruto : [bruto];
  return lista.map((e) => ({
    codigo: String(e?.codigo ?? e?.Codigo ?? ''),
    descricao: String(e?.descricao ?? e?.Descricao ?? '').slice(0, 500),
    complemento: e?.complemento ? String(e.complemento).slice(0, 500) : undefined,
  }));
}

/** O arquivoXml da consulta de eventos: gzip+base64, ou só base64. */
function xmlDoArquivo(b64) {
  try {
    return gunzipBase64(b64);
  } catch {
    return Buffer.from(String(b64), 'base64').toString('utf8');
  }
}

function incerta(detalhe) {
  return { resultado: 'incerta', detalhe: String(detalhe).slice(0, 300) };
}

/** Chama e transforma falha de rede em `incerta`. */
async function chamar(http, metodo, url, corpo) {
  try {
    return { r: await http(metodo, url, corpo) };
  } catch (e) {
    if (e instanceof ErroDeRede) return { falha: incerta(`${e.motivo}: ${e.message}`) };
    throw e;
  }
}

async function buscarNfse(deps, base, chave) {
  const { r, falha } = await chamar(deps.http, 'GET', `${base}/nfse/${chave}`);
  if (falha) return falha;
  if (r.status === 200 && r.json?.nfseXmlGZipB64) {
    return { resultado: 'encontrada', chaveAcesso: chave, nfseXml: gunzipBase64(r.json.nfseXmlGZipB64) };
  }
  if (r.status === 404) return { resultado: 'nao_encontrada', erros: errosDaResposta(r.json) };
  return incerta(`GET /nfse respondeu ${r.status}`);
}

/**
 * @param {{ acao: string, [k: string]: any }} pedido
 * @param {{ ambiente: 'restrita'|'producao', cert: { keyPem: string, certPem: string, cnpj: string, validoAte: Date },
 *           http: Function, agora: () => Date, c14n?: 'inclusiva'|'exclusiva', imPrestador?: string, cTribMun?: string }} deps
 */
export async function executarAcao(pedido, deps) {
  const amb = AMBIENTES[deps.ambiente];
  const base = amb.sefin;
  const acao = pedido?.acao;

  if (acao === 'certificado') {
    const ate = deps.cert.validoAte;
    return {
      resultado: 'ok',
      validoAte: ate.toISOString(),
      diasRestantes: Math.floor((ate.getTime() - deps.agora().getTime()) / 86_400_000),
    };
  }

  if (acao === 'parametros') {
    const conv = await chamar(deps.http, 'GET', `${amb.adn}/parametrizacao/${MUNICIPIO_EMISSOR}/convenio`);
    if (conv.falha) return conv.falha;
    if (conv.r.status !== 200 || !conv.r.json?.parametrosConvenio) return incerta(`convenio respondeu ${conv.r.status}`);
    const p = conv.r.json.parametrosConvenio;
    const aliq = await chamar(deps.http, 'GET', `${amb.adn}/parametrizacao/${MUNICIPIO_EMISSOR}/${SERVICO.codigoMunicipalAliquota}/historicoaliquotas`);
    let aliquota = null;
    if (!aliq.falha && aliq.r.status === 200) {
      const hist = aliq.r.json?.aliquotas?.[SERVICO.codigoMunicipalAliquota];
      const vigente = Array.isArray(hist) ? hist.find((h) => !h.DtFim) ?? hist[hist.length - 1] : null;
      aliquota = vigente ? Number(vigente.Aliq) : null;
    }
    return {
      resultado: 'ok',
      aderenteEmissorNacional: Number(p.aderenteEmissorNacional) === 1,
      aderenteAmbienteNacional: Number(p.aderenteAmbienteNacional) === 1,
      aliquota,
    };
  }

  if (acao === 'emitir') {
    const p = validarPedidoEmissao(pedido);
    const { idDps, xml } = montarDps(p, { ambiente: deps.ambiente, cnpjPrestador: deps.cert.cnpj, imPrestador: deps.imPrestador, cTribMun: deps.cTribMun, agora: deps.agora() });
    const assinado = assinar(xml, { tag: 'infDPS', id: idDps, keyPem: deps.cert.keyPem, certPem: deps.cert.certPem, c14n: deps.c14n });
    const envio = `<?xml version="1.0" encoding="UTF-8"?>${assinado}`;
    const { r, falha } = await chamar(deps.http, 'POST', `${base}/nfse`, { dpsXmlGZipB64: gzipBase64(envio) });
    if (falha) return { ...falha, idDps };
    if ((r.status === 200 || r.status === 201) && r.json?.nfseXmlGZipB64 && r.json?.chaveAcesso) {
      return {
        resultado: 'emitida',
        idDps,
        chaveAcesso: String(r.json.chaveAcesso),
        nfseXml: gunzipBase64(r.json.nfseXmlGZipB64),
        alertas: errosDaResposta({ erros: r.json.alertas ?? [] }),
      };
    }
    if (r.status === 400 || r.status === 422) {
      const erros = errosDaResposta(r.json);
      if (erros.length) return { resultado: 'rejeitada', idDps, erros };
    }
    return { ...incerta(`POST /nfse respondeu ${r.status}`), idDps };
  }

  if (acao === 'consultar_dps') {
    if (!Number.isSafeInteger(pedido.numero) || pedido.numero < 1) throw new ErroPedido('numero', 'inteiro positivo');
    const idDps = idDaDps(deps.cert.cnpj, pedido.numero);
    const { r, falha } = await chamar(deps.http, 'GET', `${base}/dps/${idDps}`);
    if (falha) return { ...falha, idDps };
    if (r.status === 200 && RE_CHAVE.test(String(r.json?.chaveAcesso ?? ''))) {
      return { ...(await buscarNfse(deps, base, String(r.json.chaveAcesso))), idDps };
    }
    if (r.status === 404) return { resultado: 'nao_encontrada', idDps, erros: errosDaResposta(r.json) };
    return { ...incerta(`GET /dps respondeu ${r.status}`), idDps };
  }

  if (acao === 'consultar_nfse') {
    const chave = String(pedido.chave ?? '');
    if (!RE_CHAVE.test(chave)) throw new ErroPedido('chave', '50 algarismos');
    return buscarNfse(deps, base, chave);
  }

  if (acao === 'cancelar') {
    const { idEvento, xml } = montarPedidoCancelamento({ chave: pedido.chave }, { ambiente: deps.ambiente, cnpjPrestador: deps.cert.cnpj, agora: deps.agora() });
    const assinado = assinar(xml, { tag: 'infPedReg', id: idEvento, keyPem: deps.cert.keyPem, certPem: deps.cert.certPem, c14n: deps.c14n });
    const envio = `<?xml version="1.0" encoding="UTF-8"?>${assinado}`;
    const { r, falha } = await chamar(deps.http, 'POST', `${base}/nfse/${pedido.chave}/eventos`, { pedidoRegistroEventoXmlGZipB64: gzipBase64(envio) });
    if (falha) return falha;
    if ((r.status === 200 || r.status === 201) && r.json?.eventoXmlGZipB64) {
      return { resultado: 'cancelada', eventoXml: gunzipBase64(r.json.eventoXmlGZipB64) };
    }
    const erros = errosDaResposta(r.json);
    // E0840 = a nota já tem o cancelamento. Repetir não é erro: devolve o evento que existe.
    if (erros.some((e) => e.codigo === 'E0840')) {
      const ev = await chamar(deps.http, 'GET', `${base}/nfse/${pedido.chave}/eventos/101101/1`);
      const arquivo = ev.r?.status === 200 ? ev.r.json?.eventos?.[0]?.arquivoXml : null;
      if (arquivo) return { resultado: 'cancelada', jaEstava: true, eventoXml: xmlDoArquivo(arquivo) };
      return { resultado: 'cancelada', jaEstava: true, eventoXml: null };
    }
    if (r.status >= 400 && r.status < 500 && erros.length) return { resultado: 'rejeitada', erros };
    return incerta(`POST /eventos respondeu ${r.status}`);
  }

  throw new ErroPedido('acao', `uma de ${ACOES.join(', ')}`);
}
