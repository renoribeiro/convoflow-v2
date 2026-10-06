import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createLogger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/validation.ts';
import {
  BOUNCE_INVALID_MESSAGE,
  bounceErrorPage,
  buildAuthorizeUrl,
  buildReturnUrl,
  defaultRedirectUri,
  INSTAGRAM_CODE_EXCHANGE_URL,
  INSTAGRAM_LONG_LIVED_URL,
  isStateShaped,
  meUrl,
  parseCodeExchange,
  parseLongLived,
  parseMe,
  parseRequestBody,
  parseSubscribe,
  readBounceQuery,
  resolveReturnTo,
  runCallback,
  subscribeUrl,
  type CallbackDeps,
  type CheckOk,
  type ClaimOk,
  type CommitOk,
  type RpcRefusal,
} from './logic.ts';

/**
 * instagram-connect — conectar e reconectar uma conta do Instagram pela tela
 * (fatia 4b), pelo Business Login do Instagram com redirecionamento.
 *
 * ============================================================================
 * TRÊS ENTRADAS
 * ============================================================================
 *
 *   POST {action:'start', tenantId?, instanceId?}   (sessão do usuário)
 *        instagram_connect_begin como o usuário (capability, Loja, chave da
 *        Loja, alcance, gerente na Loja filha) → state. Devolve a URL de
 *        autorização do Instagram. O navegador vai para lá.
 *
 *   GET  ?code&state  |  ?error&state                (o Instagram, sem sessão)
 *        O endereço cadastrado na Meta é ESTA função — HTTPS, igual para
 *        produção e para teste no localhost. Ela pergunta ao banco
 *        (instagram_connect_bounce) para onde devolver: o return_to gravado no
 *        begin, nunca um endereço vindo da URL. State desconhecido/vencido/usado
 *        = página de erro, sem redirecionar. NÃO troca o código aqui: sem a
 *        sessão do usuário não há como amarrar o state a ele.
 *
 *   POST {action:'complete', code, state}            (sessão do usuário)
 *        runCallback (logic.ts), nesta ordem: claim (queima o state, confere
 *        que é DESTE usuário) → Meta: código → token curto → token longo →
 *        /me (user_id = igAccountId) → check (Loja, conta alheia, outra conta
 *        no cartão) → subscribed_apps → commit (linha + token no Vault numa
 *        transação). Tudo o que grava é SECURITY DEFINER e só service_role.
 *
 * verify_jwt = false no config.toml por causa do GET (o navegador volta do
 * Instagram sem cabeçalho). Os dois POST validam a sessão aqui dentro
 * (auth.getUser) e o begin roda COMO o usuário.
 *
 * Respostas dos POST: recusa de negócio = 200 com {ok:false, reason, message}
 * (a tela mostra a mensagem); problema de servidor = 4xx/5xx com {error}.
 *
 * SEGREDOS: INSTAGRAM_APP_ID e INSTAGRAM_APP_SECRET (o do app de Instagram,
 * o mesmo que assina o webhook). Sem INSTAGRAM_APP_ID a função recusa tudo
 * (503). INSTAGRAM_OAUTH_REDIRECT_URI é opcional (padrão: esta função).
 *
 * NÃO VAI PARA O LOG: código, state, tokens. Sai: usuário, Loja, etapa,
 * motivo, código de erro da Meta.
 */

const META_TIMEOUT_MS = 20_000;

Deno.serve(async (req: Request) => {
  const logger = createLogger(req);
  const cors = buildCorsHeaders(req.headers.get('origin'));
  const json = (body: Record<string, unknown>, status = 200): Response =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRole) {
    logger.error('instagram-connect: ambiente incompleto');
    return json({ error: 'Servidor mal configurado.' }, 500);
  }
  const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  // ---------------------------------------------------------------------------
  // GET — a volta do Instagram
  // ---------------------------------------------------------------------------
  if (req.method === 'GET') {
    const html = (status: number, message: string) =>
      new Response(bounceErrorPage(message), { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    const input = readBounceQuery(new URL(req.url));
    if (!isStateShaped(input.state)) return html(400, BOUNCE_INVALID_MESSAGE);

    const { data: returnTo, error } = await admin.rpc('instagram_connect_bounce', { p_state: input.state });
    if (error) {
      logger.error('instagram-connect: bounce falhou', { code: error.code });
      return html(500, 'O ConvoFlow não conseguiu concluir agora. Volte à tela e tente de novo. Nada foi alterado.');
    }
    if (typeof returnTo !== 'string' || !returnTo) return html(400, BOUNCE_INVALID_MESSAGE);

    logger.info('instagram-connect: volta do Instagram', { recusou: !!input.error, temCodigo: !!input.code });
    return new Response(null, { status: 302, headers: { Location: buildReturnUrl(returnTo, input) } });
  }

  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  // ---------------------------------------------------------------------------
  // POST — sessão do usuário
  // ---------------------------------------------------------------------------
  const appId = Deno.env.get('INSTAGRAM_APP_ID');
  const appSecret = Deno.env.get('INSTAGRAM_APP_SECRET');
  if (!appId || !appSecret) {
    logger.error('instagram-connect: INSTAGRAM_APP_ID/INSTAGRAM_APP_SECRET ausente, recusando');
    return json({ error: 'A conexão do Instagram ainda não foi configurada no servidor. Fale com o suporte do ConvoFlow.' }, 503);
  }
  const redirectUri = Deno.env.get('INSTAGRAM_OAUTH_REDIRECT_URI') || defaultRedirectUri(supabaseUrl);

  const authHeader = req.headers.get('Authorization');
  const jwt = authHeader?.replace(/^Bearer\s+/i, '') ?? '';
  if (!jwt) return json({ error: 'Sessão ausente. Entre de novo no ConvoFlow.' }, 401);
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  const user = userData?.user;
  if (userErr || !user) return json({ error: 'Sessão inválida ou expirada. Entre de novo no ConvoFlow.' }, 401);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: 'Pedido inválido.' }, 400);
  }
  const parsed = parseRequestBody(raw);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const body = parsed.value;

  // ------------------------------- start -------------------------------
  if (body.action === 'start') {
    const returnTo = resolveReturnTo(req.headers.get('origin'));
    if (!returnTo) {
      logger.warn('instagram-connect: origem fora da lista', { userId: user.id });
      return json({ ok: false, reason: 'invalid_redirect', message: 'Abra o ConvoFlow pelo endereço oficial e tente de novo.' });
    }
    const asUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false },
    });
    const { data, error } = await asUser.rpc('instagram_connect_begin', {
      p_tenant_id: body.tenantId,
      p_instance_id: body.instanceId,
      p_redirect_uri: redirectUri,
      p_return_to: returnTo,
    });
    if (error) {
      logger.error('instagram-connect: begin falhou', { code: error.code });
      return json({ error: 'Não foi possível iniciar a conexão. Tente de novo.' }, 500);
    }
    const r = (data ?? {}) as Record<string, unknown>;
    if (r.ok !== true || typeof r.state !== 'string') {
      logger.info('instagram-connect: begin recusado', { userId: user.id, reason: r.reason ?? null });
      return json({ ok: false, reason: String(r.reason ?? 'unknown'), message: String(r.message ?? 'Não foi possível iniciar a conexão.') });
    }
    logger.info('instagram-connect: begin', { userId: user.id, tenantId: r.tenant_id, mode: r.mode });
    return json({ ok: true, mode: r.mode, url: buildAuthorizeUrl({ appId, redirectUri, state: r.state }) });
  }

  // ------------------------------ complete ------------------------------
  const rpcRefusal = (d: unknown, fallback: string): RpcRefusal => {
    const o = (d ?? {}) as Record<string, unknown>;
    return { ok: false, reason: String(o.reason ?? 'unknown'), message: String(o.message ?? fallback) };
  };
  const metaFetch = async (url: string, init: RequestInit): Promise<{ status: number; text: string }> => {
    try {
      const resp = await fetch(url, { ...init, signal: AbortSignal.timeout(META_TIMEOUT_MS) });
      return { status: resp.status, text: await resp.text() };
    } catch {
      return { status: 0, text: '' };
    }
  };

  const deps: CallbackDeps = {
    async claim(state, userId) {
      const { data, error } = await admin.rpc('instagram_connect_claim', { p_state: state, p_user_id: userId });
      if (error) throw new Error(`claim: ${error.code}`);
      const o = (data ?? {}) as Record<string, unknown>;
      return o.ok === true ? (o as unknown as ClaimOk) : rpcRefusal(o, 'Pedido de conexão inválido.');
    },
    async exchangeCode(code, redirect) {
      const form = new FormData();
      form.set('client_id', appId);
      form.set('client_secret', appSecret);
      form.set('grant_type', 'authorization_code');
      form.set('redirect_uri', redirect);
      form.set('code', code);
      const r = await metaFetch(INSTAGRAM_CODE_EXCHANGE_URL, { method: 'POST', body: form });
      return parseCodeExchange(r.status, r.text);
    },
    async exchangeLongLived(shortValue) {
      const qs = new URLSearchParams({ grant_type: 'ig_exchange_token', client_secret: appSecret, access_token: shortValue });
      const r = await metaFetch(`${INSTAGRAM_LONG_LIVED_URL}?${qs.toString()}`, { method: 'GET' });
      return parseLongLived(r.status, r.text);
    },
    async fetchMe(longValue) {
      const r = await metaFetch(meUrl(), { method: 'GET', headers: { Authorization: `Bearer ${longValue}` } });
      return parseMe(r.status, r.text);
    },
    async check(stateId, userId, igAccountId) {
      const { data, error } = await admin.rpc('instagram_connect_check', {
        p_state_id: stateId, p_user_id: userId, p_ig_account_id: igAccountId,
      });
      if (error) throw new Error(`check: ${error.code}`);
      const o = (data ?? {}) as Record<string, unknown>;
      return o.ok === true ? (o as unknown as CheckOk) : rpcRefusal(o, 'Conexão recusada.');
    },
    async subscribe(longValue) {
      const r = await metaFetch(subscribeUrl(), { method: 'POST', headers: { Authorization: `Bearer ${longValue}` } });
      return parseSubscribe(r.status, r.text);
    },
    async commit(a) {
      const args = {
        p_state_id: a.stateId, p_user_id: a.userId, p_ig_account_id: a.igAccountId,
        p_username: a.username, p_token: a.longToken, p_expires_in: a.expiresIn,
      };
      let res = await admin.rpc('instagram_connect_commit', args);
      // A Meta já entregou o acesso e inscreveu a conta; perder a gravação é o
      // pior caso. Uma segunda tentativa antes de desistir (o state só vira
      // "gravado" se a primeira não gravou — o banco garante).
      if (res.error) res = await admin.rpc('instagram_connect_commit', args);
      if (res.error) throw new Error(`commit: ${res.error.code}`);
      const o = (res.data ?? {}) as Record<string, unknown>;
      return o.ok === true ? (o as unknown as CommitOk) : rpcRefusal(o, 'Conexão recusada.');
    },
  };

  try {
    const result = await runCallback(deps, { userId: user.id, code: body.code, state: body.state });
    if (!result.ok) {
      logger.warn('instagram-connect: conexão não concluída', {
        userId: user.id, step: result.step, reason: result.reason,
        metaStep: result.metaStep ?? null, metaCode: result.metaCode ?? null,
      });
      return json({ ok: false, reason: result.reason, message: result.message });
    }
    logger.info('instagram-connect: conectada', {
      userId: user.id, mode: result.mode, instanceId: result.instance.id,
      tenantId: result.instance.tenant_id, expiryFromMeta: result.expiryFromMeta,
    });
    return json({ ok: true, mode: result.mode, instance: result.instance, username: result.username });
  } catch (e) {
    logger.error('instagram-connect: falha de servidor', { userId: user.id, erro: (e as Error)?.message ?? 'desconhecido' });
    return json({ error: 'O ConvoFlow não conseguiu concluir a conexão agora. Tente de novo pelo botão.' }, 500);
  }
});
