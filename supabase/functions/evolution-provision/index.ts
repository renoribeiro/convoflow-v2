import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/validation.ts';
import { credentialsForVault } from '../_shared/instance-credentials.ts';
import { decideConnectTarget, targetTenantIdFor } from '../_shared/connect-target.ts';

/**
 * Cria uma instância no servidor Evolution da plataforma.
 *
 * POR QUE ISTO É SERVIDOR E NÃO FRONTEND
 *
 * A chave global da Evolution é chave-mestra do servidor inteiro. Medido em
 * 2026-09-10 contra o servidor de produção: com a chave global, `fetchInstances`
 * devolve as 14 instâncias de TODOS os clientes; com a chave de uma instância,
 * devolve 1 e responde 401 em qualquer outra. O ConvoFlow é multi-cliente, então
 * a chave global não pode chegar ao navegador de ninguém.
 *
 * O desenho, então: a chave global vive aqui, como secret. A chave DA
 * INSTÂNCIA (que só abre aquela instância) vai para o cofre, por
 * set_instance_provider_credentials (migração 20261026000001), e não para a
 * linha de whatsapp_instances: a linha é lida por todo membro da Loja, o
 * atendente incluído. Até 2026-10-26 ela ia para `connection_config`.
 * Quem usa a chave é o servidor: whatsapp-instance-action (estado, QR,
 * desconectar), o webhook e os envios. Plano: docs/RUNBOOK_segredos_das_instancias.md.
 *
 * EM QUE LOJA O NÚMERO NASCE (lote 6b, B2): na Loja aberta no topo, que o
 * navegador manda em `tenant_id`. connect-target.ts confere cargo, alcance e
 * que é Loja, ANTES de criar qualquer coisa na Evolution. Até 2026-10-29 o
 * número nascia em `profiles.tenant_id` (para o Gerente, a Conta).
 *
 * Endpoints conforme `.agent/skills/evolution-v2/SKILL.md` §2.5, §2.1, §2.8 e §7.1.
 */

interface ProvisionRequest {
  instance_key: string;
  name?: string;
  enableWebhookAutomation?: boolean;
  retryAttempts?: number;
  retryDelay?: number;
  /** A Loja aberta no topo. Sem ela, vale a do perfil (Gerente = Conta = recusa). */
  tenant_id?: string;
}

const WEBHOOK_EVENTS = [
  'QRCODE_UPDATED',
  'CONNECTION_UPDATE',
  'MESSAGES_UPSERT',
  'MESSAGES_UPDATE',
  'SEND_MESSAGE',
  'CONTACTS_UPSERT',
  'CONTACTS_UPDATE',
];

/** Mesma regra do schema Zod do formulário. O servidor não confia no cliente. */
const INSTANCE_KEY_PATTERN = /^[A-Za-z0-9_-]{3,100}$/;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !supabaseServiceKey) {
    logger.error('Missing Supabase configuration');
    return jsonResponse({ ok: false, error: 'Server misconfigured' }, 500);
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ ok: false, error: 'Missing authorization header' }, 401);
  }
  const token = authHeader.replace('Bearer ', '');
  const { data: { user: callerUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !callerUser) {
    return jsonResponse({ ok: false, error: 'Invalid token' }, 401);
  }

  const { data: callerProfile } = await supabaseAdmin
    .from('profiles')
    .select('tenant_id, role, status, capabilities')
    .eq('user_id', callerUser.id)
    .maybeSingle();

  let body: ProvisionRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  // Cargo, alcance e Loja (nunca Conta) ANTES de falar com a Evolution.
  const targetId = targetTenantIdFor(callerProfile, body?.tenant_id);
  const { data: targetTenant } = targetId
    ? await supabaseAdmin.from('tenants').select('id, kind, parent_tenant_id').eq('id', targetId).maybeSingle()
    : { data: null };
  const target = decideConnectTarget({
    caller: callerProfile,
    requestedTenantId: body?.tenant_id,
    targetTenant: targetTenant ?? null,
  });
  if (!target.ok) {
    logger.warn('evolution-provision recusado', { reason: target.reason, userId: callerUser.id });
    return jsonResponse({ ok: false, reason: target.reason, error: target.message }, target.status);
  }

  // As credenciais da plataforma. Ausentes = recusa explícita, com o nome do
  // secret que falta: "não abre nada" foi exatamente o bug que trouxe a gente aqui.
  const evolutionBaseUrl = (Deno.env.get('EVOLUTION_API_URL') || '').replace(/\/+$/, '');
  const evolutionGlobalKey = Deno.env.get('EVOLUTION_GLOBAL_KEY') || '';
  if (!evolutionBaseUrl || !evolutionGlobalKey) {
    logger.error('Evolution secrets ausentes', {
      hasUrl: !!evolutionBaseUrl,
      hasKey: !!evolutionGlobalKey,
    });
    return jsonResponse(
      {
        ok: false,
        error:
          'O servidor WhatsApp da plataforma ainda não foi configurado. ' +
          'Quem administra o ConvoFlow precisa definir os secrets EVOLUTION_API_URL e EVOLUTION_GLOBAL_KEY.',
      },
      503,
    );
  }

  const instanceKey = (body.instance_key || '').trim();
  if (!INSTANCE_KEY_PATTERN.test(instanceKey)) {
    return jsonResponse(
      {
        ok: false,
        error: 'Código interno inválido. Use de 3 a 100 caracteres, só letras, números, _ e -.',
      },
      400,
    );
  }

  const displayName = (body.name || '').trim() || instanceKey;
  const enableWebhookAutomation = body.enableWebhookAutomation ?? true;
  const retryAttempts = Math.min(Math.max(body.retryAttempts ?? 3, 1), 10);
  const retryDelay = Math.min(Math.max(body.retryDelay ?? 2000, 1000), 10000);
  const webhookUrl = `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/evolution-webhook`;

  // Chave já usada é erro do usuário, não do servidor: dizer isso antes de
  // tocar na Evolution evita criar lá algo que não vai conseguir gravar aqui.
  const { data: existing } = await supabaseAdmin
    .from('whatsapp_instances')
    .select('id')
    .eq('instance_key', instanceKey)
    .maybeSingle();

  if (existing) {
    return jsonResponse(
      { ok: false, error: 'Já existe um número com esse código interno. Clique em Gerar para criar outro.' },
      409,
    );
  }

  const evolutionRequest = async (path: string, init: RequestInit = {}): Promise<Response> =>
    fetch(`${evolutionBaseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        apikey: evolutionGlobalKey,
        ...(init.headers || {}),
      },
    });

  const describeFailure = async (res: Response): Promise<string> => {
    const raw = await res.text().catch(() => '');
    if (res.status === 401) return 'O servidor Evolution recusou a chave da plataforma (401).';
    if (res.status === 403) return 'O servidor Evolution recusou o acesso (403).';
    return `O servidor Evolution respondeu ${res.status}. ${raw.slice(0, 300)}`.trim();
  };

  // ---------------------------------------------------------------- criar
  let createPayload: Record<string, unknown>;
  try {
    const createRes = await evolutionRequest('/instance/create', {
      method: 'POST',
      body: JSON.stringify({
        instanceName: instanceKey,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: true,
        rejectCall: true,
        groupsIgnore: true,
        alwaysOnline: true,
        readMessages: false,
        readStatus: false,
        ...(enableWebhookAutomation
          ? {
              webhook: {
                url: webhookUrl,
                enabled: true,
                byEvents: false,
                base64: false,
                events: WEBHOOK_EVENTS,
              },
            }
          : {}),
      }),
    });

    if (!createRes.ok) {
      const detail = await describeFailure(createRes);
      logger.error('Falha ao criar instância na Evolution', { instanceKey, status: createRes.status });
      return jsonResponse({ ok: false, error: detail }, 502);
    }

    createPayload = await createRes.json();
  } catch (err) {
    logger.error('Erro de rede ao falar com a Evolution', {
      instanceKey,
      error: err instanceof Error ? err.message : String(err),
    });
    return jsonResponse(
      { ok: false, error: 'O servidor de WhatsApp do ConvoFlow não respondeu. Tente de novo em instantes.' },
      502,
    );
  }

  /** Remove da Evolution o que não conseguimos registrar aqui — sem órfão. */
  const rollback = async (motivo: string) => {
    try {
      await evolutionRequest(`/instance/delete/${encodeURIComponent(instanceKey)}`, {
        method: 'DELETE',
      });
      logger.warn('Instância removida da Evolution após falha local', { instanceKey, motivo });
    } catch (err) {
      logger.error('Rollback falhou: instância pode ter ficado órfã na Evolution', {
        instanceKey,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // -------------------------------------------------- chave da instância
  // O `hash` do /instance/create já mudou de forma entre versões da v2 (string
  // solta, ou objeto com apikey). Em vez de apostar numa, confirmamos pelo
  // fetchInstances, que devolve `token` — o campo que a SKILL.md chama de
  // INST_KEY. Sem essa chave a instância nasce inútil: o servidor não teria
  // como parear nem enviar.
  let instanceToken = '';
  const hash = (createPayload as Record<string, unknown>)?.hash;
  if (typeof hash === 'string') instanceToken = hash;
  else if (hash && typeof hash === 'object') {
    instanceToken = String((hash as Record<string, unknown>).apikey || '');
  }

  if (!instanceToken) {
    try {
      const listRes = await evolutionRequest(
        `/instance/fetchInstances?instanceName=${encodeURIComponent(instanceKey)}`,
      );
      if (listRes.ok) {
        const list = await listRes.json();
        const row = Array.isArray(list)
          ? list.find((i: Record<string, unknown>) => i?.name === instanceKey || i?.instanceName === instanceKey)
          : null;
        instanceToken = String(row?.token || row?.apikey || '');
      }
    } catch (err) {
      logger.warn('fetchInstances falhou ao buscar a chave da instância', {
        instanceKey,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (!instanceToken) {
    await rollback('sem chave própria da instância');
    return jsonResponse(
      {
        ok: false,
        error:
          'O servidor de WhatsApp criou o número mas não devolveu a chave dele. ' +
          'O número foi desfeito para não ficar pela metade. Tente de novo.',
      },
      502,
    );
  }

  // ------------------------------------------------------------- webhook
  // Quando o webhook não entra inline no create, insistimos. Falha aqui NÃO
  // desfaz a instância: ela funciona para enviar, só não recebe em tempo real —
  // e isso é consertável na tela de webhook sem recriar nada.
  let webhookConfigured = enableWebhookAutomation;
  if (enableWebhookAutomation) {
    webhookConfigured = false;
    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
      try {
        const hookRes = await evolutionRequest(`/webhook/set/${encodeURIComponent(instanceKey)}`, {
          method: 'POST',
          body: JSON.stringify({
            webhook: {
              enabled: true,
              url: webhookUrl,
              byEvents: false,
              base64: false,
              events: WEBHOOK_EVENTS,
            },
          }),
        });
        if (hookRes.ok) {
          webhookConfigured = true;
          break;
        }
        logger.warn('Tentativa de configurar webhook falhou', {
          instanceKey,
          attempt,
          status: hookRes.status,
        });
      } catch (err) {
        logger.warn('Erro de rede ao configurar webhook', {
          instanceKey,
          attempt,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      if (attempt < retryAttempts) await sleep(retryDelay);
    }
  }

  // -------------------------------------------------------------- gravar
  // A linha nasce SEM servidor e sem chave; os dois vão para o cofre logo em
  // seguida. Se o cofre recusar, a linha e a instância na Evolution saem.
  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('whatsapp_instances')
    .insert({
      instance_key: instanceKey,
      name: displayName,
      tenant_id: target.tenantId,
      provider: 'evolution',
      connection_config: {},
      status: 'disconnected',
      webhook_url: enableWebhookAutomation ? webhookUrl : null,
      webhook_configured: webhookConfigured,
      webhook_events: enableWebhookAutomation ? WEBHOOK_EVENTS : null,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    logger.error('Falha ao gravar whatsapp_instances', {
      instanceKey,
      error: insertError?.message,
    });
    await rollback('insert falhou');
    return jsonResponse(
      { ok: false, error: 'Não foi possível salvar o número. Tente de novo em instantes.' },
      500,
    );
  }

  // Só a chave DESTA instância. A global nunca sai daqui.
  const { error: vaultError } = await supabaseAdmin.rpc('set_instance_provider_credentials', {
    p_instance_id: inserted.id,
    p_credentials: credentialsForVault({ baseUrl: evolutionBaseUrl, apiKey: instanceToken }),
  });
  if (vaultError) {
    logger.error('Falha ao guardar a chave da instância no cofre', { instanceKey, error: vaultError.message });
    await supabaseAdmin.from('whatsapp_instances').delete().eq('id', inserted.id);
    await rollback('cofre recusou');
    return jsonResponse(
      { ok: false, error: 'Não foi possível guardar a chave do número. Nada foi criado. Tente de novo.' },
      500,
    );
  }

  logger.info('Instância Evolution provisionada', {
    instanceKey,
    tenantId: target.tenantId,
    webhookConfigured,
  });

  return jsonResponse(
    {
      ok: true,
      instance_id: inserted.id,
      instance_key: instanceKey,
      name: displayName,
      webhook_configured: webhookConfigured,
    },
    200,
  );
});
