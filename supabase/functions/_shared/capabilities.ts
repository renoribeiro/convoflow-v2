// =============================================================================
// capabilities.ts — matriz de permissões por role (fonte da verdade do SERVIDOR)
// =============================================================================
// Espelha `src/types/userHierarchy.ts` (DEFAULT_CAPABILITIES). O front esconde
// botões; ESTE arquivo é o que realmente nega. Toda edge function que precisa
// checar permissão importa daqui — a matriz é escrita uma vez, não por função.
//
// Existe um TERCEIRO espelho, em SQL: `public.has_capability(text)` (migração
// 20260813000005), usado pelas policies de RLS nas tabelas que o front escreve
// direto via PostgREST (campanhas, execuções, instâncias de WhatsApp).
// Os três precisam concordar:
//
//   src/types/userHierarchy.ts   → esconde na UI
//   _shared/capabilities.ts      → nega nas edge functions   (este arquivo)
//   public.has_capability(text)  → nega no banco (RLS)
//
// A divergência entre os dois primeiros é detectada pelo teste
// `src/test/capabilities-parity.test.ts`. O terceiro é conferido pela query de
// verificação no fim de `docs/aplicar_access_control.sql`.
//
// SEM IMPORTS DE PROPÓSITO: assim este módulo roda no Deno (edge functions) e
// também é importável pelo Vitest (Node) para o teste de paridade.
// =============================================================================

export type UserRole = 'superadmin' | 'gerente' | 'gestor' | 'atendente';

export type Capability =
  | 'conversations.handle'
  | 'contacts.manage'
  | 'automations.operate'
  | 'campaigns.view_convos'
  | 'campaigns.budget'
  | 'campaigns.dispatch'
  | 'store.admin'
  | 'whatsapp.configure'
  | 'billing.view'
  | 'billing.manage'
  | 'stores.switch'
  | 'stores.compare'
  | 'platform.ops';

/**
 * Roles legadas que ainda existem no enum `public.user_role` e podem aparecer
 * em JWTs/linhas antigas. Mesmo mapeamento de `normalizeRole()` no front.
 */
const LEGACY_ROLE_MAP: Record<string, UserRole> = {
  super_admin: 'superadmin',
  account_manager: 'gerente',
  agencia: 'gerente',
  tenant_admin: 'gestor',
  enterprise: 'gestor',
  tenant_user: 'gestor',
  user: 'gestor',
  loja: 'gestor',
};

export function normalizeRole(role: string | null | undefined): UserRole | null {
  if (!role) return null;
  if (role === 'superadmin' || role === 'gerente' || role === 'gestor' || role === 'atendente') {
    return role;
  }
  return LEGACY_ROLE_MAP[role] ?? null;
}

/**
 * Defaults por role. Cópia fiel de DEFAULT_CAPABILITIES em
 * src/types/userHierarchy.ts — se mudar lá, mude aqui (o teste de paridade
 * quebra se esquecer).
 *
 * `billing.manage` NÃO existe no modelo original: foi acrescentada em
 * 2026-08-13 porque `billing.view` (gerente+) não serve para autorizar o
 * checkout — quem assina o plano de uma Loja é o próprio GESTOR. Usar
 * `billing.view` no create-checkout-session mataria o fluxo de pagamento que
 * está no ar desde 2026-07-27. `billing.manage` nega só o atendente.
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

/** Mensagens de negação, em pt-BR, prontas para devolver ao cliente. */
export const CAPABILITY_DENIAL_MESSAGES: Record<Capability, string> = {
  'conversations.handle': 'Você não tem permissão para atender conversas.',
  'contacts.manage': 'Você não tem permissão para gerenciar contatos.',
  'automations.operate': 'Você não tem permissão para operar automações.',
  'campaigns.view_convos': 'Você não tem permissão para ver conversas de campanha.',
  'campaigns.budget': 'Apenas Gestor ou Gerente pode ver ou alterar o orçamento de campanhas.',
  'campaigns.dispatch': 'Apenas Gestor ou Gerente pode disparar campanhas.',
  'store.admin': 'Apenas Gestor ou Gerente pode administrar a Loja.',
  'whatsapp.configure': 'Apenas Gestor ou Gerente pode configurar números de WhatsApp.',
  'billing.view': 'Apenas Gerente pode ver os dados de cobrança.',
  'billing.manage': 'Apenas Gestor ou Gerente pode contratar ou alterar a assinatura.',
  'stores.switch': 'Apenas Gerente pode alternar entre Lojas.',
  'stores.compare': 'Apenas Gerente pode comparar Lojas.',
  'platform.ops': 'Apenas Superadmin pode executar operações da plataforma.',
};

/**
 * Resolve uma capability para uma role, aplicando overrides por usuário
 * (`profiles.capabilities` jsonb). Role desconhecida cai no conjunto mais
 * restritivo (atendente) — nunca abre por engano.
 */
export function can(
  role: string | null | undefined,
  capability: Capability,
  overrides?: Record<string, unknown> | null,
): boolean {
  const normalized = normalizeRole(role) ?? 'atendente';
  const override = overrides?.[capability];
  if (typeof override === 'boolean') return override;
  return DEFAULT_CAPABILITIES[normalized][capability] === true;
}

// -----------------------------------------------------------------------------
// Uso nas edge functions
// -----------------------------------------------------------------------------

export interface CallerProfile {
  id: string;
  user_id: string;
  role: string;
  tenant_id: string | null;
  status: string;
  capabilities: Record<string, unknown> | null;
}

export type CapabilityCheck =
  | { ok: true; caller: CallerProfile }
  | { ok: false; status: number; error: string };

/**
 * Cliente Supabase tipado estruturalmente para este módulo não precisar
 * importar `@supabase/supabase-js` (o que quebraria o teste rodando em Node).
 */
interface MinimalAdminClient {
  auth: {
    getUser(token: string): Promise<{ data: { user: { id: string } | null }; error: unknown }>;
  };
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: unknown }>;
      };
    };
  };
}

/**
 * Resolve o chamador a partir do JWT e decide se ele tem a capability.
 *
 * Nega, nesta ordem:
 *   401 — sem token / token inválido
 *   403 — sem perfil
 *   403 — perfil com status != 'active'  (suspenso, convite não aceito, excluído)
 *   403 — perfil ativo, mas sem a capability
 *
 * Devolve o perfil no caso feliz para a função não precisar buscá-lo de novo.
 */
export async function requireCapability(
  admin: MinimalAdminClient,
  authHeader: string | null,
  capability: Capability,
): Promise<CapabilityCheck> {
  if (!authHeader) {
    return { ok: false, status: 401, error: 'Cabeçalho de autorização ausente.' };
  }

  const token = authHeader.replace(/^Bearer\s+/i, '');
  const { data, error } = await admin.auth.getUser(token);
  const user = data?.user ?? null;
  if (error || !user) {
    return { ok: false, status: 401, error: 'Sessão inválida ou expirada.' };
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('id, user_id, role, tenant_id, status, capabilities')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!profile) {
    return { ok: false, status: 403, error: 'Perfil de usuário não encontrado.' };
  }

  const caller = profile as unknown as CallerProfile;

  if (caller.status !== 'active') {
    return { ok: false, status: 403, error: statusDenialMessage(caller.status) };
  }

  if (!can(caller.role, capability, caller.capabilities)) {
    return { ok: false, status: 403, error: CAPABILITY_DENIAL_MESSAGES[capability] };
  }

  return { ok: true, caller };
}

/** Mensagem pt-BR para cada estado de conta que não seja 'active'. */
export function statusDenialMessage(status: string): string {
  switch (status) {
    case 'pending':
      return 'Complete seu cadastro para acessar o sistema.';
    case 'suspended':
      return 'Sua conta foi suspensa. Entre em contato com o administrador.';
    case 'deleted':
      return 'Esta conta foi excluída.';
    default:
      return 'Sua conta não está ativa. Entre em contato com o administrador.';
  }
}
