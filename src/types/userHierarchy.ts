/**
 * Shared types for the user hierarchy (V2 — 4 levels, two-axis permissions).
 *
 * Hierarchy: superadmin > gerente > gestor > atendente
 *
 *   - superadmin : platform level (business ops). Not a product role.
 *   - gerente    : top-level SOLD account. Full power over every store in its
 *                  slot group (all-stores scope) + store switcher + cross-store
 *                  metrics. Comes with 5 store slots; extra slots are purchasable.
 *   - gestor     : full power over exactly ONE store (delegable by a gerente).
 *   - atendente  : operational-only inside ONE store (max 5 per store).
 *
 * PERMISSION MODEL — two independent axes, not one-rule-per-role:
 *   - POWER : 'full' (gerente, gestor) vs 'operational' (atendente)
 *   - SCOPE : 'platform' (superadmin) | 'group' (gerente, all its stores)
 *             | 'store' (gestor, atendente — their single store)
 * Capabilities (fine-grained flags) are derived from role defaults and can be
 * overridden per-user WITHOUT a schema change (e.g. campaigns.dispatch). This
 * makes `gerente` a clean superset of `gestor` and avoids hardcoding per role.
 *
 * These types mirror the DB enum `public.user_role` after the V2 rename
 * migration (agencia→gerente, loja→gestor, +atendente). Legacy values stay in
 * the Postgres enum for compatibility but are blocked by the CHECK constraint
 * `profiles_role_modern_only`. `normalizeRole()` keeps accepting legacy values
 * for data in transit (TanStack Query cache, old JWTs) until session rotation.
 */
export type UserRole = 'superadmin' | 'gerente' | 'gestor' | 'atendente';

/** Legacy roles — accepted only for backward-compat during/after transition. */
export type LegacyUserRole =
  | 'super_admin'
  | 'account_manager'
  | 'tenant_admin'
  | 'enterprise'
  | 'tenant_user'
  | 'user'
  | 'agencia'
  | 'loja';

export type AnyUserRole = UserRole | LegacyUserRole;

export type UserStatus = 'active' | 'suspended' | 'pending' | 'deleted';

export const ROLE_ORDER: Record<UserRole, number> = {
  atendente: 1,
  gestor: 2,
  gerente: 3,
  superadmin: 4,
};

/**
 * Map legacy role → current role.
 * Two prior renames collapsed the old 6-value enum into superadmin/agencia/loja;
 * V2 renames those to gerente/gestor. `atendente` has no legacy equivalent.
 */
const LEGACY_ROLE_MAP: Record<LegacyUserRole, UserRole> = {
  super_admin: 'superadmin',
  account_manager: 'gerente',
  agencia: 'gerente',
  tenant_admin: 'gestor',
  enterprise: 'gestor',
  tenant_user: 'gestor',
  user: 'gestor',
  loja: 'gestor',
};

/**
 * Normalize a possibly-legacy role to the current enum.
 * Returns null for unknown values.
 */
export function normalizeRole(role: AnyUserRole | null | undefined): UserRole | null {
  if (!role) return null;
  if (role in ROLE_ORDER) return role as UserRole;
  if (role in LEGACY_ROLE_MAP) return LEGACY_ROLE_MAP[role as LegacyUserRole];
  return null;
}

/**
 * Compare two roles by hierarchy order.
 * `roleAtLeast('gerente', 'gestor') === true`. Accepts legacy values.
 */
export function roleAtLeast(actual: AnyUserRole | null, minimum: AnyUserRole): boolean {
  const a = normalizeRole(actual);
  const m = normalizeRole(minimum);
  if (!a || !m) return false;
  return ROLE_ORDER[a] >= ROLE_ORDER[m];
}

/** pt-BR labels for each current role. */
export const ROLE_LABELS: Record<UserRole, string> = {
  superadmin: 'Superadmin',
  gerente: 'Gerente',
  gestor: 'Gestor',
  atendente: 'Atendente',
};

/** pt-BR label for any role (normalizes legacy first). */
export function roleLabel(role: AnyUserRole | null | undefined): string {
  const normalized = normalizeRole(role);
  if (!normalized) return 'Desconhecido';
  return ROLE_LABELS[normalized];
}

export const STATUS_LABELS: Record<UserStatus, string> = {
  active: 'Ativo',
  suspended: 'Suspenso',
  pending: 'Pendente',
  deleted: 'Excluído',
};

// ============================================================================
// Two-axis permission model
// ============================================================================

/** POWER axis: what a user can do. */
export type RolePower = 'full' | 'operational';
/** SCOPE axis: over which stores a user acts. */
export type RoleScope = 'platform' | 'group' | 'store';

export const ROLE_POWER: Record<UserRole, RolePower> = {
  superadmin: 'full',
  gerente: 'full',
  gestor: 'full',
  atendente: 'operational',
};

export const ROLE_SCOPE: Record<UserRole, RoleScope> = {
  superadmin: 'platform',
  gerente: 'group',
  gestor: 'store',
  atendente: 'store',
};

export const hasFullPower = (role: AnyUserRole | null | undefined): boolean =>
  ROLE_POWER[normalizeRole(role) ?? 'atendente'] === 'full';

/** True when the role can see/act across more than one store. */
export const hasGroupScope = (role: AnyUserRole | null | undefined): boolean => {
  const scope = ROLE_SCOPE[normalizeRole(role) ?? 'atendente'];
  return scope === 'group' || scope === 'platform';
};

// ============================================================================
// Capabilities — fine-grained, flag-based (overridable without schema change)
// ============================================================================

export type Capability =
  | 'conversations.handle'
  | 'contacts.manage'
  | 'automations.operate'
  | 'campaigns.view_convos'
  | 'campaigns.budget'
  | 'campaigns.dispatch'
  | 'store.admin' // manage users + WhatsApp chip of the store
  | 'whatsapp.configure'
  | 'billing.view'
  | 'billing.manage' // contratar/alterar assinatura (checkout Stripe)
  | 'stores.switch'
  | 'stores.compare'
  | 'platform.ops'; // stripe config, coupons/promotions, plans, subscriptions

export const ALL_CAPABILITIES: readonly Capability[] = [
  'conversations.handle',
  'contacts.manage',
  'automations.operate',
  'campaigns.view_convos',
  'campaigns.budget',
  'campaigns.dispatch',
  'store.admin',
  'whatsapp.configure',
  'billing.view',
  'billing.manage',
  'stores.switch',
  'stores.compare',
  'platform.ops',
] as const;

/**
 * Default capability set per role.
 *
 * Atendente × Campanhas (confirmed with Reno, 2026-07-16): can view/join
 * campaign conversations, but CANNOT see/edit budget and CANNOT trigger a mass
 * dispatch. Encoded as flags below so it stays adjustable without a schema
 * change (see `resolveCapabilities` overrides).
 *
 * `billing.view` × `billing.manage` (2026-08-13): ver os dados de cobrança é
 * de gerente para cima, mas QUEM ASSINA o plano de uma Loja é o próprio
 * gestor — é assim que o paywall de Loja é destravado (useTenantAccess).
 * Autorizar o checkout por `billing.view` mataria o fluxo de pagamento. Por
 * isso `billing.manage` existe e nega só o atendente. O servidor
 * (create-checkout-session) checa `billing.manage`.
 *
 * ESTE MAPA É ESPELHADO em `supabase/functions/_shared/capabilities.ts` e em
 * `public.has_capability(text)` (SQL). Mudou aqui, mude nos dois — o teste
 * `src/test/capabilities-parity.test.ts` quebra se esquecer do segundo.
 */
export const DEFAULT_CAPABILITIES: Record<UserRole, Record<Capability, boolean>> = {
  superadmin: {
    'conversations.handle': true,
    'contacts.manage': true,
    'automations.operate': true,
    'campaigns.view_convos': true,
    'campaigns.budget': true,
    'campaigns.dispatch': true,
    'store.admin': true,
    'whatsapp.configure': true,
    'billing.view': true,
    'billing.manage': true,
    'stores.switch': true,
    'stores.compare': true,
    'platform.ops': true,
  },
  gerente: {
    'conversations.handle': true,
    'contacts.manage': true,
    'automations.operate': true,
    'campaigns.view_convos': true,
    'campaigns.budget': true,
    'campaigns.dispatch': true,
    'store.admin': true,
    'whatsapp.configure': true,
    'billing.view': true,
    'billing.manage': true,
    'stores.switch': true,
    'stores.compare': true,
    'platform.ops': false,
  },
  gestor: {
    'conversations.handle': true,
    'contacts.manage': true,
    'automations.operate': true,
    'campaigns.view_convos': true,
    'campaigns.budget': true,
    'campaigns.dispatch': true,
    'store.admin': true,
    'whatsapp.configure': true,
    'billing.view': false,
    // O gestor é quem contrata o plano da própria Loja (destrava o paywall).
    'billing.manage': true,
    'stores.switch': false,
    'stores.compare': false,
    'platform.ops': false,
  },
  atendente: {
    'conversations.handle': true,
    'contacts.manage': true,
    'automations.operate': true,
    'campaigns.view_convos': true,
    'campaigns.budget': false,
    'campaigns.dispatch': false,
    'store.admin': false,
    'whatsapp.configure': false,
    'billing.view': false,
    'billing.manage': false,
    'stores.switch': false,
    'stores.compare': false,
    'platform.ops': false,
  },
};

/**
 * Resolve the effective capability map for a role, applying optional per-user
 * overrides (e.g. from `profiles.capabilities` JSONB). Overrides win over the
 * role default. Unknown roles resolve to the most restrictive (atendente) set.
 */
export function resolveCapabilities(
  role: AnyUserRole | null | undefined,
  overrides?: Partial<Record<Capability, boolean>> | null,
): Record<Capability, boolean> {
  const normalized = normalizeRole(role) ?? 'atendente';
  const base = DEFAULT_CAPABILITIES[normalized];
  if (!overrides) return { ...base };
  return { ...base, ...overrides };
}

/**
 * Whether a role (with optional overrides) has a given capability.
 * `can('atendente', 'campaigns.dispatch') === false`.
 */
export function can(
  role: AnyUserRole | null | undefined,
  capability: Capability,
  overrides?: Partial<Record<Capability, boolean>> | null,
): boolean {
  return resolveCapabilities(role, overrides)[capability] === true;
}
