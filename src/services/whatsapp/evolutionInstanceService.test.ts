import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCreateService } = vi.hoisted(() => ({ mockCreateService: vi.fn() }));

vi.mock('@/services/evolutionApi', () => ({
  createEvolutionApiService: mockCreateService,
  EvolutionApiService: class {},
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn() } }));

import {
  evolutionCredentialsFrom,
  evolutionServiceForRow,
  SEM_CREDENCIAL,
} from './evolutionInstanceService';

/**
 * Este módulo existe porque o `service` global do useEvolutionApi é sempre nulo
 * em produção — nenhuma Conta tem `tenants.settings.evolutionApi` e as env vars
 * `VITE_EVOLUTION_API_*` não estão na Vercel. Três botões da tela de instâncias
 * dependiam dele; dois falhavam em silêncio.
 */

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateService.mockImplementation((baseUrl: string, apiKey: string) => ({ baseUrl, apiKey }));
});

describe('evolutionCredentialsFrom', () => {
  it('lê do connection_config, que é onde a edge function grava', () => {
    expect(
      evolutionCredentialsFrom({
        connection_config: { baseUrl: 'https://evo.exemplo.com.br', apiKey: 'CHAVE_DA_INSTANCIA' },
      }),
    ).toEqual({ baseUrl: 'https://evo.exemplo.com.br', apiKey: 'CHAVE_DA_INSTANCIA' });
  });

  it('cai nas colunas legadas quando o connection_config está vazio', () => {
    expect(
      evolutionCredentialsFrom({
        connection_config: {},
        evolution_api_url: 'https://antigo.exemplo.com.br',
        evolution_api_key: 'CHAVE_ANTIGA',
      }),
    ).toEqual({ baseUrl: 'https://antigo.exemplo.com.br', apiKey: 'CHAVE_ANTIGA' });
  });

  it('o connection_config tem precedência sobre as colunas legadas', () => {
    const creds = evolutionCredentialsFrom({
      connection_config: { baseUrl: 'https://novo.exemplo.com.br', apiKey: 'NOVA' },
      evolution_api_url: 'https://antigo.exemplo.com.br',
      evolution_api_key: 'ANTIGA',
    });
    expect(creds?.apiKey).toBe('NOVA');
  });

  it('devolve null quando falta metade — meia credencial não conecta', () => {
    expect(
      evolutionCredentialsFrom({ connection_config: { baseUrl: 'https://evo.exemplo.com.br' } }),
    ).toBeNull();
    expect(evolutionCredentialsFrom({ connection_config: { apiKey: 'SO_A_CHAVE' } })).toBeNull();
  });

  it('devolve null para a linha semente, de connection_config vazio', () => {
    expect(evolutionCredentialsFrom({ connection_config: {} })).toBeNull();
    expect(evolutionCredentialsFrom(null)).toBeNull();
  });
});

describe('evolutionServiceForRow', () => {
  it('monta o serviço com a credencial da instância', () => {
    const service = evolutionServiceForRow({
      connection_config: { baseUrl: 'https://evo.exemplo.com.br', apiKey: 'CHAVE_DA_INSTANCIA' },
    });
    expect(mockCreateService).toHaveBeenCalledWith(
      'https://evo.exemplo.com.br',
      'CHAVE_DA_INSTANCIA',
    );
    expect(service).toMatchObject({ apiKey: 'CHAVE_DA_INSTANCIA' });
  });

  it('sem credencial, ERRA em vez de devolver nulo', () => {
    // O nulo silencioso era o bug: `getQRCode` devolvia null, o chamador fazia
    // `if (qrCode)` e o clique não produzia nada — nem QR, nem erro.
    expect(() => evolutionServiceForRow({ connection_config: {} })).toThrow(SEM_CREDENCIAL);
    expect(mockCreateService).not.toHaveBeenCalled();
  });
});
