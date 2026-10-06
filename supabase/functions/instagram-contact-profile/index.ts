import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createLogger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/validation.ts';
import {
  buildProfileUrl,
  classifyProfileResponse,
  recordStatusFor,
  TOKEN_INVALID_MESSAGE,
  TOKEN_MISSING_MESSAGE,
  validateProfileRequest,
  type ProfileOutcome,
} from './logic.ts';

/**
 * instagram-contact-profile — o NOME e o @ do cliente do Instagram, sob demanda
 * (fatia 4a).
 *
 * ============================================================================
 * POR QUE AQUI E NÃO NA CHEGADA DA MENSAGEM
 * ============================================================================
 *
 * A mensagem do Instagram não traz o nome (a do WhatsApp traz, e o webhook
 * grava de graça). Buscar na chegada poria uma chamada à Meta dentro do
 * instagram-webhook, que está provado em produção e hoje nem usa o token para
 * receber. Aqui a tela pede quando o cliente aparece na lista ou a conversa é
 * aberta; se a Meta falhar, nada no recebimento é afetado.
 *
 * ============================================================================
 * O QUE FAZ
 * ============================================================================
 *
 *   1. quem chama tem sessão; os contatos pedidos passam pela RLS DELE (um
 *      SELECT com o JWT do usuário) — só busca o que ele pode ver;
 *   2. instagram_contact_profile_claim marca como 'pending' os que estão na
 *      hora (nunca tentado, retry há 6 h, pending esquecido há 10 min) e cuja
 *      conexão atende. Duas abas ao mesmo tempo nunca pegam o mesmo contato;
 *   3. GET graph.instagram.com/<IGSID>?fields=name,username com o token do
 *      cofre;
 *   4. grava: ok (o @ sempre; o nome só se o contato não tem um), unavailable
 *      (bloqueou/sem consentimento — não tenta mais), retry (tenta em 6 h);
 *   5. acesso da conta recusado (190): tira a marca do contato e grava
 *      "precisa reconectar" na instância (a mesma função da renovação) — o
 *      cartão mostra "Reconectar", o sino avisa, e nada mais é tentado até a
 *      conta ser reconectada.
 *
 * Resposta: { ok: true, results: [{ contactId, outcome }] }, outcome =
 * ok | unavailable | retry | waiting_reconnect | not_due.
 *
 * NÃO VAI PARA O LOG: IGSID, nome, @, token. Sai: contagens e códigos.
 */

const META_TIMEOUT_MS = 10_000;

Deno.serve(async (req: Request) => {
  const logger = createLogger(req);
  const corsHeaders = buildCorsHeaders(req.headers.get('origin'));
  const json = (body: Record<string, unknown>, status: number): Response =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !serviceRole || !anonKey) {
    logger.error('instagram-contact-profile: ambiente incompleto');
    return json({ ok: false, error: 'Server misconfigured' }, 500);
  }

  // ---- quem chama ----------------------------------------------------------
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ ok: false, error: 'Missing authorization header' }, 401);
  const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
  const { data: { user }, error: authError } = await admin.auth.getUser(authHeader.replace('Bearer ', ''));
  if (authError || !user) return json({ ok: false, error: 'Invalid session' }, 401);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ ok: false, error: 'corpo não é JSON' }, 400);
  }
  const parsed = validateProfileRequest(raw);
  if (!parsed.ok) return json({ ok: false, error: parsed.error }, 400);

  // ---- só o que ELE pode ver (RLS com o JWT dele) ---------------------------
  const asUser = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: visible, error: visErr } = await asUser
    .from('contacts')
    .select('id')
    .in('id', parsed.contactIds)
    .eq('channel', 'instagram');
  if (visErr) {
    logger.error('instagram-contact-profile: não consegui conferir os contatos', { code: visErr.code });
    return json({ ok: false, error: 'lookup failed' }, 500);
  }
  const visibleIds = (visible ?? []).map((r: { id: string }) => r.id);
  if (visibleIds.length === 0) return json({ ok: true, results: [] }, 200);

  // ---- reservar os que estão na hora ----------------------------------------
  const { data: claimed, error: claimErr } = await admin.rpc('instagram_contact_profile_claim', {
    p_contact_ids: visibleIds,
  });
  if (claimErr) {
    logger.error('instagram-contact-profile: reserva falhou', { code: claimErr.code });
    return json({ ok: false, error: 'claim failed' }, 500);
  }
  type Claimed = { contact_id: string; igsid: string; instance_id: string; token_issued_at: string | null };
  const rows = (claimed ?? []) as Claimed[];

  const results: Array<{ contactId: string; outcome: string }> = [];
  const claimedIds = new Set(rows.map((r) => r.contact_id));
  for (const id of visibleIds) if (!claimedIds.has(id)) results.push({ contactId: id, outcome: 'not_due' });

  // ---- por conta do Instagram -----------------------------------------------
  const byInstance = new Map<string, Claimed[]>();
  for (const r of rows) byInstance.set(r.instance_id, [...(byInstance.get(r.instance_id) ?? []), r]);

  const record = async (contactId: string, outcome: ProfileOutcome) => {
    const { error } = await admin.rpc('instagram_contact_profile_record', {
      p_contact_id: contactId,
      p_status: recordStatusFor(outcome),
      p_name: outcome.kind === 'ok' ? outcome.name : null,
      p_username: outcome.kind === 'ok' ? outcome.username : null,
    });
    if (error) logger.error('instagram-contact-profile: gravação falhou', { code: error.code });
  };

  for (const [instanceId, contacts] of byInstance) {
    const { data: accessValue, error: vaultErr } = await admin.rpc('get_instance_meta_token', {
      p_instance_id: instanceId,
    });
    let connectionRefused = !!vaultErr || typeof accessValue !== 'string' || accessValue.length === 0;
    let refusedCode: number | null = null;
    if (connectionRefused) {
      // Sem acesso no cofre: é a conta que precisa ser reconectada. Grava isso
      // (senão a tela pediria de novo a cada ciclo) e solta os contatos.
      const { error: failErr } = await admin.rpc('instagram_token_renewal_record_failure', {
        p_instance_id: instanceId,
        p_kind: 'needs_reconnect',
        p_reason: 'token_missing',
        p_message: TOKEN_MISSING_MESSAGE,
        p_meta_code: null,
        p_expected_issued_at: contacts[0]?.token_issued_at ?? null,
      });
      if (failErr) logger.error('instagram-contact-profile: não gravei o estado da conexão', { code: failErr.code });
    }

    for (const c of contacts) {
      if (connectionRefused) {
        await record(c.contact_id, { kind: 'token_invalid', metaCode: refusedCode });
        results.push({ contactId: c.contact_id, outcome: 'waiting_reconnect' });
        continue;
      }
      let outcome: ProfileOutcome;
      try {
        const resp = await fetch(buildProfileUrl(c.igsid), {
          method: 'GET',
          headers: { Authorization: `Bearer ${accessValue}` },
          signal: AbortSignal.timeout(META_TIMEOUT_MS),
        });
        let body: unknown = null;
        try {
          body = await resp.json();
        } catch {
          /* corpo não-JSON: classificado pelo status */
        }
        outcome = classifyProfileResponse(resp.status, body);
      } catch {
        outcome = { kind: 'retry', metaCode: null };
      }

      await record(c.contact_id, outcome);

      if (outcome.kind === 'token_invalid') {
        // A conta inteira: grava "precisa reconectar" (a mesma função da
        // renovação, com a guarda de corrida pelo tokenIssuedAt lido) e não
        // tenta mais ninguém desta conta nesta chamada.
        connectionRefused = true;
        refusedCode = outcome.metaCode;
        const { error: failErr } = await admin.rpc('instagram_token_renewal_record_failure', {
          p_instance_id: instanceId,
          p_kind: 'needs_reconnect',
          p_reason: 'token_invalid',
          p_message: TOKEN_INVALID_MESSAGE,
          p_meta_code: outcome.metaCode,
          p_expected_issued_at: c.token_issued_at,
        });
        if (failErr) logger.error('instagram-contact-profile: não gravei o estado da conexão', { code: failErr.code });
        results.push({ contactId: c.contact_id, outcome: 'waiting_reconnect' });
        continue;
      }
      results.push({ contactId: c.contact_id, outcome: outcome.kind });
    }
  }

  const tally: Record<string, number> = {};
  for (const r of results) tally[r.outcome] = (tally[r.outcome] ?? 0) + 1;
  logger.info('instagram-contact-profile: fim', { pedidos: parsed.contactIds.length, visiveis: visibleIds.length, ...tally });

  return json({ ok: true, results }, 200);
});
