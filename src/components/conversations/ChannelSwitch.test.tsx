import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChannelSwitch, awaitingBadgeLabel } from './ChannelSwitch';

describe('ChannelSwitch — a chave WhatsApp / Instagram', () => {
  it('os dois lados, com o logo de cada um; o aberto fica marcado', () => {
    const { container } = render(<ChannelSwitch value="whatsapp" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /WhatsApp/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Instagram/ })).toHaveAttribute('aria-pressed', 'false');
    expect(container.querySelector('[data-channel-logo="whatsapp"]')).not.toBeNull();
    expect(container.querySelector('[data-channel-logo="instagram"]')).not.toBeNull();
  });

  it('o selo aparece SÓ no lado que não está aberto, com o número exato', () => {
    render(<ChannelSwitch value="whatsapp" onChange={() => {}} awaitingInOther={3} />);
    expect(screen.getByTestId('awaiting-badge-instagram')).toHaveTextContent('3');
    expect(screen.queryByTestId('awaiting-badge-whatsapp')).toBeNull();
    expect(screen.getByLabelText('3 conversas aguardando resposta no Instagram')).toBeInTheDocument();
  });

  it('do lado do Instagram, o selo vai no WhatsApp', () => {
    render(<ChannelSwitch value="instagram" onChange={() => {}} awaitingInOther={12} />);
    expect(screen.getByTestId('awaiting-badge-whatsapp')).toHaveTextContent('12');
    expect(screen.queryByTestId('awaiting-badge-instagram')).toBeNull();
  });

  it('zero ou ainda sem número: nada de selo', () => {
    const { rerender } = render(<ChannelSwitch value="whatsapp" onChange={() => {}} awaitingInOther={0} />);
    expect(screen.queryByTestId('awaiting-badge-instagram')).toBeNull();
    rerender(<ChannelSwitch value="whatsapp" onChange={() => {}} />);
    expect(screen.queryByTestId('awaiting-badge-instagram')).toBeNull();
  });

  it('clicar no outro lado troca; clicar no lado aberto não faz nada', () => {
    const onChange = vi.fn();
    render(<ChannelSwitch value="whatsapp" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /WhatsApp/ }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Instagram/ }));
    expect(onChange).toHaveBeenCalledWith('instagram');
  });

  it('singular e plural', () => {
    expect(awaitingBadgeLabel(1, 'whatsapp')).toBe('1 conversa aguardando resposta no WhatsApp');
    expect(awaitingBadgeLabel(2, 'instagram')).toBe('2 conversas aguardando resposta no Instagram');
  });
});
