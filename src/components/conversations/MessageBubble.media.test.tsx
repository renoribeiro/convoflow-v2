/**
 * MessageBubble com o bucket privado: a bolha só mostra o arquivo pelo link
 * temporário que o ChatWindow já entregou em media_url.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { MessageBubble, type RenderableMessage } from './MessageBubble';

const LOJA = 'aaaaaaaa-0000-4000-8000-000000000001';
const ASSINADO = `https://projeto-teste.supabase.co/storage/v1/object/sign/whatsapp-media/${LOJA}/inbound/wamid.FAKE1.jpg?token=FAKE`;

const msg = (extra: Partial<RenderableMessage>): RenderableMessage => ({
  id: 'aaaaaaaa-0000-4000-8000-0000000000a1',
  content: null,
  created_at: '2026-10-23T12:00:00Z',
  direction: 'inbound',
  status: 'delivered',
  message_type: 'image',
  ...extra,
});

const mostrar = (m: RenderableMessage) =>
  render(
    <TooltipProvider>
      <MessageBubble message={m} />
    </TooltipProvider>,
  );

describe('MessageBubble — mídia pelo link temporário', () => {
  it('enquanto o link não chega: aviso de carregando, nenhuma <img>', () => {
    mostrar(msg({ media_url: null, media_state: 'loading', message_type: 'audio' }));
    expect(screen.getByRole('status').textContent).toMatch(/Áudio · carregando/);
    expect(document.querySelector('audio')).toBeNull();
  });

  it('quando o link não veio: diz que não deu para abrir', () => {
    mostrar(msg({ media_url: null, media_state: 'unavailable', message_type: 'document' }));
    expect(screen.getByRole('status').textContent).toMatch(/Documento · não foi possível abrir o arquivo agora/);
  });

  it('com o link: mostra a imagem e o "Baixar" vem como anexo (&download=)', () => {
    mostrar(msg({ media_url: ASSINADO, media_state: 'ready' }));
    const img = screen.getByRole('img', { name: 'Imagem enviada' });
    expect(img.getAttribute('src')).toBe(ASSINADO);
    fireEvent.click(img.closest('button')!);
    expect(screen.getByRole('link', { name: /Baixar/ }).getAttribute('href')).toBe(`${ASSINADO}&download=`);
  });

  it('áudio OGG pelo link assinado continua sendo mensagem de voz', () => {
    mostrar(msg({ message_type: 'audio', media_url: ASSINADO.replace('.jpg', '.ogg'), media_state: 'ready' }));
    expect(screen.getByLabelText('Mensagem de voz')).toBeTruthy();
    expect(document.querySelector('audio')?.getAttribute('src')).toBe(ASSINADO.replace('.jpg', '.ogg'));
  });

  it('media_url de arquivo nosso dentro do conteúdo (JSON antigo) não abre direto', () => {
    const publica = `https://projeto-teste.supabase.co/storage/v1/object/public/whatsapp-media/${LOJA}/x.jpg`;
    mostrar(msg({ media_url: null, content: JSON.stringify({ media_url: publica }) }));
    expect(document.querySelector('img')).toBeNull();
  });

  it('link de fora dentro do conteúdo segue funcionando', () => {
    mostrar(msg({ media_url: null, content: JSON.stringify({ media_url: 'https://pps.whatsapp.net/v/foto.jpg' }) }));
    expect(document.querySelector('img')?.getAttribute('src')).toBe('https://pps.whatsapp.net/v/foto.jpg');
  });
});
