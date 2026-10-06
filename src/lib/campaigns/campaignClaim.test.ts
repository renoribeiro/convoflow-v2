import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// Item 14, lote 2: a reserva de campaign_executions só pega linha 'pending'.
import { claimExecution } from '../../../supabase/functions/_shared/campaign-claim';

type Row = { id: string; status: string; updated_at?: string };

// Banco de mentira com a semântica do PostgREST que importa aqui: UPDATE com
// filtros, e .select() devolve só as linhas que o UPDATE pegou.
function fakeDb(rows: Row[], fail = false) {
  return {
    from(table: string) {
      expect(table).toBe('campaign_executions');
      let patch: Partial<Row> = {};
      const filters: Array<[keyof Row, string]> = [];
      const q = {
        update(p: Partial<Row>) {
          patch = p;
          return q;
        },
        eq(col: keyof Row, val: string) {
          filters.push([col, val]);
          return q;
        },
        async select(_cols: string) {
          if (fail) return { data: null, error: { message: 'falhou' } };
          const hit = rows.filter((r) => filters.every(([c, v]) => r[c] === v));
          hit.forEach((r) => Object.assign(r, patch));
          return { data: hit.map((r) => ({ id: r.id })), error: null };
        },
      };
      return q;
    },
  };
}

describe('claimExecution', () => {
  it('pega a linha pendente e marca processing', async () => {
    const rows: Row[] = [{ id: 'a', status: 'pending' }];
    expect(await claimExecution(fakeDb(rows), 'a', 'T')).toEqual({ result: 'claimed' });
    expect(rows[0]).toEqual({ id: 'a', status: 'processing', updated_at: 'T' });
  });

  it('duas execuções sobrepostas: só a primeira envia', async () => {
    const rows: Row[] = [{ id: 'a', status: 'pending' }];
    const db = fakeDb(rows);
    const first = await claimExecution(db, 'a');
    const second = await claimExecution(db, 'a');
    expect(first.result).toBe('claimed');
    expect(second.result).toBe('taken');
  });

  it('não reabre linha já enviada ou falhada', async () => {
    for (const status of ['sent', 'failed', 'processing', 'skipped']) {
      const rows: Row[] = [{ id: 'a', status }];
      expect((await claimExecution(fakeDb(rows), 'a')).result).toBe('taken');
      expect(rows[0].status).toBe(status);
    }
  });

  it('erro do banco não vira envio', async () => {
    expect(await claimExecution(fakeDb([], true), 'a')).toEqual({ result: 'error', error: 'falhou' });
  });

  it('o dispatch usa a reserva e pula quando não é dele', () => {
    const src = readFileSync(
      resolve(__dirname, '../../../supabase/functions/process-campaign-dispatch/index.ts'),
      'utf-8',
    ).replace(/\r\n/g, '\n');
    expect(src).toContain("import { claimExecution } from '../_shared/campaign-claim.ts'");
    const claimAt = src.indexOf('await claimExecution(supabase, exec.id)');
    expect(claimAt).toBeGreaterThan(-1);
    // Nenhum envio pode vir antes da reserva dentro do laço.
    const loopAt = src.indexOf('for (const exec of executions');
    const firstSend = src.indexOf('ProviderFactory', loopAt);
    expect(loopAt).toBeGreaterThan(-1);
    expect(claimAt).toBeGreaterThan(loopAt);
    if (firstSend > -1) expect(firstSend).toBeGreaterThan(claimAt);
    expect(src).toMatch(/claim\.result === 'taken'\)\s*\{[\s\S]{0,200}?\n\s*continue\n/);
    // A reserva antiga (só por id, sem status) não pode voltar.
    expect(src).not.toMatch(/update\(\{ status: 'processing'[^)]*\}\)\s*\.eq\('id', exec\.id\)\s*\n\s*\n/);
  });
});
