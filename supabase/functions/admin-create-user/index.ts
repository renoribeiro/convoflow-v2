// =============================================================================
// admin-create-user — SHIM de retrocompatibilidade
// =============================================================================
// Esta função foi substituída por `manage-user`. Continua disponível por 1
// release para o frontend antigo. Aqui traduzimos o payload legado e
// reencaminhamos para manage-user via fetch interno.
//
// Mapeamentos:
//   POST   { email, firstName, lastName, phone, role, isActive, tenantId, redirectTo }
//                 ->  manage-user action='create' (role legado é convertido)
//                     `isActive` é a caixa "Usuário ativo" do painel. ELA ESTAVA
//                     SENDO JOGADA FORA AQUI: o corpo remontado abaixo não a
//                     repassava, então o convite sempre nascia sem a intenção do
//                     admin. Corrigido em 2026-08-13.
//   DELETE { userId }
//                 ->  manage-user action='soft_delete' (não apaga auth.users)
// =============================================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildCorsHeaders } from '../_shared/validation.ts';

type NewRole = 'superadmin' | 'gerente' | 'gestor' | 'atendente';

/**
 * Normaliza a função para o enum atual.
 *
 * BUG CORRIGIDO EM 2026-08-13: este mapa só conhecia os nomes LEGADOS
 * (tenant_admin, enterprise, account_manager...) e devolvia os nomes legados
 * também. O painel manda os nomes atuais desde a migração V2, então
 * `gestor`, `gerente` e `atendente` caíam todos no `default` e viravam `user`.
 *
 * O estrago: manage-user recebia role='user', que não é gestor nem atendente,
 * então ele PULAVA a exigência de tenantId e mandava o convite assim mesmo —
 * aí o trigger handle_new_user derrubava com "tenant_id e obrigatorio no
 * raw_user_meta_data para role user". Ou seja: criar Gestor pelo painel era
 * impossível, e a mensagem de erro apontava para o lugar errado.
 */
function mapRole(role: string | undefined | null): NewRole {
  switch (role) {
    case 'superadmin':
    case 'super_admin':
      return 'superadmin';
    case 'gerente':
    case 'agencia':
    case 'account_manager':
      return 'gerente';
    case 'gestor':
    case 'loja':
    case 'enterprise':
    case 'tenant_admin':
    case 'tenant_user':
    case 'user':
      return 'gestor';
    case 'atendente':
      return 'atendente';
    default:
      return 'gestor';
  }
}

const json = (body: unknown, status: number, cors: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

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

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return json({ error: 'Missing authorization header' }, 401, cors);
  }

  const manageUserUrl = `${supabaseUrl}/functions/v1/manage-user`;

  try {
    if (req.method === 'DELETE') {
      // Legado deletava auth.users + profiles direto. Agora viramos soft_delete.
      // Como o legado passava `userId` (auth.users.id), precisamos resolver
      // profile.id correspondente.
      const { userId } = await req.json();
      if (!userId) return json({ error: 'userId é obrigatório' }, 400, cors);

      const admin = createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      // Quem chama ANTES de procurar o alvo (item 14 lote 6): o 404 abaixo
      // respondia a qualquer um se um user_id existia. Só o painel de admin
      // (RoleGuard superadmin) usa este DELETE.
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      const { data: { user: caller }, error: callerErr } = await admin.auth.getUser(token);
      if (callerErr || !caller) return json({ error: 'Token inválido' }, 401, cors);
      const { data: callerProfile } = await admin
        .from('profiles')
        .select('role, status')
        .eq('user_id', caller.id)
        .maybeSingle();
      if (!callerProfile || callerProfile.role !== 'superadmin' || callerProfile.status !== 'active') {
        return json({ error: 'Apenas superadmin ativo exclui usuário por aqui' }, 403, cors);
      }

      const { data: profile, error: profileErr } = await admin
        .from('profiles')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();
      if (profileErr || !profile) {
        return json({ error: 'Profile não encontrado' }, 404, cors);
      }

      const upstream = await fetch(manageUserUrl, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'soft_delete',
          targetProfileId: profile.id,
        }),
      });
      const data = await upstream.json();
      return json(data, upstream.status, cors);
    }

    if (req.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405, cors);
    }

    const body = await req.json();
    const upstream = await fetch(manageUserUrl, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'create',
        email: body.email,
        firstName: body.firstName,
        lastName: body.lastName,
        phone: body.phone,
        role: mapRole(body.role),
        tenantId: body.tenantId,
        // Nome da Conta quando a função é Gerente — o manage-user
        // cria a Conta e vincula o convite a ela.
        newTenantName: body.newTenantName,
        redirectTo: body.redirectTo,
        // Caixa "Usuário ativo": o convidado continua nascendo 'pending' (ele
        // ainda precisa concluir o cadastro), mas a intenção viaja junto e é
        // aplicada no aceite. Ausente/indefinida = marcada, por compatibilidade
        // com chamadores antigos.
        isActive: body.isActive === undefined ? true : body.isActive !== false,
      }),
    });
    const data = await upstream.json();
    return json(data, upstream.status, cors);
  } catch (err) {
    console.error('admin-create-user shim error:', err);
    return json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      500,
      cors,
    );
  }
});
