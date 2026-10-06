import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant, useRole, useHasMinRole } from '@/contexts/TenantContext';
import { Skeleton } from '@/components/ui/skeleton';
import { UserRole } from '@/types/userHierarchy';

interface RoleGuardProps {
  children: React.ReactNode;
  role?: UserRole | UserRole[];
  minRole?: UserRole;
  fallbackPath?: string;
}

export const RoleGuard = ({
  children,
  role,
  minRole,
  fallbackPath = '/dashboard',
}: RoleGuardProps) => {
  const { isLoading: authLoading } = useAuth();
  const { loading: tenantLoading, profile } = useTenant();
  const userRole = useRole();
  const hasMinRole = useHasMinRole(minRole ?? 'gestor');

  // Aguardar AMBOS auth e tenant antes de decidir redirect.
  // Caso contrário o redirect dispara antes do profile carregar -> loop visual
  // entre landing page e dashboard.
  if (authLoading || tenantLoading || profile === null) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-48 rounded" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-md" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-md" />
      </div>
    );
  }

  const isSuperAdmin = userRole === 'superadmin';
  let hasAccess = isSuperAdmin;

  if (!hasAccess && minRole) {
    hasAccess = hasMinRole;
  }
  if (!hasAccess && role) {
    const allowed = Array.isArray(role) ? role : [role];
    hasAccess = userRole !== null && allowed.includes(userRole);
  }

  if (!hasAccess) {
    return <Navigate to={fallbackPath} replace />;
  }

  return <>{children}</>;
};
