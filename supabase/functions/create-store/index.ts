// =============================================================================
// create-store — cria uma Loja dentro da Conta de um Gerente
// =============================================================================
// Uma Conta ("kind='account'") nasce vazia em `manage-user` quando o superadmin
// convida um gerente. As Lojas dela vêm depois — e até aqui não vinham de lugar
// nenhum: nenhuma tela e nenhuma função inseria linha com `kind='store'` e
// `parent_tenant_id` preenchido. Um gerente que comprava 5 vagas de Loja não
// conseguia criar nem a primeira. Esta função é esse caminho.
//
// Por que edge function e não INSERT direto do navegador: `public.tenants` não
// tem policy de INSERT para ninguém além do superadmin. O gerente autenticado
// simplesmente não escreve nessa tabela — quem escreve é a service key, daqui,
// depois de conferir permissão e vaga. Mesmo desenho de `manage-user`.
//
// As regras (quem pode, qual Conta, cabe?, qual slug) moram em
// `_shared/store-creation.ts`, sem I/O, para poderem ser testadas pelo Vitest.
// =============================================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  buildCorsHeaders,
  SecureError,
  createErrorResponse,
  DataSanitizer,
} from '../_shared/validation.ts';
import { statusDenialMessage } from '../_shared/capabilities.ts';
import {
  authorizeStoreCreation,
  buildStoreSlug,
  checkParentAccount,
  hasFreeStoreSlot,
  isCapacityViolation,
  isUniqueViolation,
  noFreeSlotMessage,
  storeCapacity,
  validateStoreName,
  type ParentAccountRow,
  type StoreCreationCaller,
} from '../_shared/store-creation.ts';

interface RequestPayload {
  /** Nome da Loja, como o usuário digitou. */
  name?: unknown;
  /**
   * Conta que receberá a Loja. Só o superadmin pode indicar uma — para o
   * gerente este campo é ignorado se for igual à Conta dele e recusado se for
   * diferente. Ver `authorizeStoreCreation`.
   */
  accountId?: unknown;
}

/** Quantas vezes tentar de novo quando o slug sorteado já existir. */
const MAX_TENTATIVAS_DE_SLUG = 3;

const json = (body: unknown, status: number, cors: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

/**
 * Resolve o chamador pelo JWT. Nada relativo a cargo vem do corpo da
 * requisição: role, Conta e capabilities saem sempre da tabela `profiles`.
 */
async function getCaller(
  admin: SupabaseClient,
  token: string,
): Promise<StoreCreationCaller & { id: string }> {
  const {
    data: { user },
    error,
  } = await admin.auth.getUser(token);

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
  if (profile.status !== 'active') {
    throw new SecureError(statusDenialMessage(profile.status as string), 'INACTIVE', 403);
  }

  return profile as unknown as StoreCreationCaller & { id: string };
}

/** Busca a Conta que vai receber a Loja, com as colunas de vaga. */
async function buscarConta(
  admin: SupabaseClient,
  accountId: string,
): Promise<ParentAccountRow | null> {
  const { data, error } = await admin
    .from('tenants')
    .select('id, name, kind, store_slots_included, store_slots_extra')
    .eq('id', accountId)
    .maybeSingle();

  if (error) {
    throw new SecureError(
      `Falha ao consultar a Conta: ${error.message}`,
      'ACCOUNT_LOOKUP_FAILED',
      500,
    );
  }
  return (data as ParentAccountRow | null) ?? null;
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

/**
 * Insere a Loja.
 *
 * `kind` e `parent_tenant_id` vão EXPLÍCITOS. O default da coluna já é 'store',
 * mas é o pai preenchido que faz o trigger `enforce_store_slot_capacity_trg`
 * entrar em ação — ele retorna cedo quando `parent_tenant_id IS NULL`. Loja sem
 * pai não gasta vaga e não aparece para o gerente; não criamos mais nenhuma.
 */
async function inserirLoja(
  admin: SupabaseClient,
  nome: string,
  accountId: string,
  capacidade: number,
): Promise<{ id: string; name: string; slug: string }> {
  let ultimoErro: { code?: string | null; message?: string | null } | null = null;

  for (let tentativa = 0; tentativa < MAX_TENTATIVAS_DE_SLUG; tentativa++) {
    const slug = buildStoreSlug(nome, crypto.randomUUID());

    const { data, error } = await admin
      .from('tenants')
      .insert({
        name: nome,
        slug,
        kind: 'store',
        parent_tenant_id: accountId,
      })
      .select('id, name, slug')
      .single();

    if (!error && data) {
      return data as { id: string; name: string; slug: string };
    }

    ultimoErro = error;

    // O trigger é o guarda final. Só chega aqui numa corrida entre duas
    // criações simultâneas — a checagem de vaga já rodou antes. Traduzimos
    // para a mesma frase em pt-BR, em vez de vazar o texto do Postgres.
    if (isCapacityViolation(error)) {
      throw new SecureError(noFreeSlotMessage(capacidade), 'NO_FREE_SLOT', 409);
    }

    // Slug repetido: sorteia outro sufixo e tenta de novo.
    if (isUniqueViolation(error)) continue;

    break;
  }

  throw new SecureError(
    `Falha ao criar a Loja: ${ultimoErro?.message ?? 'desconhecida'}`,
    'STORE_CREATE_FAILED',
    500,
  );
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  const cors = buildCorsHeaders(req.headers.get('origin'));

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, cors);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'Server misconfigured' }, 500, cors);
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

    let body: RequestPayload;
    try {
      body = (await req.json()) as RequestPayload;
    } catch {
      throw new SecureError('Corpo da requisição inválido.', 'VALIDATION_ERROR', 400);
    }

    // 1) Quem pode, e sob qual Conta.
    const accountId = typeof body.accountId === 'string' ? body.accountId : null;
    const authz = authorizeStoreCreation(caller, accountId);
    if (!authz.ok) {
      throw new SecureError(authz.error, 'FORBIDDEN', authz.status);
    }

    // 2) O nome.
    const nome = validateStoreName(body.name);
    if (!nome.ok) {
      throw new SecureError(nome.error, 'VALIDATION_ERROR', 400);
    }

    // 3) A Conta existe e é mesmo uma Conta.
    const conta = await buscarConta(admin, authz.accountId);
    const parentCheck = checkParentAccount(conta);
    if (!parentCheck.ok) {
      throw new SecureError(parentCheck.error, 'INVALID_PARENT', parentCheck.status);
    }

    // 4) Cabe mais uma Loja? O trigger no banco repete esta conta; aqui ela
    //    existe para o usuário ler pt-BR em vez de uma exceção do Postgres.
    const capacidade = storeCapacity(conta!);
    const usadas = await contarLojas(admin, authz.accountId);
    if (!hasFreeStoreSlot(usadas, capacidade)) {
      throw new SecureError(noFreeSlotMessage(capacidade), 'NO_FREE_SLOT', 409);
    }

    // 5) Cria.
    const loja = await inserirLoja(admin, nome.value, authz.accountId, capacidade);

    console.log(
      'create-store',
      DataSanitizer.sanitizeForLog({
        caller: caller.id,
        account: authz.accountId,
        store: loja.id,
        usadas: usadas + 1,
        capacidade,
      }),
    );

    return json(
      {
        success: true,
        store: { id: loja.id, name: loja.name, slug: loja.slug },
        slots: { used: usadas + 1, capacity: capacidade },
      },
      200,
      cors,
    );
  } catch (err) {
    if (err instanceof SecureError) {
      return createErrorResponse(err, undefined, req.headers.get('origin'));
    }
    console.error('create-store error:', err);
    return json(
      { error: err instanceof Error ? err.message : 'Erro interno.' },
      500,
      cors,
    );
  }
});
