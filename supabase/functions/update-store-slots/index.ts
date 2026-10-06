// =============================================================================
// update-store-slots — muda o número de Lojas adicionais da Conta
// =============================================================================
// O caminho que faltava. Contratar Loja extra era feito por CHECKOUT, e
// `create-checkout-session` recusa com 409 quem já assina — então uma Conta
// assinante NUNCA conseguia contratar mais nenhuma Loja. O 409 continua lá e
// está certo: ele é correto para *checkout*. O que muda é que comprar vaga
// deixa de passar por checkout.
//
// Aqui a assinatura existente é alterada no lugar: o item de vaga ganha (ou
// perde) quantidade. É a operação certa para uma assinatura viva — gera
// proração, não uma segunda cobrança cheia.
//
// O corpo pede o TOTAL desejado, não um incremento. Foi a confusão entre esses
// dois que produziu o defeito de atribuição no webhook; com "total" o pedido é
// idempotente por construção e repetir a chamada não acumula nada.
//
// As regras (quem pode, quanto, cabe?, o que fazer no Stripe) moram em
// `_shared/store-slots.ts`, sem I/O, testadas pelo Vitest.
// =============================================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno';
import {
  buildCorsHeaders,
  SecureError,
  createErrorResponse,
  DataSanitizer,
} from '../_shared/validation.ts';
import {
  authorizeSlotChange,
  checkCapacityFits,
  planSlotChange,
  slotIdempotencyKey,
  slotQuantityFromSubscription,
  validateSlotQuantity,
  type SlotAccountRow,
  type SlotCaller,
} from '../_shared/store-slots.ts';

const json = (body: unknown, status: number, cors: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

/** Resolve o chamador pelo JWT. Cargo e Conta saem sempre de `profiles`. */
async function getCaller(
  admin: SupabaseClient,
  token: string,
): Promise<SlotCaller & { id: string }> {
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) {
    throw new SecureError('Sessão inválida ou expirada.', 'UNAUTHORIZED', 401);
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, role, tenant_id, status, capabilities')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profileError || !profile) {
    throw new SecureError('Perfil de usuário não encontrado.', 'NO_PROFILE', 403);
  }
  return profile as unknown as SlotCaller & { id: string };
}

/** Quantas Lojas a Conta já tem. Conta linha, independente de status. */
async function contarLojas(admin: SupabaseClient, accountId: string): Promise<number> {
  const { count, error } = await admin
    .from('tenants')
    .select('id', { count: 'exact', head: true })
    .eq('parent_tenant_id', accountId)
    .eq('kind', 'store');

  if (error) {
    throw new SecureError(
      `Falha ao contar as Lojas da Conta: ${error.message}`,
      'STORE_COUNT_FAILED',
      500,
    );
  }
  return count ?? 0;
}

Deno.serve(async (req: Request) => {
  const cors = buildCorsHeaders(req.headers.get('origin'));

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
  const slotPrice = Deno.env.get('STRIPE_PRICE_STORE_SLOT');

  if (!supabaseUrl || !serviceKey) return json({ error: 'Server misconfigured' }, 500, cors);
  if (!stripeSecret || !slotPrice) {
    return json(
      { error: 'Contratação de Lojas adicionais ainda não configurada no servidor.' },
      500,
      cors,
    );
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new SecureError('Cabeçalho de autorização ausente.', 'UNAUTHORIZED', 401);
    }
    const caller = await getCaller(admin, authHeader.replace(/^Bearer\s+/i, ''));

    let body: { totalExtraSlots?: unknown };
    try {
      body = (await req.json()) as { totalExtraSlots?: unknown };
    } catch {
      throw new SecureError('Corpo da requisição inválido.', 'VALIDATION_ERROR', 400);
    }

    // 1) A Conta do chamador. Nunca vem do navegador.
    if (!caller.tenant_id) {
      throw new SecureError('Usuário sem Conta associada.', 'NO_TENANT', 400);
    }
    const { data: conta, error: contaErr } = await admin
      .from('tenants')
      .select('id, kind, subscription_id, subscription_status, store_slots_included, store_slots_extra')
      .eq('id', caller.tenant_id)
      .maybeSingle();

    if (contaErr) {
      throw new SecureError(`Falha ao consultar a Conta: ${contaErr.message}`, 'ACCOUNT_LOOKUP_FAILED', 500);
    }

    // 2) Quem pode, e a Conta está em condição de mudar vaga.
    const authz = authorizeSlotChange(caller, (conta as SlotAccountRow | null) ?? null);
    if (!authz.ok) {
      throw new SecureError(authz.error, 'FORBIDDEN', authz.status);
    }
    const account = conta as SlotAccountRow;

    // 3) Quanto.
    const qtd = validateSlotQuantity(body.totalExtraSlots);
    if (!qtd.ok) {
      throw new SecureError(qtd.error, 'VALIDATION_ERROR', 400);
    }

    // 4) Reduzir não pode deixar a Conta com menos vaga do que Loja em uso. O
    //    trigger do banco não cobre este lado (ele só olha INSERT/UPDATE de
    //    tenants), então a trava é aqui.
    const usadas = await contarLojas(admin, account.id);
    const cabe = checkCapacityFits(qtd.value, account.store_slots_included, usadas);
    if (!cabe.ok) {
      throw new SecureError(cabe.error, 'CAPACITY_CONFLICT', 409);
    }

    // 5) Stripe: a assinatura viva é a fonte da verdade, não o nosso banco.
    const stripe = new Stripe(stripeSecret, {
      apiVersion: '2024-12-18.acacia',
      httpClient: Stripe.createFetchHttpClient(),
    });

    const subscription = await stripe.subscriptions.retrieve(account.subscription_id!);
    const plano = planSlotChange(subscription as never, slotPrice, qtd.value);
    const idempotencyKey = slotIdempotencyKey(account.id, account.subscription_id!, qtd.value);

    switch (plano.acao) {
      case 'criar':
        await stripe.subscriptionItems.create(
          {
            subscription: account.subscription_id!,
            price: slotPrice,
            quantity: plano.quantidade,
            proration_behavior: 'create_prorations',
          },
          { idempotencyKey },
        );
        break;
      case 'atualizar':
        await stripe.subscriptionItems.update(
          plano.itemId,
          { quantity: plano.quantidade, proration_behavior: 'create_prorations' },
          { idempotencyKey },
        );
        break;
      case 'remover':
        await stripe.subscriptionItems.del(
          plano.itemId,
          { proration_behavior: 'create_prorations' },
          { idempotencyKey },
        );
        break;
      case 'nada':
        break;
    }

    // 6) Relê a assinatura e DERIVA o número — não confiamos no que pedimos.
    //    O `customer.subscription.updated` vai gravar o mesmo valor quando
    //    chegar; como os dois derivam da mesma fonte, a ordem não importa e
    //    repetir não acumula.
    const atualizada = await stripe.subscriptions.retrieve(account.subscription_id!);
    const extras = slotQuantityFromSubscription(atualizada as never, slotPrice);

    const { error: updErr } = await admin
      .from('tenants')
      .update({ store_slots_extra: extras, updated_at: new Date().toISOString() })
      .eq('id', account.id);

    if (updErr) {
      throw new SecureError(
        `A assinatura foi atualizada, mas a Conta não: ${updErr.message}`,
        'TENANT_UPDATE_FAILED',
        500,
      );
    }

    const capacidade = (account.store_slots_included ?? 0) + extras;

    console.log(
      'update-store-slots',
      DataSanitizer.sanitizeForLog({
        caller: caller.id,
        account: account.id,
        acao: plano.acao,
        extras,
        usadas,
        capacidade,
      }),
    );

    return json(
      { success: true, slots: { extra: extras, included: account.store_slots_included ?? 0, capacity: capacidade, used: usadas } },
      200,
      cors,
    );
  } catch (err) {
    if (err instanceof SecureError) {
      return createErrorResponse(err, undefined, req.headers.get('origin'));
    }
    console.error('update-store-slots error:', err);
    return json(
      { error: err instanceof Error ? err.message : 'Erro interno.' },
      500,
      cors,
    );
  }
});
