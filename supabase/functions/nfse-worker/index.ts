// =============================================================================
// nfse-worker — a fila da nota fiscal (parte 2)
// =============================================================================
// Chamado pelo pg_cron a cada 5 minutos (public.cron_worker_kick('nfse-worker'),
// com o segredo do cron). Também aceita a chave secreta do projeto, para rodar
// à mão. Não tem tela: o superadmin age pelo nfse-admin.
//
// Um ciclo: checagem diária (certificado, Fortaleza, conciliação, paradas),
// cancelamentos por reembolso, emissão das cobranças na fila e e-mails que
// faltam. As regras estão em _shared/nfse/worker-core.ts.
//
// Corpo opcional (só quem passa pelo backend-gate):
//   {charge_id}                  processa só essa cobrança
//   {acao:'status_email', nota_id} situação do e-mail da nota no Resend (só a situação)
//
// verify_jwt = false (supabase/config.toml): quem confere é o backend-gate.
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createLogger } from '../_shared/logger.ts';
import { guardBackendCaller } from '../_shared/backend-gate.ts';
import { corsHeaders } from '../_shared/validation.ts';
import { clienteDeServico, lerConfiguracao, montarPortas, statusDoEmailNoResend } from '../_shared/nfse/adaptadores.ts';
import { processarCobranca, rodarCiclo } from '../_shared/nfse/worker-core.ts';

const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const logger = createLogger(req);
  const recusa = await guardBackendCaller(req, logger);
  if (recusa) return recusa;

  const cfg = lerConfiguracao();
  if (!cfg.ok) {
    logger.error('nfse-worker: configuração incompleta', { motivo: cfg.motivo });
    return json(503, { error: cfg.motivo });
  }

  let corpo: { charge_id?: unknown; acao?: unknown; nota_id?: unknown } = {};
  try {
    corpo = await req.json();
  } catch {
    corpo = {};
  }

  const portas = montarPortas(clienteDeServico(), cfg, (m, c) => logger.info(m, c));
  try {
    // Só backend (segredo do cron ou chave secreta): a situação de entrega do e-mail de uma nota.
    if (corpo.acao === 'status_email' && typeof corpo.nota_id === 'string' && /^[0-9a-f-]{36}$/i.test(corpo.nota_id)) {
      return json(200, await statusDoEmailNoResend(clienteDeServico(), corpo.nota_id));
    }
    if (typeof corpo.charge_id === 'string' && /^[0-9a-f-]{36}$/i.test(corpo.charge_id)) {
      return json(200, { ambiente: cfg.ambiente, resultado: await processarCobranca(portas, corpo.charge_id) });
    }
    const resumo = await rodarCiclo(portas);
    logger.info('nfse-worker: ciclo', resumo);
    return json(200, resumo);
  } catch (e) {
    logger.error('nfse-worker: falhou', { erro: (e as Error).message });
    return json(500, { error: 'falha no ciclo da nota fiscal' });
  }
});
