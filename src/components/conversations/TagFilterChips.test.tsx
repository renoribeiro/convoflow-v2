/**
 * Selos de etiqueta acima das pílulas — o sinal, fora do modal, de que a lista
 * está recortada por etiqueta.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/hooks/useTags', () => ({
  useTags: () => ({
    tags: [
      { id: 'tag-quente', name: 'Quente', color: '#ef4444' },
      { id: 'tag-frio', name: 'Frio', color: '#3b82f6' },
    ],
    isLoading: false,
  }),
}));

import { TagFilterChips } from './TagFilterChips';

describe('TagFilterChips', () => {
  it('sem etiqueta marcada não renderiza nada', () => {
    const { container } = render(<TagFilterChips tagIds={[]} onRemove={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('mostra o nome das etiquetas marcadas, com a cor da etiqueta', () => {
    render(<TagFilterChips tagIds={['tag-quente', 'tag-frio']} onRemove={() => {}} />);
    expect(screen.getByTestId('tag-filter-chips')).toBeInTheDocument();
    expect(screen.getByText('Quente')).toBeInTheDocument();
    expect(screen.getByText('Frio')).toBeInTheDocument();
  });

  it('o "x" de um selo tira só aquela etiqueta', () => {
    const onRemove = vi.fn();
    render(<TagFilterChips tagIds={['tag-quente', 'tag-frio']} onRemove={onRemove} />);
    const selo = screen.getByText('Quente');
    const x = selo.querySelector('svg.cursor-pointer') as SVGElement;
    fireEvent.click(x);
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith('tag-quente');
  });

  it('etiqueta que não existe mais na Loja não vira selo sem nome', () => {
    const { container } = render(<TagFilterChips tagIds={['apagada']} onRemove={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
