// =============================================================================
// usage-limits — CRUD de limites de uso por role (somente superadmin)
// =============================================================================
// GET     ?role=gestor       → lista limites (qualquer usuário ATIVO logado —
//                              o mesmo que o RLS de usage_limits deixa ler;
//                              a UI normalmente chama via supabase-js direto)
// POST    { role, limit_name, limit_value, description? } → upsert
// PATCH   { id, limit_value, description? }              → update
// DELETE  { id }                                         → delete
// =============================================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildCorsHeaders, SecureError, createErrorResponse } from '../_shared/validation.ts';

// Os cargos de hoje (hierarquia V2). A lista antiga (account_manager,
// enterprise, user) recusava todo cargo que a tabela usa de verdade.
type UserRole = 'superadmin' | 'gerente' | 'gestor' | 'atendente';
const VALID_ROLES: UserRole[] = ['superadmin', 'gerente', 'gestor', 'atendente'];

const json = (body: unknown, status: number, cors: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

// GET: bastava mandar QUALQUER texto no Authorization (item 14 lote 6, LOW).
// Agora o token tem de ser de um usuário de verdade, com perfil ativo.
async function requireActiveUser(admin: SupabaseClient, token: string): Promise<void> {
  const {
    data: { user },
    error,
  } = await admin.auth.getUser(token);
  if (error || !user) {
    throw new SecureError('Token inválido', 'UNAUTHORIZED', 401);
  }
  const { data: profile } = await admin
    .from('profiles')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!profile || profile.status !== 'active') {
    throw new SecureError('Conta suspensa ou inativa', 'INACTIVE', 403);
  }
}

async function requireSuperadmin(admin: SupabaseClient, token: string): Promise<void> {
  const {
    data: { user },
    error,
  } = await admin.auth.getUser(token);
  if (error || !user) {
    throw new SecureError('Token inválido', 'UNAUTHORIZED', 401);
  }
  const { data: profile } = await admin
    .from('profiles')
    .select('role, status')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!profile || profile.role !== 'superadmin' || profile.status !== 'active') {
    throw new SecureError('Apenas superadmin pode gerenciar limites', 'FORBIDDEN', 403);
  }
}

Deno.serve(async (req: Request) => {
  const cors = buildCorsHeaders(req.headers.get('origin'));

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
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

    if (req.method === 'GET') {
      await requireActiveUser(admin, token);
      const url = new URL(req.url);
      const role = url.searchParams.get('role');
      let query = admin.from('usage_limits').select('*');
      if (role) {
        if (!VALID_ROLES.includes(role as UserRole)) {
          throw new SecureError('Role inválido', 'VALIDATION_ERROR', 400);
        }
        query = query.eq('role', role);
      }
      const { data, error } = await query.order('role').order('limit_name');
      if (error) {
        throw new SecureError(`Erro ao listar limites: ${error.message}`, 'QUERY_FAILED', 500);
      }
      return json({ data }, 200, cors);
    }

    // Demais verbos requerem superadmin
    await requireSuperadmin(admin, token);

    if (req.method === 'POST') {
      const { role, limit_name, limit_value, description } = await req.json();
      if (!role || !limit_name) {
        throw new SecureError('role e limit_name são obrigatórios', 'VALIDATION_ERROR', 400);
      }
      if (!VALID_ROLES.includes(role)) {
        throw new SecureError('Role inválido', 'VALIDATION_ERROR', 400);
      }
      const { data, error } = await admin
        .from('usage_limits')
        .upsert(
          {
            role,
            limit_name,
            limit_value: limit_value ?? { limit: null },
            description: description ?? null,
          },
          { onConflict: 'role,limit_name' },
        )
        .select()
        .single();
      if (error) {
        throw new SecureError(`Erro ao salvar: ${error.message}`, 'UPSERT_FAILED', 500);
      }
      return json({ data }, 200, cors);
    }

    if (req.method === 'PATCH') {
      const { id, limit_value, description } = await req.json();
      if (!id) {
        throw new SecureError('id é obrigatório', 'VALIDATION_ERROR', 400);
      }
      const patch: Record<string, unknown> = {};
      if (limit_value !== undefined) patch.limit_value = limit_value;
      if (description !== undefined) patch.description = description;
      const { data, error } = await admin
        .from('usage_limits')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) {
        throw new SecureError(`Erro ao atualizar: ${error.message}`, 'UPDATE_FAILED', 500);
      }
      return json({ data }, 200, cors);
    }

    if (req.method === 'DELETE') {
      const { id } = await req.json();
      if (!id) {
        throw new SecureError('id é obrigatório', 'VALIDATION_ERROR', 400);
      }
      const { error } = await admin.from('usage_limits').delete().eq('id', id);
      if (error) {
        throw new SecureError(`Erro ao remover: ${error.message}`, 'DELETE_FAILED', 500);
      }
      return json({ success: true }, 200, cors);
    }

    return json({ error: 'Method not allowed' }, 405, cors);
  } catch (err) {
    if (err instanceof SecureError) {
      return createErrorResponse(err, undefined, req.headers.get('origin'));
    }
    console.error('usage-limits error:', err);
    return json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      500,
      cors,
    );
  }
});
