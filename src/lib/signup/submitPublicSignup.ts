import { supabase } from '@/integrations/supabase/client';
import { mensagemDaEdgeFunction } from '@/lib/edgeFunctionError';
import { PRIVACY_VERSION, TERMS_VERSION } from '@/lib/legal/versions';
import type { PublicSignupData } from '@/lib/validations/publicSignup';

export type SignupSubmitResult = { ok: true } | { ok: false; message: string };

const FALHA_GENERICA =
  'Não foi possível enviar seu cadastro agora. Tente de novo em alguns minutos.';

/**
 * Envia o cadastro para a edge function public-signup.
 *
 * `ok: true` NÃO quer dizer "conta criada": o servidor dá a mesma resposta
 * para e-mail novo, e-mail que já tem login e convite que não saiu — é o que
 * impede o formulário de revelar quem é cliente. A tela mostra sempre o mesmo
 * "confira seu e-mail".
 *
 * `ok: false` só acontece por algo do próprio pedido (campo inválido, robô,
 * muitas tentativas, cadastro desligado) — nunca por causa do e-mail.
 */
export async function enviarCadastroPublico(
  dados: PublicSignupData,
  turnstileToken: string,
): Promise<SignupSubmitResult> {
  const { error } = await supabase.functions.invoke('public-signup', {
    body: {
      firstName: dados.firstName,
      lastName: dados.lastName,
      email: dados.email,
      companyName: dados.companyName,
      phone: dados.phone,
      acceptedTerms: dados.acceptedTerms,
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      turnstileToken,
    },
  });

  if (error) {
    return { ok: false, message: await mensagemDaEdgeFunction(error, FALHA_GENERICA) };
  }
  return { ok: true };
}
