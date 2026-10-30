import { useEffect, useRef, useState } from 'react';
import { TELAS_SO_DE_LOJA, telaDoCaminho } from '@/lib/access/telas';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';
import { cn } from '@/lib/utils';
import PageErrorBoundary from '@/components/ErrorBoundaries/PageErrorBoundary';
import { LojaOnlyNotice } from '@/components/auth/LojaOnlyNotice';
import { useRole, useTenant } from '@/contexts/TenantContext';
import { MaintenanceBanner } from '@/components/maintenance/MaintenanceBanner';
import { TourHost } from '@/components/onboarding/TourHost';

export const DashboardLayout = () => {
  // Barra fixa expandida/recolhida (desktop). No mobile quem manda é o drawer.
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();
  const role = useRole();
  // O nome em português da tela (o mesmo do menu), nunca o pedaço do endereço.
  const pageName = telaDoCaminho(location.pathname)?.nome ?? 'esta tela';

  // Bloqueio "Exclusivo para lojas" para o superadmin nas telas operacionais.
  const firstSegment = location.pathname.replace(/^\/dashboard\/?/, '').split('/')[0] ?? '';
  const blockedForSuperadmin = role === 'superadmin' && TELAS_SO_DE_LOJA.includes(firstSegment);

  // Paywall, manutenção, sessão e cadastro pendente são decididos antes, na
  // PortaDeEntrada (App.tsx), com um esqueleto só (lote 6f, B14). Quem chega
  // aqui já pode usar o painel.
  const { tenantId, trocandoLoja } = useTenant();

  // Navegou? O drawer do mobile fecha sozinho.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  // Altura do topo (faixa de manutenção + Navbar) em --altura-topo: é o que
  // as telas de layout fixo descontam da janela (.altura-da-tela, index.css).
  // Mede onde o <main> começa dentro da coluna, sem embrulhar a faixa: ela é
  // sticky e deixaria de ser dentro de um embrulho.
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const main = mainRef.current;
    const coluna = main?.parentElement;
    if (!main || !coluna) return;
    const raiz = document.documentElement;
    const medir = () => {
      const topo = main.getBoundingClientRect().top - coluna.getBoundingClientRect().top;
      raiz.style.setProperty('--altura-topo', `${Math.max(0, Math.round(topo))}px`);
    };
    medir();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null;
    // A coluna cresce quando a faixa aparece; os filhos, quando mudam de altura.
    ro?.observe(coluna);
    for (const filho of Array.from(coluna.children)) if (filho !== main) ro?.observe(filho);
    return () => {
      ro?.disconnect();
      raiz.style.removeProperty('--altura-topo');
    };
  }, []);

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

        {/* Troca de Loja no ar: a tela atual fica até a nova chegar. */}
        {trocandoLoja ? (
          <div className="h-0.5 w-full animate-pulse bg-primary" role="status" aria-label="Abrindo a Loja" />
        ) : null}

        <main ref={mainRef} className="flex-1 min-w-0 p-6">
          {/* A chave leva a Loja: trocar de Loja monta de novo só a tela do
              meio (com os dados e a seleção da Loja nova); menu e topo ficam. */}
          <PageErrorBoundary key={`${location.pathname}|${tenantId ?? ''}`} pageName={pageName}>
            {blockedForSuperadmin ? <LojaOnlyNotice /> : <Outlet />}
          </PageErrorBoundary>
        </main>
      </div>

      {/* Tours do onboarding. Aqui, depois do bloqueio de pagamento: com a
          Conta bloqueada a PortaDeEntrada já entregou a PaywallScreen. */}
      <TourHost />
    </div>
  );
};
