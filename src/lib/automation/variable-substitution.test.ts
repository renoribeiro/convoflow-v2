import { describe, it, expect } from 'vitest';
// Lógica pura de variáveis (compartilhada com a Edge Function Deno).
import {
  substituteVariables,
  evaluateCondition,
  firstName,
  buildAutomationVariableContext,
} from '../../../supabase/functions/_shared/variable-substitution';

describe('substituteVariables', () => {
  const ctx = { nome: 'Maria', first_name: 'Maria', empty: '' };

  it('substitui tokens conhecidos', () => {
    expect(substituteVariables('Olá {nome}!', ctx)).toBe('Olá Maria!');
  });

  it('tolera espaços dentro das chaves', () => {
    expect(substituteVariables('Oi { nome }', ctx)).toBe('Oi Maria');
  });

  it('mantém tokens desconhecidos como estão', () => {
    expect(substituteVariables('Oi {desconhecida}', ctx)).toBe('Oi {desconhecida}');
  });

  it('retorna string vazia para template nulo/indefinido', () => {
    expect(substituteVariables(null, ctx)).toBe('');
    expect(substituteVariables(undefined, ctx)).toBe('');
  });

  it('substitui múltiplos tokens', () => {
    expect(substituteVariables('{first_name} {nome}', ctx)).toBe('Maria Maria');
  });
});

describe('evaluateCondition', () => {
  it('equals é case-insensitive e ignora espaços', () => {
    expect(evaluateCondition('equals', '  Imóvel ', 'imovel')).toBe(false);
    expect(evaluateCondition('equals', '  SIM ', 'sim')).toBe(true);
  });

  it('contains procura substring case-insensitive', () => {
    expect(evaluateCondition('contains', 'quero um imóvel novo', 'IMÓVEL')).toBe(true);
    expect(evaluateCondition('contains', 'casa', 'apto')).toBe(false);
  });

  it('not_empty / empty consideram apenas espaços', () => {
    expect(evaluateCondition('not_empty', 'x')).toBe(true);
    expect(evaluateCondition('not_empty', '   ')).toBe(false);
    expect(evaluateCondition('empty', '')).toBe(true);
    expect(evaluateCondition('empty', 'x')).toBe(false);
  });

  it('trata null/undefined como vazio', () => {
    expect(evaluateCondition('empty', null)).toBe(true);
    expect(evaluateCondition('not_empty', undefined)).toBe(false);
  });
});

describe('firstName', () => {
  it('extrai o primeiro nome', () => {
    expect(firstName('Maria da Silva')).toBe('Maria');
  });
  it('retorna vazio para null/undefined', () => {
    expect(firstName(null)).toBe('');
    expect(firstName(undefined)).toBe('');
  });
});

describe('buildAutomationVariableContext', () => {
  it('expõe campos do contato e custom_fields', () => {
    const ctx = buildAutomationVariableContext({
      contactName: 'João Souza',
      phone: '5511999999999',
      email: 'joao@x.example',
      customFields: { interesse: 'imovel', orcamento: 500000 },
    });
    expect(ctx.name).toBe('João Souza');
    expect(ctx.first_name).toBe('João');
    expect(ctx.phone).toBe('5511999999999');
    expect(ctx.email).toBe('joao@x.example');
    expect(ctx.interesse).toBe('imovel');
    expect(ctx.orcamento).toBe('500000'); // números viram string
  });

  it('promove a variável do gatilho como token nomeado e captured_value', () => {
    const ctx = buildAutomationVariableContext({
      triggerData: { variable_name: 'nome', value: 'Ana' },
    });
    expect(ctx.nome).toBe('Ana');
    expect(ctx.captured_value).toBe('Ana');
  });

  it('o valor do gatilho tem precedência sobre o custom_field de mesmo nome', () => {
    const ctx = buildAutomationVariableContext({
      customFields: { nome: 'Antigo' },
      triggerData: { variable_name: 'nome', value: 'Novo' },
    });
    expect(ctx.nome).toBe('Novo');
  });

  it('ignora valores de objeto em custom_fields', () => {
    const ctx = buildAutomationVariableContext({
      customFields: { obj: { a: 1 }, ok: 'sim' },
    });
    expect(ctx.obj).toBeNull();
    expect(ctx.ok).toBe('sim');
  });
});
