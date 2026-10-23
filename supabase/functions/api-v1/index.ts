// =============================================================================
// api-v1 — API pública REST, só leitura (complemento "API e integrações")
// =============================================================================
// Endereço público: https://api.convoflow.com.br/v1/... (Vercel repassa para
// esta função). Chave: Authorization: Bearer cf_live_… (ou X-API-Key).
// Tudo o que importa está em _shared/api/nucleo.ts (regras, testado no
// Vitest) e _shared/api/banco.ts (Postgres como o dono da chave).
// verify_jwt = false: a função confere a chave de API no próprio código.
// Secrets: API_ADDON_ENABLED ("true" abre para todos) e API_ADDON_TEST_CONTAS.
// Runbook: docs/RUNBOOK_api_publica.md.
// =============================================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createLogger } from '../_shared/logger.ts';
import { atenderRest } from '../_shared/api/nucleo.ts';
import { dependenciasDoBanco } from '../_shared/api/banco.ts';

Deno.serve(async (req: Request) => {
  const logger = createLogger(req);
  const t0 = performance.now();
  const deps = dependenciasDoBanco((nivel, msg, ctx) => logger[nivel](msg, ctx));
  const r = await atenderRest({ metodo: req.method, url: req.url, cabecalhos: req.headers }, deps);
  logger.info('api-v1', { status: r.status, ms: Math.round(performance.now() - t0) });
  return new Response(r.corpo === null ? null : JSON.stringify(r.corpo), { status: r.status, headers: r.cabecalhos });
});
