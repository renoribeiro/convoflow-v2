/**
 * Achado 37 (lote 6d): a mensagem que falhou diz o motivo embaixo da bolha,
 * em português, e oferece "Reenviar" quando a conversa deixa enviar.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { MessageBubble, type RenderableMessage } from './MessageBubble';
import type { Reenvio } from '@/lib/conversations/falhaDaMensagem';

const msg = (extra: Partial<RenderableMessage>): RenderableMessage => ({
  id: 'aaaaaaaa-0000-4000-8000-0000000000b1',
  content: 'Oi, tudo bem?',
  created_at: '2026-10-29T12:00:00Z',
  direction: 'outbound',
  status: 'failed',
  message_type: 'text',
  ...extra,
});

const mostrar = (m: RenderableMessage, reenvio?: Reenvio | null, onResend = vi.fn()) => {
  render(
    <TooltipProvider>
      <MessageBubble message={m} reenvio={reenvio} onResend={onResend} />
    </TooltipProvider>,
  );
  return onResend;
};

describe('MessageBubble: mensagem que falhou', () => {
  it('API Oficial: o motivo em português, nunca a frase da Meta em inglês', () => {
    mostrar(msg({ error_code: '131026', error_message: 'Message undeliverable' }), { pode: true });
    const bloco = screen.getByTestId('falha-da-mensagem');
    expect(bloco.textContent).toMatch(/A Meta não conseguiu entregar para este telefone/);
    expect(bloco.textContent).toMatch(/código 131026 da Meta/);
    expect(bloco.textContent).not.toMatch(/undeliverable/);
  });

  it('Evolution ou WAHA: a frase do servidor', () => {
    mostrar(msg({ error_code: 'provider_rejected', error_message: 'O WhatsApp não aceitou esta mensagem. Confira o número do contato e tente de novo.' }), { pode: true });
    expect(screen.getByTestId('falha-da-mensagem').textContent).toMatch(/O WhatsApp não aceitou esta mensagem/);
  });

  it('"Reenviar" chama o reenvio com a mensagem', () => {
    const onResend = mostrar(msg({ error_code: 'provider_error' }), { pode: true });
    fireEvent.click(screen.getByRole('button', { name: 'Reenviar' }));
    expect(onResend).toHaveBeenCalledWith(expect.objectContaining({ id: 'aaaaaaaa-0000-4000-8000-0000000000b1' }));
  });

  it('fora da janela de 24 horas: sem botão, com o motivo', () => {
    mostrar(msg({ error_code: '131047' }), { pode: false, motivo: 'Mais de 24 horas sem mensagem do cliente.' });
    expect(screen.queryByRole('button', { name: 'Reenviar' })).toBeNull();
    expect(screen.getByTestId('falha-da-mensagem').textContent).toMatch(/Mais de 24 horas sem mensagem do cliente/);
  });

  it('mensagem que saiu: nada embaixo da bolha', () => {
    mostrar(msg({ status: 'delivered' }), null);
    expect(screen.queryByTestId('falha-da-mensagem')).toBeNull();
  });
});
