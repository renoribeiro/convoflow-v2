// =============================================================================
// manage-user — Edge function para CRUD hierárquico de usuários
// =============================================================================
// Substitui/estende `admin-create-user`. Ações suportadas:
//   create           — convida novo usuário (inviteUserByEmail) com metadata
//                      que o trigger handle_new_user usa para popular profile.
//   update           — atualiza campos editáveis do profile (nome, telefone, ...).
//   suspend          — UPDATE status='suspended' (e cascade nos descendentes)
//                      e bane o login de todos eles (Supabase Auth).
//   reactivate       — tira o ban do login e faz UPDATE status='active'.
//   reset_password   — gera link de recuperação via auth.admin.
//   soft_delete      — UPDATE status='deleted' (mantém histórico/comissões) + ban.
//   transfer         — move parent_id (somente superadmin).
//
// Autorização: o caller precisa ter `can_manage_profile(target)` true para
// agir sobre target. Para `create`, regras específicas por role do caller.
// =============================================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  buildCorsHeaders,
  SecureError,
  createErrorResponse,
  DataSanitizer,
} from '../_shared/validation.ts';
import { can, CAPABILITY_DENIAL_MESSAGES, normalizeRole } from '../_shared/capabilities.ts';
import { contaSlug, sufixoAleatorio } from '../_shared/conta-slug.ts';
import { setLoginBan, statusBansLogin } from '../_shared/login-ban.ts';
import {
  classifyAuthEmailError,
  recordAuthEmailFailure,
  type AuthLikeError,
} from '../_shared/auth-email-failures.ts';

type Action =
  | 'create'
  | 'update'
  | 'suspend'
  | 'reactivate'
  | 'reset_password'
  | 'soft_delete'
  | 'transfer';

type UserRole = 'superadmin' | 'gerente' | 'gestor' | 'atendente';

interface CallerProfile {
  id: string;
  user_id: string;
  role: UserRole;
  tenant_id: string | null;
  status: string;
  capabilities: Record<string, unknown> | null;
}

interface RequestPayload {
  action: Action;
  // create
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  role?: UserRole;
  tenantId?: string | null;
  parentId?: string | null;
  affiliateId?: string | null;
  redirectTo?: string;
  /**
   * Caixa "Usuário ativo" do painel. O convidado SEMPRE nasce 'pending' — ele
   * ainda precisa concluir o cadastro. Isto guarda a intenção do admin em
   * profiles.invite_intent_active; no aceite, o trigger on_auth_user_confirmed
   * promove para 'active' (marcada) ou 'suspended' (desmarcada).
   */
  isActive?: boolean;
  /**
   * Nome da Conta a criar junto com um GERENTE.
   *
   * Gerente é dono de uma Conta, não funcionário de uma loja: as lojas dele
   * vêm depois, penduradas nessa Conta. Não existia jeito de criar Conta pela
   * interface (só SQL), então convidar gerente pelo painel era impossível —
   * o trigger handle_new_user derrubava por falta de tenant_id.
   */
  newTenantName?: string;
  // target-bound actions
  targetProfileId?: string;
  // update
  patch?: Record<string, unknown>;
  // transfer
  newParentId?: string;
}

const json = (body: unknown, status: number, cors: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

async function getCaller(
  admin: SupabaseClient,
  token: string,
): Promise<CallerProfile> {
  const {
    data: { user },
    error,
  } = await admin.auth.getUser(token);
  if (error || !user) {
    throw new SecureError('Token inválido', 'UNAUTHORIZED', 401);
  }
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, user_id, role, tenant_id, status, capabilities')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profileError || !profile) {
    throw new SecureError('Profile do caller não encontrado', 'NO_PROFILE', 403);
  }
  if (profile.status !== 'active') {
    throw new SecureError(
      profile.status === 'pending'
        ? 'Complete seu cadastro para acessar o sistema.'
        : 'Sua conta foi suspensa. Entre em contato com o administrador.',
      'INACTIVE',
      403,
    );
  }
  return profile as CallerProfile;
}

/**
 * Gerenciar usuários é `store.admin` — atendente não faz. As regras finas de
 * quem-pode-sobre-quem continuam em ensureCanCreate/ensureCanManage; isto é o
 * corte grosso, escrito uma vez na matriz compartilhada.
 */
function ensureStoreAdmin(caller: CallerProfile): void {
  if (!can(caller.role, 'store.admin', caller.capabilities)) {
    throw new SecureError(CAPABILITY_DENIAL_MESSAGES['store.admin'], 'FORBIDDEN', 403);
  }
}

function ensureCanCreate(caller: CallerProfile, role: UserRole): void {
  // superadmin creates gerente accounts (and anything else); gerente invites
  // gestor/atendente into its own stores; gestor invites atendente into its store.
  if (caller.role === 'superadmin') return;
  if (caller.role === 'gerente' && (role === 'gestor' || role === 'atendente')) return;
  if (caller.role === 'gestor' && role === 'atendente') return;
  throw new SecureError(
    `Role ${caller.role} não pode criar role ${role}`,
    'FORBIDDEN',
    403,
  );
}

/**
 * Per-store membership caps: 1 gestor + up to 5 atendentes per store.
 * Pre-checked here (before inviteUserByEmail) so we never leave an orphan auth
 * user when the DB trigger `enforce_store_membership_limits` would reject.
 */
async function ensureStoreHasRoom(
  admin: SupabaseClient,
  storeTenantId: string,
  role: UserRole,
): Promise<void> {
  if (role !== 'gestor' && role !== 'atendente') return;
  const { count, error } = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', storeTenantId)
    .eq('role', role)
    .neq('status', 'deleted');
  if (error) {
    throw new SecureError(`Falha ao checar limites da loja: ${error.message}`, 'CAP_CHECK_FAILED', 500);
  }
  const cap = role === 'gestor' ? 1 : 5;
  if ((count ?? 0) >= cap) {
    throw new SecureError(
      role === 'gestor'
        ? 'Esta loja já possui um gestor.'
        : 'Esta loja já atingiu o limite de 5 atendentes.',
      'STORE_FULL',
      409,
    );
  }
}

/**
 * Cria a Conta de um gerente novo.
 *
 * `kind='account'` + `parent_tenant_id=null` é o formato de uma Conta de topo —
 * as lojas dela nascem depois com `parent_tenant_id` apontando para cá. O slug é
 * NOT NULL e único, então vai com sufixo aleatório (mesmo padrão das Contas que
 * já existem, ex.: "maria-souza-1a2b3c4d").
 *
 * Só o superadmin chega aqui: ensureCanCreate já barrou todo mundo antes.
 */
async function criarConta(
  admin: SupabaseClient,
  nome: string,
): Promise<string> {
  // Mesmo slug do cadastro pelo site (public-signup): as duas Contas nascem no
  // mesmo formato. Ver _shared/conta-slug.ts.
  const { data, error } = await admin
    .from('tenants')
    .insert({
      name: nome,
      slug: contaSlug(nome, sufixoAleatorio()),
      kind: 'account',
      plan_type: 'gerente',
      parent_tenant_id: null,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new SecureError(
      `Falha ao criar a Conta: ${error?.message ?? 'desconhecida'}`,
      'TENANT_CREATE_FAILED',
      500,
    );
  }
  return data.id as string;
}

/** Achata o retorno de descendant_profile_ids (uuid[] ou [{id}]). */
function idsDeDescendentes(data: unknown): string[] {
  if (!Array.isArray(data)) return [];
  return (data as Array<string | { id: string }>).map((x) =>
    typeof x === 'string' ? x : x.id,
  );
}

/**
 * Quem pode agir sobre quem.
 *
 *   superadmin → qualquer perfil (menos o próprio)
 *   gerente    → seus descendentes na árvore de perfis
 *   gestor     → atendentes da própria loja
 *   atendente  → ninguém
 *
 * NÃO usa mais a RPC `can_manage_profile`. Ela tinha DOIS defeitos que juntos
 * faziam toda ação sobre outro perfil falhar com "Sem permissão sobre este
 * perfil", inclusive para superadmin:
 *
 *   1. Descobria o chamador com `WHERE user_id = auth.uid()`. Esta função é
 *      chamada com a chave de serviço, onde não há JWT — `auth.uid()` é NULL,
 *      nenhuma linha casa, e ela saía no `IF v_caller_id IS NULL RETURN FALSE`
 *      antes mesmo de olhar o alvo.
 *   2. Comparava contra 'account_manager' e 'enterprise', nomes de cargo de
 *      duas renomeações atrás, sem nenhuma linha em produção.
 *
 * A regra agora mora aqui, onde o chamador já está resolvido pelo JWT (getCaller)
 * e não depende de contexto de sessão no banco. A RPC continua existindo para
 * quem a chame com sessão de usuário de verdade.
 */
async function ensureCanManage(
  admin: SupabaseClient,
  caller: CallerProfile,
  targetId: string,
): Promise<void> {
  if (caller.id === targetId) {
    throw new SecureError(
      'Não é possível executar esta ação sobre o próprio perfil',
      'FORBIDDEN',
      403,
    );
  }

  const papel = normalizeRole(caller.role);

  if (papel === 'superadmin') return;

  const alvo = await fetchTarget(admin, targetId);

  if (papel === 'gerente') {
    const { data, error } = await admin.rpc('descendant_profile_ids', {
      root_id: caller.id,
    });
    if (error) {
      throw new SecureError(
        `Falha ao verificar permissão: ${error.message}`,
        'PERMISSION_CHECK_FAILED',
        500,
      );
    }
    if (idsDeDescendentes(data).includes(targetId)) return;
    throw new SecureError(
      'Este usuário não pertence à sua Conta.',
      'FORBIDDEN',
      403,
    );
  }

  if (papel === 'gestor') {
    const alvoPapel = normalizeRole(alvo.role);
    if (
      alvoPapel === 'atendente' &&
      alvo.tenant_id &&
      alvo.tenant_id === caller.tenant_id
    ) {
      return;
    }
    throw new SecureError(
      'Gestor só gerencia os atendentes da própria Loja.',
      'FORBIDDEN',
      403,
    );
  }

  throw new SecureError('Sem permissão sobre este perfil.', 'FORBIDDEN', 403);
}

async function fetchTarget(admin: SupabaseClient, id: string) {
  const { data, error } = await admin
    .from('profiles')
    .select('id, user_id, role, tenant_id, parent_id, status')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) {
    throw new SecureError('Profile alvo não encontrado', 'NOT_FOUND', 404);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------

async function actionCreate(
  admin: SupabaseClient,
  caller: CallerProfile,
  body: RequestPayload,
) {
  const {
    email,
    firstName,
    lastName,
    phone,
    role,
    tenantId,
    parentId,
    redirectTo,
    isActive,
    newTenantName,
  } = body;

  // Ausente = marcada. Chamadores antigos (e o auto-cadastro) não mandam o
  // campo e devem continuar produzindo usuário ativo ao aceitar o convite.
  const inviteIntentActive = isActive === undefined ? true : isActive !== false;

  if (!email || !firstName || !lastName) {
    throw new SecureError(
      'email, firstName e lastName são obrigatórios',
      'VALIDATION_ERROR',
      400,
    );
  }
  const effectiveRole: UserRole = role ?? 'atendente';
  ensureCanCreate(caller, effectiveRole);

  // Decidir tenant_id (loja) e parent_id implícitos por role do caller
  let resolvedTenantId: string | null = tenantId ?? null;
  let resolvedParentId: string | null = parentId ?? null;

  if (caller.role === 'gerente') {
    // Gerente convida gestor/atendente para UMA das suas próprias lojas.
    resolvedParentId = caller.id;
    if (!resolvedTenantId) {
      throw new SecureError(
        'tenantId (loja) é obrigatório para convidar gestor/atendente',
        'VALIDATION_ERROR',
        400,
      );
    }
    const { data: store, error: storeError } = await admin
      .from('tenants')
      .select('id, kind, parent_tenant_id')
      .eq('id', resolvedTenantId)
      .maybeSingle();
    if (storeError) {
      throw new SecureError(`Falha ao validar a loja: ${storeError.message}`, 'STORE_LOOKUP_FAILED', 500);
    }
    if (!store || store.kind !== 'store' || store.parent_tenant_id !== caller.tenant_id) {
      throw new SecureError('Esta loja não pertence à sua conta.', 'FORBIDDEN', 403);
    }
  } else if (caller.role === 'gestor') {
    // Gestor convida atendente para a PRÓPRIA loja.
    if (!caller.tenant_id) {
      throw new SecureError(
        'Gestor sem loja não pode convidar usuários',
        'FORBIDDEN',
        403,
      );
    }
    resolvedTenantId = caller.tenant_id;
    resolvedParentId = caller.id;
  }

  if (
    (effectiveRole === 'gestor' || effectiveRole === 'atendente') &&
    !resolvedTenantId
  ) {
    throw new SecureError(
      'Selecione a Loja do usuário. Gestor e Atendente sempre pertencem a uma.',
      'VALIDATION_ERROR',
      400,
    );
  }

  // Gerente é dono de uma Conta: ela nasce aqui, vazia, e as lojas vêm depois.
  // Sem isto, convidar gerente pelo painel era impossível — não há nenhuma tela
  // que crie Conta, e o trigger do banco exige tenant_id para qualquer role que
  // não seja superadmin.
  if (effectiveRole === 'gerente' && !resolvedTenantId) {
    if (!newTenantName?.trim()) {
      throw new SecureError(
        'Informe o nome da Conta do gerente.',
        'VALIDATION_ERROR',
        400,
      );
    }
    resolvedTenantId = await criarConta(admin, newTenantName.trim());
  }

  // Respeita o limite da loja ANTES de convidar (evita usuário órfão no Auth).
  if (resolvedTenantId) {
    await ensureStoreHasRoom(admin, resolvedTenantId, effectiveRole);
  }

  const { data: invite, error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: redirectTo || undefined,
      data: {
        first_name: firstName,
        last_name: lastName,
        phone: phone ?? null,
        role: effectiveRole,
        tenant_id: resolvedTenantId,
        parent_id: resolvedParentId,
        // Convidado sempre nasce 'pending': ele ainda não definiu a senha.
        // Quem decide o estado FINAL é invite_intent_active, aplicado pelo
        // trigger on_auth_user_confirmed quando o cadastro é concluído.
        status: 'pending',
        invite_intent_active: inviteIntentActive,
      },
    });

  if (inviteError || !invite?.user) {
    // Termômetro do envio de e-mail (auth_email_failures). Não muda a resposta.
    await recordAuthEmailFailure(admin, 'manage_user_invite', inviteError as AuthLikeError | null);
    throw new SecureError(
      `Falha ao convidar usuário: ${inviteError?.message ?? 'desconhecida'}`,
      'INVITE_FAILED',
      400,
    );
  }

  // O trigger handle_new_user já preencheu profiles a partir do metadata.
  return {
    success: true,
    user: {
      id: invite.user.id,
      email: invite.user.email,
      role: effectiveRole,
      tenantId: resolvedTenantId,
      parentId: resolvedParentId,
      status: 'pending',
      inviteIntentActive: inviteIntentActive,
    },
    warning: inviteIntentActive
      ? undefined
      : 'O usuário foi convidado com "Usuário ativo" desmarcado: ao concluir o cadastro ele já entrará suspenso.',
  };
}

async function actionUpdate(
  admin: SupabaseClient,
  caller: CallerProfile,
  body: RequestPayload,
) {
  if (!body.targetProfileId) {
    throw new SecureError('targetProfileId é obrigatório', 'VALIDATION_ERROR', 400);
  }
  await ensureCanManage(admin, caller, body.targetProfileId);

  const patch = body.patch ?? {};
  // Campos editáveis controlados — qualquer outra chave é ignorada.
  const allowed: Record<string, unknown> = {};
  for (const k of ['first_name', 'last_name', 'phone', 'avatar_url']) {
    if (k in patch) allowed[k] = patch[k];
  }
  // role só superadmin pode alterar
  if ('role' in patch) {
    if (caller.role !== 'superadmin') {
      throw new SecureError('Apenas superadmin pode mudar role', 'FORBIDDEN', 403);
    }
    allowed.role = patch.role;
  }
  if ('tenant_id' in patch) {
    if (caller.role !== 'superadmin') {
      throw new SecureError('Apenas superadmin pode mudar tenant_id', 'FORBIDDEN', 403);
    }
    allowed.tenant_id = patch.tenant_id;
  }
  if (Object.keys(allowed).length === 0) {
    throw new SecureError('Nenhum campo válido para atualizar', 'VALIDATION_ERROR', 400);
  }

  const { error } = await admin
    .from('profiles')
    .update(allowed)
    .eq('id', body.targetProfileId);

  if (error) {
    throw new SecureError(`Falha ao atualizar profile: ${error.message}`, 'UPDATE_FAILED', 500);
  }
  return { success: true };
}

async function actionChangeStatus(
  admin: SupabaseClient,
  caller: CallerProfile,
  body: RequestPayload,
  newStatus: 'suspended' | 'active' | 'deleted',
) {
  if (!body.targetProfileId) {
    throw new SecureError('targetProfileId é obrigatório', 'VALIDATION_ERROR', 400);
  }
  await ensureCanManage(admin, caller, body.targetProfileId);
  const target = await fetchTarget(admin, body.targetProfileId);

  // Item 14, lote 4 (H5): reativar tira o ban do login ANTES de gravar
  // 'active' — se falhar, nada mudou (ver _shared/login-ban.ts).
  if (newStatus === 'active') {
    const unban = await setLoginBan(admin.auth.admin, [target.user_id], false);
    if (unban.failed.length > 0) {
      console.error('manage-user: falha ao liberar login', { target: target.id, error: unban.failed[0].error });
      throw new SecureError(
        'Não foi possível liberar o login desta pessoa. Nada foi alterado; tente de novo.',
        'UNBAN_FAILED',
        500,
      );
    }
  }

  // Quem perde o login junto com o alvo (o cascade abaixo suspende os descendentes).
  const banUserIds: string[] = [target.user_id];

  // Cascade: se suspender ou deletar, propagar para descendentes (status='suspended').
  if (newStatus === 'suspended' || newStatus === 'deleted') {
    const { data: descendants, error: descErr } = await admin.rpc(
      'descendant_profile_ids',
      { root_id: target.id },
    );
    if (descErr) {
      throw new SecureError(
        `Falha ao calcular descendentes: ${descErr.message}`,
        'CASCADE_FAILED',
        500,
      );
    }
    const ids = (descendants as Array<{ id: string }> | string[] | null) ?? [];
    const idList: string[] = Array.isArray(ids)
      ? (ids as Array<string | { id: string }>).map((x) =>
          typeof x === 'string' ? x : x.id,
        )
      : [];

    // Atualiza o alvo com o status pedido; cascade nos demais vira 'suspended'.
    const others = idList.filter((id) => id !== target.id);
    if (others.length > 0) {
      const { data: cascaded, error: cascadeErr } = await admin
        .from('profiles')
        .update({ status: 'suspended' })
        .in('id', others)
        .neq('status', 'deleted')
        .select('user_id');
      if (cascadeErr) {
        throw new SecureError(
          `Falha no cascade: ${cascadeErr.message}`,
          'CASCADE_FAILED',
          500,
        );
      }
      for (const row of (cascaded ?? []) as Array<{ user_id: string | null }>) {
        if (row.user_id) banUserIds.push(row.user_id);
      }
    }
  }

  const { error } = await admin
    .from('profiles')
    .update({ status: newStatus })
    .eq('id', target.id);
  if (error) {
    throw new SecureError(
      `Falha ao alterar status: ${error.message}`,
      'STATUS_FAILED',
      500,
    );
  }

  // Suspender/excluir: o status já fechou o banco; agora tira o login (alvo +
  // descendentes suspensos no cascade). Falha aqui devolve erro para a ação
  // ser repetida — repetir é seguro (status igual, ban de novo).
  if (statusBansLogin(newStatus)) {
    const ban = await setLoginBan(admin.auth.admin, banUserIds, true);
    if (ban.failed.length > 0) {
      console.error('manage-user: falha ao bloquear login', { target: target.id, falhas: ban.failed.length });
      throw new SecureError(
        `A conta foi suspensa, mas o login de ${ban.failed.length} pessoa(s) não foi bloqueado. Tente de novo.`,
        'BAN_FAILED',
        500,
      );
    }
    return { success: true, status: newStatus, loginBlocked: ban.done.length };
  }
  return { success: true, status: newStatus, loginBlocked: 0 };
}

async function actionResetPassword(
  admin: SupabaseClient,
  caller: CallerProfile,
  body: RequestPayload,
) {
  if (!body.targetProfileId) {
    throw new SecureError('targetProfileId é obrigatório', 'VALIDATION_ERROR', 400);
  }
  await ensureCanManage(admin, caller, body.targetProfileId);
  const target = await fetchTarget(admin, body.targetProfileId);

  const { data: authUser, error: getErr } = await admin.auth.admin.getUserById(
    target.user_id,
  );
  if (getErr || !authUser?.user?.email) {
    throw new SecureError('Não foi possível obter email do usuário', 'NOT_FOUND', 404);
  }

  // `resetPasswordForEmail`, NÃO `admin.generateLink`.
  //
  // generateLink apenas GERA o link e devolve — não manda e-mail nenhum. O
  // código antigo ainda descartava o link (só lia o `error`), então esta ação
  // não fazia absolutamente nada enquanto a tela dizia "Link de redefinição de
  // senha enviado por e-mail". Ninguém nunca recebeu esse e-mail.
  //
  // O redirectTo aponta para /definir-senha, a tela que existe desde
  // 2026-08-18. Sem ele o link cai na home (site_url), que é a página de
  // vendas, e o token se perde sem nada para recebê-lo.
  const redirectTo = typeof body.redirectTo === 'string' && body.redirectTo
    ? body.redirectTo
    : undefined;

  const { error: resetErr } = await admin.auth.resetPasswordForEmail(
    authUser.user.email,
    redirectTo ? { redirectTo } : undefined,
  );
  if (resetErr) {
    // Teto de envio do mailer EMBUTIDO do Supabase (poucos e-mails por hora).
    // Sem esta tradução o usuário lia "non-2xx status code" e não tinha como
    // saber que bastava esperar — ou configurar um SMTP próprio, que é o que
    // realmente resolve para valer.
    // Mesma regra de antes (429 / over_email_send_rate_limit / "rate limit"),
    // agora num lugar só e com registro em auth_email_failures.
    await recordAuthEmailFailure(admin, 'manage_user_reset', resetErr as AuthLikeError);
    const ehLimite = classifyAuthEmailError(resetErr as AuthLikeError) === 'quota';

    if (ehLimite) {
      throw new SecureError(
        'Limite de envio de e-mail atingido. O servidor de e-mail padrão libera poucos envios por hora. Espere cerca de uma hora e tente de novo, ou configure um SMTP próprio para não esbarrar nisso.',
        'EMAIL_RATE_LIMIT',
        429,
      );
    }

    throw new SecureError(
      `Falha ao enviar o e-mail de redefinição: ${resetErr.message}`,
      'RESET_FAILED',
      500,
    );
  }
  return { success: true };
}

async function actionTransfer(
  admin: SupabaseClient,
  caller: CallerProfile,
  body: RequestPayload,
) {
  if (caller.role !== 'superadmin') {
    throw new SecureError('Apenas superadmin pode transferir', 'FORBIDDEN', 403);
  }
  if (!body.targetProfileId || !body.newParentId) {
    throw new SecureError(
      'targetProfileId e newParentId são obrigatórios',
      'VALIDATION_ERROR',
      400,
    );
  }
  const { error } = await admin
    .from('profiles')
    .update({ parent_id: body.newParentId })
    .eq('id', body.targetProfileId);
  if (error) {
    throw new SecureError(`Falha ao transferir: ${error.message}`, 'TRANSFER_FAILED', 500);
  }
  return { success: true };
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
      throw new SecureError('Authorization header ausente', 'UNAUTHORIZED', 401);
    }
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const caller = await getCaller(admin, token);

    const body = (await req.json()) as RequestPayload;
    if (!body?.action) {
      throw new SecureError('action é obrigatório', 'VALIDATION_ERROR', 400);
    }

    // Toda ação desta função é administração de usuários da Loja.
    ensureStoreAdmin(caller);

    console.log(
      'manage-user',
      DataSanitizer.sanitizeForLog({ action: body.action, caller: caller.id }),
    );

    let result: unknown;
    switch (body.action) {
      case 'create':
        result = await actionCreate(admin, caller, body);
        break;
      case 'update':
        result = await actionUpdate(admin, caller, body);
        break;
      case 'suspend':
        result = await actionChangeStatus(admin, caller, body, 'suspended');
        break;
      case 'reactivate':
        result = await actionChangeStatus(admin, caller, body, 'active');
        break;
      case 'soft_delete':
        result = await actionChangeStatus(admin, caller, body, 'deleted');
        break;
      case 'reset_password':
        result = await actionResetPassword(admin, caller, body);
        break;
      case 'transfer':
        result = await actionTransfer(admin, caller, body);
        break;
      default:
        throw new SecureError(`Ação desconhecida: ${body.action}`, 'VALIDATION_ERROR', 400);
    }

    return json(result, 200, cors);
  } catch (err) {
    if (err instanceof SecureError) {
      return createErrorResponse(err, undefined, req.headers.get('origin'));
    }
    console.error('manage-user error:', err);
    return json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      500,
      cors,
    );
  }
});
