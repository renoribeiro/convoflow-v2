import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import { can, CAPABILITY_DENIAL_MESSAGES, statusDenialMessage } from "../_shared/capabilities.ts";
import { checkoutBlockReason, trialDaysForCheckout } from "../_shared/subscription-state.ts";

// =============================================================================
// create-checkout-session
// -----------------------------------------------------------------------------
// Cria uma sessão de Stripe Checkout (assinatura mensal recorrente) para a
// Conta Gerente do usuário autenticado. Padronizado em ENV secrets:
//   - STRIPE_SECRET_KEY        → chave secreta (sk_test_/sk_live_)
//   - STRIPE_PRICE_GERENTE     → Price recorrente da conta Gerente, R$ 499,90/mês
//                                (inclui 5 lojas). Fallback: STRIPE_PRICE_ID (legado).
//   - STRIPE_PRICE_STORE_SLOT  → Price recorrente de loja extra, R$ 99,90/mês
//                                (quantidade = nº de lojas extras). Opcional.
//   - APP_URL (opcional)       → fallback de origem para os redirects
//
// O corpo da requisição aceita { extraSlots?: number } para já contratar lojas
// extras junto da conta. O preço é sempre fixado no servidor (env).
//
// Segurança:
//   - O tenant_id NÃO vem do browser: é resolvido no servidor a partir do
//     profiles do usuário logado. Assim ninguém paga por outra Conta.
//   - O Price também é fixado no servidor (env), então o cliente não troca o preço.
//   - O tenant_id vai no metadata da sessão E da assinatura — o stripe-webhook
//     acha a Conta por ele. O client_reference_id ficou para o Rewardful.
//
// Teste grátis (2026-09-26): a PRIMEIRA assinatura da Conta começa com
// TRIAL_DAYS dias de teste, com o cartão cadastrado no checkout; no fim do
// teste o Stripe cobra o plano. Conta que já assinou antes não ganha outro
// teste (ver trialDaysForCheckout). O cliente do Stripe é UM por Conta, criado
// aqui na primeira vez e reaproveitado depois (tenants.stripe_customer_id).
// =============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** O erro do Stripe para "esse id não existe nesta conta do Stripe". */
function naoExiste(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === "resource_missing";
}

/**
 * O cliente do Stripe desta Conta: o guardado em tenants.stripe_customer_id se
 * ele ainda existe no Stripe; senão, um novo, gravado na Conta.
 *
 * "Ainda existe" importa: o id guardado pode ser de outra conta do Stripe (a
 * troca de conta do ConvoFlow), do modo de teste, ou de um cliente apagado.
 * Passar um id assim ao checkout derrubaria a assinatura da Conta com um erro
 * que o gerente não entende.
 *
 * A chave de idempotência amarra a criação à Conta e ao id que estava gravado:
 * clique duplo cria UM cliente só (o Stripe devolve o mesmo por 24 h).
 */
async function clienteDaConta(
  stripe: Stripe,
  admin: ReturnType<typeof createClient>,
  conta: { tenantId: string; nome: string | null; email: string | null; atual: string | null },
): Promise<string> {
  if (conta.atual) {
    try {
      const existente = await stripe.customers.retrieve(conta.atual);
      if (!(existente as { deleted?: boolean }).deleted) return conta.atual;
    } catch (err) {
      if (!naoExiste(err)) throw err;
    }
  }

  const novo = await stripe.customers.create(
    {
      email: conta.email ?? undefined,
      name: conta.nome ?? undefined,
      metadata: { tenant_id: conta.tenantId },
    },
    { idempotencyKey: `convoflow-cliente:${conta.tenantId}:${conta.atual ?? "nenhum"}` },
  );

  const { error } = await admin
    .from("tenants")
    .update({ stripe_customer_id: novo.id })
    .eq("id", conta.tenantId);
  // Não gravar não impede a venda: o stripe-webhook grava o cliente da
  // assinatura quando o checkout terminar.
  if (error) console.error("Falha ao gravar stripe_customer_id:", error.message);

  return novo.id;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
    // Price da conta Gerente (R$ 499,90/mês). Fallback ao nome legado durante a transição.
    const gerentePrice = Deno.env.get("STRIPE_PRICE_GERENTE") ?? Deno.env.get("STRIPE_PRICE_ID");
    // Price de loja extra (R$ 99,90/mês). Opcional — só necessário se comprar slots extras.
    const slotPrice = Deno.env.get("STRIPE_PRICE_STORE_SLOT");

    if (!stripeSecret || !gerentePrice) {
      console.error("Missing STRIPE_SECRET_KEY or STRIPE_PRICE_GERENTE");
      return new Response(
        JSON.stringify({ error: "Cobrança ainda não configurada." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Lojas extras opcionais (0..100) + referral do Rewardful. O corpo pode vir vazio.
    let extraSlots = 0;
    let referral: string | undefined;
    try {
      const parsed = await req.clone().json();
      extraSlots = Math.max(0, Math.min(100, Math.floor(Number(parsed?.extraSlots) || 0)));
      if (parsed?.referral && typeof parsed.referral === "string") referral = parsed.referral;
    } catch {
      // sem corpo / corpo inválido → sem lojas extras
    }
    if (extraSlots > 0 && !slotPrice) {
      return new Response(
        JSON.stringify({ error: "Compra de lojas extras ainda não configurada." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---- Autenticação: resolve o usuário a partir do JWT ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");

    const {
      data: { user },
      error: userError,
    } = await createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    ).auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- Resolve o tenant do usuário no servidor (service role) ----
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("tenant_id, role, status, capabilities")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile?.tenant_id) {
      console.error("Could not resolve tenant for user", user.id, profileError);
      return new Response(
        JSON.stringify({ error: "Conta não encontrada para este usuário." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Conta parada não contrata plano.
    if (profile.status !== "active") {
      return new Response(
        JSON.stringify({ error: statusDenialMessage(profile.status as string) }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // `billing.manage`, NÃO `billing.view`. Nega o atendente, que é quem
    // realmente não pode contratar nada.
    //
    // ATENÇÃO — o motivo original desta escolha caducou. Ela existia porque
    // "quem assina o plano de uma Loja é o próprio GESTOR". Desde 2026-08-18
    // isso não é mais verdade: só a Conta assina, e a Loja herda o acesso dela
    // (ver a trava de `kind` logo abaixo, que é quem barra o gestor hoje).
    // A capability foi mantida como está de propósito: trocar por billing.view
    // é mudança de comportamento em cima do fluxo de pagamento, e o gestor já
    // não passa da trava de `kind` de qualquer jeito.
    if (!can(profile.role as string, "billing.manage", profile.capabilities as Record<string, unknown> | null)) {
      return new Response(
        JSON.stringify({ error: CAPABILITY_DENIAL_MESSAGES["billing.manage"] }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const tenantId = profile.tenant_id as string;

    // Já assinante? Evita checkout duplicado.
    const { data: tenant } = await admin
      .from("tenants")
      .select("name, kind, subscription_id, subscription_status, stripe_customer_id")
      .eq("id", tenantId)
      .maybeSingle();

    // -------------------------------------------------------------------
    // Só a CONTA assina.
    //
    // `profile.tenant_id` de um gestor é uma LOJA. Sem esta trava, o checkout
    // dele gravaria subscription_id/subscription_status numa linha de Loja —
    // e desde que o acesso passou a ser herdado da Conta
    // (tenant_access_state, migração 20260818000001) essa assinatura não
    // liberaria nem a própria Loja: quem é lido é o pai. Seria dinheiro
    // cobrado sem acesso entregue.
    //
    // A capability continua sendo `billing.manage` logo acima: ela nega o
    // atendente. Esta checagem é a que decide QUAL tenant pode assinar.
    // Tenant não encontrado também cai aqui, em vez de virar checkout órfão.
    // -------------------------------------------------------------------
    if (tenant?.kind !== "account") {
      return new Response(
        JSON.stringify({
          error:
            "O plano é contratado pela Conta, não pela Loja. Fale com o Gerente responsável pela sua Conta para assinar.",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Qualquer assinatura que libera o sistema (ativa, em teste ou com
    // pagamento pendente) barra um segundo checkout: ele criaria uma SEGUNDA
    // assinatura cobrando em paralelo. Antes só 'active' barrava.
    const bloqueio = checkoutBlockReason(tenant.subscription_status as string | null);
    if (bloqueio) {
      return new Response(
        JSON.stringify({ error: bloqueio }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---- Monta URLs de retorno a partir da origem da requisição ----
    const origin =
      req.headers.get("origin") || Deno.env.get("APP_URL") || "";
    const successUrl = `${origin}/dashboard/settings?checkout=success`;
    const cancelUrl = `${origin}/dashboard/settings?checkout=cancel`;

    // ---- Cria a sessão de Checkout ----
    const stripe = new Stripe(stripeSecret, {
      apiVersion: "2024-12-18.acacia",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const customerId = await clienteDaConta(stripe, admin, {
      tenantId,
      nome: (tenant.name as string | null) ?? null,
      email: user.email ?? null,
      atual: (tenant.stripe_customer_id as string | null) ?? null,
    });
    const diasDeTeste = trialDaysForCheckout({
      subscription_id: (tenant.subscription_id as string | null) ?? null,
    });

    const lineItems: Array<{ price: string; quantity: number }> = [
      { price: gerentePrice, quantity: 1 },
    ];
    if (extraSlots > 0 && slotPrice) {
      lineItems.push({ price: slotPrice, quantity: extraSlots });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: lineItems,
      // Rewardful usa client_reference_id para atribuir a indicação (só se houver).
      // O nosso tenant_id vai no metadata (lido pelo stripe-webhook).
      ...(referral ? { client_reference_id: referral } : {}),
      // O cliente da Conta, sempre o mesmo. `customer_email` não vai junto: o
      // e-mail já está no cliente.
      customer: customerId,
      // Cartão SEMPRE, inclusive com teste grátis (é o padrão; explícito para
      // ninguém trocar por 'if_required' sem ler isto): sem cartão, o fim do
      // teste não tem o que cobrar.
      payment_method_collection: "always",
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { tenant_id: tenantId, extra_slots: String(extraSlots) },
        ...(diasDeTeste
          ? {
            trial_period_days: diasDeTeste,
            // Rede de segurança: se ainda assim faltar cartão no fim do teste,
            // a assinatura é cancelada (e a Conta tranca) em vez de seguir.
            trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
          }
          : {}),
      },
      metadata: { tenant_id: tenantId, extra_slots: String(extraSlots) },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("create-checkout-session error:", err?.message ?? err);
    return new Response(
      JSON.stringify({ error: err?.message ?? "Erro ao iniciar checkout" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
