import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Tables } from '@/integrations/supabase/types';
import {
  AnyUserRole,
  Capability,
  UserRole,
  can,
  normalizeRole,
  resolveCapabilities,
  roleAtLeast,
} from '@/types/userHierarchy';
import { clearActiveTenant, readActiveTenant, writeActiveTenant } from '@/lib/activeTenant';

type Tenant = Tables<'tenants'>;
type Profile = Tables<'profiles'>;

interface TenantContextType {
  tenant: Tenant | null;
  profile: Profile | null;
  tenantId: string | null;
  loading: boolean;
  error: string | null;
  refreshTenant: () => Promise<void>;
  /**
   * Merge raso em `tenants.settings`. Passe `{ silent: true }` quando a tela
   * chamadora já dá o próprio retorno — sem isso saem dois toasts (o genérico
   * daqui e o da tela).
   */
  updateTenantSettings: (settings: any, options?: { silent?: boolean }) => Promise<void>;
  /**
   * True quando um superadmin está "dentro" de uma Conta que não é a sua
   * (impersonação). Usado para mostrar o banner/seletor de Conta ativa.
   */
  isImpersonating: boolean;
  /**
   * Define a Conta ativa do superadmin. Passar `null` volta ao estado
   * sem Conta. Só tem efeito para superadmin — para os demais, o tenant
   * é sempre derivado do próprio profile.
   */
  setActiveTenant: (tenantId: string | null) => void;
  /** True para superadmin (qualquer Conta) e gerente (suas Lojas): pode trocar a Conta/Loja ativa. */
  canSwitchTenant: boolean;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

/**
 * A Conta ativa fica no localStorage e sobrevive à troca de usuário, então
 * precisa ser validada contra quem está logado AGORA. Sem isso, um gerente que
 * entra depois de um superadmin no mesmo navegador herda a Conta que o
 * superadmin havia escolhido — e passa a ver (ou não ver) dados de outra Conta.
 *
 *   - superadmin: pode entrar em qualquer Conta.
 *   - gerente: só a própria Conta ou uma Loja filha dela.
 *   - demais roles: nunca — o tenant vem sempre do próprio perfil.
 */
const canUseActiveTenant = async (
  role: UserRole | null,
  ownTenantId: string | null,
  activeTenantId: string,
): Promise<boolean> => {
  if (role === 'superadmin') return true;
  if (role !== 'gerente' || !ownTenantId) return false;
  if (activeTenantId === ownTenantId) return true;

  const { data, error } = await supabase
    .from('tenants')
    .select('id')
    .eq('id', activeTenantId)
    .eq('parent_tenant_id', ownTenantId)
    .maybeSingle();

  if (error) {
    console.error('[TenantContext] Erro ao validar Conta ativa:', error);
    return false;
  }
  return !!data;
};

export const useTenant = () => {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
};

export const TenantProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [impersonatedTenantId, setImpersonatedTenantId] = useState<string | null>(
    () => readActiveTenant(),
  );
  const { user } = useAuth();
  const { toast } = useToast();

  const loadTenantData = async () => {
    if (!user) {
      setTenant(null);
      setProfile(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // Buscar perfil do usuário — falha aqui é crítica
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error('[TenantContext] Erro ao buscar perfil:', profileError);
      setError(`Erro ao buscar perfil: ${profileError.message}`);
      setProfile(null);
      setTenant(null);
      setLoading(false);
      return;
    }

    if (!profileData) {
      console.warn('[TenantContext] Profile não encontrado para user:', user.id);
      setProfile(null);
      setTenant(null);
      setLoading(false);
      return;
    }

    setProfile(profileData);

    // Resolver o tenant efetivo.
    // Um superadmin não tem tenant_id próprio, mas pode "entrar" numa Conta
    // específica (impersonação) — nesse caso usamos o tenant escolhido. O RLS
    // já libera o superadmin a ler qualquer tenant (policies "Super admins can
    // access all ..."), então basta filtrar as queries por esse tenant_id.
    // Para qualquer outra role o impersonatedTenantId é ignorado.
    // Superadmin (qualquer Conta) e Gerente (suas próprias Lojas) podem trocar a
    // Conta/Loja ativa. Para gestor/atendente o tenant é sempre o próprio.
    const switchRole = normalizeRole(profileData.role as AnyUserRole | undefined);

    let effectiveTenantId = profileData.tenant_id;

    if (impersonatedTenantId) {
      const permitido = await canUseActiveTenant(
        switchRole,
        profileData.tenant_id,
        impersonatedTenantId,
      );

      if (permitido) {
        effectiveTenantId = impersonatedTenantId;
      } else {
        // Chave órfã — tipicamente sobrou de outro usuário no mesmo navegador.
        // Descarta e segue com a Conta do próprio perfil.
        console.warn(
          '[TenantContext] Conta ativa persistida não pertence a este usuário; descartando.',
          impersonatedTenantId,
        );
        clearActiveTenant();
        setImpersonatedTenantId(null);
      }
    }

    if (!effectiveTenantId) {
      setTenant(null);
      setLoading(false);
      return;
    }

    // Buscar tenant — falha aqui NÃO deve apagar o profile já carregado.
    // Profile carregado é mais importante que tenant (auth/permissions usam o profile).
    const { data: tenantData, error: tenantError } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', effectiveTenantId)
      .maybeSingle();

    if (tenantError) {
      console.error('[TenantContext] Erro ao buscar tenant (profile preservado):', tenantError);
      setError(`Erro ao buscar Conta: ${tenantError.message}`);
      setTenant(null);
    } else {
      setTenant(tenantData);
    }

    setLoading(false);
  };

  const refreshTenant = async () => {
    await loadTenantData();
  };

  const setActiveTenant = (tenantId: string | null) => {
    writeActiveTenant(tenantId);
    // Dispara o useEffect (deps inclui impersonatedTenantId) → recarrega o
    // tenant efetivo. Como o queryKey das queries inclui tenant?.id, o
    // TanStack Query refetcha automaticamente os dados da nova Conta.
    setImpersonatedTenantId(tenantId);
  };

  const updateTenantSettings = async (
    settings: Record<string, unknown>,
    options?: { silent?: boolean },
  ) => {
    if (!tenant) {
      throw new Error('Nenhuma Conta carregada');
    }

    try {
      // Vai por RPC, não por UPDATE direto: public.tenants não tem policy de
      // UPDATE para gerente/gestor, e um UPDATE que o RLS filtra devolve 204 sem
      // erro — o que fazia esta função "salvar" com sucesso e não gravar nada.
      // A RPC (20260813000003) escreve só a coluna settings e reclama alto
      // quando o usuário não pode. Cast local: função nova, fora dos tipos
      // gerados.
      const { data, error } = await (supabase as any).rpc('set_tenant_settings', {
        p_tenant_id: tenant.id,
        p_patch: settings,
      });

      if (error) {
        throw error;
      }

      // Atualizar estado local com o que o banco confirmou ter gravado.
      const merged = (data as Record<string, unknown> | null) ?? {
        ...(tenant.settings as Record<string, unknown> | null ?? {}),
        ...settings,
      };
      setTenant(prev => prev ? { ...prev, settings: merged as typeof prev.settings } : null);

      if (!options?.silent) {
        toast({
          title: 'Sucesso',
          description: 'Configurações atualizadas com sucesso',
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao atualizar configurações';
      if (!options?.silent) {
        toast({
          title: 'Erro',
          description: errorMessage,
          variant: 'destructive',
        });
      }
      throw err;
    }
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (cancelled) return;
      await loadTenantData();
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [user, impersonatedTenantId]);

  const isImpersonating = !!impersonatedTenantId
    && normalizeRole(profile?.role as AnyUserRole | undefined) === 'superadmin';

  const currentRole = normalizeRole(profile?.role as AnyUserRole | undefined);
  const canSwitchTenant = currentRole === 'superadmin' || currentRole === 'gerente';

  const value: TenantContextType = {
    tenant,
    profile,
    tenantId: tenant?.id || null,
    loading,
    error,
    refreshTenant,
    updateTenantSettings,
    isImpersonating,
    canSwitchTenant,
    setActiveTenant,
  };

  return (
    <TenantContext.Provider value={value}>
      {children}
    </TenantContext.Provider>
  );
};

// Hook para obter tenant_id de forma mais simples
export const useTenantId = () => {
  const { tenantId } = useTenant();
  return tenantId;
};

/**
 * Retorna a role do usuário atual normalizada para o enum atual
 * (`superadmin` | `gerente` | `gestor` | `atendente`), ou null se ainda não
 * carregada.
 *
 * `normalizeRole()` converte valores legados (`user`/`enterprise`/
 * `account_manager`) para o enum atual, então este hook permanece
 * estável mesmo quando o cache do TanStack Query ainda contém um
 * profile pré-migration.
 */
export const useRole = (): UserRole | null => {
  const { profile } = useTenant();
  return normalizeRole(profile?.role as AnyUserRole | undefined);
};

export const useIsSuperAdmin = () => useRole() === 'superadmin';
/** True para superadmin (qualquer Conta) e gerente (suas Lojas): pode trocar a Conta/Loja ativa. */
export const useCanSwitchTenant = () => useTenant().canSwitchTenant;
export const useIsGerente = () => useRole() === 'gerente';
export const useIsGestor = () => useRole() === 'gestor';
export const useIsAtendente = () => useRole() === 'atendente';

/** @deprecated Use useIsGerente. Mantido por 1 release. */
export const useIsAccountManager = useIsGerente;
/** @deprecated Use useIsGestor. Mantido por 1 release. */
export const useIsEnterprise = useIsGestor;
/** @deprecated Use useIsGestor. Mantido por 1 release. */
export const useIsTenantAdmin = useIsGestor;

/** Retorna true se a role do usuário for ao menos `minimum` na hierarquia. */
export const useHasMinRole = (minimum: UserRole): boolean => {
  const role = useRole();
  return role !== null && roleAtLeast(role, minimum);
};

/**
 * Capacidades efetivas do usuário atual (defaults por role + overrides de
 * `profiles.capabilities`). Lido defensivamente via `(profile as any)` porque
 * a coluna JSONB é da migração V2 e `types.ts` ainda não foi regenerado.
 */
export const useCapabilities = (): Record<Capability, boolean> => {
  const { profile } = useTenant();
  return resolveCapabilities(
    profile?.role as AnyUserRole | undefined,
    (profile as any)?.capabilities,
  );
};

/** Retorna true se o usuário atual tiver a capability informada. */
export const useCan = (capability: Capability): boolean => {
  const { profile } = useTenant();
  return can(
    profile?.role as AnyUserRole | undefined,
    capability,
    (profile as any)?.capabilities,
  );
};
