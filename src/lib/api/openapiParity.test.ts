/**
 * A documentação (src/lib/api/openapi.ts, mostrada em /api) e o servidor
 * (supabase/functions/_shared/api/nucleo.ts) andam juntos: mesmos endereços,
 * mesmo escopo por endereço, mesmos parâmetros e mesmos campos de resposta.
 * Mudou o servidor sem mudar a página (ou o contrário)? Este teste falha.
 */
import { describe, expect, it } from 'vitest';

import { OPENAPI, OPENAPI_PATHS, operacaoDe } from './openapi';
import {
  CAMPOS_APROVADOS,
  ESCOPO_DO_RECURSO,
  montarLeitura,
  ROTAS_REST,
} from '../../../supabase/functions/_shared/api/nucleo';

const UUID = 'aaaaaaaa-0000-4000-8000-000000000001';

describe('documentação = servidor', () => {
  it('os mesmos 7 endereços', () => {
    expect([...OPENAPI_PATHS].sort()).toEqual(ROTAS_REST.map((r) => r.caminho).sort());
  });

  it.each(ROTAS_REST.map((r) => [r.caminho, r.recurso] as const))('%s: escopo e parâmetros', (caminho, recurso) => {
    const op = operacaoDe(caminho);
    const escopo = ESCOPO_DO_RECURSO[recurso];
    if (escopo) expect(op['x-escopo']).toContain(escopo);
    // todo parâmetro de query documentado é aceito pelo servidor
    for (const p of op.parameters ?? []) {
      if (p.in !== 'query') continue;
      const exemplo = p.name.endsWith('_id') ? UUID : p.name === 'limite' ? '10' : ['desde', 'ate', 'atualizado_desde'].includes(p.name) ? '2026-10-01' : p.name === 'arquivada' ? 'false' : p.name === 'midia' ? '1' : p.name === 'cursor' ? null : 'x';
      if (exemplo === null) continue;
      expect(() => montarLeitura(recurso, { [p.name]: exemplo }, recurso === 'mensagens' ? UUID : undefined), `${caminho} ?${p.name}`).not.toThrow();
    }
  });

  it('os campos de cada resposta documentada são os aprovados no servidor', () => {
    const texto = JSON.stringify(OPENAPI);
    for (const r of ROTAS_REST) {
      for (const campo of CAMPOS_APROVADOS[r.recurso]) {
        expect(texto, `${r.caminho}: ${campo}`).toContain(`"${campo}"`);
      }
    }
  });
});
