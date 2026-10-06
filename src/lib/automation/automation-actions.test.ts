import { describe, it, expect } from 'vitest';
// Lógica pura das ações de automação (compartilhada com a Edge Function Deno).
import {
  buildSendMessageJobData,
  normalizeTagName,
} from '../../../supabase/functions/_shared/automation-actions';

describe('buildSendMessageJobData', () => {
  const base = {
    instanceKey: 'inst_abc',
    phone: '5511999999999',
    message: 'Olá!',
    contactId: 'contact-123',
  };

  it('usa a instance_key no campo instanceName (o job-worker resolve por instance_key, não UUID)', () => {
    const job = buildSendMessageJobData(base);
    expect(job.instanceName).toBe('inst_abc');
  });

  it('produz exatamente o shape que o job-worker consome', () => {
    const job = buildSendMessageJobData(base);
    expect(job).toEqual({
      instanceName: 'inst_abc',
      phone: '5511999999999',
      message: 'Olá!',
      contactId: 'contact-123',
      source: 'automation',
    });
    // Garante que não vaza nenhum campo extra inesperado para o contrato.
    expect(Object.keys(job).sort()).toEqual(
      ['contactId', 'instanceName', 'message', 'phone', 'source'].sort(),
    );
  });

  it('marca a origem como automation', () => {
    expect(buildSendMessageJobData(base).source).toBe('automation');
  });

  it('preserva o conteúdo da mensagem sem alterar', () => {
    const job = buildSendMessageJobData({ ...base, message: '  espaços  e quebras\n ' });
    expect(job.message).toBe('  espaços  e quebras\n ');
  });
});

describe('normalizeTagName', () => {
  it('faz trim de espaços nas bordas', () => {
    expect(normalizeTagName('  vip  ')).toBe('vip');
  });
  it('retorna string vazia para null/undefined', () => {
    expect(normalizeTagName(null)).toBe('');
    expect(normalizeTagName(undefined)).toBe('');
  });
  it('retorna string vazia para somente espaços (tag inválida)', () => {
    expect(normalizeTagName('   ')).toBe('');
  });
  it('preserva espaços internos do nome', () => {
    expect(normalizeTagName('  lead quente ')).toBe('lead quente');
  });
});
