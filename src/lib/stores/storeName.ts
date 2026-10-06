/**
 * Regras do nome da Loja, lado do cliente.
 *
 * Espelha `supabase/functions/_shared/store-creation.ts`. A duplicação é a
 * mesma convenção da matriz de capabilities: o servidor é quem realmente nega,
 * o cliente existe para o usuário não descobrir o erro depois de uma ida ao
 * servidor. O teste `src/lib/stores/storeCreation.test.ts` compara os dois
 * lados e quebra se um mudar sem o outro.
 *
 * O módulo do servidor não é importado aqui de propósito: ele é escrito para o
 * Deno (import com extensão `.ts`) e não deve entrar no bundle do navegador.
 */

export const STORE_NAME_MIN = 2;
export const STORE_NAME_MAX = 60;

export const STORE_NAME_MESSAGES = {
  required: 'Informe o nome da loja.',
  tooShort: `O nome da loja precisa ter pelo menos ${STORE_NAME_MIN} caracteres.`,
  tooLong: `O nome da loja pode ter no máximo ${STORE_NAME_MAX} caracteres.`,
  noAlphanumeric: 'O nome da loja precisa ter ao menos uma letra ou um número.',
} as const;

export type StoreNameCheck =
  | { ok: true; value: string }
  | { ok: false; error: string };

/**
 * Valida e normaliza o nome digitado. Espaços das pontas somem e espaços
 * repetidos no meio viram um só.
 */
export function validateStoreName(input: unknown): StoreNameCheck {
  if (typeof input !== 'string') {
    return { ok: false, error: STORE_NAME_MESSAGES.required };
  }
  const value = input.trim().replace(/\s+/g, ' ');
  if (value.length === 0) {
    return { ok: false, error: STORE_NAME_MESSAGES.required };
  }
  if (value.length < STORE_NAME_MIN) {
    return { ok: false, error: STORE_NAME_MESSAGES.tooShort };
  }
  if (value.length > STORE_NAME_MAX) {
    return { ok: false, error: STORE_NAME_MESSAGES.tooLong };
  }
  if (!/[\p{L}\p{N}]/u.test(value)) {
    return { ok: false, error: STORE_NAME_MESSAGES.noAlphanumeric };
  }
  return { ok: true, value };
}
