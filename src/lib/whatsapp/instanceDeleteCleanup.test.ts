import { describe, it, expect } from 'vitest';
import {
  planProviderCleanup,
  cleanupOutcomeFromStatus,
} from '../../../supabase/functions/_shared/instance-delete-cleanup.ts';

/**
 * O plano de limpeza no provedor que a edge function delete-whatsapp-instance
 * executa DEPOIS de a RPC ter apagado no banco. Endpoints e headers vêm dos
 * SKILL.md (Evolution §2.7/§2.8, WAHA §2.7). Para Meta, o plano é "nada".
 */

const env = { evolutionBaseUrl: 'https://evo.example.com/', evolutionGlobalKey: 'GLOBAL' };

describe('planProviderCleanup', () => {
  it('official: não chama nada na Meta', () => {
    expect(planProviderCleanup('official', '100000000000099', { anything: 1 }, env)).toEqual({
      kind: 'not_applicable',
      provider: 'official',
    });
  });

  it('evolution: logout (opcional) e depois delete, os dois com a chave GLOBAL, sem barra dupla', () => {
    const plan = planProviderCleanup('evolution', 'minha instancia', null, env);
    expect(plan.kind).toBe('requests');
    if (plan.kind !== 'requests') return;
    expect(plan.requests.map((r) => [r.method, r.url, r.optional])).toEqual([
      ['DELETE', 'https://evo.example.com/instance/logout/minha%20instancia', true],
      ['DELETE', 'https://evo.example.com/instance/delete/minha%20instancia', false],
    ]);
    for (const r of plan.requests) expect(r.headers).toEqual({ apikey: 'GLOBAL' });
  });

  it('provider ausente conta como evolution (mesmo default do ProviderFactory)', () => {
    expect(planProviderCleanup(null, 'k', null, env)).toEqual(planProviderCleanup('evolution', 'k', null, env));
    expect(planProviderCleanup(undefined, 'k', null, env)).toEqual(planProviderCleanup('evolution', 'k', null, env));
  });

  it('evolution sem secrets: pula e diz qual secret falta (nunca manda sem chave)', () => {
    const plan = planProviderCleanup('evolution', 'k', null, { evolutionBaseUrl: '', evolutionGlobalKey: null });
    expect(plan.kind).toBe('skipped');
    if (plan.kind === 'skipped') expect(plan.why).toMatch(/EVOLUTION_GLOBAL_KEY/);
  });

  it('waha: DELETE /api/sessions/{session} no servidor do cliente com X-Api-Key do connection_config', () => {
    const plan = planProviderCleanup('waha', 'vendas', { baseUrl: 'https://waha.cliente.com/', apiKey: 'K1', sessionName: 'vendas' }, env);
    expect(plan).toEqual({
      kind: 'requests',
      provider: 'waha',
      requests: [
        { method: 'DELETE', url: 'https://waha.cliente.com/api/sessions/vendas', headers: { 'X-Api-Key': 'K1' }, optional: false, label: 'delete-session' },
      ],
    });
  });

  it('waha sem baseUrl: pula (a plataforma não conhece o servidor)', () => {
    expect(planProviderCleanup('waha', 'vendas', { apiKey: 'K1' }, env).kind).toBe('skipped');
  });

  it('waha sem sessionName usa a instance_key (é o que useWahaApi grava)', () => {
    const plan = planProviderCleanup('waha', 'vendas', { baseUrl: 'https://w.x' }, env);
    if (plan.kind !== 'requests') throw new Error('esperava requests');
    expect(plan.requests[0].url).toBe('https://w.x/api/sessions/vendas');
    expect(plan.requests[0].headers).toEqual({});
  });
});

describe('cleanupOutcomeFromStatus', () => {
  it('404 = já não existia; 2xx = removida; resto = falhou', () => {
    expect(cleanupOutcomeFromStatus(404)).toBe('not_found');
    expect(cleanupOutcomeFromStatus(200)).toBe('removed');
    expect(cleanupOutcomeFromStatus(204)).toBe('removed');
    expect(cleanupOutcomeFromStatus(400)).toBe('failed');
    expect(cleanupOutcomeFromStatus(401)).toBe('failed');
    expect(cleanupOutcomeFromStatus(500)).toBe('failed');
  });
});
