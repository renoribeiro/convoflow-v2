/**
 * Conta ativa escolhida na interface — impersonação do superadmin e seletor de
 * Loja do gerente compartilham a mesma chave.
 *
 * Vive em módulo próprio porque `TenantContext` e `AuthContext` precisam mexer
 * nela, e o TenantContext já importa o AuthContext — um import de volta criaria
 * ciclo.
 */
const ACTIVE_TENANT_KEY = 'convoflow-active-tenant';

/** Lê a Conta ativa persistida. `null` quando não há, ou sem localStorage. */
export const readActiveTenant = (): string | null => {
  try {
    return localStorage.getItem(ACTIVE_TENANT_KEY);
  } catch {
    // localStorage indisponível (modo privado, etc.) — segue sem persistência.
    return null;
  }
};

/** Persiste a Conta ativa. `null` apaga a chave. */
export const writeActiveTenant = (tenantId: string | null): void => {
  try {
    if (tenantId) {
      localStorage.setItem(ACTIVE_TENANT_KEY, tenantId);
    } else {
      localStorage.removeItem(ACTIVE_TENANT_KEY);
    }
  } catch {
    // idem
  }
};

/** Apaga a Conta ativa. Chamado no logout para não vazar entre usuários. */
export const clearActiveTenant = (): void => writeActiveTenant(null);
