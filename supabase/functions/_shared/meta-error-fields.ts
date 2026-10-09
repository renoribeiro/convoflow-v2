/**
 * Código e mensagem de uma recusa da Meta, no formato das colunas
 * `messages.error_code` / `messages.error_message` (migração 20261008000001).
 *
 * A Meta manda o mesmo objeto de erro nos dois lugares em que uma mensagem
 * pode falhar (SKILL meta-cloud-api §3.6 e §9):
 *   - na resposta do POST /messages, em `error`;
 *   - no webhook, em `statuses[].errors[]`, quando o status é `failed`.
 * Os dois trazem `code`, `title`/`message` e às vezes `error_data.details`,
 * que é a explicação mais específica (§9: "consulte error_data.details").
 *
 * Guarda-se a mensagem CRUA da Meta, em inglês: é ela que se procura na
 * documentação. A frase em pt-BR para a tela é montada no front.
 *
 * Sem import de propósito: o vitest do app testa este arquivo direto.
 */
export interface CamposDaFalha {
  error_code: string | null;
  error_message: string | null;
}

/** Limite da coluna na prática: uma explicação da Meta cabe com folga. */
const MAXIMO = 1000;

export function camposDaFalhaMeta(erro: unknown): CamposDaFalha {
  if (!erro || typeof erro !== 'object') return { error_code: null, error_message: null };
  const e = erro as {
    code?: unknown;
    title?: unknown;
    message?: unknown;
    error_data?: { details?: unknown } | null;
  };

  const codigo =
    typeof e.code === 'number' || (typeof e.code === 'string' && e.code.trim()) ? String(e.code) : null;

  const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const resumo = texto(e.message) ?? texto(e.title);
  const detalhe = texto(e.error_data?.details);
  const mensagem =
    resumo && detalhe && !resumo.includes(detalhe) ? `${resumo}: ${detalhe}` : detalhe ?? resumo;

  return {
    error_code: codigo,
    error_message: mensagem ? mensagem.slice(0, MAXIMO) : null,
  };
}

/** O primeiro erro de um status `failed` do webhook (`statuses[].errors[0]`). */
export function camposDoStatusFalho(status: unknown): CamposDaFalha {
  const erros = (status as { errors?: unknown } | null)?.errors;
  return camposDaFalhaMeta(Array.isArray(erros) ? erros[0] : null);
}
