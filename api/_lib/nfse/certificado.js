// Leitura do certificado A1 (e-CNPJ ICP-Brasil), só em memória.
//
// O .pfx da empresa usa a criptografia antiga (RC2-40 + 3DES), que o OpenSSL 3
// do Node recusa ("Unsupported PKCS12 PFX data"). O node-forge lê em JS puro.
// Nada daqui é gravado em disco, logado ou devolvido: quem chama recebe só o
// PEM para o TLS e para a assinatura, o CNPJ e a validade.

import forge from 'node-forge';

const OID_CNPJ = '2.16.76.1.3.3'; // ICP-Brasil: CNPJ da pessoa jurídica titular

/** Os 14 algarismos do CNPJ do titular: no otherName 2.16.76.1.3.3 ou no fim do CN ("NOME:CNPJ"). */
export function cnpjDoCertificado(cert) {
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const oid = forge.asn1.toDer(forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false, forge.asn1.oidToDer(OID_CNPJ).getBytes())).getBytes();
  const i = der.indexOf(oid);
  if (i >= 0) {
    const m = /\d{14}/.exec(der.slice(i + oid.length, i + oid.length + 40));
    if (m) return m[0];
  }
  const cn = cert.subject.getField('CN')?.value ?? '';
  const m = /:(\d{14})$/.exec(cn);
  return m ? m[1] : null;
}

/**
 * @param {string} pfxBase64
 * @param {string} senha
 * @returns {{ keyPem: string, certPem: string, cadeiaPem: string, cnpj: string|null, validoDe: Date, validoAte: Date }}
 */
export function carregarCertificado(pfxBase64, senha) {
  if (!pfxBase64 || !senha) throw new Error('certificado ausente');
  const der = forge.util.decode64(String(pfxBase64).replace(/\s+/g, ''));
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(der), String(senha));
  const chave =
    p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]?.key ??
    p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0]?.key;
  if (!chave) throw new Error('certificado sem chave privada');
  const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? []).map((b) => b.cert).filter(Boolean);
  const titular = certs.find((c) => c.publicKey.n && c.publicKey.n.equals(chave.n));
  if (!titular) throw new Error('certificado do titular não encontrado no arquivo');
  const cadeia = [titular, ...certs.filter((c) => c !== titular)];
  return {
    keyPem: forge.pki.privateKeyToPem(chave),
    certPem: forge.pki.certificateToPem(titular),
    cadeiaPem: cadeia.map((c) => forge.pki.certificateToPem(c)).join(''),
    cnpj: cnpjDoCertificado(titular),
    validoDe: titular.validity.notBefore,
    validoAte: titular.validity.notAfter,
  };
}
