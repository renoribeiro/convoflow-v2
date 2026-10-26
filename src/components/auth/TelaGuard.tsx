import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { Skeleton } from '@/components/ui/skeleton';
import { useAcessoTelas } from '@/hooks/useAcessoTelas';
import { SemAcesso } from '@/components/auth/SemAcesso';
import { tela } from '@/lib/access/telas';

interface TelaGuardProps {
  /** Chave da tela em src/lib/access/telas.ts (ex.: 'campaigns', 'admin/users'). */
  chave: string;
  children: React.ReactNode;
}

/**
 * A guarda de toda rota do painel. Lê a regra do registro de telas
 * (src/lib/access/telas.ts): o módulo tem de estar ligado e o cargo tem de ter
 * a capacidade que a tela exige. Substituiu o ModuleGuard e o RoleGuard em
 * 2026-10-26 (lote 2 do checkup), que decidiam cada um por uma regra.
 *
 * Isto é interface. Quem protege o dado é o servidor (RLS e edge functions),
 * que segue a mesma matriz de capacidades.
 */
export const TelaGuard = ({ chave, children }: TelaGuardProps) => {
  const { isLoading: authLoading } = useAuth();
  const { loading: tenantLoading, profile } = useTenant();
  const { ctx, acesso, carregandoModulos } = useAcessoTelas();

  // Tela aberta a qualquer sessão (Dashboard, Ajuda, Perfil...): nada a esperar.
  const regra = tela(chave);
  if (!regra.modulo && !regra.capacidade) return <>{children}</>;

  // Espera perfil e módulos antes de decidir: decidir cedo mostrava "sem
  // acesso" piscando para quem tem acesso.
  if (authLoading || tenantLoading || profile === null || (carregandoModulos && ctx.papel !== 'superadmin')) {
    return (
      <div className="space-y-6 p-6" data-testid="tela-guard-carregando">
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

  const resultado = acesso(chave);
  if (resultado !== 'liberado') return <SemAcesso papel={ctx.papel} motivo={resultado} />;
  return <>{children}</>;
};
