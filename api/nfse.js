// =============================================================================
// POST /api/nfse — a única peça que fala com a Sefin Nacional (nota fiscal, parte 2)
// =============================================================================
// Por que na Vercel: a Sefin pede o certificado por renegociação TLS 1.2 e só
// o Node (OpenSSL) renegocia; as edge functions do Supabase (Deno) não.
// Fila, numeração, banco, PDF, e-mail e telas ficam no Supabase; esta função só
// assina, envia e devolve o resultado.
//
// Quem pode chamar: só as funções do Supabase, com HMAC (_lib/nfse/hmac.js).
// Variáveis da Vercel (Sensitive, nunca no código):
//   NFSE_CERT_PFX_B64  o .pfx da empresa em base64
//   NFSE_CERT_SENHA    a senha do .pfx
//   NFSE_HMAC_SECRET   o segredo dividido com o Supabase (≥ 32 caracteres)
//   NFSE_AMBIENTE      restrita | producao — o pedido tem de dizer o mesmo
//   NFSE_CNPJ          CNPJ da empresa: o certificado tem de ser dele
//   NFSE_IM            (opcional) inscrição municipal, só se a Sefin exigir
//   NFSE_C14N          (opcional) exclusiva, se a Sefin recusar a inclusiva
//   NFSE_CTRIBMUN      (opcional) desdobramento de Fortaleza para o item 01.05
// Nunca devolve nem loga certificado, senha, segredo ou dado do cliente.
// =============================================================================

import { ambienteValido } from './_lib/nfse/constantes.js';
import { criarMemoriaDeNonces, verificarPedido } from './_lib/nfse/hmac.js';
import { carregarCertificado } from './_lib/nfse/certificado.js';
import { criarClienteHttp } from './_lib/nfse/sefin.js';
import { executarAcao } from './_lib/nfse/acoes.js';
import { ErroPedido } from './_lib/nfse/dps.js';

const nonces = criarMemoriaDeNonces();
let cache = null; // { chave, cert, http }

function json(status, corpo) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function certificadoEmCache(env) {
  const chave = `${(env.NFSE_CERT_PFX_B64 ?? '').length}:${(env.NFSE_CERT_PFX_B64 ?? '').slice(-16)}`;
  if (cache?.chave === chave) return cache;
  const cert = carregarCertificado(env.NFSE_CERT_PFX_B64, env.NFSE_CERT_SENHA);
  cache = { chave, cert, http: criarClienteHttp({ cadeiaPem: cert.cadeiaPem, keyPem: cert.keyPem }) };
  return cache;
}

/** O núcleo, com ambiente e relógio injetáveis (o teste local usa este). */
export async function atender(request, env = process.env, agora = () => new Date()) {
  if (request.method !== 'POST') return json(405, { erro: 'metodo' });
  const corpo = await request.text();
  if (corpo.length > 64_000) return json(413, { erro: 'grande_demais' });

  const v = verificarPedido({
    segredo: env.NFSE_HMAC_SECRET,
    ts: request.headers.get('x-nfse-ts'),
    nonce: request.headers.get('x-nfse-nonce'),
    assinatura: request.headers.get('x-nfse-assinatura'),
    corpo,
    agoraS: Math.floor(agora().getTime() / 1000),
    nonces,
  });
  if (!v.ok) return json(v.motivo === 'segredo_nao_configurado' ? 503 : 401, { erro: v.motivo });

  let pedido;
  try {
    pedido = JSON.parse(corpo);
  } catch {
    return json(400, { erro: 'json' });
  }
  if (!ambienteValido(env.NFSE_AMBIENTE)) return json(503, { erro: 'ambiente_nao_configurado' });
  if (pedido?.ambiente !== env.NFSE_AMBIENTE) return json(409, { erro: 'ambiente_diferente', ambiente: env.NFSE_AMBIENTE });

  let c;
  try {
    c = certificadoEmCache(env);
  } catch {
    return json(503, { erro: 'certificado_indisponivel' });
  }
  const cnpjEsperado = String(env.NFSE_CNPJ ?? '').replace(/\D/g, '');
  if (!c.cert.cnpj || c.cert.cnpj !== cnpjEsperado) return json(503, { erro: 'certificado_nao_confere' });
  if (c.cert.validoAte.getTime() <= agora().getTime() && pedido.acao !== 'certificado') {
    return json(200, { resultado: 'certificado_vencido', validoAte: c.cert.validoAte.toISOString() });
  }

  try {
    const resposta = await executarAcao(pedido, {
      ambiente: env.NFSE_AMBIENTE,
      cert: c.cert,
      http: c.http,
      agora,
      c14n: env.NFSE_C14N === 'exclusiva' ? 'exclusiva' : 'inclusiva',
      imPrestador: env.NFSE_IM,
      cTribMun: env.NFSE_CTRIBMUN,
    });
    console.log(JSON.stringify({ nfse: pedido.acao, resultado: resposta.resultado, codigos: (resposta.erros ?? []).map((e) => e.codigo) }));
    return json(200, resposta);
  } catch (e) {
    if (e instanceof ErroPedido) return json(400, { erro: 'pedido_invalido', campo: e.campo });
    console.error(JSON.stringify({ nfse: pedido?.acao, falha: e?.name ?? 'erro' }));
    return json(500, { erro: 'falha_interna' });
  }
}

export function POST(request) {
  return atender(request);
}

export function GET() {
  return json(405, { erro: 'metodo' });
}
