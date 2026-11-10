import { supabase } from '@/integrations/supabase/client';
import { corpoDaEdgeFunction } from '@/lib/edgeFunctionError';
import { PRIVACY_VERSION, TERMS_VERSION } from '@/lib/legal/versions';
import type { PublicSignupData } from '@/lib/validations/publicSignup';

export type SignupSubmitResult =
  | { ok: true }
  | {
      ok: false;
      message: string;
      /** O campo do formulário a que a recusa se refere (ex.: email temporário). */
      field?: string;
      /** email_nao_saiu, tente_de_novo, teto_de_cadastros... */
      code?: string;
      /** A tela oferece "Tentar de novo". */
      tentarDeNovo?: boolean;
    };

const FALHA_GENERICA =
  'Não foi possível enviar seu cadastro agora. Tente de novo em alguns minutos.';

/**
 * Envia o cadastro para a edge function public-signup.
 *
 * `ok: true` NÃO quer dizer "conta criada": o servidor dá a mesma resposta
 * para e-mail novo e e-mail que já tem login. É o que impede o formulário de
 * revelar quem é cliente. A tela mostra o mesmo "confira seu e-mail".
 *
 * `ok: false` vem do próprio pedido (campo inválido, email temporário, robô,
 * muitas tentativas), do sistema (cadastro desligado, teto de cadastros) ou do
 * envio do email que não saiu (desde a sessão 2): nunca de o e-mail existir.
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
    const corpo = await corpoDaEdgeFunction(error);
    const mensagem = typeof corpo?.error === 'string' && corpo.error.trim() ? corpo.error : FALHA_GENERICA;
    return {
      ok: false,
      message: mensagem,
      field: typeof corpo?.field === 'string' ? corpo.field : undefined,
      code: typeof corpo?.code === 'string' ? corpo.code : undefined,
      tentarDeNovo: corpo?.tentarDeNovo === true,
    };
  }
  return { ok: true };
}
