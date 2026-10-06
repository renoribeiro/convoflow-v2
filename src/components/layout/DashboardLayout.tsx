import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';
import { cn } from '@/lib/utils';
import PageErrorBoundary from '@/components/ErrorBoundaries/PageErrorBoundary';
import { useTenantAccess } from '@/hooks/useTenantAccess';
import { PaywallScreen } from '@/components/auth/PaywallScreen';
import { LojaOnlyNotice } from '@/components/auth/LojaOnlyNotice';
import { useRole } from '@/contexts/TenantContext';
import { MaintenanceBanner } from '@/components/maintenance/MaintenanceBanner';

// Telas operacionais (dados de cliente) que o superadmin NÃO acessa — ele só
// vê estatísticas (Dashboard/Rastreamento/Relatórios) e gerencia (Administração).
const LOJA_ONLY_SEGMENTS = [
  'conversations',
  'contacts',
  'funnel',
  'chatbots',
  'campaigns',
  'followups',
  'automation',
  'whatsapp-numbers',
];

export const DashboardLayout = () => {
  // Barra fixa expandida/recolhida (desktop). No mobile quem manda é o drawer.
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();
  const role = useRole();
  const pageName = (location.pathname.split('/').filter(Boolean).pop() || 'página')
    .replace(/-/g, ' ');

  // Bloqueio "Exclusivo para lojas" para o superadmin nas telas operacionais.
  const firstSegment = location.pathname.replace(/^\/dashboard\/?/, '').split('/')[0] ?? '';
  const blockedForSuperadmin = role === 'superadmin' && LOJA_ONLY_SEGMENTS.includes(firstSegment);

  // Paywall: Conta sem acesso liberado (pago/manual) vê só a tela de bloqueio.
  // Só o superadmin tem bypass (ver useTenantAccess) — o gerente perdeu o dele
  // em 2026-08-19 e agora também é barrado quando a Conta dele não está paga.
  //
  // O bloqueio continua sendo total AQUI, para todo mundo: nenhuma rota do
  // dashboard passa. O que muda por cargo é o CONTEÚDO da PaywallScreen — o
  // gerente recebe dentro dela o caminho de pagamento (checkout do Stripe), e
  // por isso não existe lista de rotas liberadas neste arquivo. A justificativa
  // dessa escolha está no cabeçalho da PaywallScreen.
  const { loading: accessLoading, locked } = useTenantAccess();

  // Navegou? O drawer do mobile fecha sozinho.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  if (accessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (locked) {
    return <PaywallScreen />;
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />

      {/* Mobile: sem barra lateral (drawer sobreposto) → conteúdo ocupa 100%.
          Tablet: barra em modo ícone (64px). Desktop: 240px ou 56px. */}
      <div
        className={cn(
          'flex flex-col min-h-screen min-w-0 transition-[margin] duration-300 md:ml-16',
          sidebarOpen ? 'lg:ml-60' : 'lg:ml-14',
        )}
      >
        {/* So o superadmin ve. Fica ACIMA do Navbar e e sticky: e o unico
            aviso de que a manutencao esta ligada para quem esta usando o
            sistema normalmente durante ela. Ver MaintenanceBanner.tsx. */}
        <MaintenanceBanner />

        <Navbar onMenuClick={() => setMobileNavOpen(true)} />

        <main className="flex-1 min-w-0 p-6">
          <PageErrorBoundary key={location.pathname} pageName={pageName}>
            {blockedForSuperadmin ? <LojaOnlyNotice /> : <Outlet />}
          </PageErrorBoundary>
        </main>
      </div>
    </div>
  );
};
