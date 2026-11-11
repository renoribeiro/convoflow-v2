/**
 * O que a tela Números de WhatsApp faz com a resposta de register-meta-number
 * (ícone de chave "Registrar o número na API Oficial").
 *
 * O servidor pede o PIN com status 409 e `pin_required: true`. Para 4xx/5xx o
 * supabase.functions.invoke devolve `data` nulo e o corpo só dentro do erro:
 * quem chama lê esse corpo com `corpoDaEdgeFunction` e passa aqui. Até
 * 2026-11-11 a tela olhava só `data` e a caixa "Informe o PIN do número" nunca
 * abria: aparecia "Não foi possível falar com o servidor".
 *
 * Número que já funcionava em outra empresa e sem PIN conhecido vem com
 * `pin_desconhecido: true` e a frase que explica onde achar o PIN
 * (MENSAGEM_PIN_DESCONHECIDO em supabase/functions/_shared/meta-numero-existente.ts).
 */

export const TEXTO_PADRAO_DO_PIN =
  'Este número já tem um PIN de verificação em duas etapas no WhatsApp. Digite os 6 números do PIN para registrar.';

export type ResultadoDoRegistro =
  | { tipo: 'pedir_pin'; texto: string; pinDesconhecido: boolean }
  | { tipo: 'erro'; texto: string }
  | { tipo: 'ok'; pin: string | null; aviso: string | null };

function frase(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

export function lerRespostaDoRegistro(
  corpo: Record<string, unknown> | null | undefined,
  deuErro: boolean,
): ResultadoDoRegistro {
  if (corpo?.pin_required === true) {
    return {
      tipo: 'pedir_pin',
      texto: frase(corpo.error) ?? TEXTO_PADRAO_DO_PIN,
      pinDesconhecido: corpo.pin_desconhecido === true,
    };
  }
  if (deuErro || !corpo || corpo.success !== true) {
    return {
      tipo: 'erro',
      texto:
        frase(corpo?.error) ??
        'Não foi possível registrar o número. Tente de novo em instantes; se continuar, fale com o suporte do ConvoFlow.',
    };
  }
  return { tipo: 'ok', pin: frase(corpo.pin), aviso: frase(corpo.warning) };
}
