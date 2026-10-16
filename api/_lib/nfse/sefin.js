// Cliente HTTP com o certificado da empresa (TLS mútuo).
//
// Tem de ser node:https (OpenSSL): a Sefin pede o certificado por renegociação
// TLS 1.2 depois de ver o pedido, e só o OpenSSL renegocia. O Deno (rustls) e
// por isso as edge functions do Supabase NÃO conseguem — provado em
// 2026-10-16, ver docs/RUNBOOK_nfse_nacional.md.

import https from 'node:https';
import zlib from 'node:zlib';

export class ErroDeRede extends Error {
  constructor(motivo, detalhe) {
    super(`${motivo}: ${detalhe}`);
    this.name = 'ErroDeRede';
    this.motivo = motivo; // 'timeout' | 'rede'
  }
}

/**
 * @param {{ cadeiaPem: string, keyPem: string, timeoutMs?: number }} op
 * @returns {(metodo: string, url: string, corpo?: object) => Promise<{ status: number, json: any, texto: string }>}
 */
export function criarClienteHttp(op) {
  const agente = new https.Agent({ cert: op.cadeiaPem, key: op.keyPem, keepAlive: false });
  const timeoutMs = op.timeoutMs ?? 25_000;
  return (metodo, url, corpo) =>
    new Promise((resolve, reject) => {
      const dados = corpo === undefined ? undefined : Buffer.from(JSON.stringify(corpo), 'utf8');
      const req = https.request(
        url,
        {
          method: metodo,
          agent: agente,
          timeout: timeoutMs,
          headers: {
            accept: 'application/json',
            ...(dados ? { 'content-type': 'application/json', 'content-length': String(dados.length) } : {}),
          },
        },
        (res) => {
          const partes = [];
          res.on('data', (p) => partes.push(p));
          res.on('end', () => {
            const texto = Buffer.concat(partes).toString('utf8');
            let json = null;
            try {
              json = texto ? JSON.parse(texto) : null;
            } catch {
              json = null;
            }
            resolve({ status: res.statusCode ?? 0, json, texto });
          });
          res.on('error', (e) => reject(new ErroDeRede('rede', e.message)));
        },
      );
      req.on('timeout', () => req.destroy(new ErroDeRede('timeout', `${timeoutMs} ms sem resposta`)));
      req.on('error', (e) => reject(e instanceof ErroDeRede ? e : new ErroDeRede('rede', `${e.code ?? ''} ${e.message}`.trim())));
      if (dados) req.write(dados);
      req.end();
    });
}

/** XML → gzip → base64 (formato dos campos *XmlGZipB64). */
export function gzipBase64(xml) {
  return zlib.gzipSync(Buffer.from(xml, 'utf8')).toString('base64');
}

/** base64 → gunzip → XML. */
export function gunzipBase64(b64) {
  return zlib.gunzipSync(Buffer.from(String(b64), 'base64')).toString('utf8');
}
