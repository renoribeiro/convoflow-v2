import { describe, it, expect } from 'vitest';
import {
  SAFE_INSTANCE_SELECT,
  SAFE_CONNECTION_CONFIG_KEYS,
  rebuildSafeInstanceRow,
} from './safeInstanceColumns';

describe('colunas seguras de whatsapp_instances', () => {
  it('o select não pede nenhuma coluna de segredo nem o connection_config inteiro', () => {
    const partes = SAFE_INSTANCE_SELECT.split(',').map((p) => p.trim());
    for (const proibida of ['*', 'evolution_api_key', 'evolution_api_url', 'connection_config', 'qr_code']) {
      expect(partes).not.toContain(proibida);
    }
    expect(SAFE_INSTANCE_SELECT).not.toMatch(/apiKey|baseUrl|webhookSecret|accessToken|token\b/);
  });

  it('a lista de chaves seguras não tem chave nem endereço de servidor', () => {
    expect(SAFE_CONNECTION_CONFIG_KEYS).not.toContain('apiKey' as never);
    expect(SAFE_CONNECTION_CONFIG_KEYS).not.toContain('baseUrl' as never);
    expect(SAFE_CONNECTION_CONFIG_KEYS).not.toContain('webhookUrl' as never);
  });

  it('pede cada chave segura pelo caminho dentro do connection_config', () => {
    expect(SAFE_INSTANCE_SELECT).toContain('cfg_igUsername:connection_config->igUsername');
    expect(SAFE_INSTANCE_SELECT).toContain('cfg_wabaId:connection_config->wabaId');
  });

  it('remonta o connection_config só com o que veio preenchido', () => {
    const row = rebuildSafeInstanceRow({
      id: 'aaaaaaaa-0000-4000-8000-000000000001',
      name: 'Instagram Loja',
      provider: 'instagram',
      cfg_igUsername: 'loja.exemplo',
      cfg_tokenExpiresAt: 1893456000,
      cfg_renewal: { status: 'ok' },
      cfg_wabaId: null,
      apiKey: 'nao-deve-passar',
    });
    expect(row.connection_config).toEqual({
      igUsername: 'loja.exemplo',
      tokenExpiresAt: 1893456000,
      renewal: { status: 'ok' },
    });
    expect((row as unknown as Record<string, unknown>).apiKey).toBeUndefined();
    expect(row.phone_number).toBeNull();
  });

  it('connection_config inteiro (cache antigo): só as chaves seguras passam', () => {
    const row = rebuildSafeInstanceRow({
      id: 'x',
      connection_config: { apiKey: 'nao-passa', baseUrl: 'https://evolution.exemplo.com.br', sessionName: 'loja' },
    });
    expect(row.connection_config).toEqual({ sessionName: 'loja' });
  });
});
