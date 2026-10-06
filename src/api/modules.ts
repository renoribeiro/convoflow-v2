import { supabase } from '@/integrations/supabase/client';
import { Database } from '@/integrations/supabase/types';

type ModuleSettings = Database['public']['Tables']['module_settings']['Row'];
type ModuleSettingsInsert = Database['public']['Tables']['module_settings']['Insert'];
type ModuleSettingsUpdate = Database['public']['Tables']['module_settings']['Update'];

/**
 * API para gerenciamento de configurações de módulos
 */
export class ModulesApi {
  /**
   * Lista todos os módulos disponíveis
   */
  static async getModules(): Promise<ModuleSettings[]> {
    try {
      const { data, error } = await supabase
        .from('module_settings')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) {
        console.error('Erro ao buscar módulos:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Erro na API getModules:', error);
      if (error instanceof Error && error.message.includes('permission denied')) {
        throw new Error('Acesso negado: Usuário não autenticado ou sem permissões');
      }
      throw new Error('Falha ao carregar módulos');
    }
  }

  /**
   * Lista apenas os módulos habilitados
   */
  static async getEnabledModules(): Promise<ModuleSettings[]> {
    try {
      const { data, error } = await supabase
        .from('module_settings')
        .select('*')
        .eq('is_enabled', true)
        .order('sort_order', { ascending: true });

      if (error) {
        console.error('Erro ao buscar módulos habilitados:', error);
        throw new Error('Falha ao carregar módulos habilitados');
      }

      return data || [];
    } catch (error) {
      console.error('Erro na API getEnabledModules:', error);
      throw error;
    }
  }

  /**
   * Atualiza o status de um módulo (habilitar/desabilitar)
   */
  static async updateModuleStatus(
    moduleId: string, 
    isEnabled: boolean
  ): Promise<ModuleSettings> {
    try {
      const { data, error } = await supabase
        .from('module_settings')
        .update({ 
          is_enabled: isEnabled,
          updated_at: new Date().toISOString()
        })
        .eq('id', moduleId)
        .select()
        .single();

      if (error) {
        console.error('Erro ao atualizar status do módulo:', error);
        throw new Error('Falha ao atualizar status do módulo');
      }

      if (!data) {
        throw new Error('Módulo não encontrado');
      }

      return data;
    } catch (error) {
      console.error('Erro na API updateModuleStatus:', error);
      throw error;
    }
  }

  /**
   * Atualiza múltiplos módulos em lote
   */
  static async updateMultipleModules(
    updates: Array<{ id: string; is_enabled: boolean }>
  ): Promise<ModuleSettings[]> {
    try {
      const promises = updates.map(update => 
        this.updateModuleStatus(update.id, update.is_enabled)
      );

      const results = await Promise.all(promises);
      return results;
    } catch (error) {
      console.error('Erro na API updateMultipleModules:', error);
      throw error;
    }
  }

  /**
   * Atualiza a ordem de exibição dos módulos
   */
  static async updateModuleOrder(
    moduleId: string, 
    sortOrder: number
  ): Promise<ModuleSettings> {
    try {
      const { data, error } = await supabase
        .from('module_settings')
        .update({ 
          sort_order: sortOrder,
          updated_at: new Date().toISOString()
        })
        .eq('id', moduleId)
        .select()
        .single();

      if (error) {
        console.error('Erro ao atualizar ordem do módulo:', error);
        throw new Error('Falha ao atualizar ordem do módulo');
      }

      if (!data) {
        throw new Error('Módulo não encontrado');
      }

      return data;
    } catch (error) {
      console.error('Erro na API updateModuleOrder:', error);
      throw error;
    }
  }

  /**
   * Cria um novo módulo
   */
  static async createModule(
    moduleData: Omit<ModuleSettingsInsert, 'id' | 'created_at' | 'updated_at'>
  ): Promise<ModuleSettings> {
    try {
      const { data, error } = await supabase
        .from('module_settings')
        .insert({
          ...moduleData,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error('Erro ao criar módulo:', error);
        throw new Error('Falha ao criar módulo');
      }

      if (!data) {
        throw new Error('Falha ao criar módulo');
      }

      return data;
    } catch (error) {
      console.error('Erro na API createModule:', error);
      throw error;
    }
  }

  /**
   * Atualiza informações de um módulo
   */
  static async updateModule(
    moduleId: string,
    moduleData: Partial<ModuleSettingsUpdate>
  ): Promise<ModuleSettings> {
    try {
      const { data, error } = await supabase
        .from('module_settings')
        .update({
          ...moduleData,
          updated_at: new Date().toISOString()
        })
        .eq('id', moduleId)
        .select()
        .single();

      if (error) {
        console.error('Erro ao atualizar módulo:', error);
        throw new Error('Falha ao atualizar módulo');
      }

      if (!data) {
        throw new Error('Módulo não encontrado');
      }

      return data;
    } catch (error) {
      console.error('Erro na API updateModule:', error);
      throw error;
    }
  }

  /**
   * Remove um módulo
   */
  static async deleteModule(moduleId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('module_settings')
        .delete()
        .eq('id', moduleId);

      if (error) {
        console.error('Erro ao deletar módulo:', error);
        throw new Error('Falha ao deletar módulo');
      }
    } catch (error) {
      console.error('Erro na API deleteModule:', error);
      throw error;
    }
  }

  /**
   * Verifica se o usuário atual é superadministrador
   */
  static async isSuperAdmin(): Promise<boolean> {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      
      if (error) {
        console.error('Erro ao obter usuário:', error);
        return false;
      }
      
      if (!user) {
        console.log('Usuário não autenticado');
        return false;
      }

      // Verificar se o usuário tem role de superadmin na tabela profiles.
      // Usa apenas `role` como fonte de verdade (status é mantido em sync
      // por trigger). Filtrar por is_active duplicava a regra e gerava
      // divergência com useIsSuperAdmin() do TenantContext.
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profileError) {
        console.log('Erro ao verificar superadmin:', profileError.message);
        return false;
      }

      const isSuper = !!profile && (profile.role as string) === 'superadmin';
      console.log('Verificação superadmin:', { userId: user.id, role: profile?.role, isSuper });
      return isSuper;
    } catch (error) {
      console.error('Erro ao verificar superadmin:', error);
      return false;
    }
  }

  /**
   * Obtém os módulos visíveis para o usuário atual
   * - Superadmin vê todos os módulos
   * - Usuários normais veem apenas módulos habilitados
   */
  static async getVisibleModules(): Promise<ModuleSettings[]> {
    try {
      const isSuperAdmin = await this.isSuperAdmin();
      
      if (isSuperAdmin === true) {
        // Superadmin vê todos os módulos
        return this.getModules();
      } else {
        // Usuários normais veem apenas módulos habilitados
        return this.getEnabledModules();
      }
    } catch (error) {
      console.error('Erro na API getVisibleModules:', error);
      throw error;
    }
  }
}

export default ModulesApi;