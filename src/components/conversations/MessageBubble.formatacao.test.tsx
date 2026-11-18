/**
 * A bolha mostra a formatação do WhatsApp (recebida e enviada), a legenda da
 * mídia também, a citação vem limpa, e no Instagram os sinais ficam como vieram.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { MessageBubble, citacaoLimpa, type RenderableMessage } from './MessageBubble';

const msg = (extra: Partial<RenderableMessage>): RenderableMessage => ({
  id: 'aaaaaaaa-0000-4000-8000-0000000000c1',
  content: 'Sua *Consulta* está marcada para _amanhã_',
  created_at: '2026-11-17T12:00:00Z',
  direction: 'inbound',
  status: 'delivered',
  message_type: 'text',
  ...extra,
});

const mostrar = (m: RenderableMessage, formatarTexto?: boolean) =>
  render(
    <TooltipProvider>
      <MessageBubble message={m} formatarTexto={formatarTexto} />
    </TooltipProvider>,
  ).container;

describe('MessageBubble: formatação do WhatsApp', () => {
  it('mensagem recebida: negrito e itálico, sem os sinais', () => {
    const c = mostrar(msg({}));
    expect(c.querySelector('strong')?.textContent).toBe('Consulta');
    expect(c.querySelector('em')?.textContent).toBe('amanhã');
    expect(c.textContent).not.toContain('*Consulta*');
  });

  it('mensagem enviada pelo atendente: a bolha já mostra formatada', () => {
    const c = mostrar(msg({ direction: 'outbound', status: 'sent', content: '~R$ 200~ por ```R$ 150```' }));
    expect(c.querySelector('s')?.textContent).toBe('R$ 200');
    expect(c.querySelector('[data-formatacao="mono"]')?.textContent).toBe('R$ 150');
  });

  it('legenda da foto também formata', () => {
    const c = mostrar(msg({ message_type: 'image', media_url: 'https://exemplo.com.br/f.jpg', content: '[Imagem] *Promoção*' }));
    expect(c.querySelector('strong')?.textContent).toBe('Promoção');
  });

  it('Instagram: os sinais ficam como o cliente escreveu', () => {
    const c = mostrar(msg({}), false);
    expect(c.querySelector('strong')).toBeNull();
    expect(c.textContent).toContain('Sua *Consulta* está marcada para _amanhã_');
  });

  it('a citação da resposta vem limpa', () => {
    const c = mostrar(msg({ quoted: { id: 'q1', content: '*Horário* confirmado', sender: 'Cliente' } }));
    expect(c.textContent).toContain('Horário confirmado');
    expect(c.textContent).not.toContain('*Horário*');
  });

  it('link na mensagem continua clicável', () => {
    const c = mostrar(msg({ content: '*Agende* em https://exemplo.com.br/agenda' }));
    expect(c.querySelector('a')?.getAttribute('href')).toBe('https://exemplo.com.br/agenda');
    expect(c.querySelector('strong')?.textContent).toBe('Agende');
  });

  it('tentativa de HTML fica texto', () => {
    const c = mostrar(msg({ content: '*<img src=x onerror=alert(1)>*' }));
    expect(c.querySelector('img')).toBeNull();
    expect(c.querySelector('strong')?.textContent).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('citacaoLimpa', () => {
  it('tira o rótulo da mídia e os sinais', () => {
    expect(citacaoLimpa('[Imagem] *olha*')).toBe('Foto: olha');
  });
  it('Instagram: só o rótulo sai', () => {
    expect(citacaoLimpa('*olha*', false)).toBe('*olha*');
  });
});
