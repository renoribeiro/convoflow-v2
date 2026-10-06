// =============================================================================
// auth-email-failures — por que um e-mail de login não saiu, e o registro disso
// =============================================================================
// Convite e redefinição de senha saem pelo envio de e-mail do Supabase Auth.
// Enquanto ele for o servidor embutido, há dois tetos que derrubam o envio:
//
//   quota           limite de e-mails por hora (erro 429,
//                   `over_email_send_rate_limit`)
//   not_authorized  o servidor embutido só entrega para endereços do time do
//                   projeto no Supabase (`email_address_not_authorized`,
//                   "Email address not authorized")
//
// Cada falha vai para `public.auth_email_failures` (migração 20260926000002).
// É o termômetro que diz quando trocar o envio — docs/RUNBOOK_trocar_envio_email.md.
//
// Sem nada do Deno: roda também no Vitest.
// =============================================================================

export type AuthEmailFailureReason = 'quota' | 'not_authorized' | 'email_exists' | 'other';

export type AuthEmailSource =
  | 'public_signup_invite'
  | 'manage_user_invite'
  | 'manage_user_reset';

/** O formato de erro que o supabase-js devolve do Auth (AuthApiError). */
export interface AuthLikeError {
  status?: number;
  code?: string;
  message?: string;
}

/** Classifica um erro do Auth em envio de e-mail. */
export function classifyAuthEmailError(err: AuthLikeError | null | undefined): AuthEmailFailureReason {
  if (!err) return 'other';
  const code = (err.code ?? '').toLowerCase();
  const message = err.message ?? '';

  if (
    err.status === 429 ||
    code === 'over_email_send_rate_limit' ||
    /rate limit/i.test(message)
  ) {
    return 'quota';
  }
  if (code === 'email_address_not_authorized' || /not authori[sz]ed/i.test(message)) {
    return 'not_authorized';
  }
  if (
    code === 'email_exists' ||
    code === 'user_already_exists' ||
    /already (been )?registered|already exists/i.test(message)
  ) {
    return 'email_exists';
  }
  return 'other';
}

/**
 * Vale registrar? Limite e recusa de endereço sempre; "e-mail já existe" nunca
 * (não é falha de envio); o resto só quando o próprio servidor falhou (5xx ou
 * sem status) — erro de validação do endereço não diz nada sobre o envio.
 */
export function isEmailSendFailure(
  reason: AuthEmailFailureReason,
  err: AuthLikeError | null | undefined,
): boolean {
  if (reason === 'quota' || reason === 'not_authorized') return true;
  if (reason === 'email_exists') return false;
  return (err?.status ?? 500) >= 500;
}

/**
 * O mínimo do cliente do Supabase que o registro usa (sem importar o
 * supabase-js). `any` de propósito: o SupabaseClient tem sobrecargas genéricas
 * em `from()` que não casam com um tipo estrutural estreito.
 */
export interface InsertCapableClient {
  // deno-lint-ignore no-explicit-any
  from(table: string): any;
}

/**
 * Grava a falha. NUNCA lança: registrar a falha não pode virar uma segunda
 * falha no caminho do usuário.
 */
export async function recordAuthEmailFailure(
  admin: InsertCapableClient,
  source: AuthEmailSource,
  err: AuthLikeError | null | undefined,
): Promise<void> {
  const reason = classifyAuthEmailError(err);
  if (!isEmailSendFailure(reason, err)) return;
  try {
    const { error } = await admin.from('auth_email_failures').insert({
      source,
      reason: reason === 'email_exists' ? 'other' : reason,
      error_status: typeof err?.status === 'number' ? err.status : null,
      error_code: err?.code ? String(err.code).slice(0, 80) : null,
      detail: err?.message ? String(err.message).slice(0, 500) : null,
    });
    if (error) console.error('[auth-email-failures] falha ao registrar:', error.message);
  } catch (e) {
    console.error('[auth-email-failures] falha ao registrar:', e instanceof Error ? e.message : e);
  }
}
