import type { SendResult } from '@/services/whatsapp';

/**
 * O que vai para `messages.error_code` / `messages.error_message` quando o
 * envio falha (migração 20261008000001). Antes disso a linha ficava só
 * "failed", sem dizer por quê.
 *
 * Código: o do provider (Meta: "131047"); sem ele, o motivo estável do
 * adapter (Instagram: "outside_window"). Mensagem: a crua do provider quando
 * existe, senão a frase que a tela mostrou.
 */
export function camposDaFalha(resultado: SendResult | null | undefined): {
  error_code: string | null;
  error_message: string | null;
} {
  const codigo = resultado?.errorCode ?? resultado?.reason ?? null;
  const mensagem = (resultado?.providerError ?? resultado?.error ?? '').trim();
  return {
    error_code: codigo,
    error_message: mensagem ? mensagem.slice(0, 1000) : null,
  };
}
