import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno'
import { syncSubscriptionFromEvent } from '../_shared/stripe-webhook-sync.ts'
import type { TenantBillingRow } from '../_shared/subscription-state.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-12-18.acacia',
  httpClient: Stripe.createFetchHttpClient(),
});

const cryptoProvider = Stripe.createSubtleCryptoProvider();

const SLOT_PRICE = Deno.env.get('STRIPE_PRICE_STORE_SLOT') ?? '';
// Produto 'Atendente extra' (reconhecido pelo PRODUTO, não pelo preço). Vazio = não mexe.
const ATTENDANT_PRODUCT = Deno.env.get('STRIPE_PRODUCT_ATTENDANT') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const COLUNAS_DA_CONTA = 'id, kind, subscription_id, subscription_status';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const signature = req.headers.get('Stripe-Signature')

  if (!signature) {
    return new Response('Webhook Error: Missing Stripe-Signature', { status: 400 })
  }

  const body = await req.text()
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')

  if (!webhookSecret) {
      console.error("Missing STRIPE_WEBHOOK_SECRET configuration");
      return new Response("Configuration Error", { status: 500 });
  }

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret,
      undefined,
      cryptoProvider
    );
  } catch (err) {
    console.error(`Webhook signature verification failed: ${err.message}`)
    return new Response(`Webhook Error: ${err.message}`, { status: 400 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  console.log(`Processing event: ${event.type} [${event.id}]`)

  // Idempotencia. O Stripe reenvia o mesmo evento quando a resposta demora ou
  // falha. Como o handler DERIVA tudo da assinatura, reprocessar seria
  // inofensivo; a guarda evita o trabalho e mantem o log honesto.
  const { data: jaProcessado } = await supabase
    .from('stripe_webhook_logs')
    .select('id')
    .eq('stripe_event_id', event.id)
    .maybeSingle();

  if (jaProcessado) {
    console.log(`Evento ${event.id} ja processado; ignorando reenvio.`)
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  }

  try {
    // Todo evento de assinatura -- checkout, customer.subscription.* e
    // invoice.* -- vira "releia a assinatura e copie o estado de agora para a
    // Conta". O status que o evento carrega nao e usado: ele e uma foto do
    // passado, pode chegar fora de ordem, e a fatura de R$ 0 do inicio do
    // teste gratis marcaria o teste como pago. Ver _shared/subscription-state.ts.
    const outcome = await syncSubscriptionFromEvent(event, {
      retrieveSubscription: (id) => stripe.subscriptions.retrieve(id),
      loadTenantById: async (id) => {
        const { data, error } = await supabase
          .from('tenants').select(COLUNAS_DA_CONTA).eq('id', id).maybeSingle();
        // id que nao e uuid (o referral do Rewardful no client_reference_id)
        // volta erro de sintaxe: e so "nao e Conta nenhuma".
        if (error) {
          console.warn(`Conta ${id} nao consultada: ${error.message}`);
          return null;
        }
        return (data as TenantBillingRow | null) ?? null;
      },
      loadTenantBySubscriptionId: async (subscriptionId) => {
        const { data, error } = await supabase
          .from('tenants').select(COLUNAS_DA_CONTA).eq('subscription_id', subscriptionId).limit(1);
        if (error) throw error;
        return (data?.[0] as TenantBillingRow | undefined) ?? null;
      },
      updateTenant: async (tenantId, patch) => {
        const { error } = await supabase.from('tenants').update(patch).eq('id', tenantId);
        if (error) {
          console.error("Error updating tenant:", error);
          throw error;
        }
      },
      slotPriceId: SLOT_PRICE,
      attendantProductId: ATTENDANT_PRODUCT,
      now: () => new Date(),
    });

    switch (outcome.result) {
      case 'written':
        console.log(`Conta ${outcome.tenantId}: assinatura ${outcome.subscriptionId} -> ${outcome.status} (${outcome.action}, vagas extras: ${outcome.patch.store_slots_extra ?? 'inalterado'}, atendentes extras: ${outcome.patch.atendentes_extra_cobrados ?? 'inalterado'}, cancela: ${outcome.patch.subscription_will_cancel})`)
        break;
      case 'ignored':
        // other_subscription com as DUAS assinaturas vivas e cobranca em
        // dobro: a trava de checkout duplicado existe para isso nao acontecer.
        console.warn(`Assinatura ${outcome.subscriptionId} (${outcome.status}) NAO gravada na Conta ${outcome.tenantId}: ${outcome.reason}`)
        break;
      case 'no_tenant':
        console.warn(`Assinatura ${outcome.subscriptionId} (${outcome.status}) sem Conta correspondente.`)
        break;
      default:
        break;
    }

    // Log event to DB
    const { error: logError } = await supabase.from('stripe_webhook_logs').insert({
        stripe_event_id: event.id,
        event_type: event.type,
        payload: event.data.object,
        processed: true
    });
    
    if (logError) console.error("Error logging webhook:", logError);

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (err) {
    console.error(`Error processing webhook: ${err.message}`)
    return new Response(`Error processing webhook: ${err.message}`, { status: 500 })
  }
})
