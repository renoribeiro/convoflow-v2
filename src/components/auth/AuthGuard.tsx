
import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { AccountStatusScreen } from './AccountStatusScreen';

interface AuthGuardProps {
  children: React.ReactNode;
}

const Spinner = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
  </div>
);

/**
 * Sessão + estado da conta.
 *
 * `profiles.status` é a fonte da verdade (migração 20260813000004):
 *   active     → passa
 *   pending    → convite não concluído: bloqueia o dashboard e explica o que
 *                fazer. O aceite do convite acontece em /auth, que é rota
 *                pública e não passa por aqui — então isto não trava ninguém
 *                no meio do cadastro.
 *   suspended  → desloga na hora e volta para o login com o aviso.
 *   deleted    → idem (lápide do soft delete).
 *
 * Perfil ausente (usuário no auth.users sem linha em profiles) NÃO é bloqueado
 * aqui de propósito: são contas órfãs antigas, sem Conta e sem role, que o RLS
 * já deixa sem enxergar nada. Bloquear na tela não acrescentaria segurança e
 * mudaria o comportamento de quem hoje só vê tela vazia. Quem garante o
 * fechamento é o servidor, não este componente.
 */
export const AuthGuard = ({ children }: AuthGuardProps) => {
  const { session, isLoading, logout } = useAuth();
  const { profile, loading: tenantLoading } = useTenant();

  const status = (profile as { status?: string } | null)?.status ?? null;
  const mustSignOut = status === 'suspended' || status === 'deleted';

  // Suspenso/excluído não fica com sessão aberta: derruba e manda para o login.
  useEffect(() => {
    if (!mustSignOut) return;
    toast.error(
      status === 'deleted'
        ? 'Esta conta foi excluída.'
        : 'Sua conta foi suspensa. Entre em contato com o administrador.',
    );
    void logout();
  }, [mustSignOut, status, logout]);

  // Espera auth E perfil antes de decidir — sem isso o redirect dispara antes
  // de saber o status e o usuário pisca entre login e dashboard.
  if (isLoading || (session && tenantLoading)) {
    return <Spinner />;
  }

  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  if (mustSignOut) {
    // O logout do efeito acima limpa a sessão e este componente volta pelo
    // ramo `!session`. Enquanto isso, nada do dashboard é montado.
    return <Spinner />;
  }

  if (status === 'pending') {
    return <AccountStatusScreen status="pending" />;
  }

  return <>{children}</>;
};
