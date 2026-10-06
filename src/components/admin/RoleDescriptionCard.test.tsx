import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoleDescriptionCard } from './RoleDescriptionCard';
import { ROLE_DESCRIPTIONS } from '@/lib/roleDescriptions';
import type { UserRole } from '@/types/userHierarchy';

const ROLES = Object.keys(ROLE_DESCRIPTIONS) as UserRole[];
/** A linha "+N outras" que aparece quando uma lista é cortada. */
const OVERFLOW = /^\+\d+ outras?$/;

describe('RoleDescriptionCard', () => {
  it('gestor mostra a lista inteira, sem cortar', () => {
    render(<RoleDescriptionCard role="gestor" />);
    expect(
      screen.getByText('Administra uma loja e a equipe de atendimento dela.'),
    ).toBeTruthy();
    expect(screen.getByText('Pode')).toBeTruthy();
    expect(screen.getByText('Não pode')).toBeTruthy();
    // Os 5 itens de `can`, incluindo o último — com MAX_VISIBLE_ITEMS = 5
    // nenhum deles cai fora.
    expect(screen.getByText('Criar até 5 atendentes na loja')).toBeTruthy();
    expect(screen.getByText('Configurar o WhatsApp da loja')).toBeTruthy();
    expect(screen.queryByText(OVERFLOW)).toBeNull();
  });

  it('gestor com hideStoreCaps omite a linha do limite por loja', () => {
    render(<RoleDescriptionCard role="gestor" hideStoreCaps />);
    expect(screen.queryByText('Criar até 5 atendentes na loja')).toBeNull();
    // O resto da lista continua lá.
    expect(screen.getByText('Configurar o WhatsApp da loja')).toBeTruthy();
    expect(screen.queryByText(OVERFLOW)).toBeNull();
  });

  it('atendente mostra os 5 itens de "Não pode"', () => {
    render(<RoleDescriptionCard role="atendente" />);
    expect(screen.getByText('Criar usuários')).toBeTruthy();
    expect(screen.getByText('Ver faturamento')).toBeTruthy();
    expect(screen.queryByText(OVERFLOW)).toBeNull();
  });

  it('superadmin não renderiza a lista "Não pode"', () => {
    render(<RoleDescriptionCard role="superadmin" />);
    expect(screen.getByText('Pode')).toBeTruthy();
    expect(screen.queryByText('Não pode')).toBeNull();
  });

  it('função nula e cargo legado não renderizam nada', () => {
    const { container: a } = render(<RoleDescriptionCard role={null} />);
    expect(a.innerHTML).toBe('');
    const { container: b } = render(<RoleDescriptionCard role={'user' as never} />);
    expect(b.innerHTML).toBe('');
  });

  /**
   * O corte em MAX_VISIBLE_ITEMS virou rede de segurança: hoje nenhuma lista o
   * alcança. Este teste avisa no dia em que alguém acrescentar um sexto item e,
   * sem perceber, esconder informação atrás de um "+1 outra".
   */
  it.each(ROLES)('%s cabe inteiro no cartão, sem "+N outras"', (role) => {
    render(<RoleDescriptionCard role={role} />);
    expect(screen.queryByText(OVERFLOW)).toBeNull();
  });
});
