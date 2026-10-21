/**
 * Menu lateral: "Comparar Lojas" é só do Gerente (a rota é RoleGuard
 * role="gerente"); até 2026-10-21 o Gestor via o item e voltava ao Dashboard
 * ao clicar. E o item Ajuda carrega a marca do tour da boas-vindas.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';

let papel = 'gestor';
vi.mock('@/contexts/TenantContext', () => ({
  useRole: () => papel,
  useIsSuperAdmin: () => papel === 'superadmin',
}));
vi.mock('@/hooks/useModules', () => ({
  useModules: () => ({ visibleModules: [], isLoading: true }),
}));

import { Sidebar } from './Sidebar';

function montar() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
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

  it('o item Ajuda tem a marca do tour', () => {
    papel = 'atendente';
    montar();
    expect(screen.getByRole('link', { name: 'Ajuda' })).toHaveAttribute('data-tour', 'menu-ajuda');
  });
});
