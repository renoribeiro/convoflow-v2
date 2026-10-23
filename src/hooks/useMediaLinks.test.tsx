/**
 * useMediaLinks — a bolha das Conversas pega o link temporário do arquivo.
 *
 * Trava: um pedido só para as mensagens da tela; nada de pedido para link de
 * fora; o link fica guardado por mensagem (rolar/voltar não pede de novo); e o
 * que a bolha recebe enquanto espera, quando não vem link, e com a URL pública
 * antiga gravada.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const ORIGEM = 'https://projeto-teste.supabase.co';
const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('@/lib/env', () => ({ env: { get: (k: string) => (k === 'SUPABASE_URL' ? 'https://projeto-teste.supabase.co' : undefined) } }));

import { useMediaLinks, __resetMediaLinkQueue, MEDIA_LINK_CACHE_MS } from './useMediaLinks';

const LOJA = 'aaaaaaaa-0000-4000-8000-000000000001';
const id = (n: number) => `aaaaaaaa-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const assinado = (mid: string) => `${ORIGEM}/storage/v1/object/sign/whatsapp-media/${LOJA}/${mid}.jpg?token=FAKE`;
const publica = (caminho: string) => `${ORIGEM}/storage/v1/object/public/whatsapp-media/${caminho}`;

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  __resetMediaLinkQueue();
  invoke.mockReset();
  invoke.mockImplementation(async (_nome: string, { body }: { body: { message_ids: string[] } }) => ({
    data: { links: Object.fromEntries(body.message_ids.map((m) => [m, assinado(m)])), expires_in: 3600 },
    error: null,
  }));
});

describe('useMediaLinks', () => {
  it('pede os links das mensagens da tela numa chamada só e entrega o assinado', async () => {
    const msgs = [
      { id: id(1), media_url: `${LOJA}/inbound/wamid.FAKE1.ogg` },
      { id: id(2), media_url: publica(`${LOJA}/inbound/wamid.FAKE2.jpg`) },
      { id: id(3), media_url: 'https://pps.whatsapp.net/v/foto.jpg' },
      { id: id(4), media_url: null },
    ];
    const { result } = renderHook(() => useMediaLinks(msgs), { wrapper: wrapper() });

    expect(result.current(id(1), msgs[0]!.media_url)).toEqual({ url: null, state: 'loading' });
    expect(result.current(id(3), msgs[2]!.media_url)).toEqual({ url: 'https://pps.whatsapp.net/v/foto.jpg', state: 'ready' });
    expect(result.current(id(4), null)).toEqual({ url: null, state: 'ready' });

    await waitFor(() => expect(result.current(id(1), msgs[0]!.media_url).state).toBe('ready'));
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('media-links', { body: { message_ids: [id(1), id(2)] } });
    expect(result.current(id(1), msgs[0]!.media_url).url).toBe(assinado(id(1)));
    expect(result.current(id(2), msgs[1]!.media_url).url).toBe(assinado(id(2)));
  });

  it('guarda o link por mensagem: rerender não pede de novo; mensagem nova pede só a nova', async () => {
    const um = [{ id: id(1), media_url: `${LOJA}/a.jpg` }];
    const { result, rerender } = renderHook(({ m }) => useMediaLinks(m), { wrapper: wrapper(), initialProps: { m: um } });
    await waitFor(() => expect(result.current(id(1), um[0]!.media_url).state).toBe('ready'));
    rerender({ m: [...um] });
    const dois = [...um, { id: id(2), media_url: `${LOJA}/b.jpg` }];
    rerender({ m: dois });
    await waitFor(() => expect(result.current(id(2), dois[1]!.media_url).state).toBe('ready'));
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls[1]?.[1]).toEqual({ body: { message_ids: [id(2)] } });
  });

  it('sem link: a URL pública antiga é tentada; sem ela, a bolha diz que não deu', async () => {
    invoke.mockResolvedValue({ data: { links: {}, expires_in: 3600 }, error: null });
    const msgs = [
      { id: id(1), media_url: publica(`${LOJA}/a.jpg`) },
      { id: id(2), media_url: `${LOJA}/b.jpg` },
    ];
    const { result } = renderHook(() => useMediaLinks(msgs), { wrapper: wrapper() });
    await waitFor(() => expect(result.current(id(2), msgs[1]!.media_url).state).toBe('unavailable'));
    expect(result.current(id(1), msgs[0]!.media_url)).toEqual({ url: publica(`${LOJA}/a.jpg`), state: 'ready' });
    expect(result.current(id(2), msgs[1]!.media_url)).toEqual({ url: null, state: 'unavailable' });
  });

  it('função fora do ar: não quebra a tela, cai na reserva ou em "não deu"', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('Edge Function returned a non-2xx status code') });
    const msgs = [{ id: id(1), media_url: `${LOJA}/b.jpg` }];
    const { result } = renderHook(() => useMediaLinks(msgs), { wrapper: wrapper() });
    await waitFor(() => expect(result.current(id(1), msgs[0]!.media_url).state).toBe('unavailable'), { timeout: 3000 });
  });

  it('o link é trocado antes de vencer (50 min de 60)', () => {
    expect(MEDIA_LINK_CACHE_MS).toBe(50 * 60 * 1000);
  });
});
