// =============================================================================
// update-api-addon — o gerente liga ou desliga o complemento "API e integrações"
// =============================================================================
// POST { ligar: true | false } com a sessão do gerente.
// Muda a assinatura viva no lugar (item do produto STRIPE_PRODUCT_API), como o
// update-store-slots faz com a Loja extra: ligar gera proporcional na próxima
// fatura; desligar tira o item SEM crédito e as chaves seguem até o fim do mês
// já pago. As regras estão em _shared/api-addon.ts (testadas no Vitest).
//
// Secrets: STRIPE_SECRET_KEY, STRIPE_PRODUCT_API, STRIPE_PRICE_API e a chave
// de liberação API_ADDON_ENABLED ("true"; desligada, só as Contas de
// API_ADDON_TEST_CONTAS). Runbook: docs/RUNBOOK_api_publica.md.
// =============================================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno';
import { buildCorsHeaders, SecureError, createErrorResponse, DataSanitizer } from '../_shared/validation.ts';
import {
  API_PRICE_ENV,
  API_PRODUCT_ENV,
  ApiAddonError,
  changeApiAddon,
  MSG_DESLIGADO,
  type Caller,
  type ContaApi,
} from '../_shared/api-addon.ts';
import { apiLiberada } from '../_shared/api/nucleo.ts';

const json = (body: unknown, status: number, cors: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function getCaller(admin: SupabaseClient, token: string): Promise<Caller & { id: string }> {
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) throw new SecureError('Sessão inválida ou expirada.', 'UNAUTHORIZED', 401);
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, role, tenant_id, status, capabilities')
    .eq('user_id', user.id)
    .maybeSingle();
  if (profileError || !profile) throw new SecureError('Perfil de usuário não encontrado.', 'NO_PROFILE', 403);
  return profile as unknown as Caller & { id: string };
}

Deno.serve(async (req: Request) => {
  const cors = buildCorsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
  if (!supabaseUrl || !serviceKey || !stripeSecret) return json({ error: 'Server misconfigured' }, 500, cors);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new SecureError('Cabeçalho de autorização ausente.', 'UNAUTHORIZED', 401);
    const caller = await getCaller(admin, authHeader.replace(/^Bearer\s+/i, ''));

    if (!apiLiberada(Deno.env.get('API_ADDON_ENABLED'), Deno.env.get('API_ADDON_TEST_CONTAS'), caller.tenant_id)) {
      return json({ error: MSG_DESLIGADO }, 503, cors);
    }

    let body: { ligar?: unknown };
    try {
      body = (await req.json()) as { ligar?: unknown };
    } catch {
      throw new SecureError('Corpo da requisição inválido.', 'VALIDATION_ERROR', 400);
    }

    const stripe = new Stripe(stripeSecret, { apiVersion: '2024-12-18.acacia', httpClient: Stripe.createFetchHttpClient() });
    const r = await changeApiAddon(
      {
        stripe,
        productId: Deno.env.get(API_PRODUCT_ENV)?.trim() || null,
        priceId: Deno.env.get(API_PRICE_ENV)?.trim() || null,
        now: () => new Date(),
        async loadConta(id: string) {
          const { data, error } = await admin
            .from('tenants')
            .select('id, kind, subscription_id, subscription_status, manual_access_granted, api_addon_cobrado, api_addon_ate')
            .eq('id', id)
            .maybeSingle();
          if (error) throw new ApiAddonError(`Falha ao ler a Conta: ${error.message}`, 500);
          return (data as ContaApi | null) ?? null;
        },
        async saveConta(id, patch) {
          const { error } = await admin
            .from('tenants')
            .update({ ...patch, updated_at: new Date().toISOString() })
            .eq('id', id);
          if (error) throw new ApiAddonError(`A assinatura foi atualizada, mas a Conta não: ${error.message}`, 500);
        },
        log: (level, msg, ctx) => console[level === 'info' ? 'log' : level](msg, DataSanitizer.sanitizeForLog(ctx ?? {})),
      },
      caller,
      body.ligar,
    );

    const { data: estado } = await admin.rpc('api_addon_estado', { p_conta: caller.tenant_id });
    const e = Array.isArray(estado) ? estado[0] : estado;
    return json({ success: true, cobrado: r.cobrado, ate: r.ate, estado: e ?? null }, 200, cors);
  } catch (err) {
    if (err instanceof SecureError) return createErrorResponse(err, undefined, req.headers.get('origin'));
    if (err instanceof ApiAddonError) return json({ error: err.message }, err.status, cors);
    console.error('update-api-addon error:', err instanceof Error ? err.message : err);
    return json({ error: 'Não foi possível mudar a API agora. Tente de novo.' }, 500, cors);
  }
});
