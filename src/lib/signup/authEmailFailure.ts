import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

/**
 * O e-mail de login não saiu por um dos dois tetos do envio do Supabase?
 *
 * Cópia da regra de classifyAuthEmailError
 * (supabase/functions/_shared/auth-email-failures.ts), só com os dois motivos
 * que o navegador registra. src/lib/signup/publicSignupHandler.test.ts compara
 * as duas.
 */
export function motivoDoEnvioBarrado(
  err: { status?: number; code?: string; message?: string } | null | undefined,
): 'quota' | 'not_authorized' | null {
  if (!err) return null;
  const code = (err.code ?? '').toLowerCase();
  const message = err.message ?? '';
  if (err.status === 429 || code === 'over_email_send_rate_limit' || /rate limit/i.test(message)) {
    return 'quota';
  }
  if (code === 'email_address_not_authorized' || /not authori[sz]ed/i.test(message)) {
    return 'not_authorized';
  }
  return null;
}

/**
 * Registra, em auth_email_failures, que o reenvio de link em /definir-senha
 * esbarrou num teto do envio de e-mail. Nunca lança e nunca muda o que a
 * pessoa vê — é só o termômetro de quando trocar o envio de e-mail.
 */
export async function registrarEnvioBarradoNoNavegador(
  err: { status?: number; code?: string; message?: string } | null | undefined,
): Promise<void> {
  const motivo = motivoDoEnvioBarrado(err);
  if (!motivo) return;
  try {
    // Função nova, fora dos tipos gerados em types.ts.
    await (supabase as unknown as {
      rpc(fn: string, args: Record<string, unknown>): PromiseLike<unknown>;
    }).rpc('record_auth_email_failure_from_browser', {
      p_source: 'definir_senha_reset',
      p_reason: motivo,
    });
  } catch (e) {
    logger.warn('[authEmailFailure] não registrou a falha de envio', {
      message: e instanceof Error ? e.message : 'desconhecido',
    });
  }
}
