import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/validation.ts';
import {
  planProviderCleanup,
  cleanupOutcomeFromStatus,
  type CleanupOutcome,
} from '../_shared/instance-delete-cleanup.ts';

/**
 * Exclui uma instância de WhatsApp.
 *
 * QUEM DECIDE É O BANCO. Esta função chama a RPC `delete_whatsapp_instance`
 * (migração 20260919000001) COMO O USUÁRIO — cliente com a anon key e o JWT
 * dele, para `auth.uid()` ser ele. A RPC checa permissão, alcance da Conta e
 * histórico, e recusa antes de tocar em qualquer linha; quando aceita, apaga a
 * linha, as cascatas e o segredo do Vault numa transação só. Não existe
 * "apagou metade".
 *
 * POR QUE EXISTE UMA EDGE FUNCTION, ENTÃO
 * Pelo provedor: na Evolution, apagar a instância no servidor da plataforma
 * exige a chave GLOBAL (SKILL.md §2.8), que vive só aqui (ver
 * evolution-provision). O navegador chama esta função; esta função chama a
 * RPC e, só se ela aceitou, encerra a sessão no provedor. Se o provedor
 * falhar, a resposta diz `provider_cleanup: 'failed'` — a instância já saiu
 * do ConvoFlow, e o que sobrou é limpeza de operação, não perda de dado.
 *
 * Na Meta (provider 'official') nada é chamado: o número continua registrado
 * lá e o app inscrito na WABA. Reconectar é assunto da próxima fatia.
 */

interface DeleteRequest {
  instance_id: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** HTTP por motivo de recusa da RPC. */
const STATUS_BY_REASON: Record<string, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  has_history: 409,
};

Deno.serve(async (req: Request) => {
  const logger = createLogger(req);
  const corsHeaders = buildCorsHeaders(req.headers.get('origin'));

  const jsonResponse = (body: Record<string, unknown>, status: number): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) {
    logger.error('Missing Supabase configuration');
    return jsonResponse({ ok: false, error: 'Server misconfigured' }, 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ ok: false, error: 'Missing authorization header' }, 401);
  }
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const admin = createClient(supabaseUrl, serviceKey);
  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) {
    return jsonResponse({ ok: false, error: 'Invalid token' }, 401);
  }

  let body: DeleteRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400);
  }
  const instanceId = String(body?.instance_id || '').trim();
  if (!UUID_PATTERN.test(instanceId)) {
    return jsonResponse({ ok: false, error: 'instance_id inválido.' }, 400);
  }

  // ------------------------------------------------------------- a RPC
  // Como o usuário: é o JWT dele que vira auth.uid() dentro da função.
  const asUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: result, error: rpcError } = await asUser.rpc('delete_whatsapp_instance', {
    p_instance_id: instanceId,
  });

  if (rpcError) {
    // 23503 = um dependente entrou entre a contagem e o DELETE (webhook no
    // meio). A transação desfez tudo; o usuário tenta de novo e vê o número.
    const code = (rpcError as { code?: string }).code;
    logger.error('delete_whatsapp_instance falhou', { instanceId, code, error: rpcError.message });
    if (code === '23503') {
      return jsonResponse(
        {
          ok: false,
          reason: 'has_history',
          error: 'Chegou uma mensagem nesta instância durante a exclusão. Nada foi apagado. Feche e abra de novo para ver o histórico.',
        },
        409,
      );
    }
    return jsonResponse({ ok: false, error: `Não foi possível excluir a instância: ${rpcError.message}` }, 500);
  }

  const decision = (result ?? {}) as Record<string, unknown>;
  if (decision.ok !== true) {
    const reason = String(decision.reason || 'unknown');
    logger.warn('Exclusão recusada pela RPC', { instanceId, userId: user.id, reason });
    return jsonResponse(
      {
        ok: false,
        reason,
        error: String(decision.message || 'Exclusão recusada.'),
        counts: decision.counts ?? null,
        total: decision.total ?? null,
      },
      STATUS_BY_REASON[reason] ?? 400,
    );
  }

  // --------------------------------------------------- o provedor, depois
  const instance = (decision.instance ?? {}) as { instance_key?: string; provider?: string; tenant_id?: string };
  const connectionConfig = (decision.connection_config ?? null) as Record<string, unknown> | null;
  const provider = instance.provider || 'evolution';

  const plan = planProviderCleanup(provider, String(instance.instance_key || ''), connectionConfig, {
    evolutionBaseUrl: Deno.env.get('EVOLUTION_API_URL'),
    evolutionGlobalKey: Deno.env.get('EVOLUTION_GLOBAL_KEY'),
  });

  let providerCleanup: CleanupOutcome = 'skipped';
  let providerDetail: string | null = null;

  if (plan.kind === 'not_applicable') {
    providerCleanup = 'not_applicable';
  } else if (plan.kind === 'skipped') {
    providerCleanup = 'skipped';
    providerDetail = plan.why;
    logger.warn('Limpeza no provedor pulada', { instanceId, provider, why: plan.why });
  } else {
    for (const step of plan.requests) {
      try {
        const res = await fetch(step.url, { method: step.method, headers: step.headers });
        if (step.optional) continue;
        providerCleanup = cleanupOutcomeFromStatus(res.status);
        if (providerCleanup === 'failed') {
          const raw = await res.text().catch(() => '');
          providerDetail = `${step.label}: HTTP ${res.status} ${raw.slice(0, 200)}`.trim();
        }
      } catch (err) {
        if (step.optional) continue;
        providerCleanup = 'failed';
        providerDetail = `${step.label}: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
    if (providerCleanup === 'failed') {
      logger.error('Instância saiu do banco mas o provedor não confirmou', {
        instanceId, provider, detail: providerDetail,
      });
    }
  }

  logger.info('Instância excluída', {
    instanceId,
    tenantId: instance.tenant_id,
    provider,
    access: decision.access,
    providerCleanup,
    removed: decision.removed,
  });

  // connection_config (chave do provedor) NÃO volta para o navegador.
  return jsonResponse(
    {
      ok: true,
      instance_id: instanceId,
      instance_key: instance.instance_key ?? null,
      provider,
      provider_cleanup: providerCleanup,
      provider_detail: providerDetail,
      removed: decision.removed ?? null,
    },
    200,
  );
});
