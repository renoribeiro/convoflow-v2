/**
 * Selos de responsável acima das pílulas — o sinal, fora do modal, de que a
 * lista está recortada por responsável. Irmão de TagFilterChips.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const OPTIONS = [
  { id: 'p-maria', label: 'Maria Souza', first_name: 'Maria', last_name: 'Souza', avatar_url: null },
  {
    id: 'p-carla',
    label: 'Carla Reis (suspenso)',
    first_name: 'Carla',
    last_name: 'Reis',
    avatar_url: null,
    reason: 'suspended',
  },
];

vi.mock('@/hooks/useOwnerFilterOptions', () => ({
  useOwnerFilterOptions: () => ({
    canFilter: true,
    isLoading: false,
    options: OPTIONS,
    optionFor: (id: string) => OPTIONS.find((o) => o.id === id),
  }),
}));

import { OwnerFilterChips } from './OwnerFilterChips';

describe('OwnerFilterChips', () => {
  it('sem responsável marcado não renderiza nada', () => {
    const { container } = render(<OwnerFilterChips assignedProfileIds={[]} onRemove={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('mostra o nome de cada pessoa marcada, com o motivo de quem saiu do time', () => {
    render(<OwnerFilterChips assignedProfileIds={['p-maria', 'p-carla']} onRemove={() => {}} />);
    expect(screen.getByTestId('owner-filter-chips')).toBeInTheDocument();
    expect(screen.getByText('Maria Souza')).toBeInTheDocument();
    expect(screen.getByText('Carla Reis (suspenso)')).toBeInTheDocument();
  });

  it('o "x" de um selo tira só aquela pessoa', () => {
    const onRemove = vi.fn();
    render(<OwnerFilterChips assignedProfileIds={['p-maria', 'p-carla']} onRemove={onRemove} />);
    fireEvent.click(screen.getByLabelText('Tirar Maria Souza do filtro'));
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith('p-maria');
  });

  it('id que não está nas opções (outra Loja) não vira selo sem nome', () => {
    const { container } = render(<OwnerFilterChips assignedProfileIds={['p-de-outra-loja']} onRemove={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
