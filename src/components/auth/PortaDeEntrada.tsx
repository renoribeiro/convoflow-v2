import { ReactNode, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useRole, useTenant } from '@/contexts/TenantContext';
import { useMaintenanceMode } from '@/hooks/useMaintenanceMode';
import { useTenantAccess } from '@/hooks/useTenantAccess';
import { useModules } from '@/hooks/useModules';
import { decidirEntrada, LIMITE_DE_ESPERA_DA_MANUTENCAO_MS } from '@/lib/access/entrada';
import { AccountStatusScreen } from './AccountStatusScreen';
import { PaywallScreen } from './PaywallScreen';
import { MaintenanceScreen } from '@/components/maintenance/MaintenanceScreen';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * O esqueleto da entrada: o desenho do painel (menu, topo e cartões) enquanto
 * a sessão, o perfil, a manutenção, o acesso e os módulos respondem. Um só,
 * no lugar dos carregandos que vinham um depois do outro.
 */
export const EsqueletoDaEntrada = () => (
  <div className="min-h-screen bg-muted/30" data-testid="carregando-entrada" role="status" aria-label="Carregando o ConvoFlow">
    <div className="fixed left-0 top-0 hidden h-screen w-16 flex-col gap-3 border-r bg-card p-3 md:flex lg:w-60">
      <Skeleton className="h-8 w-full rounded" />
      {Array.from({ length: 7 }).map((_, i) => (
        <Skeleton key={i} className="h-6 w-full rounded" />
      ))}
    </div>
    <div className="flex min-h-screen flex-col md:ml-16 lg:ml-60">
      <div className="flex h-14 items-center gap-3 border-b bg-card px-4">
        <Skeleton className="h-8 w-8 rounded md:hidden" />
        <Skeleton className="h-8 w-40 rounded" />
        <Skeleton className="ml-auto h-8 w-8 rounded-full" />
      </div>
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-48 rounded" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-md" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-md" />
      </div>
    </div>
  </div>
);

/**
 * A porta do painel (lote 6f, B14). Substitui o AuthGuard, o MaintenanceGuard
 * e o carregando do acesso que ficava no DashboardLayout.
 *
 * O que mudou foi a espera, não a regra: a manutenção pergunta assim que a
 * sessão é lida (junto com o perfil), o acesso pergunta assim que o perfil
 * chega (junto com a Loja), e os módulos saem junto com o perfil. A decisão é
 * de `decidirEntrada` (src/lib/access/entrada.ts), que tem as regras escritas
 * e os testes de cada caso.
 *
 * Trocar de Loja não passa por aqui de novo: o TenantContext troca a Loja sem
 * voltar ao carregando, e só a tela do meio é montada de novo.
 */
export const PortaDeEntrada = ({ children }: { children: ReactNode }) => {
  const { session, isLoading: sessaoCarregando, logout } = useAuth();
  const { profile, loading: perfilCarregando } = useTenant();
  const papel = useRole();
  const manutencao = useMaintenanceMode({ enabled: !sessaoCarregando && !!session });
  const acesso = useTenantAccess();
  const { isLoading: modulosCarregando } = useModules();

  // O relógio da falha aberta da manutenção corre desde que a pergunta sai.
  const [esperaExpirou, setEsperaExpirou] = useState(false);
  const perguntando = !sessaoCarregando && !!session;
  useEffect(() => {
    if (!perguntando) return;
    const id = setTimeout(() => setEsperaExpirou(true), LIMITE_DE_ESPERA_DA_MANUTENCAO_MS);
    return () => clearTimeout(id);
  }, [perguntando]);

  const statusDoPerfil = (profile as { status?: string } | null)?.status ?? null;

  const decisao = decidirEntrada({
    sessaoCarregando,
    temSessao: !!session,
    perfilCarregando: !!session && perfilCarregando,
    statusDoPerfil,
    papel,
    manutencao: { carregando: manutencao.loading, esperaExpirou, ligada: manutencao.active },
    acesso: { carregando: acesso.loading, bloqueado: acesso.locked },
    modulosCarregando,
  });

  // Suspenso ou excluído não fica com sessão aberta: derruba e manda ao login.
  const deveSair = decisao === 'sair';
  useEffect(() => {
    if (!deveSair) return;
    toast.error(
      statusDoPerfil === 'deleted'
        ? 'Esta conta foi excluída.'
        : 'Sua conta foi suspensa. Entre em contato com o administrador.',
    );
    void logout();
  }, [deveSair, statusDoPerfil, logout]);

  switch (decisao) {
    case 'login':
      return <Navigate to="/auth" replace />;
    case 'carregando':
    case 'sair':
      // No 'sair', o logout do efeito limpa a sessão e a porta volta pelo
      // 'login'. Enquanto isso, nada do painel é montado.
      return <EsqueletoDaEntrada />;
    case 'pendente':
      return <AccountStatusScreen status="pending" />;
    case 'manutencao':
      return (
        <MaintenanceScreen
          reason={manutencao.reason}
          startsAt={manutencao.startsAt}
          endsAt={manutencao.endsAt}
          onRecheck={manutencao.refetch}
        />
      );
    case 'bloqueio':
      return <PaywallScreen />;
    default:
      return <>{children}</>;
  }
};
