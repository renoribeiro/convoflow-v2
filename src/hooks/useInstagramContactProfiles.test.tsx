/**
 * A busca do nome do cliente do Instagram, sob demanda, como a tela chama:
 * só contatos do Instagram na hora, com a conexão atendendo, uma vez por aba
 * a cada 10 min — nunca para WhatsApp, nunca para quem já tem resultado.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import { useInstagramContactProfiles, __resetProfileAttempts } from './useInstagramContactProfiles';

const VALIDO = new Date(Date.now() + 40 * 86_400_000).toISOString();
const instancias = [
  { row: { id: 'ig-1', provider: 'instagram', is_active: true, connection_config: { tokenIssuedAt: 'A', tokenExpiresAt: VALIDO } } },
  { row: { id: 'ig-venc', provider: 'instagram', is_active: true, connection_config: { tokenIssuedAt: 'A', tokenExpiresAt: '2020-01-01T00:00:00Z' } } },
  { row: { id: 'wa-1', provider: 'official', is_active: true, connection_config: {} } },
];
const ig = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  channel: 'instagram',
  profile_status: null,
  profile_checked_at: null,
  whatsapp_instance_id: 'ig-1',
  ...extra,
});

beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue({ data: { ok: true, results: [] }, error: null });
  __resetProfileAttempts();
});

describe('useInstagramContactProfiles', () => {
  it('pede só os do Instagram que estão na hora, numa chamada só, e avisa a tela', async () => {
    const onUpdated = vi.fn();
    renderHook(() =>
      useInstagramContactProfiles({
        contacts: [
          ig('a'),
          ig('b'),
          ig('ok', { profile_status: 'ok' }),
          ig('bloq', { profile_status: 'unavailable' }),
          { id: 'w', channel: 'whatsapp', profile_status: null, whatsapp_instance_id: 'wa-1' },
          ig('venc', { whatsapp_instance_id: 'ig-venc' }),
          null,
        ],
        instances: instancias,
        enabled: true,
        onUpdated,
      }),
    );
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(invoke).toHaveBeenCalledWith('instagram-contact-profile', { body: { contactIds: ['a', 'b'] } });
    await waitFor(() => expect(onUpdated).toHaveBeenCalledTimes(1));
  });

  it('desligado (lado do WhatsApp): não chama', () => {
    renderHook(() => useInstagramContactProfiles({ contacts: [ig('a')], instances: instancias, enabled: false }));
    expect(invoke).not.toHaveBeenCalled();
  });

  it('a mesma aba não pede o mesmo contato de novo (nem se a lista recarregar)', async () => {
    const { rerender } = renderHook(
      ({ contacts }) => useInstagramContactProfiles({ contacts, instances: instancias, enabled: true }),
      { initialProps: { contacts: [ig('a')] } },
    );
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    rerender({ contacts: [ig('a', { profile_checked_at: 'x' })] });
    rerender({ contacts: [ig('a'), ig('c')] });
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    expect(invoke.mock.calls[1]?.[1]).toEqual({ body: { contactIds: ['c'] } });
  });

  it('função fora do ar: não quebra a tela e não avisa', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('404') });
    const onUpdated = vi.fn();
    renderHook(() =>
      useInstagramContactProfiles({ contacts: [ig('a')], instances: instancias, enabled: true, onUpdated }),
    );
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it('no máximo 20 por chamada', async () => {
    const muitos = Array.from({ length: 25 }, (_, i) => ig(`c${i}`));
    renderHook(() => useInstagramContactProfiles({ contacts: muitos, instances: instancias, enabled: true }));
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect((invoke.mock.calls[0]?.[1] as { body: { contactIds: string[] } }).body.contactIds).toHaveLength(20);
  });
});
