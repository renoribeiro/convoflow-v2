// =============================================================================
// manage-subscription — cancelar / desfazer o cancelamento / trocar o cartão
// (teste grátis, entrega 3)
// =============================================================================
// POST { action: 'preview' | 'schedule_cancel' | 'undo_cancel' | 'card_portal' | 'card_sync' }
//
// Só o GERENTE ativo, sobre a própria Conta — conferido no servidor a partir do
// JWT (ver _shared/manage-subscription.ts). Esta função NÃO grava na Conta: o
// estado volta pelo stripe-webhook, que relê a assinatura a cada evento.
//
// Secrets: STRIPE_SECRET_KEY (a mesma do checkout e do webhook).
// Opcional: STRIPE_PORTAL_CONFIGURATION_ID — uma configuração do portal criada
// pela API; sem ele o Stripe usa a configuração padrão do Dashboard.
// =============================================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno';
import { buildCorsHeaders } from '../_shared/validation.ts';
import {
  manageSubscription,
  type Caller,
  type ManageDeps,
  type StripePort,
} from '../_shared/manage-subscription.ts';

function json(status: number, body: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Método não permitido.' }, cors);

  let action: unknown = null;
  try {
    action = ((await req.json()) as { action?: unknown })?.action ?? null;
  } catch {
    return json(400, { error: 'Pedido inválido.' }, cors);
  }

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Quem chama: o JWT resolve o login; o CARGO vem do perfil no banco.
  let caller: Caller | null = null;
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (token) {
    const { data } = await createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '').auth.getUser(token);
    if (data?.user) {
      const { data: perfil } = await admin
        .from('profiles')
        .select('id, role, status, tenant_id')
        .eq('user_id', data.user.id)
        .maybeSingle();
      if (perfil) {
        caller = {
          profileId: perfil.id as string,
          role: String(perfil.role ?? ''),
          status: String(perfil.status ?? ''),
          tenantId: (perfil.tenant_id as string | null) ?? null,
        };
      }
    }
  }

  const segredo = Deno.env.get('STRIPE_SECRET_KEY');
  const stripe = segredo
    ? new Stripe(segredo, { apiVersion: '2024-12-18.acacia', httpClient: Stripe.createFetchHttpClient() })
    : null;
  const configuracaoDoPortal = Deno.env.get('STRIPE_PORTAL_CONFIGURATION_ID') || null;

  const porta: StripePort | null = stripe
    ? {
      retrieveSubscription: (id) => stripe.subscriptions.retrieve(id) as never,
      updateSubscription: (id, params, idempotencyKey) =>
        stripe.subscriptions.update(id, params as never, { idempotencyKey }) as never,
      retrieveCustomer: (id) => stripe.customers.retrieve(id) as never,
      updateCustomer: (id, params, idempotencyKey) =>
        stripe.customers.update(id, params as never, { idempotencyKey }) as never,
      retrievePaymentMethod: (id) => stripe.paymentMethods.retrieve(id) as never,
      createPortalSession: (params) =>
        stripe.billingPortal.sessions.create({
          ...(params as Record<string, unknown>),
          ...(configuracaoDoPortal ? { configuration: configuracaoDoPortal } : {}),
        } as never) as never,
    }
    : null;

  const deps: ManageDeps = {
    caller,
    stripe: porta,
    // A origem liberada pelo CORS (o site) é a volta do portal.
    siteUrl: cors['Access-Control-Allow-Origin'],
    now: () => new Date(),
    async loadConta(tenantId) {
      const { data } = await admin
        .from('tenants')
        .select('id, kind, subscription_id, stripe_customer_id')
        .eq('id', tenantId)
        .maybeSingle();
      return (data as never) ?? null;
    },
    log(level, msg, ctx) {
      const linha = ctx ? `${msg} ${JSON.stringify(ctx)}` : msg;
      if (level === 'error') console.error(linha);
      else if (level === 'warn') console.warn(linha);
      else console.log(linha);
    },
  };

  const r = await manageSubscription(action, deps);
  return json(r.status, r.body, cors);
});
