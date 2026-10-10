// =============================================================================
// track-login — registra UMA entrada (login) em user_activity_log
// =============================================================================
// Chamada pelo navegador (fire-and-forget) quando aparece uma sessão que ele
// ainda não registrou: senha, link de convite, link de nova senha
// (src/lib/auth/loginTracking.ts). Supabase Auth não expõe hook server-side em
// sign-in, então a edge é necessária para capturar IP real (header
// x-forwarded-for) com privilégio.
//
// Uma linha por sessão: a regra mora em _shared/track-login.ts e o índice
// único do banco (20261010000002) garante. Recarregar, voltar à aba e renovar
// o token não contam.
//
// Trigger SQL `after_insert_user_activity_log` propaga para
// profiles.last_login_at / login_count. IP e navegador ficam só no histórico,
// que só o superadmin lê.
// =============================================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildCorsHeaders, SecureError, createErrorResponse } from '../_shared/validation.ts';
import { trackLogin, type TrackLoginStore } from '../_shared/track-login.ts';

function extractIp(req: Request): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    null
  );
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

    const {
      data: { user },
      error: authErr,
    } = await admin.auth.getUser(token);
    if (authErr || !user) {
      throw new SecureError('Token inválido', 'UNAUTHORIZED', 401);
    }

    const store: TrackLoginStore = {
      async profileIdFor(userId) {
        const { data, error } = await admin
          .from('profiles')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();
        if (error) throw new SecureError('Falha ao ler o perfil', 'PROFILE_READ_FAILED', 500);
        return data?.id ?? null;
      },
      async hasLegacyLoginBetween(profileId, from, to) {
        const { count, error } = await admin
          .from('user_activity_log')
          .select('id', { count: 'exact', head: true })
          .eq('profile_id', profileId)
          .eq('event_type', 'login')
          .is('session_id', null)
          .gte('created_at', from.toISOString())
          .lte('created_at', to.toISOString());
        if (error) throw new SecureError('Falha ao ler o histórico', 'LOG_READ_FAILED', 500);
        return (count ?? 0) > 0;
      },
      async insertLogin(row) {
        const { error } = await admin.from('user_activity_log').insert(row);
        if (!error) return 'inserted';
        if (error.code === '23505') return 'duplicate';
        throw new SecureError(`Falha ao registrar login: ${error.message}`, 'INSERT_FAILED', 500);
      },
    };

    const outcome = await trackLogin(
      {
        userId: user.id,
        accessToken: token,
        ip: extractIp(req),
        userAgent: req.headers.get('user-agent') || null,
        now: new Date(),
      },
      store,
    );

    if (outcome === 'no_session') {
      throw new SecureError('Token sem sessão', 'NO_SESSION', 400);
    }
    if (outcome === 'no_profile') {
      throw new SecureError('Profile não encontrado', 'NO_PROFILE', 404);
    }

    return json({ success: true, outcome }, 200, cors);
  } catch (err) {
    if (err instanceof SecureError) {
      return createErrorResponse(err, undefined, req.headers.get('origin'));
    }
    console.error('track-login error:', err);
    return json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      500,
      cors,
    );
  }
});
