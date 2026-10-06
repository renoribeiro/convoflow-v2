// Lado Deno da porta de backend (a regra mora em backend-caller.ts, que o
// Vitest testa). Uso, logo depois do OPTIONS:
//
//   const denied = await guardBackendCaller(req, logger);
//   if (denied) return denied;

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from './validation.ts';
import { rejectUnlessBackendCaller } from './backend-caller.ts';

type GateLogger = {
  warn: (m: string, c?: Record<string, unknown>) => void;
  error: (m: string, c?: Record<string, unknown>) => void;
};

export async function guardBackendCaller(req: Request, logger: GateLogger): Promise<Response | null> {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    logger.error('backend-gate: ambiente incompleto');
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });
  return rejectUnlessBackendCaller(req, admin, (n) => Deno.env.get(n), logger, corsHeaders);
}
