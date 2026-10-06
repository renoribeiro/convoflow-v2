// =============================================================================
// stripe-admin — Faturamento da Administração (superadmin)
// =============================================================================
// Toda a regra mora em ../_shared/stripe-admin-core.ts (testada no Vitest). Aqui
// só se descobre QUEM chama e se ligam o Supabase e o Stripe.
//
// Quem chama:
//   1. backend: x-cron-secret do Vault ou a chave sb_secret_ (mesma regra dos
//      workers, _shared/backend-caller.ts) → só as BACKEND_ACTIONS do núcleo;
//   2. login de superadmin (o cargo vem de profiles, lido no servidor).
//
// Secrets: STRIPE_SECRET_KEY (a mesma do checkout e do webhook) e, para o
// estado e a receita mensal, STRIPE_PRICE_GERENTE / STRIPE_PRICE_STORE_SLOT.
// A tabela stripe_config não é lida nem gravada.
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import { cronSecretLoader, decideBackendCaller, secretKeys } from "../_shared/backend-caller.ts";
import { handleStripeAdmin, type AdminCaller } from "../_shared/stripe-admin-core.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const getEnv = (name: string) => Deno.env.get(name);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // --- Quem chama ---
    let caller: AdminCaller = null;
    const backend = await decideBackendCaller(req.headers, {
      secretKeys: secretKeys(getEnv),
      loadCronSecret: cronSecretLoader(supabaseClient),
    });
    if (backend.ok) {
      caller = { kind: 'backend' };
    } else {
      const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
      if (token) {
        const { data: { user } } = await createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        ).auth.getUser(token);

        if (user) {
          const { data: profile } = await supabaseClient
            .from('profiles')
            .select('role')
            .eq('user_id', user.id)
            .single();
          caller = profile?.role === 'superadmin' ? { kind: 'superadmin' } : { kind: 'other' };
        }
      }
    }

    let action: unknown = null;
    let payload: unknown = null;
    try {
      const body = await req.json();
      action = body?.action ?? null;
      payload = body?.payload ?? null;
    } catch {
      return json(400, { error: 'Pedido inválido.' });
    }

    const result = await handleStripeAdmin(action, payload, {
      caller,
      getEnv,
      createStripe: (secretKey) =>
        new Stripe(secretKey, {
          apiVersion: '2023-10-16',
          httpClient: Stripe.createFetchHttpClient(),
        }),
      db: supabaseClient,
      now: () => new Date(),
      log(level, msg, ctx) {
        const linha = ctx ? `${msg} ${JSON.stringify(ctx)}` : msg;
        if (level === 'error') console.error(linha);
        else if (level === 'warn') console.warn(linha);
        else console.log(linha);
      },
    });

    if (caller?.kind === 'backend') {
      console.log(`stripe-admin: ação ${String(action)} pedida pelo backend (${backend.ok ? backend.via : '-'}) -> ${result.status}`);
    }

    return json(result.status, result.body);
  } catch (error: unknown) {
    return json(400, { error: (error as Error)?.message ?? String(error) });
  }
});
