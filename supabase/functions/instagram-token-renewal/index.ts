import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createLogger } from '../_shared/logger.ts';
import { matchVerifyToken } from '../_shared/cryptoSignature.ts';
import {
  buildRefreshUrl,
  classifyRefreshResponse,
  CRON_SECRET_HEADER,
  decideRenewal,
  failure,
  failureMessage,
  validateRunRequest,
  type RefreshResult,
} from './logic.ts';

/**
 * instagram-token-renewal — renova o acesso das contas de Instagram antes que
 * ele vença (fatia 4/5, primeira entrega).
 *
 * ============================================================================
 * O QUE FAZ
 * ============================================================================
 *
 * Uma vez por dia (pg_cron → public.instagram_token_renewal_kick() →
 * net.http_post), para cada instância provider='instagram':
 *
 *   1. decide (logic.ts: decideRenewal): renova se está ativa, o token tem
 *      pelo menos 24 h, ainda não venceu, faltam até 30 dias e a Meta não
 *      recusou este token antes;
 *   2. lê o token do Vault (get_instance_meta_token — o mesmo cofre de sempre);
 *   3. GET graph.instagram.com/refresh_access_token;
 *   4. grava o resultado por RPC:
 *        sucesso → instagram_token_renewal_record_success: token novo no Vault
 *                  NO LUGAR (set_instance_meta_token), tokenIssuedAt = agora,
 *                  tokenExpiresAt = agora + expires_in da Meta;
 *        falha   → instagram_token_renewal_record_failure: estado, motivo e
 *                  data em connection_config.renewal. Falha passageira tenta de
 *                  novo amanhã; "precisa reconectar" para de tentar até o token
 *                  ser trocado;
 *   5. no fim, instagram_connection_alert_sweep: os avisos do sino (7 dias
 *      antes, no vencimento, e quando precisa reconectar), cada um UMA vez.
 *
 * ============================================================================
 * AUTENTICAÇÃO
 * ============================================================================
 *
 * verify_jwt = false, e a chave anon NÃO autoriza nada aqui. Quem chama
 * precisa mandar o cabeçalho `x-cron-secret` com o valor guardado no Vault
 * como `instagram_token_renewal_cron_secret`. A comparação é em tempo
 * constante (matchVerifyToken). Sem o segredo no Vault, a função recusa TUDO
 * (503): falha fechada.
 *
 * O segredo vem do Vault e não de variável de ambiente para existir num lugar
 * só: o mesmo valor é lido aqui e por instagram_token_renewal_kick (que o põe
 * no cabeçalho), e ninguém precisa copiá-lo à mão.
 *
 * ============================================================================
 * EXECUÇÃO MANUAL
 * ============================================================================
 *
 * Corpo opcional: { dryRun?: boolean, instanceId?: uuid, ignoreWindow?: boolean }.
 * dryRun só diz o que faria. ignoreWindow renova mesmo faltando mais de 30
 * dias (as regras da Meta continuam valendo). Ver docs/RUNBOOK_instagram_renovacao.md.
 *
 * NÃO VAI PARA O LOG: token, segredo, resposta da Meta. Sai: instância,
 * decisão, resultado, motivo, código da Meta.
 */

const META_TIMEOUT_MS = 20_000;

Deno.serve(async (req: Request) => {
  const logger = createLogger(req);
  const json = (body: Record<string, unknown>, status: number): Response =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRole) {
    logger.error('instagram-token-renewal: ambiente incompleto');
    return json({ ok: false, error: 'Server misconfigured' }, 500);
  }

  // ---- quem chama ----------------------------------------------------------
  const provided = req.headers.get(CRON_SECRET_HEADER);
  if (!provided) {
    logger.warn('instagram-token-renewal: chamada sem o cabeçalho do cron, recusada');
    return json({ ok: false, error: 'Unauthorized' }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  const { data: expected, error: secretErr } = await admin.rpc('instagram_token_renewal_cron_secret');
  if (secretErr || typeof expected !== 'string' || expected.length < 32) {
    logger.error('instagram-token-renewal: segredo do cron ausente no Vault, recusando tudo', {
      rpcFalhou: !!secretErr,
    });
    return json({ ok: false, error: 'Not configured' }, 503);
  }
  if (matchVerifyToken(provided, [expected]) !== 0) {
    logger.warn('instagram-token-renewal: cabeçalho do cron não confere, recusada');
    return json({ ok: false, error: 'Unauthorized' }, 401);
  }

  // ---- pedido --------------------------------------------------------------
  let raw: unknown = null;
  const text = await req.text();
  if (text.trim().length > 0) {
    try {
      raw = JSON.parse(text);
    } catch {
      return json({ ok: false, error: 'corpo não é JSON' }, 400);
    }
  }
  const parsed = validateRunRequest(raw);
  if (!parsed.ok) return json({ ok: false, error: parsed.error }, 400);
  const run = parsed.value;

  // ---- instâncias ----------------------------------------------------------
  let q = admin
    .from('whatsapp_instances')
    .select('id, tenant_id, is_active, connection_config')
    .eq('provider', 'instagram')
    .order('created_at', { ascending: true });
  if (run.instanceId) q = q.eq('id', run.instanceId);
  const { data: instances, error: listErr } = await q;
  if (listErr) {
    logger.error('instagram-token-renewal: não consegui listar as instâncias', { code: listErr.code });
    return json({ ok: false, error: 'list failed' }, 500);
  }

  const now = new Date();
  const results: Record<string, unknown>[] = [];

  for (const inst of instances ?? []) {
    const cfg = (inst.connection_config ?? {}) as Record<string, unknown>;
    const decision = decideRenewal(
      { isActive: inst.is_active, connectionConfig: cfg },
      now,
      { ignoreWindow: run.ignoreWindow },
    );

    if (decision.action === 'skip') {
      results.push({ instanceId: inst.id, outcome: 'skipped', reason: decision.reason });
      logger.info('instagram-token-renewal: pulada', { instanceId: inst.id, reason: decision.reason });
      continue;
    }
    if (run.dryRun) {
      results.push({ instanceId: inst.id, outcome: 'would_renew' });
      continue;
    }

    // O texto exato que lemos. A gravação só acontece se ele ainda for o mesmo
    // (ninguém trocou o token no meio do caminho).
    const issuedSeen = typeof cfg.tokenIssuedAt === 'string' ? cfg.tokenIssuedAt : null;

    const { data: current, error: vaultErr } = await admin.rpc('get_instance_meta_token', {
      p_instance_id: inst.id,
    });

    let result: RefreshResult;
    if (vaultErr || typeof current !== 'string' || current.length === 0) {
      result = failure('token_missing');
    } else {
      try {
        const resp = await fetch(buildRefreshUrl(current), {
          method: 'GET',
          signal: AbortSignal.timeout(META_TIMEOUT_MS),
        });
        let body: unknown = null;
        try {
          body = await resp.json();
        } catch {
          /* corpo não-JSON: classificado pelo status */
        }
        result = classifyRefreshResponse(resp.status, body);
      } catch {
        result = failure('network_error');
      }
    }

    if (result.ok) {
      const args = {
        p_instance_id: inst.id,
        p_token: result.accessToken,
        p_expires_in: result.expiresIn,
        p_expected_issued_at: issuedSeen,
      };
      let rec = await admin.rpc('instagram_token_renewal_record_success', args);
      if (rec.error) {
        // A Meta já entregou um token novo; perdê-lo é o pior caso. Uma segunda
        // tentativa antes de desistir.
        rec = await admin.rpc('instagram_token_renewal_record_success', args);
      }
      if (rec.error) {
        logger.error('instagram-token-renewal: RENOVADA NA META MAS NÃO GRAVADA', {
          instanceId: inst.id,
          code: rec.error.code,
        });
        results.push({ instanceId: inst.id, outcome: 'store_failed' });
        continue;
      }
      const out = (rec.data ?? {}) as Record<string, unknown>;
      results.push({
        instanceId: inst.id,
        outcome: out.outcome ?? 'unknown',
        validUntil: out.valid_until ?? null,
        expiryFromMeta: result.expiresIn !== null,
      });
      logger.info('instagram-token-renewal: renovada', {
        instanceId: inst.id,
        outcome: out.outcome ?? 'unknown',
        validUntil: out.valid_until ?? null,
        expiryFromMeta: result.expiresIn !== null,
      });
      continue;
    }

    const rec = await admin.rpc('instagram_token_renewal_record_failure', {
      p_instance_id: inst.id,
      p_kind: result.kind,
      p_reason: result.reason,
      p_message: failureMessage(result.reason, result.metaCode),
      p_meta_code: result.metaCode,
      p_expected_issued_at: issuedSeen,
    });
    const out = (rec.data ?? {}) as Record<string, unknown>;
    results.push({
      instanceId: inst.id,
      outcome: rec.error ? 'record_failed' : out.outcome ?? 'unknown',
      kind: result.kind,
      reason: result.reason,
      metaCode: result.metaCode,
    });
    logger.warn('instagram-token-renewal: renovação falhou', {
      instanceId: inst.id,
      kind: result.kind,
      reason: result.reason,
      metaCode: result.metaCode,
      gravado: !rec.error,
    });
  }

  // ---- avisos --------------------------------------------------------------
  let alerts: unknown = null;
  if (!run.dryRun) {
    const { data, error } = await admin.rpc('instagram_connection_alert_sweep', {
      p_instance_id: run.instanceId,
    });
    if (error) {
      logger.error('instagram-token-renewal: avisos falharam', { code: error.code });
    }
    alerts = error ? { error: error.code ?? 'unknown' } : data;
  }

  logger.info('instagram-token-renewal: fim', {
    dryRun: run.dryRun,
    ignoreWindow: run.ignoreWindow,
    checked: results.length,
  });
  return json({ ok: true, dryRun: run.dryRun, ignoreWindow: run.ignoreWindow, checked: results.length, results, alerts }, 200);
});
