// Assinatura XMLDSig da DPS e do pedido de evento.
//
// Envelopada, irmã do elemento assinado (infDPS ou infPedReg), sem prefixo
// "ds:", RSA-SHA256 com digest SHA-256, só o certificado da empresa no
// KeyInfo. Canonicalização inclusiva (manual da Sefin); a exclusiva fica atrás
// de NFSE_C14N=exclusiva, para o caso de a Sefin recusar a inclusiva.
// Testado em 2026-10-16: xml-crypto assina igual em Node e Deno e o SignedXml
// do .NET aceita as duas formas.

import { SignedXml } from 'xml-crypto';

export const C14N = Object.freeze({
  inclusiva: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
  exclusiva: 'http://www.w3.org/2001/10/xml-exc-c14n#',
});

const RSA_SHA256 = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
const SHA256 = 'http://www.w3.org/2001/04/xmlenc#sha256';
const ENVELOPADA = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';

/** Corpo base64 do primeiro certificado de um PEM. */
export function corpoDoCertificado(certPem) {
  const m = /-----BEGIN CERTIFICATE-----([\s\S]+?)-----END CERTIFICATE-----/.exec(certPem);
  if (!m) throw new Error('certificado PEM inválido');
  return m[1].replace(/\s+/g, '');
}

/**
 * Assina o elemento `tag` (que tem o atributo Id = `id`).
 * @param {string} xml
 * @param {{ tag: string, id: string, keyPem: string, certPem: string, c14n?: 'inclusiva'|'exclusiva' }} op
 * @returns {string} o XML com a <Signature> logo depois do elemento assinado
 */
export function assinar(xml, op) {
  const c14n = C14N[op.c14n ?? 'inclusiva'];
  if (!c14n) throw new Error('c14n inválida');
  const caminho = `//*[local-name(.)='${op.tag}']`;
  const certB64 = corpoDoCertificado(op.certPem);
  const sx = new SignedXml({
    privateKey: op.keyPem,
    publicCert: op.certPem,
    signatureAlgorithm: RSA_SHA256,
    canonicalizationAlgorithm: c14n,
    getKeyInfoContent: () => `<X509Data><X509Certificate>${certB64}</X509Certificate></X509Data>`,
  });
  sx.addReference({
    xpath: caminho,
    transforms: [ENVELOPADA, c14n],
    digestAlgorithm: SHA256,
    uri: `#${op.id}`,
    isEmptyUri: false,
  });
  sx.computeSignature(xml, { location: { reference: caminho, action: 'after' } });
  return sx.getSignedXml();
}
