import { corpoDaRecusa, decidirAcessoDoChamador } from '../_shared/conta-acesso.ts';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/validation.ts';
import { enviarAvisoDeTeste, LEAD_DE_TESTE } from '../_shared/aviso-de-teste.ts';
import { entregarAviso } from '../_shared/webhook-entrega.ts';

/**
 * Botão "Enviar aviso de teste" de Configurações › Avisos para sistemas.
 * Manda um "Lead novo" com dados falsos ao endereço do aviso, grava no
 * histórico (teste = true) e devolve o código que o outro sistema respondeu.
 * Quem decide e como: `_shared/aviso-de-teste.ts`.
 *
 * Corpo: { webhook_id: uuid }
 * Resposta: { ok: true, aceito, status, erro, no_historico } ou { ok: false, error }.
 * Nunca devolve a senha de conferência.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  const logger = createLogger(req);
  const corsHeaders = buildCorsHeaders(req.headers.get('origin'));
  const jsonResponse = (body: Record<string, unknown>, status: number): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    logger.error('Missing Supabase configuration');
    return jsonResponse({ ok: false, error: 'Server misconfigured' }, 500);
  }
  const admin = createClient(supabaseUrl, serviceKey);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ ok: false, error: 'Missing authorization header' }, 401);
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return jsonResponse({ ok: false, error: 'Invalid token' }, 401);

  let body: { webhook_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400);
  }
  const webhookId = String(body?.webhook_id ?? '').trim();
  if (!UUID_PATTERN.test(webhookId)) return jsonResponse({ ok: false, error: 'webhook_id inválido.' }, 400);

  const { data: chamador } = await admin
    .from('profiles')
    .select('tenant_id, role, status, capabilities')
    .eq('user_id', user.id)
    .maybeSingle();

  // Grava no histórico da Conta: conta sem acesso não testa.
  const acesso = await decidirAcessoDoChamador(admin, chamador);
  if (!acesso.ok) return jsonResponse(corpoDaRecusa(acesso), acesso.status);

  const { data: aviso } = await admin
    .from('webhooks')
    .select('id, tenant_id, url, secret')
    .eq('id', webhookId)
    .maybeSingle();
  const { data: lojaDoAviso } = aviso
    ? await admin.from('tenants').select('id, name, kind, parent_tenant_id').eq('id', aviso.tenant_id).maybeSingle()
    : { data: null };

  const result = await enviarAvisoDeTeste({
    chamador,
    aviso,
    lojaDoAviso,
    testesNoUltimoMinuto: async () => {
      const { count } = await admin
        .from('webhook_deliveries')
        .select('id', { count: 'exact', head: true })
        .eq('webhook_id', webhookId)
        .eq('teste', true)
        .gte('created_at', new Date(Date.now() - 60_000).toISOString());
      return count ?? 0;
    },
    montarCorpo: async (loja) => {
      const { data, error } = await admin.rpc('lead_novo_corpo', {
        p_quando: new Date().toISOString(),
        p_lead_id: LEAD_DE_TESTE.lead_id,
        p_nome: LEAD_DE_TESTE.nome,
        p_telefone: LEAD_DE_TESTE.telefone,
        p_mensagem: LEAD_DE_TESTE.mensagem,
        p_loja: loja,
      });
      if (error || !data) throw new Error(error?.message ?? 'lead_novo_corpo sem resposta');
      return data as Record<string, unknown>;
    },
    entregar: (url, corpo, cabecalhos) => entregarAviso(url, corpo, cabecalhos),
    gravarHistorico: async (linha) => {
      const agora = new Date().toISOString();
      const { error } = await admin.from('webhook_deliveries').insert({
        id: linha.id,
        tenant_id: linha.tenant_id,
        webhook_id: linha.webhook_id,
        event_type: 'lead.novo',
        payload: linha.payload,
        status: linha.resultado.aceito ? 'delivered' : 'failed',
        attempts: 1,
        max_attempts: 1,
        response_status: linha.resultado.status,
        error_message: linha.resultado.erro,
        delivered_at: linha.resultado.aceito ? agora : null,
        teste: true,
      });
      return { error: error?.message ?? null };
    },
    novoId: () => crypto.randomUUID(),
  });

  logger.info('webhook-teste', {
    webhookId,
    userId: user.id,
    httpStatus: result.status,
    aceito: result.body.aceito ?? null,
    respostaDoOutroSistema: result.body.status ?? null,
    erro: result.body.erro ?? null,
  });
  return jsonResponse(result.body, result.status);
});
