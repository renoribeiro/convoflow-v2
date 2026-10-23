import { describe, it, expect } from 'vitest';
import { OPENAPI, OPENAPI_PATHS } from '@/lib/api/openapi';

describe('OPENAPI', () => {
  it('descreve exatamente os 7 caminhos da v1', () => {
    expect([...OPENAPI_PATHS].sort()).toEqual(
      [
        '/v1/lojas',
        '/v1/contatos',
        '/v1/conversas',
        '/v1/conversas/{id}/mensagens',
        '/v1/funil',
        '/v1/equipe',
        '/v1/metricas',
      ].sort(),
    );
  });

  it('só tem GET e todo caminho exige chave Bearer', () => {
    for (const item of Object.values(OPENAPI.paths)) {
      expect(Object.keys(item)).toEqual(['get']);
      expect(item.get.security).toContainEqual({ bearerAuth: [] });
    }
    expect(OPENAPI.components.securitySchemes.bearerAuth.scheme).toBe('bearer');
  });

  it('é OpenAPI 3.1 e aponta para a base da API', () => {
    expect(OPENAPI.openapi).toBe('3.1.0');
    expect(OPENAPI.servers[0].url).toBe('https://api.convoflow.com.br');
  });

  it('não traz chave realista nem dado pessoal nos exemplos', () => {
    const texto = JSON.stringify(OPENAPI);
    expect(texto).not.toMatch(/cf_live_[A-Za-z0-9]{32}/);
    expect(texto).not.toMatch(/@(?!exemplo\.com\.br)[a-z0-9-]+\.[a-z]+/i);
  });
});
