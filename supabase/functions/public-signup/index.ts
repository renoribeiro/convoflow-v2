// =============================================================================
// public-signup — cadastro pelo site (teste grátis, entrega 2)
// =============================================================================
// Público: o visitante não tem sessão, então verify_jwt = false (config.toml).
// Quem protege a porta:
//   - PUBLIC_SIGNUP_ENABLED   secret; diferente de "true" → 503 para tudo
//   - TURNSTILE_SECRET_KEY    secret; ausente → 503 (fecha, não abre sem robô)
//   - Turnstile               token verificado no Cloudflare, com a ação
//                             'cadastro' e, se TURNSTILE_ALLOWED_HOSTNAMES
//                             estiver setado, o hostname
//   - checkRateLimitDb        5 pedidos/hora por IP, 3/dia por e-mail (hash),
//                             recusando quando a própria checagem falha
//   - public_signup_registrar teto do sistema inteiro por hora e por dia
//                             (limites_da_plataforma); erro também é recusa
//
// NUNCA liga o "Allow new users to sign up" do Supabase: a conta é criada aqui,
// com a chave de serviço, por convite. O cargo é fixo (gerente) e a Conta é a
// que este servidor cria — ver _shared/public-signup.ts.
//
// Toda a lógica está em _shared/public-signup.ts (testada no Vitest). Aqui só
// o que depende do Deno, do Supabase e do Cloudflare.
// =============================================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildCorsHeaders } from '../_shared/validation.ts';
import { checkRateLimitDb } from '../_shared/rateLimit.ts';
import { recordAuthEmailFailure } from '../_shared/auth-email-failures.ts';
import { sufixoAleatorio } from '../_shared/conta-slug.ts';
import {
  handlePublicSignup,
  SIGNUP_RATE_LIMITS,
  TURNSTILE_ACTION,
  type PublicSignupDeps,
} from '../_shared/public-signup.ts';

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

async function sha256(texto: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function ipDoCliente(req: Request): string | null {
  const encaminhado = req.headers.get('x-forwarded-for');
  if (encaminhado) return encaminhado.split(',')[0]?.trim() || null;
  return req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || null;
}

Deno.serve(async (req) => {
  const origem = req.headers.get('origin');
  const cors = buildCorsHeaders(origem);
  // A origem liberada pelo CORS (a do site, ou a principal) é a base do link do
  // convite. O Supabase ainda confere o link contra a lista de Redirect URLs.
  const baseDoSite = cors['Access-Control-Allow-Origin'];

  const turnstileSecret = Deno.env.get('TURNSTILE_SECRET_KEY') ?? '';
  const hostnames = (Deno.env.get('TURNSTILE_ALLOWED_HOSTNAMES') ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const deps: PublicSignupDeps = {
    enabled: Deno.env.get('PUBLIC_SIGNUP_ENABLED') === 'true',
    turnstileConfigured: turnstileSecret.length > 0,
    corsHeaders: cors,
    clientIp: ipDoCliente(req),
    redirectTo: `${baseDoSite}/definir-senha`,
    slugSuffix: sufixoAleatorio,

    async verifyTurnstile(token, ip) {
      const form = new FormData();
      form.append('secret', turnstileSecret);
      form.append('response', token);
      if (ip) form.append('remoteip', ip);
      form.append('idempotency_key', crypto.randomUUID());
      const r = await fetch(SITEVERIFY, { method: 'POST', body: form });
      if (!r.ok) return false;
      const d = (await r.json()) as { success?: boolean; action?: string; hostname?: string };
      if (d.success !== true) return false;
      if (d.action && d.action !== TURNSTILE_ACTION) return false;
      if (hostnames.length > 0 && !hostnames.includes((d.hostname ?? '').toLowerCase())) return false;
      return true;
    },

    async allowRequest(bucket, key) {
      const cfg = SIGNUP_RATE_LIMITS[bucket];
      const r = await checkRateLimitDb(admin, await sha256(`${bucket}:${key}`), {
        maxRequests: cfg.maxRequests,
        windowMs: cfg.windowMs,
        keyPrefix: `cadastro-${bucket}`,
        failClosed: true,
      });
      return r.allowed;
    },

    async insertLead(f) {
      // Grava conferindo o teto do sistema inteiro, numa transação só.
      const { data, error } = await admin.rpc('public_signup_registrar', {
        p_first_name: f.firstName,
        p_last_name: f.lastName,
        p_email: f.email,
        p_company_name: f.companyName,
        p_phone: f.phone,
        p_terms_version: f.termsVersion,
        p_privacy_version: f.privacyVersion,
      });
      if (error) {
        const e = error as { code?: string; hint?: string; message?: string };
        if (e.code === 'CF429') return { teto: e.hint === 'teto_dia' ? 'dia' : 'hora' };
        throw new Error(e.message ?? 'public_signup_registrar falhou');
      }
      if (typeof data !== 'string') throw new Error('public_signup_registrar sem retorno');
      return data;
    },

    async startSignup(leadId, slug) {
      const { data, error } = await admin.rpc('public_signup_start', { p_lead_id: leadId, p_slug: slug });
      if (error) throw new Error(error.message);
      const linha = (Array.isArray(data) ? data[0] : data) as { resultado?: string; conta_id?: string | null } | null;
      if (!linha?.resultado) throw new Error('public_signup_start sem resposta');
      return {
        outcome: linha.resultado === 'created' ? 'created' : 'email_exists',
        tenantId: linha.conta_id ?? null,
      };
    },

    async inviteGerente(email, metadata, redirectTo) {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { data: metadata, redirectTo });
      return {
        userId: data?.user?.id ?? null,
        error: error
          ? { status: (error as { status?: number }).status, code: (error as { code?: string }).code, message: error.message }
          : null,
      };
    },

    async markInvited(leadId, userId) {
      const { error } = await admin.rpc('public_signup_invited', { p_lead_id: leadId, p_user_id: userId });
      if (error) throw new Error(error.message);
    },

    async markFailed(leadId, code, detail) {
      const { error } = await admin.rpc('public_signup_failed', {
        p_lead_id: leadId,
        p_code: code,
        p_detail: detail,
      });
      if (error) throw new Error(error.message);
    },

    recordEmailFailure: (err) => recordAuthEmailFailure(admin, 'public_signup_invite', err),

    runInBackground(task) {
      // EdgeRuntime é global do runtime do Supabase: mantém o trabalho vivo
      // depois de a resposta sair.
      const runtime = (globalThis as { EdgeRuntime?: { waitUntil?(p: Promise<unknown>): void } })
        .EdgeRuntime;
      if (runtime?.waitUntil) {
        runtime.waitUntil(task);
      } else {
        // Fora do runtime do Supabase (serve local antigo): segue sem bloquear.
        task.catch(() => {});
      }
    },

    agora: () => Date.now(),
    esperar: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),

    log(level, message, context) {
      const linha = context ? `${message} ${JSON.stringify(context)}` : message;
      if (level === 'error') console.error(linha);
      else if (level === 'warn') console.warn(linha);
      else console.log(linha);
    },
  };

  return handlePublicSignup(req, deps);
});
