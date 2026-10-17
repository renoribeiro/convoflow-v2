// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- motivo nas duas linhas abaixo
// @ts-nocheck: testa o JavaScript da função da Vercel (api/, sem declarações de tipo) e usa o
// node-forge, que não publica tipos. O comportamento é o que estes testes conferem.
/**
 * Nota fiscal, parte 2 — a função da Vercel (api/nfse.js e api/_lib/nfse):
 * DPS na ordem do XSD, assinatura, certificado (formato antigo, 3DES), HMAC
 * (janela, repetição, assinatura errada), respostas da Sefin (E0014, E0840,
 * timeout) e o atendimento inteiro. Certificado e CNPJ inventados.
 */
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import forge from 'node-forge';
import { DOMParser } from '@xmldom/xmldom';
import { SignedXml } from 'xml-crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { idDaDps, montarDps, validarPedidoEmissao, ErroPedido } from '../../../api/_lib/nfse/dps.js';
import { montarPedidoCancelamento } from '../../../api/_lib/nfse/evento.js';
import { assinar, C14N } from '../../../api/_lib/nfse/assinatura.js';
import { carregarCertificado } from '../../../api/_lib/nfse/certificado.js';
import { assinaturaHmac, criarMemoriaDeNonces, verificarPedido } from '../../../api/_lib/nfse/hmac.js';
import { executarAcao, errosDaResposta } from '../../../api/_lib/nfse/acoes.js';
import { ErroDeRede } from '../../../api/_lib/nfse/sefin.js';
import { atender } from '../../../api/nfse.js';
import { cabecalhosAssinados } from '../../../supabase/functions/_shared/nfse/hmac.ts';

const CNPJ = '11222333000181';
const AGORA = new Date('2026-10-16T15:00:00Z');
let PFX_B64 = '';
let cert: ReturnType<typeof carregarCertificado>;

function certificadoFicticio() {
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const chave = forge.pki.privateKeyFromPem(privateKey.export({ type: 'pkcs1', format: 'pem' }).toString());
  const c = forge.pki.createCertificate();
  c.publicKey = forge.pki.setRsaPublicKey(chave.n, chave.e);
  c.serialNumber = '01';
  c.validity.notBefore = new Date('2026-01-01T00:00:00Z');
  c.validity.notAfter = new Date('2027-01-01T00:00:00Z');
  const nome = [{ name: 'commonName', value: `EMPRESA FICTICIA LTDA:${CNPJ}` }, { name: 'organizationName', value: 'TESTE' }];
  c.setSubject(nome);
  c.setIssuer(nome);
  c.sign(chave, forge.md.sha256.create());
  // 3DES: o formato antigo que o OpenSSL 3 do Node recusa e o node-forge lê.
  const p12 = forge.pkcs12.toPkcs12Asn1(chave, [c], 'senha-ficticia', { algorithm: '3des' });
  return forge.util.encode64(forge.asn1.toDer(p12).getBytes());
}

beforeAll(() => {
  PFX_B64 = certificadoFicticio();
  cert = carregarCertificado(PFX_B64, 'senha-ficticia');
});

const TOMADOR = {
  tipo: 'cpf',
  documento: '111.444.777-35',
  nome: 'Cliente <&> Inventado',
  email: 'cliente@example.com',
  endereco: { cMun: '2304400', cep: '60060-170', logradouro: 'Rua de Teste', numero: '', complemento: '', bairro: 'Centro' },
};
const PEDIDO = { numero: 42, competencia: '2026-10-16', valorCentavos: 49990, descricao: 'Licença de uso & teste', pTotTribSN: '6.00', tomador: TOMADOR };

function tags(xml: string, de: string, ate: string): string[] {
  const corpo = xml.slice(xml.indexOf(`<${de}`), xml.indexOf(`</${ate}>`));
  return [...corpo.matchAll(/<([A-Za-z]\w*)[\s>]/g)].map((m) => m[1]);
}

describe('DPS (leiaute v1.01)', () => {
  it('Id tem 45 caracteres: DPS + município + 2 + CNPJ + série + número', () => {
    expect(idDaDps(CNPJ, 42)).toBe(`DPS23044002${CNPJ}00001000000000000042`);
    expect(idDaDps(CNPJ, 42)).toHaveLength(45);
    expect(() => idDaDps(CNPJ, 0)).toThrow(ErroPedido);
  });

  it('campos na ordem do XSD, com 010501/002, NBS, pTotTribSN e sem indTotTrib nem IBSCBS', () => {
    const { xml, idDps } = montarDps(validarPedidoEmissao(PEDIDO), { ambiente: 'restrita', cnpjPrestador: CNPJ, agora: AGORA });
    expect(idDps).toBe(idDaDps(CNPJ, 42));
    expect(tags(xml, 'infDPS', 'infDPS')).toEqual([
      'infDPS', 'tpAmb', 'dhEmi', 'verAplic', 'serie', 'nDPS', 'dCompet', 'tpEmit', 'cLocEmi',
      'prest', 'CNPJ', 'regTrib', 'opSimpNac', 'regApTribSN', 'regEspTrib',
      'toma', 'CPF', 'xNome', 'end', 'endNac', 'cMun', 'CEP', 'xLgr', 'nro', 'xBairro', 'email',
      'serv', 'locPrest', 'cLocPrestacao', 'cServ', 'cTribNac', 'cTribMun', 'xDescServ', 'cNBS',
      'valores', 'vServPrest', 'vServ', 'trib', 'tribMun', 'tribISSQN', 'tpRetISSQN', 'totTrib', 'pTotTribSN',
    ]);
    expect(xml).toContain('<tpAmb>2</tpAmb>');
    expect(xml).toContain('<dhEmi>2026-10-16T11:59:30-03:00</dhEmi>');
    expect(xml).toContain('<cTribNac>010501</cTribNac><cTribMun>002</cTribMun>');
    expect(xml).toContain('<cNBS>111032200</cNBS>');
    expect(xml).toContain('<opSimpNac>3</opSimpNac><regApTribSN>1</regApTribSN><regEspTrib>0</regEspTrib>');
    expect(xml).toContain('<vServ>499.90</vServ>');
    expect(xml).toContain('<pTotTribSN>6.00</pTotTribSN>');
    expect(xml).toContain('<CEP>60060170</CEP>');
    expect(xml).toContain('<nro>S/N</nro>');
    expect(xml).toContain('<xNome>Cliente &lt;&amp;&gt; Inventado</xNome>');
    expect(xml).not.toContain('indTotTrib');
    expect(xml).not.toContain('IBSCBS');
    expect(xml).not.toContain('<IM>');
  });

  it('produção usa tpAmb 1; competência futura vira a data de hoje', () => {
    const { xml } = montarDps(validarPedidoEmissao({ ...PEDIDO, competencia: '2026-12-01' }), { ambiente: 'producao', cnpjPrestador: CNPJ, agora: AGORA });
    expect(xml).toContain('<tpAmb>1</tpAmb>');
    expect(xml).toContain('<dCompet>2026-10-16</dCompet>');
  });

  it('recusa pedido com dado errado, dizendo o campo', () => {
    const erro = (p: object) => {
      try {
        validarPedidoEmissao(p);
      } catch (e) {
        return (e as ErroPedido).campo;
      }
      return null;
    };
    expect(erro({ ...PEDIDO, valorCentavos: 0 })).toBe('valorCentavos');
    expect(erro({ ...PEDIDO, pTotTribSN: '6' + '.0' })).toBe('pTotTribSN');
    expect(erro({ ...PEDIDO, tomador: { ...TOMADOR, documento: '123' } })).toBe('tomador.documento');
    expect(erro({ ...PEDIDO, tomador: { ...TOMADOR, endereco: { ...TOMADOR.endereco, cep: '6006017' } } })).toBe('tomador.endereco.cep');
    expect(erro({ ...PEDIDO, descricao: '   ' })).toBe('descricao');
  });

  it('evento de cancelamento: Id PRE + chave + 101101 (59), motivo 2', () => {
    const chave = '2'.repeat(50);
    const { idEvento, xml } = montarPedidoCancelamento({ chave }, { ambiente: 'restrita', cnpjPrestador: CNPJ, agora: AGORA });
    expect(idEvento).toBe(`PRE${chave}101101`);
    expect(idEvento).toHaveLength(59);
    expect(xml).toContain('<e101101><xDesc>Cancelamento de NFS-e</xDesc><cMotivo>2</cMotivo><xMotivo>Serviço não prestado');
    expect(() => montarPedidoCancelamento({ chave: '123' }, { ambiente: 'restrita', cnpjPrestador: CNPJ, agora: AGORA })).toThrow(ErroPedido);
  });
});

describe('certificado e assinatura', () => {
  it('lê o .pfx antigo (3DES) e acha o CNPJ do titular', () => {
    expect(cert.cnpj).toBe(CNPJ);
    expect(cert.validoAte.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(cert.keyPem).toContain('PRIVATE KEY');
    expect(() => carregarCertificado(PFX_B64, 'senha-errada')).toThrow();
  });

  /** true só quando a assinatura confere (o xml-crypto ora devolve false, ora lança). */
  function confere(xml: string): boolean {
    try {
      const doc = new DOMParser().parseFromString(xml, 'text/xml');
      const v = new SignedXml({ publicCert: cert.certPem, getCertFromKeyInfo: () => null });
      v.loadSignature(doc.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'Signature')[0]);
      return v.checkSignature(xml);
    } catch {
      return false;
    }
  }

  it('assina a DPS (RSA-SHA256, c14n inclusiva) e a assinatura confere; alterar um campo quebra', () => {
    const { xml, idDps } = montarDps(validarPedidoEmissao(PEDIDO), { ambiente: 'restrita', cnpjPrestador: CNPJ, agora: AGORA });
    const assinado = assinar(xml, { tag: 'infDPS', id: idDps, keyPem: cert.keyPem, certPem: cert.certPem });
    expect(assinado).toContain(`<Reference URI="#${idDps}">`);
    expect(assinado).toContain(`Algorithm="${C14N.inclusiva}"`);
    expect(assinado).toContain('xmldsig-more#rsa-sha256');
    expect(assinado).not.toContain('ds:Signature');
    expect(assinado.indexOf('</infDPS><Signature')).toBeGreaterThan(0);
    expect(confere(assinado)).toBe(true);
    expect(confere(assinado.replace('<vServ>499.90<', '<vServ>1.00<'))).toBe(false);
  });

  it('a c14n exclusiva fica atrás da chave', () => {
    const { xml, idEvento } = montarPedidoCancelamento({ chave: '3'.repeat(50) }, { ambiente: 'restrita', cnpjPrestador: CNPJ, agora: AGORA });
    const assinado = assinar(xml, { tag: 'infPedReg', id: idEvento, keyPem: cert.keyPem, certPem: cert.certPem, c14n: 'exclusiva' });
    expect(assinado).toContain(`Algorithm="${C14N.exclusiva}"`);
    expect(confere(assinado)).toBe(true);
  });
});

describe('HMAC dos pedidos', () => {
  const segredo = 'a'.repeat(40);
  const corpo = '{"acao":"certificado","ambiente":"restrita"}';
  const nonce = 'b'.repeat(32);
  const ts = String(Math.floor(AGORA.getTime() / 1000));
  const base = () => ({ segredo, ts, nonce, assinatura: assinaturaHmac(segredo, ts, nonce, corpo), corpo, agoraS: Number(ts), nonces: criarMemoriaDeNonces() });

  it('aceita o pedido certo uma vez e recusa a repetição', () => {
    const b = base();
    expect(verificarPedido(b)).toEqual({ ok: true });
    expect(verificarPedido(b)).toEqual({ ok: false, motivo: 'repetido' });
  });

  it('recusa segredo errado, corpo alterado, fora da janela, sem cabeçalho e segredo curto', () => {
    expect(verificarPedido({ ...base(), assinatura: assinaturaHmac('c'.repeat(40), ts, nonce, corpo) }).motivo).toBe('assinatura_nao_confere');
    expect(verificarPedido({ ...base(), corpo: corpo.replace('restrita', 'producao') }).motivo).toBe('assinatura_nao_confere');
    expect(verificarPedido({ ...base(), agoraS: Number(ts) + 121 }).motivo).toBe('fora_da_janela');
    expect(verificarPedido({ ...base(), agoraS: Number(ts) - 121 }).motivo).toBe('fora_da_janela');
    expect(verificarPedido({ ...base(), nonce: '' }).motivo).toBe('sem_credencial');
    expect(verificarPedido({ ...base(), segredo: 'curto' }).motivo).toBe('segredo_nao_configurado');
  });

  it('o lado do Supabase (WebCrypto) assina igual ao que a Vercel confere', async () => {
    const h = await cabecalhosAssinados(segredo, corpo, AGORA, nonce);
    expect(h['x-nfse-ts']).toBe(ts);
    expect(h['x-nfse-assinatura']).toBe(assinaturaHmac(segredo, ts, nonce, corpo));
  });
});

describe('ações contra a Sefin (HTTP simulado)', () => {
  const gz = (s: string) => zlib.gzipSync(Buffer.from(s)).toString('base64');
  const deps = (http: (m: string, u: string, c?: unknown) => Promise<unknown>) => ({
    ambiente: 'restrita' as const,
    cert,
    http,
    agora: () => AGORA,
  });

  it('emitida: devolve chave e o XML aberto; manda a DPS assinada em gzip+base64 para o endereço fixo', async () => {
    let enviado: { url?: string; corpo?: { dpsXmlGZipB64: string } } = {};
    const r = await executarAcao({ acao: 'emitir', ...PEDIDO }, deps(async (_m, url, corpo) => {
      enviado = { url, corpo: corpo as { dpsXmlGZipB64: string } };
      return { status: 201, json: { chaveAcesso: '9'.repeat(50), nfseXmlGZipB64: gz('<NFSe/>'), alertas: [] } };
    }));
    expect(r).toMatchObject({ resultado: 'emitida', chaveAcesso: '9'.repeat(50), nfseXml: '<NFSe/>', idDps: idDaDps(CNPJ, 42) });
    expect(enviado.url).toBe('https://sefin.producaorestrita.nfse.gov.br/SefinNacional/nfse');
    const dps = zlib.gunzipSync(Buffer.from(enviado.corpo!.dpsXmlGZipB64, 'base64')).toString();
    expect(dps.startsWith('<?xml version="1.0" encoding="UTF-8"?><DPS')).toBe(true);
    expect(dps).toContain('<Signature');
  });

  it('E0014 volta como rejeitada com o código; timeout e 5xx voltam como incerta', async () => {
    const e0014 = await executarAcao({ acao: 'emitir', ...PEDIDO }, deps(async () => ({ status: 400, json: { erros: [{ codigo: 'E0014', descricao: 'já existe' }] } })));
    expect(e0014).toMatchObject({ resultado: 'rejeitada', erros: [{ codigo: 'E0014' }] });
    const timeout = await executarAcao({ acao: 'emitir', ...PEDIDO }, deps(async () => { throw new ErroDeRede('timeout', '25000 ms'); }));
    expect(timeout).toMatchObject({ resultado: 'incerta', idDps: idDaDps(CNPJ, 42) });
    const cinco = await executarAcao({ acao: 'emitir', ...PEDIDO }, deps(async () => ({ status: 502, json: null })));
    expect(cinco.resultado).toBe('incerta');
  });

  it('consulta a DPS: achou (traz a nota) ou não achou (E2404)', async () => {
    const achou = await executarAcao({ acao: 'consultar_dps', numero: 42 }, deps(async (_m, url) =>
      String(url).includes('/dps/')
        ? { status: 200, json: { chaveAcesso: '8'.repeat(50) } }
        : { status: 200, json: { nfseXmlGZipB64: gz('<NFSe>x</NFSe>') } }));
    expect(achou).toMatchObject({ resultado: 'encontrada', chaveAcesso: '8'.repeat(50), nfseXml: '<NFSe>x</NFSe>' });
    const nao = await executarAcao({ acao: 'consultar_dps', numero: 42 }, deps(async () => ({ status: 404, json: { erro: { codigo: 'E2404', descricao: 'não gerada' } } })));
    expect(nao).toMatchObject({ resultado: 'nao_encontrada', erros: [{ codigo: 'E2404' }] });
  });

  it('cancelar de novo (E0840, erro em lista) devolve cancelada com o evento que já existe', async () => {
    const r = await executarAcao({ acao: 'cancelar', chave: '7'.repeat(50) }, deps(async (m) =>
      m === 'POST'
        ? { status: 400, json: { erro: [{ codigo: 'E0840', descricao: 'já cancelada' }] } }
        : { status: 200, json: { eventos: [{ arquivoXml: gz('<evento/>') }] } }));
    expect(r).toEqual({ resultado: 'cancelada', jaEstava: true, eventoXml: '<evento/>' });
    expect(errosDaResposta({ erro: { codigo: 'E2404', descricao: 'x' } })[0].codigo).toBe('E2404');
  });

  it('parâmetros de Fortaleza: convênio e alíquota do 01.05.01.002', async () => {
    const r = await executarAcao({ acao: 'parametros' }, deps(async (_m, url) =>
      String(url).endsWith('/convenio')
        ? { status: 200, json: { parametrosConvenio: { aderenteEmissorNacional: 0, aderenteAmbienteNacional: 1 } } }
        : { status: 200, json: { aliquotas: { '01.05.01.002': [{ Aliq: 5, DtFim: null }] } } }));
    expect(r).toEqual({ resultado: 'ok', aderenteEmissorNacional: false, aderenteAmbienteNacional: true, aliquota: 5 });
  });
});

describe('Fortaleza em produção, lida no ambiente de teste', () => {
  it('parametros_producao só faz GET no ADN de PRODUÇÃO, mesmo com a função na restrita', async () => {
    const urls: string[] = [];
    const r = await executarAcao({ acao: 'parametros_producao' }, {
      ambiente: 'restrita',
      cert,
      agora: () => AGORA,
      http: async (metodo: string, url: string) => {
        urls.push(`${metodo} ${url}`);
        return String(url).endsWith('/convenio')
          ? { status: 200, json: { parametrosConvenio: { aderenteEmissorNacional: 1, aderenteAmbienteNacional: 1 } } }
          : { status: 404, json: null };
      },
    });
    expect(r).toEqual({ resultado: 'ok', aderenteEmissorNacional: true, aderenteAmbienteNacional: true, aliquota: null });
    expect(urls).toEqual([
      'GET https://adn.nfse.gov.br/parametrizacao/2304400/convenio',
      'GET https://adn.nfse.gov.br/parametrizacao/2304400/01.05.01.002/historicoaliquotas',
    ]);
  });
});

describe('atendimento (api/nfse.js)', () => {
  const segredo = 'd'.repeat(48);
  const env = () => ({ NFSE_HMAC_SECRET: segredo, NFSE_AMBIENTE: 'restrita', NFSE_CNPJ: CNPJ, NFSE_CERT_PFX_B64: PFX_B64, NFSE_CERT_SENHA: 'senha-ficticia' });
  async function pedir(corpoObj: object, opts: { env?: Record<string, string>; segredo?: string; nonce?: string } = {}) {
    const corpo = JSON.stringify(corpoObj);
    const h = await cabecalhosAssinados(opts.segredo ?? segredo, corpo, AGORA, opts.nonce);
    const res = await atender(new Request('https://local/api/nfse', { method: 'POST', body: corpo, headers: h }), opts.env ?? env(), () => AGORA);
    return { status: res.status, body: await res.json() };
  }

  it('responde a validade do certificado a quem assina certo', async () => {
    const r = await pedir({ acao: 'certificado', ambiente: 'restrita' });
    expect(r).toEqual({ status: 200, body: { resultado: 'ok', validoAte: '2027-01-01T00:00:00.000Z', diasRestantes: 76 } });
  });

  it('recusa assinatura errada (401), repetição (401), ambiente diferente (409) e certificado de outro CNPJ (503)', async () => {
    expect((await pedir({ acao: 'certificado', ambiente: 'restrita' }, { segredo: 'e'.repeat(48) })).status).toBe(401);
    const nonce = 'f'.repeat(32);
    expect((await pedir({ acao: 'certificado', ambiente: 'restrita' }, { nonce })).status).toBe(200);
    expect(await pedir({ acao: 'certificado', ambiente: 'restrita' }, { nonce })).toEqual({ status: 401, body: { erro: 'repetido' } });
    expect(await pedir({ acao: 'certificado', ambiente: 'producao' })).toEqual({ status: 409, body: { erro: 'ambiente_diferente', ambiente: 'restrita' } });
    expect(await pedir({ acao: 'certificado', ambiente: 'restrita' }, { env: { ...env(), NFSE_CNPJ: '99999999000191' } })).toEqual({
      status: 503,
      body: { erro: 'certificado_nao_confere' },
    });
  });

  it('sem segredo configurado é 503; pedido com campo errado é 400 dizendo o campo, sem falar com a Sefin', async () => {
    expect((await pedir({ acao: 'certificado', ambiente: 'restrita' }, { env: { ...env(), NFSE_HMAC_SECRET: '' } })).status).toBe(503);
    expect(await pedir({ acao: 'emitir', ambiente: 'restrita', ...PEDIDO, valorCentavos: -1 })).toEqual({
      status: 400,
      body: { erro: 'pedido_invalido', campo: 'valorCentavos' },
    });
  });
});
