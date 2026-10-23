// =============================================================================
// api-mcp — servidor MCP para agentes de IA, só leitura (B1)
// =============================================================================
// Endereço público: https://api.convoflow.com.br/mcp (Vercel repassa para esta
// função). Transporte Streamable HTTP, sem sessão. SDK oficial v2
// (@modelcontextprotocol/server), que atende a versão nova do protocolo
// (2026-07-28) e as de 2025 pelo mesmo endereço.
// Autenticação: a mesma chave de API da REST, em Authorization: Bearer
// cf_live_… (B1). "Entrar e autorizar" (OAuth) é a B2 e não existe ainda.
// Cada pedido HTTP: confere Origin (navegador fora), autentica a chave
// (api_chave_usar: dono, complemento, limite), roda e grava UMA linha em
// api_registro. As ferramentas estão em _shared/api/mcp.ts.
// verify_jwt = false. Secrets: API_ADDON_ENABLED, API_ADDON_TEST_CONTAS e,
// opcional, API_MCP_ORIGENS (origens de navegador aceitas; vazio = nenhuma).
// =============================================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { McpServer, createMcpHandler } from 'npm:@modelcontextprotocol/server@2.4.0';
import { z } from 'npm:zod@4.6.6';
import { createLogger } from '../_shared/logger.ts';
import {
  autenticar,
  corpoDoErro,
  ErroApi,
  ipDoPedido,
  ocultarChave,
  type Contexto,
} from '../_shared/api/nucleo.ts';
import { FERRAMENTAS, INSTRUCOES_DO_SERVIDOR, rodarFerramenta, type CampoFerramenta } from '../_shared/api/mcp.ts';
import { dependenciasDoBanco } from '../_shared/api/banco.ts';

interface Coleta {
  ferramenta: string | null;
  linhas: number | null;
  resultado: string;
}

function esquema(entrada: Record<string, CampoFerramenta>) {
  const forma: Record<string, z.ZodType> = {};
  for (const [nome, c] of Object.entries(entrada)) {
    let t: z.ZodType =
      c.tipo === 'booleano' ? z.boolean() : c.tipo === 'inteiro' ? z.number().int() : z.string().max(200);
    t = t.describe(c.descricao);
    forma[nome] = c.obrigatorio ? t : t.optional();
  }
  return z.object(forma);
}

const deps = dependenciasDoBanco();

const handler = createMcpHandler(
  (ctx) => {
    const extra = ctx.authInfo?.extra as { contexto?: Contexto; coleta?: Coleta } | undefined;
    const servidor = new McpServer(
      { name: 'convoflow', title: 'ConvoFlow', version: '1.0.0' },
      { instructions: INSTRUCOES_DO_SERVIDOR },
    );
    for (const f of FERRAMENTAS) {
      servidor.registerTool(
        f.nome,
        {
          title: f.titulo,
          description: f.descricao,
          inputSchema: esquema(f.entrada),
          annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        },
        async (args: Record<string, unknown>) => {
          if (!extra?.contexto || !extra.coleta) {
            return { isError: true, content: [{ type: 'text' as const, text: 'Chave ausente.' }] };
          }
          const r = await rodarFerramenta(f.nome, args ?? {}, extra.contexto, deps);
          extra.coleta.ferramenta = f.nome;
          extra.coleta.linhas = (extra.coleta.linhas ?? 0) + r.linhas;
          if (r.erro) extra.coleta.resultado = r.erro.codigo;
          return r.erro
            ? { isError: true, content: [{ type: 'text' as const, text: r.texto }] }
            : { content: [{ type: 'text' as const, text: r.texto }] };
        },
      );
    }
    return servidor;
  },
  { responseMode: 'json' },
);

function origensAceitas(): string[] {
  return (Deno.env.get('API_MCP_ORIGENS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const JSON_SEM_CACHE = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

Deno.serve(async (req: Request) => {
  const logger = createLogger(req);
  const t0 = performance.now();
  const ip = ipDoPedido(req.headers);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });

  // O protocolo manda conferir Origin (contra DNS rebinding). Cliente MCP de
  // servidor não manda Origin; navegador manda — e navegador não é cliente aqui.
  const origem = req.headers.get('origin');
  if (origem && !origensAceitas().includes(origem)) {
    const e = new ErroApi('origem_recusada');
    return new Response(JSON.stringify(corpoDoErro(e)), { status: e.status, headers: JSON_SEM_CACHE });
  }

  let metodoRpc = req.method;
  let ferramentaPedida: string | null = null;
  if (req.method === 'POST') {
    try {
      const corpo = await req.clone().json();
      if (Array.isArray(corpo)) metodoRpc = 'lote';
      else if (corpo && typeof corpo.method === 'string') {
        metodoRpc = corpo.method.slice(0, 60);
        if (corpo.method === 'tools/call' && typeof corpo.params?.name === 'string') ferramentaPedida = corpo.params.name.slice(0, 60);
      }
    } catch {
      // corpo inválido: o SDK responde o erro de protocolo
    }
  }
  const rota = `mcp:${metodoRpc}${ferramentaPedida ? `:${ferramentaPedida}` : ''}`;

  const registrar = async (status: number, coleta: Coleta, chaveId: string | null, contaId: string | null) => {
    await deps.registrar({
      chave_id: chaveId,
      conta_id: contaId,
      canal: 'mcp',
      metodo: req.method,
      rota,
      filtros: {},
      linhas: coleta.linhas,
      status,
      resultado: coleta.resultado,
      ip,
      midia_ids: null,
      duracao_ms: Math.round(performance.now() - t0),
    });
  };

  const auth = await autenticar(req.headers, ip, deps);
  if (!auth.ok) {
    const cab: Record<string, string> = { ...JSON_SEM_CACHE };
    if (auth.erro.status === 401) cab['WWW-Authenticate'] = 'Bearer realm="convoflow"';
    if (auth.erro.status === 429) cab['Retry-After'] = auth.erro.codigo === 'limite_minuto' ? '60' : '3600';
    if (auth.erro.codigo !== 'chave_ausente') {
      try {
        await registrar(auth.erro.status, { ferramenta: null, linhas: null, resultado: auth.erro.codigo }, auth.chaveId, auth.contaId);
      } catch (e) {
        logger.error('api-mcp: registro não gravado', { erro: ocultarChave(String((e as Error)?.message ?? e)) });
      }
    }
    logger.info('api-mcp', { status: auth.erro.status, rota, ms: Math.round(performance.now() - t0) });
    return new Response(JSON.stringify(corpoDoErro(auth.erro)), { status: auth.erro.status, headers: cab });
  }

  const ctx = auth.contexto;
  const coleta: Coleta = { ferramenta: null, linhas: null, resultado: 'ok' };
  let resposta: Response;
  try {
    resposta = await handler.fetch(req, {
      authInfo: { token: 'oculto', clientId: ctx.chaveId, scopes: ctx.escopos, extra: { contexto: ctx, coleta } },
    });
  } catch (e) {
    logger.error('api-mcp: falha', { erro: ocultarChave(String((e as Error)?.message ?? e)) });
    coleta.resultado = 'erro_interno';
    resposta = new Response(JSON.stringify(corpoDoErro(new ErroApi('erro_interno'))), { status: 500, headers: JSON_SEM_CACHE });
  }

  try {
    await registrar(resposta.status, coleta, ctx.chaveId, ctx.contaId);
  } catch (e) {
    logger.error('api-mcp: registro não gravado; a resposta não sai', { erro: ocultarChave(String((e as Error)?.message ?? e)) });
    const err = new ErroApi('indisponivel');
    return new Response(JSON.stringify(corpoDoErro(err)), { status: err.status, headers: JSON_SEM_CACHE });
  }

  const cab = new Headers(resposta.headers);
  cab.set('Cache-Control', 'no-store');
  if (typeof ctx.restanteMinuto === 'number') cab.set('X-Limite-Restante-Minuto', String(ctx.restanteMinuto));
  if (typeof ctx.restanteDia === 'number') cab.set('X-Limite-Restante-Dia', String(ctx.restanteDia));
  logger.info('api-mcp', { status: resposta.status, rota, linhas: coleta.linhas, ms: Math.round(performance.now() - t0) });
  return new Response(resposta.body, { status: resposta.status, headers: cab });
});
