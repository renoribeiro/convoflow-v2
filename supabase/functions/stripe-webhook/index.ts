import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno'
import { syncSubscriptionFromEvent } from '../_shared/stripe-webhook-sync.ts'
import type { TenantBillingRow } from '../_shared/subscription-state.ts'
import { recordChargeFromEvent, type ChargeRow } from '../_shared/billing-charges.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-12-18.acacia',
  httpClient: Stripe.createFetchHttpClient(),
});

const cryptoProvider = Stripe.createSubtleCryptoProvider();

const SLOT_PRICE = Deno.env.get('STRIPE_PRICE_STORE_SLOT') ?? '';
// Produto 'Atendente extra' (reconhecido pelo PRODUTO, não pelo preço). Vazio = não mexe.
const ATTENDANT_PRODUCT = Deno.env.get('STRIPE_PRODUCT_ATTENDANT') ?? '';
// Produto 'API e integrações' (reconhecido pelo PRODUTO). Vazio = não mexe.
const API_PRODUCT = Deno.env.get('STRIPE_PRODUCT_API') ?? '';

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

  // Dois trabalhos independentes por evento: o estado da assinatura na Conta
  // (o de sempre, intocado) e o registro da cobrança (nota fiscal, parte 1).
  // Um não impede o outro; se qualquer um falhar, a resposta é 500 e o Stripe
  // reenvia — os dois são idempotentes.
  const falhas: string[] = []

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
      apiProductId: API_PRODUCT,
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
  } catch (err) {
    console.error(`Erro na assinatura do evento ${event.id}: ${err.message}`)
    falhas.push(`assinatura: ${err.message}`)
  }

  try {
    // Toda fatura paga vira uma linha de billing_charges (uma por fatura) e
    // todo reembolso é anotado nela. Ver _shared/billing-charges.ts.
    const cobranca = await recordChargeFromEvent(event, {
      retrieveInvoice: (id) => stripe.invoices.retrieve(id),
      retrieveCharge: (id) => stripe.charges.retrieve(id, { expand: ['refunds'] }),
      loadAccountBySubscriptionId: async (subscriptionId) => {
        const { data, error } = await supabase
          .from('tenants').select('id').eq('subscription_id', subscriptionId).eq('kind', 'account').limit(1);
        if (error) throw error;
        return (data?.[0]?.id as string | undefined) ?? null;
      },
      loadAccountById: async (id) => {
        const { data, error } = await supabase
          .from('tenants').select('id').eq('id', id).eq('kind', 'account').maybeSingle();
        // id que nao e uuid: "nao e Conta nenhuma", como no loadTenantById acima.
        if (error) return null;
        return (data?.id as string | undefined) ?? null;
      },
      loadAccountByCustomerId: async (customerId) => {
        const { data, error } = await supabase
          .from('tenants').select('id').eq('stripe_customer_id', customerId).eq('kind', 'account').limit(1);
        if (error) throw error;
        return (data?.[0]?.id as string | undefined) ?? null;
      },
      insertChargeIfNew: async (row: ChargeRow) => {
        const { data, error } = await supabase
          .from('billing_charges')
          .upsert(row, { onConflict: 'stripe_invoice_id', ignoreDuplicates: true })
          .select('id');
        if (error) throw error;
        return (data?.length ?? 0) > 0 ? 'inserted' : 'exists';
      },
      findInvoiceIdByCharge: async (chargeId, paymentIntentId) => {
        const filtro = paymentIntentId
          ? `stripe_charge_id.eq.${chargeId},stripe_payment_intent_id.eq.${paymentIntentId}`
          : `stripe_charge_id.eq.${chargeId}`;
        const { data, error } = await supabase
          .from('billing_charges').select('stripe_invoice_id').or(filtro).limit(1);
        if (error) throw error;
        return (data?.[0]?.stripe_invoice_id as string | undefined) ?? null;
      },
      updateRefund: async (invoiceId, patch) => {
        const { data, error } = await supabase
          .from('billing_charges')
          .update({ ...patch, updated_at: new Date().toISOString() })
          .eq('stripe_invoice_id', invoiceId)
          .select('id');
        if (error) throw error;
        return data?.length ?? 0;
      },
    });

    switch (cobranca.result) {
      case 'recorded':
        console.log(`Cobranca ${cobranca.invoiceId} gravada (Conta ${cobranca.tenantId ?? 'nao identificada'}, ${cobranca.row.amount_paid_cents} centavos, nota: ${cobranca.row.nota_status})`)
        break;
      case 'already_recorded':
        console.log(`Cobranca ${cobranca.invoiceId} ja estava gravada.`)
        break;
      case 'not_paid':
        console.log(`Fatura ${cobranca.invoiceId} nao esta paga (${cobranca.status}); nada gravado.`)
        break;
      case 'refund_recorded':
        console.log(`Reembolso da cobranca ${cobranca.chargeId} gravado na fatura ${cobranca.invoiceId}: ${cobranca.patch.amount_refunded_cents} centavos.`)
        break;
      case 'refund_without_invoice':
        console.warn(`Reembolso da cobranca ${cobranca.chargeId} sem fatura correspondente; nada gravado.`)
        break;
      default:
        break;
    }
  } catch (err) {
    console.error(`Erro ao gravar a cobranca do evento ${event.id}: ${err.message}`)
    falhas.push(`cobranca: ${err.message}`)
  }

  if (falhas.length) {
    // Sem log do evento: o reenvio do Stripe precisa passar pela guarda acima.
    return new Response(`Error processing webhook: ${falhas.join(' | ')}`, { status: 500 })
  }

  try {
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
