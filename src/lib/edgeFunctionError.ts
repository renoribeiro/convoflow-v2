/**
 * Extrai a mensagem que a edge function realmente escreveu.
 *
 * O `supabase.functions.invoke` devolve, para qualquer resposta 4xx/5xx, um
 * `FunctionsHttpError` cuja `message` é a frase genérica
 * "Edge Function returned a non-2xx status code" — e deixa `data` nulo. O texto
 * em pt-BR que o servidor mandou fica dentro do `Response` original, pendurado
 * em `error.context`. Quem não abre esse corpo mostra a frase genérica ao
 * usuário e joga fora a única informação útil.
 *
 * Aconteceu duas vezes em 2026-08-18, custando bastante tempo nas duas:
 *   - "Esta loja não pertence à sua conta." virou "Failed to send a request"
 *   - "limite de e-mails atingido" virou "non-2xx status code"
 *
 * Toda chamada a edge function no front passa por aqui.
 */
export async function mensagemDaEdgeFunction(
  error: unknown,
  fallback: string,
): Promise<string> {
  const body = await corpoDaEdgeFunction(error);
  // createErrorResponse devolve { error: { message, code } }; algumas
  // funções antigas devolvem { error: "texto" } direto.
  const erro = body?.error as { message?: unknown } | string | undefined;
  const mensagem = typeof erro === 'string' ? erro : erro?.message;
  if (typeof mensagem === 'string' && mensagem.trim()) return mensagem;

  if (error instanceof Error && error.message) {
    // A frase genérica do supabase-js não ajuda ninguém: prefira o fallback,
    // que ao menos diz qual ação falhou.
    if (error.message.includes('non-2xx status code')) return fallback;
    return error.message;
  }

  return fallback;
}

/**
 * O corpo JSON inteiro que a edge function devolveu junto com o 4xx/5xx, ou
 * `null` quando não há corpo legível. Para quem precisa de mais que a frase —
 * o `whatsapp-send-message`, por exemplo, manda também o `code` da Meta.
 *
 * O `Response` só pode ser lido uma vez: quem chama esta função não chama
 * `mensagemDaEdgeFunction` para o mesmo erro (ela lê o corpo por aqui).
 */
export async function corpoDaEdgeFunction(
  error: unknown,
): Promise<Record<string, unknown> | null> {
  const context = (error as { context?: unknown } | null)?.context;
  if (!context || typeof (context as Response).json !== 'function') return null;
  try {
    const body = await (context as Response).json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  } catch {
    // corpo vazio ou não-JSON
    return null;
  }
}
