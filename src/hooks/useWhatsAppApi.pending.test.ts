import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/contexts/TenantContext', () => ({ useTenant: () => ({ tenant: null }) }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import { instanceWithAdapter, pickActiveInstance } from './useWhatsAppApi';
import { rebuildSafeInstanceRow } from '@/lib/whatsapp/safeInstanceColumns';
import { EvolutionAdapter } from '@/services/whatsapp/evolution.adapter';
import { WahaAdapter } from '@/services/whatsapp/waha.adapter';

/**
 * Número Evolution/WAHA com a chave só no servidor: desde a sessão 2
 * (2026-10-26) ele monta o adapter que envia PELO SERVIDOR, e a resposta da
 * conversa dele nunca sai por outro número da Loja. Valores inventados.
 */

const row = (over: Record<string, unknown>) =>
  rebuildSafeInstanceRow({
    id: 'aaaaaaaa-0000-4000-8000-0000000000a1',
    tenant_id: 'aaaaaaaa-0000-4000-8000-000000000002',
    name: 'Comercial',
    instance_key: 'comercial-exemplo',
    provider: 'evolution',
    status: 'open',
    is_active: true,
    connection_config: {},
    ...over,
  });

describe('número Evolution e WAHA nas Conversas', () => {
  it('monta o adapter do servidor sem chave nenhuma na linha', () => {
    const evo = instanceWithAdapter(row({}))!;
    const waha = instanceWithAdapter(row({ provider: 'waha', status: 'connected' }))!;
    expect(evo.adapter).toBeInstanceOf(EvolutionAdapter);
    expect(waha.adapter).toBeInstanceOf(WahaAdapter);
    for (const item of [evo, waha]) {
      expect(item.adapter.isReadyToSend()).toBe(true);
      expect(item.adapter.getCapabilities().serverSideOnlySend).toBe(true);
    }
  });

  it('a linha nunca carrega chave: mesmo vindo, ela não passa', () => {
    const r = row({ evolution_api_key: 'chave-FAKE-123456', connection_config: { apiKey: 'chave-FAKE-123456', baseUrl: 'https://evolution.exemplo.com.br' } });
    expect(JSON.stringify(r)).not.toContain('chave-FAKE');
    expect(JSON.stringify(r)).not.toContain('evolution.exemplo');
  });

  it('desconectado: não pronto, com a frase para a tela', () => {
    const item = instanceWithAdapter(row({ status: 'close' }))!;
    expect(item.adapter.isReadyToSend()).toBe(false);
    expect(item.adapter.notReadyReason).toBe('Este número está desconectado. Peça ao Gestor da Loja para reconectar.');
  });

  it('a conversa desse número NÃO cai noutro número pronto da Loja, nem desconectada', () => {
    const daConversa = instanceWithAdapter(row({ status: 'close' }))!;
    const meta = instanceWithAdapter(
      row({ id: 'aaaaaaaa-0000-4000-8000-0000000000a2', provider: 'official', name: 'Oficial', connection_config: { phoneNumberId: '100000000000001' } }),
    )!;
    const outraEvo = instanceWithAdapter(row({ id: 'aaaaaaaa-0000-4000-8000-0000000000a3', name: 'Plantão' }))!;
    expect(meta.adapter.isReadyToSend()).toBe(true);
    const escolhida = pickActiveInstance([meta, outraEvo, daConversa], 'aaaaaaaa-0000-4000-8000-0000000000a1');
    expect(escolhida?.row.id).toBe('aaaaaaaa-0000-4000-8000-0000000000a1');
    expect(escolhida?.adapter.isReadyToSend()).toBe(false);
  });
});
