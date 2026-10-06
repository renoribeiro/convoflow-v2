import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ModulesApi } from '@/api/modules';
import { Database } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

type ModuleSettings = Database['public']['Tables']['module_settings']['Row'];

/**
 * Hook para gerenciar módulos da aplicação
 */
export const useModules = () => {
  const queryClient = useQueryClient();
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const { user, isLoading: authLoading } = useAuth();

  // Query para verificar se é superadmin
  const { data: superAdminStatus, isLoading: isLoadingSuperAdmin } = useQuery({
    queryKey: ['superAdminStatus'],
    queryFn: () => ModulesApi.isSuperAdmin(),
    staleTime: 5 * 60 * 1000, // 5 minutos
    enabled: !!user && !authLoading, // Só executa se há usuário autenticado
  });

  // Query para buscar todos os módulos (para superadmin)
  const { 
    data: allModules = [], 
    isLoading: isLoadingAll,
    error: allModulesError 
  } = useQuery({
    queryKey: ['modules', 'all'],
    queryFn: () => ModulesApi.getModules(),
    enabled: !!user && !authLoading && superAdminStatus === true,
  });

  // Query para buscar módulos visíveis (baseado no tipo de usuário)
  const { 
    data: visibleModules = [], 
    isLoading: isLoadingVisible,
    error: visibleModulesError 
  } = useQuery({
    queryKey: ['modules', 'visible'],
    queryFn: () => ModulesApi.getVisibleModules(),
    staleTime: 2 * 60 * 1000, // 2 minutos
    enabled: !!user && !authLoading, // Só executa se há usuário autenticado
  });

  // Query para buscar apenas módulos habilitados
  const { 
    data: enabledModules = [], 
    isLoading: isLoadingEnabled,
    error: enabledModulesError 
  } = useQuery({
    queryKey: ['modules', 'enabled'],
    queryFn: () => ModulesApi.getEnabledModules(),
    enabled: !!user && !authLoading && superAdminStatus === false,
  });

  // Mutation para atualizar status de um módulo
  const updateModuleStatusMutation = useMutation({
    mutationFn: ({ moduleId, isEnabled }: { moduleId: string; isEnabled: boolean }) =>
      ModulesApi.updateModuleStatus(moduleId, isEnabled),
    onSuccess: (data) => {
      // Invalidar queries relacionadas
      queryClient.invalidateQueries({ queryKey: ['modules'] });
      toast.success(
        `Módulo "${data.display_name}" ${data.is_enabled ? 'habilitado' : 'desabilitado'} com sucesso!`
      );
    },
    onError: (error) => {
      console.error('Erro ao atualizar status do módulo:', error);
      toast.error('Erro ao atualizar status do módulo');
    },
  });

  // Mutation para atualizar múltiplos módulos
  const updateMultipleModulesMutation = useMutation({
    mutationFn: (updates: Array<{ id: string; is_enabled: boolean }>) =>
      ModulesApi.updateMultipleModules(updates),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['modules'] });
      toast.success(`${data.length} módulos atualizados com sucesso!`);
    },
    onError: (error) => {
      console.error('Erro ao atualizar múltiplos módulos:', error);
      toast.error('Erro ao atualizar módulos');
    },
  });

  // Mutation para atualizar ordem dos módulos
  const updateModuleOrderMutation = useMutation({
    mutationFn: ({ moduleId, sortOrder }: { moduleId: string; sortOrder: number }) =>
      ModulesApi.updateModuleOrder(moduleId, sortOrder),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modules'] });
      toast.success('Ordem dos módulos atualizada!');
    },
    onError: (error) => {
      console.error('Erro ao atualizar ordem do módulo:', error);
      toast.error('Erro ao atualizar ordem do módulo');
    },
  });

  // Mutation para criar novo módulo
  const createModuleMutation = useMutation({
    mutationFn: (moduleData: Parameters<typeof ModulesApi.createModule>[0]) =>
      ModulesApi.createModule(moduleData),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['modules'] });
      toast.success(`Módulo "${data.display_name}" criado com sucesso!`);
    },
    onError: (error) => {
      console.error('Erro ao criar módulo:', error);
      toast.error('Erro ao criar módulo');
    },
  });

  // Mutation para atualizar módulo
  const updateModuleMutation = useMutation({
    mutationFn: ({ moduleId, moduleData }: { 
      moduleId: string; 
      moduleData: Parameters<typeof ModulesApi.updateModule>[1] 
    }) => ModulesApi.updateModule(moduleId, moduleData),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['modules'] });
      toast.success(`Módulo "${data.display_name}" atualizado com sucesso!`);
    },
    onError: (error) => {
      console.error('Erro ao atualizar módulo:', error);
      toast.error('Erro ao atualizar módulo');
    },
  });

  // Mutation para deletar módulo
  const deleteModuleMutation = useMutation({
    mutationFn: (moduleId: string) => ModulesApi.deleteModule(moduleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modules'] });
      toast.success('Módulo removido com sucesso!');
    },
    onError: (error) => {
      console.error('Erro ao deletar módulo:', error);
      toast.error('Erro ao deletar módulo');
    },
  });

  // Atualizar estado do superadmin
  useEffect(() => {
    if (superAdminStatus !== undefined) {
      setIsSuperAdmin(superAdminStatus);
    }
  }, [superAdminStatus]);

  // Funções de conveniência
  const toggleModuleStatus = useCallback((moduleId: string, currentStatus: boolean) => {
    updateModuleStatusMutation.mutate({
      moduleId,
      isEnabled: !currentStatus
    });
  }, [updateModuleStatusMutation]);

  const enableAllModules = useCallback(() => {
    if (allModules.length > 0) {
      const updates = allModules.map(module => ({
        id: module.id,
        is_enabled: true
      }));
      updateMultipleModulesMutation.mutate(updates);
    }
  }, [allModules, updateMultipleModulesMutation]);

  const disableAllModules = useCallback(() => {
    if (allModules.length > 0) {
      const updates = allModules.map(module => ({
        id: module.id,
        is_enabled: false
      }));
      updateMultipleModulesMutation.mutate(updates);
    }
  }, [allModules, updateMultipleModulesMutation]);

  // Função para obter módulos baseado no tipo de usuário
  const getModulesForCurrentUser = useCallback((): ModuleSettings[] => {
    if (isSuperAdmin) {
      return allModules;
    }
    return enabledModules;
  }, [isSuperAdmin, allModules, enabledModules]);

  // Função para verificar se um módulo está visível para o usuário atual
  const isModuleVisible = useCallback((moduleName: string): boolean => {
    const modules = getModulesForCurrentUser();
    const module = modules.find(m => m.module_name === moduleName);
    
    if (isSuperAdmin) {
      // Superadmin vê todos os módulos, independente do status
      return !!module;
    }
    
    // Usuários normais veem apenas módulos habilitados
    return !!module && module.is_enabled;
  }, [getModulesForCurrentUser, isSuperAdmin]);

  // Estados de loading — só considera queries que realmente vão rodar
  // (queries com enabled=false em React Query mantêm isPending=true mas
  // isLoading=false; mesmo assim, computamos explicitamente para clareza).
  const isLoading = (() => {
    if (isLoadingSuperAdmin) return true;
    if (isLoadingVisible) return true;
    if (superAdminStatus === true && isLoadingAll) return true;
    if (superAdminStatus === false && isLoadingEnabled) return true;
    return false;
  })();
  const error = allModulesError || visibleModulesError || enabledModulesError;

  return {
    // Estados
    isSuperAdmin,
    isLoading,
    error,
    
    // Dados
    allModules,
    visibleModules,
    enabledModules,
    
    // Funções
    getModulesForCurrentUser,
    isModuleVisible,
    toggleModuleStatus,
    enableAllModules,
    disableAllModules,
    
    // Mutations
    updateModuleStatus: updateModuleStatusMutation.mutate,
    updateMultipleModules: updateMultipleModulesMutation.mutate,
    updateModuleOrder: updateModuleOrderMutation.mutate,
    createModule: createModuleMutation.mutate,
    updateModule: updateModuleMutation.mutate,
    deleteModule: deleteModuleMutation.mutate,
    
    // Estados das mutations
    isUpdatingStatus: updateModuleStatusMutation.isPending,
    isUpdatingMultiple: updateMultipleModulesMutation.isPending,
    isUpdatingOrder: updateModuleOrderMutation.isPending,
    isCreating: createModuleMutation.isPending,
    isUpdating: updateModuleMutation.isPending,
    isDeleting: deleteModuleMutation.isPending,
  };
};

export default useModules;