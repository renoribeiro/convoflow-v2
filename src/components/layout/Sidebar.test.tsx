/**
 * Menu lateral: "Comparar Lojas" é só do Gerente (a rota é RoleGuard
 * role="gerente"); até 2026-10-21 o Gestor via o item e voltava ao Dashboard
 * ao clicar. E o item Ajuda carrega a marca do tour da boas-vindas. E o
 * grupo Admin do superadmin leva às três telas dele (lote 6f, achado 133).
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';

let papel = 'gestor';
vi.mock('@/contexts/TenantContext', async () => {
  const { resolveCapabilities } = await import('@/types/userHierarchy');
  return {
    useRole: () => papel,
    useIsSuperAdmin: () => papel === 'superadmin',
    useCapabilities: () => resolveCapabilities(papel as never),
  };
});
vi.mock('@/hooks/useModules', () => ({
  useModules: () => ({ visibleModules: [], isLoading: true, isModuleVisible: () => true }),
}));

import { Sidebar } from './Sidebar';

function montar(onde = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[onde]}>
      <TooltipProvider>
        <Sidebar isOpen onToggle={() => {}} mobileOpen={false} onMobileClose={() => {}} />
      </TooltipProvider>
    </MemoryRouter>,
  );
}

describe('menu lateral', () => {
  it('Gerente vê Equipe e Comparar Lojas', () => {
    papel = 'gerente';
    montar();
    expect(screen.getByRole('link', { name: 'Equipe' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Comparar Lojas' })).toBeInTheDocument();
  });

  it('Gestor vê Equipe, mas não Comparar Lojas', () => {
    papel = 'gestor';
    montar();
    expect(screen.getByRole('link', { name: 'Equipe' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Comparar Lojas' })).toBeNull();
  });

  it('Atendente não vê o grupo Equipe', () => {
    papel = 'atendente';
    montar();
    expect(screen.queryByRole('link', { name: 'Equipe' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Comparar Lojas' })).toBeNull();
  });

  // Achado 133: Gestão de Usuários e Limites de uso só abriam pela busca.
  it('Superadmin vê Administração, Gestão de Usuários e Limites de uso no grupo Admin', () => {
    papel = 'superadmin';
    montar();
    expect(screen.getByRole('link', { name: 'Administração' })).toHaveAttribute('href', '/dashboard/admin');
    expect(screen.getByRole('link', { name: 'Gestão de Usuários' })).toHaveAttribute('href', '/dashboard/admin/users');
    expect(screen.getByRole('link', { name: 'Limites de uso' })).toHaveAttribute('href', '/dashboard/admin/usage-limits');
  });

  it('em Gestão de Usuários, só ela fica acesa (Administração não)', () => {
    papel = 'superadmin';
    montar('/dashboard/admin/users');
    expect(screen.getByRole('link', { name: 'Gestão de Usuários' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Administração' })).not.toHaveAttribute('aria-current');
  });

  it('Gerente não vê o grupo Admin', () => {
    papel = 'gerente';
    montar();
    expect(screen.queryByRole('link', { name: 'Gestão de Usuários' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Limites de uso' })).toBeNull();
  });

  it('o item Ajuda tem a marca do tour', () => {
    papel = 'atendente';
    montar();
    expect(screen.getByRole('link', { name: 'Ajuda' })).toHaveAttribute('data-tour', 'menu-ajuda');
  });
});
