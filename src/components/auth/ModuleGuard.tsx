import React from 'react';
import { Navigate } from 'react-router-dom';
import { useModules } from '@/hooks/useModules';
import { useIsSuperAdmin } from '@/contexts/TenantContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';

interface ModuleGuardProps {
  children: React.ReactNode;
  moduleName: string;
  fallbackPath?: string;
}

export const ModuleGuard = ({
  children,
  moduleName,
  fallbackPath = '/'
}: ModuleGuardProps) => {
  const { visibleModules, isLoading } = useModules();
  const isSuperAdmin = useIsSuperAdmin();

  // Super admins sempre têm acesso a todos os módulos
  if (isSuperAdmin) {
    return <>{children}</>;
  }

  // Mostrar loading enquanto carrega os módulos
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Verificar se o módulo está habilitado para o usuário (System Settings).
  // Este é o toggle de produto controlado pelo admin (ModuleSettings), não
  // uma restrição de plano/assinatura — todas as verificações de plano foram
  // removidas, liberando os módulos para todos os usuários autenticados.
  const moduleEnabled = visibleModules?.some(
    module => module.module_name === moduleName && module.is_enabled
  );

  if (!moduleEnabled) {
    // Opção 1: Redirecionar para uma página específica
    if (fallbackPath !== null) {
      return <Navigate to={fallbackPath} replace />;
    }

    // Opção 2: Mostrar mensagem de acesso negado
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Alert className="max-w-md">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Você não tem acesso a este módulo. Entre em contato com o administrador se precisar de acesso.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return <>{children}</>;
};

// Hook para verificar se um módulo específico está habilitado e acessível.
// Sem verificação de plano: o acesso depende apenas do módulo estar habilitado
// (toggle de produto) e do usuário estar autenticado.
export const useModuleAccess = (moduleName: string) => {
  const { visibleModules, isLoading } = useModules();
  const isSuperAdmin = useIsSuperAdmin();

  // Super admins sempre têm acesso
  if (isSuperAdmin) {
    return { hasAccess: true, isLoading };
  }

  const moduleEnabled = visibleModules?.some(
    module => module.module_name === moduleName && module.is_enabled
  ) ?? false;

  return { hasAccess: moduleEnabled, isLoading };
};
