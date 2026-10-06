// =============================================================================
// track-login — registra um evento de login em user_activity_log
// =============================================================================
// Chamada pelo cliente (fire-and-forget) após sign-in bem-sucedido.
// Supabase Auth não expõe hook server-side em sign-in, então a edge é
// necessária para capturar IP real (header x-forwarded-for) com privilégio.
//
// Trigger SQL `after_insert_user_activity_log` propaga para
// profiles.last_login_at / login_count / last_ip.
// =============================================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildCorsHeaders, SecureError, createErrorResponse } from '../_shared/validation.ts';

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

    const { data: profile, error: profileErr } = await admin
      .from('profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (profileErr || !profile) {
      throw new SecureError('Profile não encontrado', 'NO_PROFILE', 404);
    }

    const ip = extractIp(req);
    const userAgent = req.headers.get('user-agent') || null;

    const { error: insertErr } = await admin.from('user_activity_log').insert({
      profile_id: profile.id,
      event_type: 'login',
      ip,
      user_agent: userAgent,
      metadata: {},
    });

    if (insertErr) {
      throw new SecureError(
        `Falha ao registrar login: ${insertErr.message}`,
        'INSERT_FAILED',
        500,
      );
    }

    return json({ success: true }, 200, cors);
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
