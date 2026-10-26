import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/contexts/TenantContext', () => ({ useTenant: () => ({ tenant: null }) }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import { instanceWithAdapter, pickActiveInstance } from './useWhatsAppApi';
import type { Tables } from '@/integrations/supabase/types';

/**
 * Número Evolution/WAHA com a chave só no servidor (desde 2026-10-26): fica na
 * lista como NÃO pronto, para a resposta da conversa dele não sair por outro
 * número da Loja. Valores inventados.
 */

const row = (over: Partial<Tables<'whatsapp_instances'>>) =>
  ({
    id: 'aaaaaaaa-0000-4000-8000-0000000000a1',
    tenant_id: 'aaaaaaaa-0000-4000-8000-000000000002',
    name: 'Comercial',
    instance_key: 'comercial-exemplo',
    provider: 'evolution',
    status: 'open',
    phone_number: null,
    profile_name: null,
    profile_picture_url: null,
    connection_config: {},
    evolution_api_key: null,
    evolution_api_url: null,
    is_active: true,
    ...over,
  }) as unknown as Tables<'whatsapp_instances'>;

describe('número com a chave só no servidor', () => {
  it('Evolution e WAHA sem chave no navegador: ficam na lista, não prontos, com o motivo', () => {
    for (const provider of ['evolution', 'waha']) {
      const item = instanceWithAdapter(row({ provider }));
      expect(item).not.toBeNull();
      expect(item!.adapter.isReadyToSend()).toBe(false);
      expect(item!.adapter.notReadyReason).toContain('guarda a chave só no servidor');
    }
  });

  it('a conversa desse número NÃO cai noutro número pronto da Loja', () => {
    const pendente = instanceWithAdapter(row({ id: 'aaaaaaaa-0000-4000-8000-0000000000a1' }))!;
    const meta = instanceWithAdapter(
      row({ id: 'aaaaaaaa-0000-4000-8000-0000000000a2', provider: 'official', name: 'Oficial', connection_config: { phoneNumberId: '100000000000001' } }),
    )!;
    expect(meta.adapter.isReadyToSend()).toBe(true);
    const escolhida = pickActiveInstance([meta, pendente], 'aaaaaaaa-0000-4000-8000-0000000000a1');
    expect(escolhida?.row.id).toBe('aaaaaaaa-0000-4000-8000-0000000000a1');
    expect(escolhida?.adapter.isReadyToSend()).toBe(false);
  });

  it('o adapter de espera nunca envia', async () => {
    const item = instanceWithAdapter(row({}))!;
    const r = await item.adapter.sendText('5585999990201', 'oi');
    expect(r.status).toBe('failed');
  });

  it('Evolution com chave antiga na linha continua montando o adapter de sempre', () => {
    const item = instanceWithAdapter(
      row({ connection_config: { baseUrl: 'https://evolution.exemplo.com.br', apiKey: 'chave-FAKE-123456' } }),
    )!;
    expect(item.adapter.notReadyReason).toBeUndefined();
    expect(item.adapter.isReadyToSend()).toBe(true);
  });
});
