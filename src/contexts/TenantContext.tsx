import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
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
import { motivoDoErro } from '@/lib/errors/mensagemDoErro';

type Tenant = Tables<'tenants'>;
type Profile = Tables<'profiles'>;

interface TenantContextType {
  tenant: Tenant | null;
  profile: Profile | null;
  tenantId: string | null;
  loading: boolean;
  error: string | null;
  /**
   * Recarrega perfil e Conta. Com `{ silent: true }` relê só a linha da
   * Conta/Loja aberta, sem passar por `loading` — a PortaDeEntrada troca o painel
   * inteiro por um carregando enquanto `loading` é true, e um rename não
   * justifica desmontar a tela em que a pessoa está. Com `perfil: true` (só
   * no silencioso) relê também o perfil de quem está logado: o nome e a foto
   * do topo mudam sem o carregando.
   */
  refreshTenant: (options?: { silent?: boolean; perfil?: boolean }) => Promise<void>;
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
  /**
   * Troca de Loja/Conta no ar. A Loja anterior continua na tela até a nova
   * chegar; o painel não volta ao carregando (lote 6f, B14).
   */
  trocandoLoja: boolean;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

// A id guardada no navegador entra num filtro `or` do PostgREST: só letras,
// algarismos e hífen (uuid), para vírgula, ponto ou parêntese não mudarem o filtro.
const ID_SEGURO = /^[0-9a-z-]+$/i;

interface LojaResolvida {
  tenant: Tenant | null;
  /** A Conta/Loja guardada no navegador não vale para quem está logado. */
  descartarAtiva: boolean;
  erro: string | null;
}

/**
 * A Conta ativa fica no localStorage e sobrevive à troca de usuário, então
 * precisa ser validada contra quem está logado AGORA. Sem isso, um gerente que
 * entra depois de um superadmin no mesmo navegador herda a Conta que o
 * superadmin havia escolhido — e passa a ver (ou não ver) dados de outra Conta.
 *
 *   - superadmin: pode entrar em qualquer Conta.
 *   - gerente: só a própria Conta ou uma Loja filha dela.
 *   - demais roles: nunca — o tenant vem sempre do próprio perfil.
 *
 * Para o gerente, conferir e ler são UMA ida ao banco (lote 6f, B14): a linha
 * só volta se for a Conta dele ou uma Loja filha. Antes eram duas em fila.
 */
const resolverLoja = async (perfil: Profile, ativa: string | null): Promise<LojaResolvida> => {
  const papel = normalizeRole(perfil.role as AnyUserRole | undefined);
  const propria = perfil.tenant_id;
  const ler = async (id: string): Promise<LojaResolvida> => {
    const { data, error } = await supabase.from('tenants').select('*').eq('id', id).maybeSingle();
    if (error) {
      console.error('[TenantContext] Erro ao buscar tenant (profile preservado):', error);
      return { tenant: null, descartarAtiva: false, erro: `Erro ao buscar Conta: ${error.message}` };
    }
    return { tenant: data, descartarAtiva: false, erro: null };
  };

  if (ativa && papel === 'superadmin') return ler(ativa);

  if (ativa && papel === 'gerente' && propria && ID_SEGURO.test(ativa)) {
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', ativa)
      .or(`id.eq.${propria},parent_tenant_id.eq.${propria}`)
      .maybeSingle();
    if (error) console.error('[TenantContext] Erro ao validar Conta ativa:', error);
    if (!error && data) return { tenant: data, descartarAtiva: false, erro: null };
  }

  // Chave órfã (tipicamente sobrou de outro usuário no mesmo navegador) ou
  // cargo que não troca de Loja: descarta e segue com a Conta do próprio perfil.
  const descartarAtiva = !!ativa;
  if (descartarAtiva) {
    console.warn(
      '[TenantContext] Conta ativa persistida não pertence a este usuário; descartando.',
      ativa,
    );
  }
  if (!propria) return { tenant: null, descartarAtiva, erro: null };
  return { ...(await ler(propria)), descartarAtiva };
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

  // Quem já está com o painel aberto e só trocou de Loja não volta ao
  // carregando (lote 6f, B14): a Loja nova entra no lugar da velha quando
  // chega, e só a tela do meio é montada de novo (ver DashboardLayout).
  const perfilDe = useRef<{ userId: string; perfil: Profile } | null>(null);
  const ultimaLeitura = useRef(0);
  const [trocandoLoja, setTrocandoLoja] = useState(false);

  const aplicarLoja = (r: LojaResolvida) => {
    if (r.descartarAtiva) {
      clearActiveTenant();
      setImpersonatedTenantId(null);
    }
    setError(r.erro);
    setTenant(r.tenant);
  };

  const trocarLoja = async (ativa: string | null) => {
    const atual = perfilDe.current;
    if (!atual) return;
    const leitura = ++ultimaLeitura.current;
    setTrocandoLoja(true);
    const r = await resolverLoja(atual.perfil, ativa);
    // Duas trocas seguidas: vale a última.
    if (leitura !== ultimaLeitura.current) return;
    aplicarLoja(r);
    setTrocandoLoja(false);
  };

  const loadTenantData = async () => {
    const leitura = ++ultimaLeitura.current;
    setTrocandoLoja(false);
    if (!user) {
      perfilDe.current = null;
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
    if (leitura !== ultimaLeitura.current) return;

    if (profileError) {
      console.error('[TenantContext] Erro ao buscar perfil:', profileError);
      perfilDe.current = null;
      setError(`Erro ao buscar perfil: ${profileError.message}`);
      setProfile(null);
      setTenant(null);
      setLoading(false);
      return;
    }

    if (!profileData) {
      console.warn('[TenantContext] Profile não encontrado para user:', user.id);
      perfilDe.current = null;
      setProfile(null);
      setTenant(null);
      setLoading(false);
      return;
    }

    perfilDe.current = { userId: user.id, perfil: profileData };
    setProfile(profileData);

    // Resolver o tenant efetivo.
    // Um superadmin não tem tenant_id próprio, mas pode "entrar" numa Conta
    // específica (impersonação) — nesse caso usamos o tenant escolhido. O RLS
    // já libera o superadmin a ler qualquer tenant (policies "Super admins can
    // access all ..."), então basta filtrar as queries por esse tenant_id.
    // Superadmin (qualquer Conta) e Gerente (suas próprias Lojas) podem trocar a
    // Conta/Loja ativa. Para gestor/atendente o tenant é sempre o próprio.
    // Falha ao ler a Loja NÃO apaga o profile já carregado: auth e permissões
    // usam o profile.
    const r = await resolverLoja(profileData, impersonatedTenantId);
    if (leitura !== ultimaLeitura.current) return;
    aplicarLoja(r);
    setTrocandoLoja(false);
    setLoading(false);
  };

  const refreshTenant = async (options?: { silent?: boolean; perfil?: boolean }) => {
    if (!options?.silent) {
      await loadTenantData();
      return;
    }

    if (options.perfil && user?.id) {
      const quem = user.id;
      const { data: perfil, error: perfilError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', quem)
        .maybeSingle();
      if (perfilError) console.error('[TenantContext] Erro ao reler o perfil:', perfilError);
      else if (perfil) {
        if (perfilDe.current?.userId === quem) perfilDe.current = { userId: quem, perfil };
        setProfile(prev => (prev && prev.user_id === quem ? perfil : prev));
      }
    }

    const id = tenant?.id;
    if (!id) return;
    const { data, error: rowError } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (rowError || !data) {
      console.error('[TenantContext] Erro ao reler a Conta aberta:', rowError);
      return;
    }
    // Só troca se a pessoa não mudou de Conta/Loja enquanto a leitura voltava.
    setTenant(prev => (prev && prev.id === data.id ? data : prev));
  };

  const setActiveTenant = (tenantId: string | null) => {
    writeActiveTenant(tenantId);
    // Dispara o useEffect (deps inclui impersonatedTenantId) → troca a Loja
    // sem voltar ao carregando (trocarLoja). Como o queryKey das queries inclui
    // tenant?.id, o TanStack Query busca sozinho os dados da nova Loja.
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
        toast({ title: 'Configurações salvas' });
      }
    } catch (err) {
      if (!options?.silent) {
        toast({
          title: 'Não foi possível salvar',
          description: motivoDoErro(err),
          variant: 'destructive',
        });
      }
      throw err;
    }
  };

  useEffect(() => {
    // Mesmo usuário, perfil em mãos: é troca de Loja, não entrada.
    if (user && perfilDe.current?.userId === user.id) {
      void trocarLoja(impersonatedTenantId);
      return;
    }
    void loadTenantData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    trocandoLoja,
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
