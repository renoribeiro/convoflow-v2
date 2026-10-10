/**
 * Quem pode renomear uma Loja, lado do cliente.
 *
 * Espelha `public.rename_store` (migração 20261009000002). Quem nega de verdade
 * é o banco; isto só decide se o lápis aparece, para ninguém clicar num botão
 * que vai dar "sem permissão".
 *
 *   superadmin → qualquer Loja.
 *   gerente    → as Lojas da própria Conta (parent_tenant_id = Conta dele).
 *   gestor     → a própria Loja.
 *   atendente  → nunca, nem com `store.admin` concedido à mão (decisão do
 *                dono, 2026-10-09): o cargo é conferido antes da capability.
 *
 * Além do cargo, a pessoa precisa de `store.admin` — quem teve a capability
 * retirada não renomeia. Conta (kind='account') não se renomeia por aqui.
 */
import {
  can,
  normalizeRole,
  type AnyUserRole,
  type Capability,
  type UserRole,
} from '@/types/userHierarchy';

export const STORE_RENAME_CAPABILITY: Capability = 'store.admin';

export const STORE_RENAME_ROLES: readonly UserRole[] = ['superadmin', 'gerente', 'gestor'];

export interface StoreRenameCaller {
  role: string | null | undefined;
  tenant_id: string | null | undefined;
  capabilities?: unknown;
}

export interface RenamableStore {
  id: string;
  parent_tenant_id: string | null;
  /** Quando conhecido. Sem ele, a lista de Lojas filhas já garante que é Loja. */
  kind?: string | null;
}

export function canRenameStore(
  caller: StoreRenameCaller | null | undefined,
  store: RenamableStore | null | undefined,
): boolean {
  if (!caller || !store?.id) return false;
  if (store.kind != null && store.kind !== 'store') return false;

  const role = normalizeRole(caller.role as AnyUserRole | null | undefined);
  if (!role || !STORE_RENAME_ROLES.includes(role)) return false;

  const overrides = caller.capabilities as Partial<Record<Capability, boolean>> | null | undefined;
  if (!can(role, STORE_RENAME_CAPABILITY, overrides ?? null)) return false;

  if (role === 'superadmin') return true;
  if (!caller.tenant_id) return false;
  if (role === 'gerente') return store.parent_tenant_id === caller.tenant_id;
  return store.id === caller.tenant_id;
}
