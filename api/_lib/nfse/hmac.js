// Autenticação dos pedidos que chegam a api/nfse.js.
//
// Só as funções do Supabase chamam: elas assinam com o segredo NFSE_HMAC_SECRET
// (o mesmo nos dois lados, nunca no código). Texto assinado:
//     `${ts}.${nonce}.${corpo}`   ts = segundos Unix, nonce = 32 hex
// Cabeçalhos: x-nfse-ts, x-nfse-nonce, x-nfse-assinatura (HMAC-SHA256 em hex).
// A contraparte que assina é supabase/functions/_shared/nfse/hmac.ts.
//
// Repetição: pedido com mais de JANELA_S segundos (para trás ou para frente)
// é recusado, e o nonce já visto nesta instância também. Instâncias diferentes
// não dividem a memória; por isso toda ação também é idempotente do lado do
// governo (mesmo Id de DPS = E0014; mesmo evento = recusa).

import crypto from 'node:crypto';

export const JANELA_S = 120;
export const SEGREDO_MINIMO = 32;
const RE_NONCE = /^[0-9a-f]{32}$/;
const RE_ASSINATURA = /^[0-9a-f]{64}$/;

export function assinaturaHmac(segredo, ts, nonce, corpo) {
  return crypto.createHmac('sha256', segredo).update(`${ts}.${nonce}.${corpo}`, 'utf8').digest('hex');
}

/** Memória de nonces vistos, com validade. */
export function criarMemoriaDeNonces() {
  const vistos = new Map();
  return {
    /** true se é a primeira vez (e guarda); false se repetido. */
    registrar(nonce, agoraS) {
      for (const [n, ate] of vistos) if (ate < agoraS) vistos.delete(n);
      if (vistos.has(nonce)) return false;
      vistos.set(nonce, agoraS + 2 * JANELA_S);
      return true;
    },
  };
}

/**
 * @returns {{ ok: true } | { ok: false, motivo: string }}
 */
export function verificarPedido({ segredo, ts, nonce, assinatura, corpo, agoraS, nonces }) {
  if (!segredo || segredo.length < SEGREDO_MINIMO) return { ok: false, motivo: 'segredo_nao_configurado' };
  if (!ts || !nonce || !assinatura) return { ok: false, motivo: 'sem_credencial' };
  const tsN = Number(ts);
  if (!/^\d{9,11}$/.test(String(ts)) || !Number.isSafeInteger(tsN)) return { ok: false, motivo: 'ts_invalido' };
  if (Math.abs(agoraS - tsN) > JANELA_S) return { ok: false, motivo: 'fora_da_janela' };
  if (!RE_NONCE.test(nonce) || !RE_ASSINATURA.test(assinatura)) return { ok: false, motivo: 'formato_invalido' };
  const esperada = Buffer.from(assinaturaHmac(segredo, ts, nonce, corpo), 'hex');
  const recebida = Buffer.from(assinatura, 'hex');
  if (esperada.length !== recebida.length || !crypto.timingSafeEqual(esperada, recebida)) {
    return { ok: false, motivo: 'assinatura_nao_confere' };
  }
  // Só depois de a assinatura conferir: lixo não ocupa a memória de nonces.
  if (!nonces.registrar(nonce, agoraS)) return { ok: false, motivo: 'repetido' };
  return { ok: true };
}
